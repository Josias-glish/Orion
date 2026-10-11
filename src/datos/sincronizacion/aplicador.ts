// Aplica en este equipo los cambios que llegan del servidor (R16, RF-41, CA-27). Diseño: docs/SINCRONIZACION.md, sección 6.
//
// Cada cambio se mezcla campo por campo con lo que el equipo ya tiene (`fusionar`, la misma función pura que prueba el
// servidor con los mismos vectores). Lo que sale es una lista de sentencias: la fila, el historial, las marcas, los avisos
// y el reloj. Todo un envío va en UNA transacción; si algo viola una regla de la base se aplica cambio por cambio y el que
// no se puede aplicar queda guardado completo en `aviso_sincronizacion` (tipo `conflicto`): nada se pierde ni bloquea a los demás.
import { nuevoId } from "../../dominio/identidad";
import { definicionDeEntidad } from "../../dominio/sincronizacion/entidades";
import {
  estaEliminado,
  eliminadoEfectivo,
  fusionar,
  marcaMaxima,
  type EstadoRegistro,
  type ValorCampo,
} from "../../dominio/sincronizacion/fusion";
import { compararMarcas, fechaDeMarca, leerMarca, MARCA_CERO, recibirMarca } from "../../dominio/sincronizacion/hlc";
import { CAMPOS_NO_ANOTADOS, CAMPOS_PROTEGIDOS, VALOR_PROTEGIDO } from "../cambios";
import type { Conexion, Sentencia, ValorSql } from "../conexion";
import { conCandado } from "./contexto";
import { columnasDeTabla, columnasQueViajan, entreComillas } from "./esquema";
import { CLAVES, leerClave, sentenciaEstado } from "./estado";
import { clave, leerMarcas, sentenciaMarcas, type RegistroMarcado } from "./marcas";

/** Un cambio tal como lo entrega el servidor (servidor/PROTOCOLO.md, sección 5). */
export interface CambioRemoto {
  seq: number;
  cambio_id: string;
  grupo_id: string;
  orden: number;
  dispositivo_id: string;
  usuario_id: string | null;
  entidad: string;
  registro_id: string;
  operacion: "crear" | "modificar" | "eliminar";
  campos: Record<string, ValorCampo>;
  marca: string;
  arbitrado?: boolean;
}

export interface OpcionesAplicar {
  /** Hora del equipo (ISO con milisegundos) para las filas que se crean aquí: historial, avisos, marcas. */
  ahoraIso: string;
  /** Hora corregida del equipo en milisegundos: sirve para no adoptar marcas ajenas adelantadas más de 10 minutos. */
  ahoraMs: number;
  /** Sentencias que van en el mismo lote que los cambios (marcar enviados, cursor, última sincronización). */
  extra?: readonly Sentencia[];
  /** La descarga inicial no trae el historial anterior: no se anota ningún cambio (S-92). */
  sinHistorial?: boolean;
}

export interface ResultadoAplicar {
  aplicados: number;
  /** Cambios que no se pudieron aplicar y quedaron guardados en los avisos. */
  conflictos: number;
  renombrados: number;
  restaurados: number;
}

type MotivoConflicto = "entidad_desconocida" | "falta_registro" | "falta_padre" | "unico" | "regla";

const SIN_CAMBIOS: ResultadoAplicar = { aplicados: 0, conflictos: 0, renombrados: 0, restaurados: 0 };

interface Trabajo {
  existe: boolean;
  /** Valor actual de cada columna que viaja (el de `eliminado_en` es el escrito por la última operación). */
  fila: Record<string, ValorSql> | null;
  estado: EstadoRegistro | null;
}

interface Contexto {
  conexion: Conexion;
  opciones: OpcionesAplicar;
  /** Registros ya tocados en este envío (la base todavía no tiene sus cambios). */
  cache: Map<string, Trabajo>;
  ultima: string | null;
  contactosVistos: Set<string>;
}

interface Preparada {
  sentencias: Sentencia[];
  /** El cambio no se aplicó: quedó guardado en los avisos (ya está entre las sentencias). */
  conflicto?: MotivoConflicto;
  restaurado: boolean;
  /** Nombre y marca de creación del registro resultante, para resolver choques de nombre. */
  nombre: string | null;
  creadoMarca: string;
}

const comoTexto = (campo: string, v: ValorSql | undefined): string | null =>
  v === null || v === undefined ? null : CAMPOS_PROTEGIDOS.has(campo) ? VALOR_PROTEGIDO : String(v);

function sentenciaAviso(
  contexto: Contexto,
  tipo: "restaurado" | "renombrado" | "conflicto" | "revision" | "reloj" | "rechazo",
  entidad: string | null,
  registroId: string | null,
  detalle: Record<string, unknown>,
  operacion?: CambioRemoto,
): Sentencia {
  const t = contexto.opciones.ahoraIso;
  const valores: ValorSql[] = [nuevoId(), tipo, entidad, registroId, JSON.stringify(detalle), operacion ? JSON.stringify(operacion) : null, t, t];
  if (tipo === "conflicto" && operacion) {
    // El mismo cambio no se guarda dos veces (un envío que el servidor repite después de un corte).
    return {
      sql: `INSERT INTO aviso_sincronizacion (id, tipo, entidad, registro_id, detalle, operacion, creado_en, modificado_en)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?
             WHERE NOT EXISTS (SELECT 1 FROM aviso_sincronizacion WHERE tipo = 'conflicto' AND resuelto_en IS NULL AND json_extract(operacion, '$.cambio_id') = ?)`,
      parametros: [...valores, operacion.cambio_id],
    };
  }
  return {
    sql: `INSERT INTO aviso_sincronizacion (id, tipo, entidad, registro_id, detalle, operacion, creado_en, modificado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    parametros: valores,
  };
}

async function cargar(contexto: Contexto, entidad: string, id: string): Promise<Trabajo> {
  const guardado = contexto.cache.get(clave(entidad, id));
  if (guardado) return guardado;
  const { conexion } = contexto;
  const viajan = await columnasQueViajan(conexion, entidad);
  const filas = await conexion.consultar<Record<string, ValorSql>>(`SELECT * FROM ${entreComillas(entidad)} WHERE id = ?`, [id]);
  const fila = filas[0] ?? null;
  let trabajo: Trabajo;
  if (!fila) {
    trabajo = { existe: false, fila: null, estado: null };
  } else {
    const marcado = (await leerMarcas(conexion, entidad, [id])).get(clave(entidad, id));
    const valores: Record<string, ValorCampo> = {};
    for (const columna of viajan) valores[columna] = (fila[columna] ?? null) as ValorCampo;
    let registro: RegistroMarcado;
    if (marcado) {
      registro = marcado;
      if (viajan.includes("eliminado_en")) valores.eliminado_en = marcado.eliminadoValor;
    } else {
      // Una fila de antes de vincular (por ejemplo, un catálogo de la migración) sin marcas: cualquier cambio recibido gana.
      registro = { marcas: { base: MARCA_CERO, campos: {} }, eliminadoValor: (fila.eliminado_en as string | null | undefined) ?? null };
    }
    trabajo = { existe: true, fila, estado: { valores, marcas: registro.marcas } };
  }
  contexto.cache.set(clave(entidad, id), trabajo);
  return trabajo;
}

/** Sentencias que dejan el contacto como marcador si este equipo no lo conoce (R28: los datos personales no viajan). */
function sentenciasMarcador(contexto: Contexto, contactoId: string): Sentencia[] {
  if (contexto.contactosVistos.has(contactoId)) return [];
  contexto.contactosVistos.add(contactoId);
  const t = contexto.opciones.ahoraIso;
  return [
    {
      sql: `INSERT OR IGNORE INTO contacto (id, nombre, marcador, creado_en, modificado_en) VALUES (?, 'Contacto guardado en otro equipo', 1, ?, ?)`,
      parametros: [contactoId, t, t],
    },
  ];
}

async function prepararOperacion(contexto: Contexto, c: CambioRemoto, nombreFinal?: string): Promise<Preparada> {
  const { conexion, opciones } = contexto;
  const def = definicionDeEntidad(c.entidad);
  const vacio: Omit<Preparada, "sentencias" | "conflicto"> = { restaurado: false, nombre: null, creadoMarca: c.marca };
  if (!def) {
    return { ...vacio, conflicto: "entidad_desconocida", sentencias: [sentenciaAviso(contexto, "conflicto", c.entidad, c.registro_id, { motivo: "entidad_desconocida" }, c)] };
  }
  const trabajo = await cargar(contexto, c.entidad, c.registro_id);
  if (!trabajo.existe && c.operacion !== "crear") {
    return { ...vacio, conflicto: "falta_registro", sentencias: [sentenciaAviso(contexto, "conflicto", c.entidad, c.registro_id, { motivo: "falta_registro" }, c)] };
  }

  const columnas = await columnasDeTabla(conexion, c.entidad);
  const viajan = await columnasQueViajan(conexion, c.entidad);
  const campos: Record<string, ValorCampo> = {};
  for (const [campo, valor] of Object.entries(c.campos)) if (viajan.includes(campo)) campos[campo] = valor;

  const antes = trabajo.estado;
  const resultado = fusionar(antes, { campos, marca: c.marca });
  const despues = resultado.estado;
  if (!despues) return { ...vacio, sentencias: [] };

  const sentencias: Sentencia[] = [];
  const efectivoAntes = antes ? eliminadoEfectivo(antes) : null;
  const efectivoDespues = eliminadoEfectivo(despues);
  const modificado = fechaDeMarca(marcaMaxima(despues)) ?? opciones.ahoraIso;

  // Contactos: solo viaja su id (R28).
  for (const columna of def.contactos ?? []) {
    const id = despues.valores[columna];
    if (typeof id === "string" && id !== "") sentencias.push(...sentenciasMarcador(contexto, id));
  }

  const valoresFila: Record<string, ValorSql> = { ...despues.valores };
  if (viajan.includes("eliminado_en")) valoresFila.eliminado_en = efectivoDespues;
  if (nombreFinal !== undefined) valoresFila.nombre = nombreFinal;

  if (!trabajo.existe) {
    const insertar: Record<string, ValorSql> = { id: c.registro_id };
    for (const columna of columnas) if (columna in valoresFila) insertar[columna] = valoresFila[columna];
    if (columnas.includes("creado_en") && insertar.creado_en == null) insertar.creado_en = fechaDeMarca(c.marca) ?? opciones.ahoraIso;
    if (columnas.includes("modificado_en")) insertar.modificado_en = modificado;
    if (c.entidad === "usuario") insertar.pin_pendiente = 1; // el PIN es de cada equipo (S-90)
    // Con las columnas que la operación no trae, la base usa sus valores por defecto.
    const nombres = Object.keys(insertar);
    sentencias.push({
      sql: `INSERT INTO ${entreComillas(c.entidad)} (${nombres.map(entreComillas).join(", ")}) VALUES (${nombres.map(() => "?").join(", ")})`,
      parametros: nombres.map((n) => insertar[n]),
    });
  } else {
    const fila = trabajo.fila!;
    const cambiados: string[] = [];
    for (const columna of viajan) {
      if (!(columna in valoresFila)) continue;
      const nuevo = valoresFila[columna];
      if ((fila[columna] ?? null) !== nuevo) cambiados.push(columna);
    }
    if (cambiados.length > 0) {
      const asignaciones = cambiados.map((n) => `${entreComillas(n)} = ?`);
      const parametros: ValorSql[] = cambiados.map((n) => valoresFila[n]);
      if (columnas.includes("modificado_en")) {
        asignaciones.push(`"modificado_en" = ?`);
        parametros.push(modificado);
      }
      sentencias.push({ sql: `UPDATE ${entreComillas(c.entidad)} SET ${asignaciones.join(", ")} WHERE id = ?`, parametros: [...parametros, c.registro_id] });
    }
  }

  // Historial: lo que cambió, y el valor que perdió el choque (CA-27) con `aplicado = 0`.
  const t = opciones.ahoraIso;
  const marcaTiempo = fechaDeMarca(c.marca) ?? t;
  const filasHistorial: ValorSql[][] = [];
  for (const r of resultado.campos) {
    if (CAMPOS_NO_ANOTADOS.has(r.campo)) continue;
    if (r.aplicado) {
      const anterior = r.anterior === undefined ? null : r.anterior;
      if (anterior === r.nuevo) continue;
      if (r.anterior === undefined && r.nuevo === null) continue; // campo nuevo y vacío: no hay nada que anotar
      filasHistorial.push([nuevoId(), c.entidad, c.registro_id, r.campo, comoTexto(r.campo, anterior), comoTexto(r.campo, r.nuevo), marcaTiempo, c.usuario_id, t, t, c.marca, c.dispositivo_id, 1]);
    } else {
      const quedo = r.anterior === undefined ? null : r.anterior;
      if (quedo === r.nuevo) continue;
      // Perder contra otro cambio del mismo equipo es un orden normal de ediciones (o un envío repetido), no un choque.
      const ganadora = antes ? (antes.marcas.campos[r.campo] ?? antes.marcas.base) : "";
      if (leerMarca(ganadora)?.dispositivo === leerMarca(c.marca)?.dispositivo) continue;
      const repetida = await conexion.consultar<{ n: number }>(
        `SELECT count(*) AS n FROM historial_cambios WHERE entidad = ? AND registro_id = ? AND campo = ? AND marca = ? AND aplicado = 0`,
        [c.entidad, c.registro_id, r.campo, c.marca],
      );
      if (repetida[0].n > 0) continue;
      filasHistorial.push([nuevoId(), c.entidad, c.registro_id, r.campo, comoTexto(r.campo, quedo), comoTexto(r.campo, r.nuevo), marcaTiempo, c.usuario_id, t, t, c.marca, c.dispositivo_id, 0]);
    }
  }
  if (filasHistorial.length > 0 && !opciones.sinHistorial) {
    sentencias.push({
      sql: `INSERT INTO historial_cambios (id, entidad, registro_id, campo, valor_anterior, valor_nuevo, marca_tiempo, usuario_id, creado_en, modificado_en, marca, dispositivo_id, aplicado)
            VALUES ${filasHistorial.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
      parametros: filasHistorial.flat(),
    });
  }

  sentencias.push(sentenciaMarcas(c.entidad, c.registro_id, { marcas: despues.marcas, eliminadoValor: (despues.valores.eliminado_en ?? null) as string | null }, t));

  const restaurado = Boolean(antes && estaEliminado(antes) && !estaEliminado(despues));
  if (restaurado) {
    const etiqueta = despues.valores.nombre ?? despues.valores.numero ?? null;
    sentencias.push(sentenciaAviso(contexto, "restaurado", c.entidad, c.registro_id, { etiqueta, eliminado_en: efectivoAntes }));
  }

  contexto.ultima = recibirMarca(contexto.ultima, c.marca, opciones.ahoraMs) ?? contexto.ultima;
  contexto.cache.set(clave(c.entidad, c.registro_id), {
    existe: true,
    fila: { ...(trabajo.fila ?? {}), ...valoresFila, id: c.registro_id },
    estado: despues,
  });
  const marcaCreado = despues.marcas.campos.creado_en ?? despues.marcas.base;
  return { sentencias, restaurado, nombre: typeof valoresFila.nombre === "string" ? valoresFila.nombre : null, creadoMarca: marcaCreado };
}

function nuevoContexto(conexion: Conexion, opciones: OpcionesAplicar, ultima: string | null): Contexto {
  return { conexion, opciones, cache: new Map(), ultima, contactosVistos: new Set() };
}

function sentenciasDeCierre(contexto: Contexto): Sentencia[] {
  return [
    ...(contexto.ultima ? [sentenciaEstado(CLAVES.marcaUltima, contexto.ultima, contexto.opciones.ahoraIso)] : []),
    ...(contexto.opciones.extra ?? []),
  ];
}

export function clasificarError(error: unknown): MotivoConflicto {
  const texto = error instanceof Error ? error.message : String(error);
  if (/FOREIGN KEY constraint failed/i.test(texto)) return "falta_padre";
  if (/UNIQUE constraint failed/i.test(texto)) return "unico";
  return "regla";
}

async function nombreLibre(conexion: Conexion, tabla: string, base: string): Promise<string> {
  for (let n = 2; n < 1000; n++) {
    const candidato = `${base} (${n})`;
    const ocupado = await conexion.consultar(`SELECT 1 FROM ${entreComillas(tabla)} WHERE nombre = ? COLLATE NOCASE AND eliminado_en IS NULL`, [candidato]);
    if (ocupado.length === 0) return candidato;
  }
  return `${base} (${nuevoId().slice(0, 4)})`;
}

/**
 * S-86: dos registros con el mismo nombre (lotes, razas, libros o usuarios creados sin red en equipos distintos). El que se
 * creó después queda con « (2)» (o « (3)»…); los dos se conservan con su id. Devuelve true si resolvió el choque.
 */
async function resolverNombreRepetido(contexto: Contexto, c: CambioRemoto, preparada: Preparada): Promise<boolean> {
  const { conexion } = contexto;
  const def = definicionDeEntidad(c.entidad);
  if (!def?.nombreUnico || !preparada.nombre) return false;
  const otros = await conexion.consultar<{ id: string; nombre: string }>(
    `SELECT id, nombre FROM ${entreComillas(c.entidad)} WHERE nombre = ? COLLATE NOCASE AND eliminado_en IS NULL AND id <> ?`,
    [preparada.nombre, c.registro_id],
  );
  const otro = otros[0];
  if (!otro) return false;
  const marcasOtro = (await leerMarcas(conexion, c.entidad, [otro.id])).get(clave(c.entidad, otro.id));
  const creadoOtro = marcasOtro ? (marcasOtro.marcas.campos.creado_en ?? marcasOtro.marcas.base) : MARCA_CERO;
  const orden = compararMarcas(preparada.creadoMarca, creadoOtro) || (c.registro_id < otro.id ? -1 : 1);
  const t = contexto.opciones.ahoraIso;
  if (orden > 0) {
    // El registro que llega es el posterior: se guarda con otro nombre.
    const nuevo = await nombreLibre(conexion, c.entidad, preparada.nombre);
    contexto.cache.delete(clave(c.entidad, c.registro_id));
    const reintento = await intentarUna(contexto, c, nuevo);
    if (!reintento) return false;
    await conexion.ejecutarLote([sentenciaAviso(contexto, "renombrado", c.entidad, c.registro_id, { de: preparada.nombre, a: nuevo })]);
    return true;
  }
  // El que ya estaba es el posterior: se renombra y luego se aplica el que llega con su nombre.
  const nuevo = await nombreLibre(conexion, c.entidad, otro.nombre);
  await conexion.ejecutarLote([
    { sql: `UPDATE ${entreComillas(c.entidad)} SET nombre = ?, modificado_en = ? WHERE id = ?`, parametros: [nuevo, t, otro.id] },
    sentenciaAviso(contexto, "renombrado", c.entidad, otro.id, { de: otro.nombre, a: nuevo }),
  ]);
  contexto.cache.delete(clave(c.entidad, otro.id));
  contexto.cache.delete(clave(c.entidad, c.registro_id));
  return intentarUna(contexto, c);
}

/** Aplica un solo cambio en su propia transacción. Devuelve false si la base lo rechaza (no se escribe nada) o queda como conflicto. */
async function intentarUna(contexto: Contexto, c: CambioRemoto, nombreFinal?: string): Promise<boolean> {
  contexto.contactosVistos.clear();
  const preparada = await prepararOperacion(contexto, c, nombreFinal);
  const sentencias = [...preparada.sentencias, ...(contexto.ultima ? [sentenciaEstado(CLAVES.marcaUltima, contexto.ultima, contexto.opciones.ahoraIso)] : [])];
  try {
    await contexto.conexion.ejecutarLote(sentencias);
    return !preparada.conflicto;
  } catch {
    contexto.cache.delete(clave(c.entidad, c.registro_id));
    return false;
  }
}

/** Camino lento: un cambio por transacción; los que la base rechaza se resuelven (nombres) o se guardan como conflicto. */
async function aplicarUnoPorUno(conexion: Conexion, cambios: readonly CambioRemoto[], opciones: OpcionesAplicar, ultima: string | null): Promise<ResultadoAplicar> {
  const resultado = { ...SIN_CAMBIOS };
  const contexto = nuevoContexto(conexion, opciones, ultima);
  for (const c of cambios) {
    contexto.cache.clear();
    contexto.contactosVistos.clear();
    const preparada = await prepararOperacion(contexto, c);
    const sentencias = [...preparada.sentencias, ...(contexto.ultima ? [sentenciaEstado(CLAVES.marcaUltima, contexto.ultima, opciones.ahoraIso)] : [])];
    if (preparada.conflicto) {
      await conexion.ejecutarLote(sentencias);
      resultado.conflictos++;
      continue;
    }
    try {
      await conexion.ejecutarLote(sentencias);
      resultado.aplicados++;
      if (preparada.restaurado) resultado.restaurados++;
    } catch (error) {
      const motivo = clasificarError(error);
      contexto.cache.clear();
      contexto.ultima = ultima;
      if (motivo === "unico" && (await resolverNombreRepetido(contexto, c, preparada))) {
        resultado.aplicados++;
        resultado.renombrados++;
        continue;
      }
      const mensaje = error instanceof Error ? error.message : String(error);
      await conexion.ejecutarLote([sentenciaAviso(contexto, "conflicto", c.entidad, c.registro_id, { motivo, mensaje }, c)]);
      resultado.conflictos++;
    }
    ultima = contexto.ultima ?? ultima;
  }
  // El cursor y lo demás va al final: si el equipo se cierra antes, el servidor reenvía el mismo envío (la mezcla es idempotente).
  const cierre = [...(ultima ? [sentenciaEstado(CLAVES.marcaUltima, ultima, opciones.ahoraIso)] : []), ...(opciones.extra ?? [])];
  if (cierre.length > 0) await conexion.ejecutarLote(cierre);
  return resultado;
}

async function aplicarSinCandado(conexion: Conexion, cambios: readonly CambioRemoto[], opciones: OpcionesAplicar): Promise<ResultadoAplicar> {
  const ultima = (await leerClave(conexion, CLAVES.marcaUltima)) || null;
  const contexto = nuevoContexto(conexion, opciones, ultima);
  const sentencias: Sentencia[] = [];
  let restaurados = 0;
  let conflictos = 0;
  let rapido = true;
  try {
    for (const c of cambios) {
      const preparada = await prepararOperacion(contexto, c);
      sentencias.push(...preparada.sentencias);
      if (preparada.conflicto) conflictos++;
      else if (preparada.restaurado) restaurados++;
    }
    sentencias.push(...sentenciasDeCierre(contexto));
    if (sentencias.length > 0) await conexion.ejecutarLote(sentencias);
  } catch {
    rapido = false;
  }
  if (rapido) return { aplicados: cambios.length - conflictos, conflictos, renombrados: 0, restaurados };
  return aplicarUnoPorUno(conexion, cambios, opciones, ultima);
}

/** Aplica los cambios recibidos, en el orden en que el servidor los asignó. */
export function aplicarCambios(conexion: Conexion, cambios: readonly CambioRemoto[], opciones: OpcionesAplicar): Promise<ResultadoAplicar> {
  return conCandado(conexion, () => aplicarSinCandado(conexion, cambios, opciones));
}

/**
 * Vuelve a intentar los cambios guardados como conflicto (los que esperaban a su padre o que el propietario ya arregló).
 * Los que ahora se aplican quedan resueltos; los demás siguen en la lista. Devuelve cuántos se aplicaron.
 */
export function reintentarConflictos(conexion: Conexion, opciones: Omit<OpcionesAplicar, "extra">): Promise<number> {
  return conCandado(conexion, async () => {
    const avisos = await conexion.consultar<{ id: string; operacion: string }>(
      `SELECT id, operacion FROM aviso_sincronizacion WHERE tipo = 'conflicto' AND resuelto_en IS NULL AND operacion IS NOT NULL
        ORDER BY json_extract(operacion, '$.seq'), creado_en`,
    );
    let resueltos = 0;
    for (const aviso of avisos) {
      const cambio = JSON.parse(aviso.operacion) as CambioRemoto;
      const ultima = (await leerClave(conexion, CLAVES.marcaUltima)) || null;
      const contexto = nuevoContexto(conexion, { ...opciones }, ultima);
      const preparada = await prepararOperacion(contexto, cambio);
      if (preparada.conflicto) continue;
      try {
        await conexion.ejecutarLote([
          ...preparada.sentencias,
          ...(contexto.ultima ? [sentenciaEstado(CLAVES.marcaUltima, contexto.ultima, opciones.ahoraIso)] : []),
          { sql: `UPDATE aviso_sincronizacion SET resuelto_en = ?, modificado_en = ? WHERE id = ?`, parametros: [opciones.ahoraIso, opciones.ahoraIso, aviso.id] },
        ]);
        resueltos++;
      } catch {
        // sigue esperando
      }
    }
    return resueltos;
  });
}
