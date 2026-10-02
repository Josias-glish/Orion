// Primera sincronización (CA-26, CA-33): subir los datos que ya tiene el primer equipo, descargar todo en un equipo nuevo y
// comprobar que las dos bases quedaron iguales. Reanudable: el avance se guarda y un corte continúa donde quedó.
// Diseño: docs/SINCRONIZACION.md, sección 12.
import { ENTIDADES_SINCRONIZADAS, definicionDeEntidad } from "../dominio/sincronizacion/entidades";
import { codigoDeDispositivo, marcaMayor } from "../dominio/sincronizacion/hlc";
import { idDeterminista } from "../dominio/sincronizacion/ids";
import { operacionesDeInstantanea } from "../dominio/sincronizacion/instantanea";
import type { ValorCampo } from "../dominio/sincronizacion/fusion";
import { ErrorDeRegistro } from "../datos/errores";
import { aplicarCambios, type CambioRemoto } from "../datos/sincronizacion/aplicador";
import { relojDe } from "../datos/sincronizacion/contexto";
import { columnasQueSuben, entreComillas } from "../datos/sincronizacion/esquema";
import { CLAVES, leerClave, leerVinculo, sentenciaEstado } from "../datos/sincronizacion/estado";
import { huellasLocales } from "../datos/sincronizacion/huellas";
import { clave, leerMarcas } from "../datos/sincronizacion/marcas";
import type { Conexion, Sentencia, ValorSql } from "../datos/conexion";
import { aplicarRespuesta, type ClienteDeSincronizacion } from "./cliente";
import type { InicioDeDescarga, OperacionEnviada, PaginaDescargada, RespuestaSincronizar, ResumenDeFinca } from "./protocolo";
import type { Red } from "./red";

export type FaseDePrimera = "subiendo" | "descargando" | "sincronizando" | "verificando" | "lista";

export interface ProgresoDePrimera {
  fase: FaseDePrimera;
  entidad?: string;
  hechas: number;
  total: number;
}

export interface OpcionesDePrimera {
  versionEsquema: number;
  alProgreso?: (progreso: ProgresoDePrimera) => void;
  /** Filas por paso (para las pruebas). */
  filasPorPaso?: number;
}

const FILAS_POR_PASO = 200;
const OPERACIONES_POR_ENVIO = 400;
const PAGINA_DESCARGA = 500;

const iso = (ms: number): string => new Date(ms).toISOString();

async function ahoraCorregido(conexion: Conexion): Promise<{ ms: number; iso: string }> {
  const desfase = Number((await leerClave(conexion, CLAVES.desfaseMs)) ?? 0) || 0;
  const ms = relojDe(conexion).ahoraMs() + desfase;
  return { ms, iso: iso(ms) };
}

/** Todos los ids de la tabla en el orden en que se suben. Los animales: primero los que no tienen padres y luego sus descendientes. */
async function idsEnOrden(conexion: Conexion, tabla: string): Promise<string[]> {
  if (tabla === "animal") {
    const filas = await conexion.consultar<{ id: string }>(
      `WITH RECURSIVE prof (id, d) AS (
         SELECT id, 0 FROM animal WHERE padre_id IS NULL AND madre_id IS NULL
         UNION ALL
         SELECT a.id, p.d + 1 FROM animal a JOIN prof p ON a.padre_id = p.id OR a.madre_id = p.id WHERE p.d < 100
       )
       SELECT id FROM (SELECT id, max(d) AS d FROM prof GROUP BY id) ORDER BY d, id`,
    );
    const conPadres = new Set(filas.map((f) => f.id));
    const resto = await conexion.consultar<{ id: string }>("SELECT id FROM animal ORDER BY id");
    return [...filas.map((f) => f.id), ...resto.map((f) => f.id).filter((id) => !conPadres.has(id))];
  }
  return (await conexion.consultar<{ id: string }>(`SELECT id FROM ${entreComillas(tabla)} ORDER BY id`)).map((f) => f.id);
}

interface Avance {
  entidad: string;
  /** Subida: cuántas filas de la tabla ya se enviaron. */
  desplazamiento: number;
  /** Descarga: desde qué registro sigue la tabla (null = empezar o terminada). */
  despues?: string | null;
}

async function leerAvance(conexion: Conexion, claveEstado: string): Promise<Avance | null> {
  const texto = await leerClave(conexion, claveEstado);
  return texto ? (JSON.parse(texto) as Avance) : null;
}

/**
 * Sube todo lo que había en este equipo antes de vincularse. No pasa por la cola de cambios: lee las tablas en el orden de
 * dependencias y manda cada fila como un `crear` con las marcas que ya tiene (`cambio_id` calculado, así repetir no duplica).
 */
export async function subirDatosIniciales(conexion: Conexion, red: Red, cliente: ClienteDeSincronizacion, opciones: OpcionesDePrimera): Promise<void> {
  const vinculo = await leerVinculo(conexion);
  if (!vinculo) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const { fincaId, dispositivoId } = vinculo;
  const codigo = codigoDeDispositivo(dispositivoId);
  const porPaso = opciones.filasPorPaso ?? FILAS_POR_PASO;
  const reloj = relojDe(conexion);
  await conexion.ejecutarLote([sentenciaEstado(CLAVES.subidaInicial, "en_curso", iso(reloj.ahoraMs()))]);

  let avance = await leerAvance(conexion, "subida_avance");
  const total = (await Promise.all(ENTIDADES_SINCRONIZADAS.map((e) => conexion.consultar<{ n: number }>(`SELECT count(*) AS n FROM ${entreComillas(e.tabla)}`)))).reduce((s, f) => s + f[0].n, 0);
  let hechas = 0;

  for (const def of ENTIDADES_SINCRONIZADAS) {
    if (avance && ENTIDADES_SINCRONIZADAS.findIndex((e) => e.tabla === avance!.entidad) > ENTIDADES_SINCRONIZADAS.indexOf(def)) continue;
    const ids = await idsEnOrden(conexion, def.tabla);
    const columnas = await columnasQueSuben(conexion, def.tabla);
    let desde = avance && avance.entidad === def.tabla ? avance.desplazamiento : 0;
    hechas += desde;
    while (desde < ids.length) {
      const trozo = ids.slice(desde, desde + porPaso);
      const filas = await conexion.consultar<Record<string, ValorSql>>(`SELECT * FROM ${entreComillas(def.tabla)} WHERE id IN (${trozo.map(() => "?").join(", ")})`, trozo);
      const marcas = await leerMarcas(conexion, def.tabla, trozo);
      const operaciones: OperacionEnviada[] = [];
      for (const fila of filas) {
        const id = fila.id as string;
        // Los registros ya emitidos o anulados entran por `importar_registros_emitidos` (el servidor es quien lleva los números).
        if (def.tabla === "registro_genealogico" && fila.estado !== "borrador") continue;
        const valores: Record<string, ValorCampo> = {};
        for (const c of columnas) valores[c] = (fila[c] ?? null) as ValorCampo;
        const marcado = marcas.get(clave(def.tabla, id));
        const base = `${fila.modificado_en}-0000-${codigo}`;
        if (marcado) valores.eliminado_en = marcado.eliminadoValor;
        const grupo = idDeterminista(fincaId, "grupo", def.tabla, id);
        operacionesDeInstantanea(valores, marcado?.marcas ?? { base, campos: {} }).forEach((op, i) =>
          operaciones.push({
            id: idDeterminista(fincaId, def.tabla, id, op.marca),
            grupo_id: grupo,
            orden: i,
            entidad: def.tabla,
            registro_id: id,
            operacion: i === 0 ? "crear" : "modificar",
            campos: op.campos as Record<string, string | number | null>,
            marca: op.marca,
            usuario_id: null,
          }),
        );
      }
      for (let i = 0; i < operaciones.length || i === 0; ) {
        // Sin partir los cambios de un mismo registro entre dos envíos.
        let fin = Math.min(i + OPERACIONES_POR_ENVIO, operaciones.length);
        while (fin < operaciones.length && operaciones[fin].grupo_id === operaciones[fin - 1].grupo_id) fin--;
        if (fin <= i) fin = Math.min(i + OPERACIONES_POR_ENVIO, operaciones.length);
        await enviarLote(conexion, red, vinculo.fincaId, dispositivoId, opciones.versionEsquema, operaciones.slice(i, fin));
        i = fin;
        if (operaciones.length === 0) break;
      }
      desde += trozo.length;
      hechas += trozo.length;
      avance = { entidad: def.tabla, desplazamiento: desde };
      await conexion.ejecutarLote([sentenciaEstado("subida_avance", JSON.stringify(avance), (await ahoraCorregido(conexion)).iso)]);
      opciones.alProgreso?.({ fase: "subiendo", entidad: def.tabla, hechas: Math.min(hechas, total), total });
    }
    if (def.tabla === "registro_genealogico") await importarRegistrosEmitidos(conexion, red, vinculo.fincaId, dispositivoId, codigo);
    if (def.tabla === "libro") await fijarContadores(conexion, red, vinculo.fincaId, dispositivoId);
    avance = { entidad: def.tabla, desplazamiento: ids.length };
  }
  await conexion.ejecutarLote([sentenciaEstado(CLAVES.subidaInicial, "completa", (await ahoraCorregido(conexion)).iso)]);
  opciones.alProgreso?.({ fase: "sincronizando", hechas: total, total });
  // Lo que el servidor produjo al recibir (por ejemplo, los contadores de los libros) y lo que se hizo mientras tanto.
  await cliente.sincronizar();
}

async function enviarLote(conexion: Conexion, red: Red, fincaId: string, dispositivoId: string, versionEsquema: number, operaciones: OperacionEnviada[]): Promise<void> {
  const reloj = relojDe(conexion);
  const cursor = Number((await leerClave(conexion, CLAVES.cursorSeq)) ?? 0) || 0;
  const inicio = reloj.ahoraMs();
  const respuesta = await red.rpc<RespuestaSincronizar>("sincronizar", {
    p_finca_id: fincaId,
    p_dispositivo_id: dispositivoId,
    p_version_esquema: versionEsquema,
    p_desde: cursor,
    p_cambios: operaciones,
    p_limite: PAGINA_DESCARGA,
  });
  const fin = reloj.ahoraMs();
  if (respuesta.rechazados.length > 0) throw new ErrorDeRegistro([{ codigo: "subida_rechazada", motivo: respuesta.rechazados[0].motivo }]);
  await aplicarRespuesta(conexion, respuesta, { cursor, inicio, fin }, async () => 0);
}

/** Los registros emitidos o anulados los recibe el servidor de una sola vez, y deja el contador de cada libro en `último + 1` (R31). */
async function importarRegistros(conexion: Conexion): Promise<{ registro_id: string; campos: Record<string, ValorSql>; marca: string }[]> {
  const columnas = (await columnasQueSuben(conexion, "registro_genealogico")).concat(["consecutivo", "numero", "estado", "version", "instantanea", "motivo_anulacion"]);
  const filas = await conexion.consultar<Record<string, ValorSql>>("SELECT * FROM registro_genealogico WHERE estado <> 'borrador' ORDER BY libro_id, consecutivo");
  const marcas = await leerMarcas(conexion, "registro_genealogico", filas.map((f) => f.id as string));
  return filas.map((fila) => {
    const campos: Record<string, ValorSql> = {};
    for (const c of new Set(columnas)) campos[c] = fila[c] ?? null;
    const marcado = marcas.get(clave("registro_genealogico", fila.id as string));
    let marca = `${fila.modificado_en}-0000-`;
    if (marcado) {
      marca = Object.values(marcado.marcas.campos).reduce(marcaMayor, marcado.marcas.base);
      campos.eliminado_en = marcado.eliminadoValor;
    }
    return { registro_id: fila.id as string, campos, marca };
  });
}

async function importarRegistrosEmitidos(conexion: Conexion, red: Red, fincaId: string, dispositivoId: string, codigo: string): Promise<void> {
  const registros = (await importarRegistros(conexion)).map((r) => (r.marca.endsWith("-") ? { ...r, marca: r.marca + codigo } : r));
  if (registros.length === 0) return;
  await red.rpc("importar_registros_emitidos", {
    p_finca_id: fincaId,
    p_dispositivo_id: dispositivoId,
    p_cambio_id: idDeterminista(fincaId, "importar_registros_emitidos"),
    p_registros: registros,
  });
}

/** Un libro sin registros numerados que tiene un «siguiente número» distinto de 1 se lo pide al servidor (R31). */
async function fijarContadores(conexion: Conexion, red: Red, fincaId: string, dispositivoId: string): Promise<void> {
  const libros = await conexion.consultar<{ id: string; siguiente_numero: number }>(
    `SELECT id, siguiente_numero FROM libro l WHERE siguiente_numero > 1
        AND NOT EXISTS (SELECT 1 FROM registro_genealogico r WHERE r.libro_id = l.id AND r.consecutivo IS NOT NULL)`,
  );
  for (const libro of libros) {
    await red.rpc("fijar_siguiente_numero", {
      p_finca_id: fincaId,
      p_dispositivo_id: dispositivoId,
      p_cambio_id: idDeterminista(fincaId, "fijar_siguiente_numero", libro.id),
      p_libro_id: libro.id,
      p_valor: libro.siguiente_numero,
    });
  }
}

/** Descarga el estado actual de la finca, entidad por entidad y por páginas, en un equipo recién unido. */
export async function descargarDatosIniciales(conexion: Conexion, red: Red, cliente: ClienteDeSincronizacion, opciones: OpcionesDePrimera): Promise<void> {
  const vinculo = await leerVinculo(conexion);
  if (!vinculo) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const { fincaId, dispositivoId } = vinculo;
  await conexion.ejecutarLote([sentenciaEstado(CLAVES.descargaInicial, "en_curso", (await ahoraCorregido(conexion)).iso)]);

  let semilla = Number((await leerClave(conexion, "descarga_seq_inicial")) ?? 0) || 0;
  let total = 0;
  const inicioDescarga = async (): Promise<InicioDeDescarga> => {
    const r = await red.rpc<InicioDeDescarga>("iniciar_descarga", { p_finca_id: fincaId, p_dispositivo_id: dispositivoId });
    return r;
  };
  const guardado = await leerClave(conexion, "descarga_seq_inicial");
  const inicio = await inicioDescarga();
  if (!guardado) {
    semilla = inicio.seq_inicial;
    await conexion.ejecutarLote([sentenciaEstado("descarga_seq_inicial", String(semilla), (await ahoraCorregido(conexion)).iso)]);
  }
  total = Object.values(inicio.conteos).reduce((s, n) => s + n, 0);

  let avance = await leerAvance(conexion, "descarga_avance");
  let hechas = 0;
  for (const def of ENTIDADES_SINCRONIZADAS) {
    if (avance && ENTIDADES_SINCRONIZADAS.findIndex((e) => e.tabla === avance!.entidad) > ENTIDADES_SINCRONIZADAS.indexOf(def)) continue;
    let despues: string | null = avance && avance.entidad === def.tabla ? (avance.despues ?? null) : null;
    for (;;) {
      const pagina = await red.rpc<PaginaDescargada & { hora_servidor_ms?: number }>("descargar_pagina", {
        p_finca_id: fincaId,
        p_dispositivo_id: dispositivoId,
        p_entidad: def.tabla,
        p_despues_de: despues,
        p_limite: PAGINA_DESCARGA,
      });
      const ahora = await ahoraCorregido(conexion);
      const autorref = new Set(definicionDeEntidad(def.tabla)?.autorreferencias ?? []);
      const cambios: CambioRemoto[] = [];
      const segundaPasada: CambioRemoto[] = [];
      for (const registro of pagina.registros) {
        const construir = (op: { campos: Record<string, ValorCampo>; marca: string }, i: number, pasada: number): CambioRemoto => ({
          seq: 0,
          cambio_id: idDeterminista(fincaId, "descarga", def.tabla, registro.registro_id, String(pasada), String(i)),
          grupo_id: idDeterminista(fincaId, "descarga", def.tabla, registro.registro_id),
          orden: i,
          dispositivo_id: dispositivoId,
          usuario_id: null,
          entidad: def.tabla,
          registro_id: registro.registro_id,
          operacion: i === 0 && pasada === 0 ? "crear" : "modificar",
          campos: op.campos,
          marca: op.marca,
        });
        const valores = registro.campos as Record<string, ValorCampo>;
        const primera = operacionesDeInstantanea(valores, registro.marcas, { omitir: autorref });
        primera.forEach((op, i) => cambios.push(construir(op, i, 0)));
        if (autorref.size > 0) operacionesDeInstantanea(valores, registro.marcas, { solo: autorref }).forEach((op, i) => segundaPasada.push(construir(op, i, 1)));
      }
      const siguiente = pagina.siguiente;
      const progreso: Sentencia[] = [
        sentenciaEstado("descarga_avance", JSON.stringify({ entidad: def.tabla, desplazamiento: 0, despues: siguiente }), ahora.iso),
      ];
      await aplicarCambios(conexion, cambios, { ahoraIso: ahora.iso, ahoraMs: ahora.ms, sinHistorial: true, extra: segundaPasada.length === 0 ? progreso : [] });
      if (segundaPasada.length > 0) await aplicarCambios(conexion, segundaPasada, { ahoraIso: ahora.iso, ahoraMs: ahora.ms, sinHistorial: true, extra: progreso });
      hechas += pagina.registros.length;
      avance = { entidad: def.tabla, desplazamiento: 0, despues: siguiente };
      opciones.alProgreso?.({ fase: "descargando", entidad: def.tabla, hechas: Math.min(hechas, total), total });
      if (siguiente === null) break;
      despues = siguiente;
    }
    avance = { entidad: def.tabla, desplazamiento: 0, despues: null };
  }
  const ahora = await ahoraCorregido(conexion);
  await conexion.ejecutarLote([
    sentenciaEstado(CLAVES.cursorSeq, String(semilla), ahora.iso),
    sentenciaEstado(CLAVES.descargaInicial, "completa", ahora.iso),
  ]);
  opciones.alProgreso?.({ fase: "sincronizando", hechas: total, total });
  await cliente.sincronizar();
}

export interface FilaDelInforme {
  entidad: string;
  locales: number;
  servidor: number;
  /** Filas de la tabla sin marcas en este equipo. */
  sinMarcas: number;
  coincide: boolean;
}

export interface InformeDeVerificacion {
  generadoEn: string;
  coincide: boolean;
  filas: FilaDelInforme[];
}

/** Compara este equipo con el servidor, tabla por tabla: cantidad de filas (con las eliminadas) y huella. */
export async function verificarContraElServidor(conexion: Conexion, red: Red): Promise<InformeDeVerificacion> {
  const vinculo = await leerVinculo(conexion);
  if (!vinculo) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const resumen = await red.rpc<ResumenDeFinca>("resumen_finca", { p_finca_id: vinculo.fincaId, p_dispositivo_id: vinculo.dispositivoId });
  const locales = await huellasLocales(conexion);
  const delServidor = new Map(resumen.entidades.map((e) => [e.entidad, e]));
  const filas: FilaDelInforme[] = locales.map((l) => {
    const s = delServidor.get(l.entidad);
    const vacia = l.filas === 0 && !s;
    return {
      entidad: l.entidad,
      locales: l.filas,
      servidor: s?.filas ?? 0,
      sinMarcas: l.sinMarcas,
      coincide: vacia || (s !== undefined && s.filas === l.filas && s.huella === l.huella && l.sinMarcas === 0),
    };
  });
  for (const s of resumen.entidades) if (!locales.some((l) => l.entidad === s.entidad)) filas.push({ entidad: s.entidad, locales: 0, servidor: s.filas, sinMarcas: 0, coincide: s.filas === 0 });
  const informe = { generadoEn: iso((await ahoraCorregido(conexion)).ms), coincide: filas.every((f) => f.coincide), filas };
  await conexion.ejecutarLote([sentenciaEstado(CLAVES.informeVerificacion, JSON.stringify(informe), informe.generadoEn)]);
  return informe;
}

