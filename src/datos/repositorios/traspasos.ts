// RF-50, RF-16 y RF-36 (Etapa 9, especificación 2): compra y venta de animales (R32 y R20), historial de traspasos,
// inventario del hato y datos de la hoja de venta (R21). Es solo el registro de lo que pasó: no hay mercado en línea.
// R23: solo el propietario. Toda escritura pasa por `Cambios` y valida todo antes de escribir (D-019).
import { esFechaValida, fechaLocal } from "../../dominio/fechas";
import { validarPeriodo, validarMovimiento, type Periodo, type TipoMovimiento } from "../../dominio/finanzas";
import type { EntradaHojaVenta, LactanciaParaVenta } from "../../dominio/hoja-venta";
import { armarInventario, type AnimalDeInventario, type Inventario } from "../../dominio/inventario";
import { normalizarValor } from "../../dominio/identificadores";
import type { EstadoAnimal, OrigenAnimal, TipoIdentificador } from "../../dominio/tipos";
import {
  esRutaDeAdjunto,
  movimientoDeTraspaso,
  validarCompra,
  validarVenta,
  type AnimalParaTraspaso,
  type TipoTraspaso,
} from "../../dominio/traspasos";
import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio } from "../conexion";
import { ErrorDeRegistro, rechazarSi, type Motivo } from "../errores";
import {
  filaDeAnimal,
  obtenerAnimal,
  prepararAnimalNuevo,
  prepararIdentificadores,
  validarAnimal,
  type Animal,
  type DatosAnimal,
} from "./animales";
import { lactanciasDeHembra } from "./leche";
import { obtenerDatosDeRegistro, pedigriDe, registroVigenteDe } from "./registros";

// ---------------------------------------------------------------- Lectura de un animal para las reglas

async function animalParaTraspaso(conexion: Conexion, id: string): Promise<AnimalParaTraspaso | null> {
  const [fila] = await conexion.consultar<{
    nombre: string;
    origen: OrigenAnimal;
    enHato: number;
    estado: EstadoAnimal;
    fechaNacimiento: string | null;
    fechaIngreso: string | null;
  }>(
    `SELECT coalesce(a.nombre, i.valor, '') AS nombre, a.origen, a.en_hato AS enHato, a.estado,
            a.fecha_nacimiento AS fechaNacimiento, a.fecha_ingreso AS fechaIngreso
     FROM animal AS a
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE a.id = ? AND a.eliminado_en IS NULL`,
    [id],
  );
  return fila ? { ...fila, enHato: fila.enHato === 1 } : null;
}

async function existeContacto(conexion: Conexion, id: string): Promise<boolean> {
  const [fila] = await conexion.consultar<{ id: string }>("SELECT id FROM contacto WHERE id = ? AND eliminado_en IS NULL", [id]);
  return Boolean(fila);
}

/** La categoría del movimiento que se ofrece, validada como en Finanzas (tipo, activa, valor entero mayor que cero). */
async function validarCategoria(conexion: Conexion, categoriaId: string, tipo: TipoMovimiento, valor: number, animalId: string | null): Promise<void> {
  const [categoria] = await conexion.consultar<{ tipo: TipoMovimiento; activo: number }>(
    "SELECT tipo, activo FROM categoria_economica WHERE id = ? AND eliminado_en IS NULL",
    [categoriaId],
  );
  if (!categoria) throw new ErrorDeRegistro([{ codigo: "dato_obligatorio", campo: "categoria_id" }]);
  rechazarSi(validarMovimiento({ tipo, valor, animalId, loteId: null }, { tipo: categoria.tipo, activo: categoria.activo === 1 }));
}

const adjuntosEnJson = (adjuntos: readonly string[]) => (adjuntos.length > 0 ? JSON.stringify(adjuntos) : null);

// ---------------------------------------------------------------- Compra (R32)

export interface DatosCompra {
  /** Animal que ya existe como de otra finca (o solo genealogía) y se promueve a comprado; null = crear uno nuevo. */
  animalId: string | null;
  /** Datos del animal nuevo (cuando `animalId` es null). El origen, el hato, el vendedor y la fecha de ingreso los pone la compra. */
  nuevo: DatosAnimal | null;
  /** R29: padre y madre que no están en la finca, para cargarlos como animales de otras fincas. */
  padreNuevo: DatosAnimal | null;
  madreNuevo: DatosAnimal | null;
  /** El vendedor (un contacto). Es el propietario que se anota a los padres nuevos que no traigan otro. */
  vendedorId: string | null;
  /** Fecha de ingreso a la finca: desde ese día cuenta en el inventario. */
  fechaIngreso: string;
  /** Pesos enteros; vacío si no se anotó. */
  precio: number | null;
  /** Número de registro de la asociación del animal (se guarda como su identificador `registro_asociacion`). */
  registroAsociacion: string | null;
  /** Rutas de los adjuntos ya copiados a la carpeta de documentos (PDF o imagen). */
  adjuntos: string[];
  observaciones: string | null;
  loteId: string | null;
  /** R32: crear también el gasto «Compra de animales» en Finanzas (solo si hay precio). */
  crearGasto: boolean;
  /** Texto del gasto, armado por la pantalla. */
  descripcionMovimiento?: string | null;
}

export interface ResultadoTraspaso {
  traspasoId: string;
  animalId: string;
  /** El gasto o ingreso que se creó en Finanzas, si se aceptó. */
  movimientoId: string | null;
}

/** El identificador del registro de asociación que se agrega a un animal (principal solo si no tiene otro vigente). */
function conRegistroDeAsociacion(
  identificadores: DatosAnimal["identificadores"],
  registro: string | null,
): DatosAnimal["identificadores"] {
  const valor = registro ? normalizarValor(registro) : "";
  if (!valor) return identificadores;
  const yaEsta = identificadores.some((i) => i.tipo === "registro_asociacion" && i.vigente && normalizarValor(i.valor).toUpperCase() === valor.toUpperCase());
  if (yaEsta) return identificadores;
  const hayPrincipal = identificadores.some((i) => i.vigente && i.principal);
  return [...identificadores, { tipo: "registro_asociacion", valor, fecha: null, vigente: true, principal: !hayPrincipal }];
}

/** Un padre o madre nuevo siempre es un animal de otra finca (R29): sin lote, fuera del hato y con propietario. */
function comoExterno(datos: DatosAnimal, sexo: "macho" | "hembra", vendedorId: string): DatosAnimal {
  return { ...datos, sexo, origen: "externo", enHato: false, estado: "activo", loteId: null, contactoId: datos.contactoId ?? vendedorId, fechaIngreso: null, padreId: null, madreId: null };
}

/**
 * R32: registra una compra. Promueve a «comprado» a un animal que ya existe como de otra finca (conservando su id y su
 * genealogía) o crea uno nuevo con ese origen, y guarda el vendedor, la fecha de ingreso, el precio, el registro de
 * asociación y los adjuntos. Si el animal trae padre y madre que no están en la finca, los carga como animales de otras
 * fincas. Con `crearGasto` y precio, anota el gasto «Compra de animales». Todo se valida antes de escribir.
 */
export async function registrarCompra(
  conexion: Conexion,
  datos: DatosCompra,
  contexto: ContextoCambio,
  hoy: string = fechaLocal(),
): Promise<ResultadoTraspaso> {
  exigirPermiso(contexto, "gestionar_traspasos");
  const existente = datos.animalId ? await obtenerAnimal(conexion, datos.animalId) : null;
  if (datos.animalId && !existente) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  if (!existente && !datos.nuevo) throw new ErrorDeRegistro([{ codigo: "dato_obligatorio", campo: "animal" }]);

  const motivos: Motivo[] = validarCompra({
    animal: existente ? await animalParaTraspaso(conexion, existente.id) : null,
    vendedorId: datos.vendedorId,
    fecha: datos.fechaIngreso,
    precio: datos.precio,
    adjuntos: datos.adjuntos,
    hoy,
  });
  if (datos.vendedorId && !(await existeContacto(conexion, datos.vendedorId))) motivos.push({ codigo: "no_encontrado" });
  const nacimientoNuevo = existente ? null : (datos.nuevo?.fechaNacimiento ?? null);
  if (nacimientoNuevo && esFechaValida(datos.fechaIngreso) && datos.fechaIngreso < nacimientoNuevo) {
    motivos.push({ codigo: "fecha_anterior_al_nacimiento", otro: datos.nuevo?.nombre ?? "" });
  }
  rechazarSi(motivos);
  const vendedorId = datos.vendedorId!;

  // El animal tal como queda después de la compra (los padres nuevos se enlazan al guardar).
  const base: DatosAnimal = existente ?? { ...datos.nuevo! };
  const despues: DatosAnimal = {
    ...base,
    origen: "comprado",
    enHato: true,
    estado: "activo",
    contactoId: vendedorId,
    fechaIngreso: datos.fechaIngreso,
    loteId: datos.loteId ?? base.loteId,
    identificadores: conRegistroDeAsociacion(base.identificadores, datos.registroAsociacion),
  };

  // R29: los padres que se cargan como animales de otras fincas.
  const padres = [
    { campo: "padre" as const, datos: datos.padreNuevo, sexo: "macho" as const, actual: despues.padreId },
    { campo: "madre" as const, datos: datos.madreNuevo, sexo: "hembra" as const, actual: despues.madreId },
  ];
  const nuevosPadres: { campo: "padre" | "madre"; datos: DatosAnimal }[] = [];
  for (const p of padres) {
    if (!p.datos) continue;
    if (p.actual) motivos.push({ codigo: "compra_ancestro_ya_registrado", campo: p.campo });
    else nuevosPadres.push({ campo: p.campo, datos: comoExterno(p.datos, p.sexo, vendedorId) });
  }
  rechazarSi(motivos);

  motivos.push(...(await validarAnimal(conexion, despues, existente?.id ?? null, hoy)));
  for (const p of nuevosPadres) {
    motivos.push(...(await validarAnimal(conexion, p.datos, null, hoy)));
    const nacio = p.datos.fechaNacimiento;
    if (nacio && despues.fechaNacimiento && nacio >= despues.fechaNacimiento) {
      motivos.push({ codigo: p.campo === "padre" ? "padre_nacio_despues" : "madre_nacio_despues", otro: p.datos.nombre ?? "" });
    }
  }
  // R2 entre los animales que se crean juntos: la base solo ve lo que ya está guardado.
  const conjunto: { nombre: string; datos: DatosAnimal }[] = [{ nombre: despues.nombre ?? "", datos: despues }, ...nuevosPadres.map((p) => ({ nombre: p.datos.nombre ?? "", datos: p.datos }))];
  const vistos = new Map<string, string>();
  for (const a of conjunto) {
    for (const i of a.datos.identificadores.filter((x) => x.vigente)) {
      // Los identificadores que el animal ya tenía los revisó validarAnimal contra los de la base; aquí solo importan los nuevos.
      if (existente && a.datos === despues && i.id) continue;
      const clave = `${i.tipo}|${normalizarValor(i.valor).toUpperCase()}`;
      const otro = vistos.get(clave);
      if (otro !== undefined) motivos.push({ codigo: "identificador_duplicado", tipo: i.tipo, valor: normalizarValor(i.valor), otro });
      else vistos.set(clave, a.nombre);
    }
  }

  const movimiento = datos.crearGasto ? movimientoDeTraspaso({ tipo: "compra", precio: datos.precio, fecha: datos.fechaIngreso }) : null;
  if (movimiento) {
    try {
      await validarCategoria(conexion, movimiento.categoriaId, movimiento.tipo, movimiento.valor, null);
    } catch (e) {
      if (e instanceof ErrorDeRegistro) motivos.push(...e.motivos);
      else throw e;
    }
  }
  rechazarSi(motivos);

  // Todo está validado: se escribe en este orden (padres, animal, gasto, traspaso) porque cada fila apunta a la anterior.
  const cambios = new Cambios(contexto);
  const idsPadres = new Map<"padre" | "madre", string>();
  for (const p of nuevosPadres) idsPadres.set(p.campo, prepararAnimalNuevo(cambios, p.datos));
  const conPadres: DatosAnimal = { ...despues, padreId: idsPadres.get("padre") ?? despues.padreId, madreId: idsPadres.get("madre") ?? despues.madreId };
  let animalId: string;
  if (existente) {
    cambios.actualizar("animal", existente.id, filaDeAnimal(existente), filaDeAnimal(conPadres));
    prepararIdentificadores(cambios, existente.id, existente.identificadores, conPadres.identificadores);
    animalId = existente.id;
  } else {
    animalId = prepararAnimalNuevo(cambios, conPadres);
  }
  const movimientoId = movimiento
    ? cambios.insertar("movimiento_economico", {
        fecha: movimiento.fecha,
        tipo: movimiento.tipo,
        categoria_id: movimiento.categoriaId,
        valor: movimiento.valor,
        animal_id: animalId,
        lote_id: null,
        descripcion: datos.descripcionMovimiento?.trim() || null,
      })
    : null;
  const traspasoId = cambios.insertar("traspaso", {
    animal_id: animalId,
    tipo: "compra",
    contacto_id: vendedorId,
    fecha: datos.fechaIngreso,
    precio: datos.precio,
    observaciones: datos.observaciones?.trim() || null,
    adjuntos: adjuntosEnJson(datos.adjuntos),
    movimiento_id: movimientoId,
  });
  await cambios.aplicar(conexion);
  return { traspasoId, animalId, movimientoId };
}

// ---------------------------------------------------------------- Venta (R20)

export interface DatosVenta {
  animalId: string;
  /** El comprador (un contacto). */
  compradorId: string | null;
  fecha: string;
  precio: number | null;
  observaciones: string | null;
  /** R20: crear también el ingreso «Venta de animales» en Finanzas (solo si hay precio). */
  crearIngreso: boolean;
  /** Texto del ingreso, armado por la pantalla. */
  descripcionMovimiento?: string | null;
}

/**
 * R20: registra la venta de un animal del hato. Lo marca como vendido (R11: sale del ordeño, los servicios y el
 * inventario) sin tocar su historial, su genealogía ni su registro propio, y ofrece anotar el ingreso en Finanzas.
 */
export async function registrarVenta(
  conexion: Conexion,
  datos: DatosVenta,
  contexto: ContextoCambio,
  hoy: string = fechaLocal(),
): Promise<ResultadoTraspaso> {
  exigirPermiso(contexto, "gestionar_traspasos");
  const animal = await animalParaTraspaso(conexion, datos.animalId);
  if (!animal) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const motivos: Motivo[] = validarVenta({ animal, compradorId: datos.compradorId, fecha: datos.fecha, precio: datos.precio, hoy });
  if (datos.compradorId && !(await existeContacto(conexion, datos.compradorId))) motivos.push({ codigo: "no_encontrado" });
  rechazarSi(motivos);

  const movimiento = datos.crearIngreso ? movimientoDeTraspaso({ tipo: "venta", precio: datos.precio, fecha: datos.fecha }) : null;
  if (movimiento) await validarCategoria(conexion, movimiento.categoriaId, movimiento.tipo, movimiento.valor, datos.animalId);

  const cambios = new Cambios(contexto);
  cambios.actualizar("animal", datos.animalId, { estado: animal.estado }, { estado: "vendido" });
  const movimientoId = movimiento
    ? cambios.insertar("movimiento_economico", {
        fecha: movimiento.fecha,
        tipo: movimiento.tipo,
        categoria_id: movimiento.categoriaId,
        valor: movimiento.valor,
        animal_id: datos.animalId,
        lote_id: null,
        descripcion: datos.descripcionMovimiento?.trim() || null,
      })
    : null;
  const traspasoId = cambios.insertar("traspaso", {
    animal_id: datos.animalId,
    tipo: "venta",
    contacto_id: datos.compradorId!,
    fecha: datos.fecha,
    precio: datos.precio,
    observaciones: datos.observaciones?.trim() || null,
    adjuntos: null,
    movimiento_id: movimientoId,
  });
  await cambios.aplicar(conexion);
  return { traspasoId, animalId: datos.animalId, movimientoId };
}

// ---------------------------------------------------------------- Historial

export interface FilaTraspaso {
  id: string;
  tipo: TipoTraspaso;
  fecha: string;
  precio: number | null;
  observaciones: string | null;
  adjuntos: string[];
  animalId: string;
  animal: string;
  identificador: string | null;
  contactoId: string;
  /** «Nombre · Criadero» del vendedor o comprador. */
  contacto: string;
  /** El ingreso o gasto de Finanzas que nació de este traspaso. */
  movimientoId: string | null;
}

export interface FiltroTraspasos extends Partial<Periodo> {
  tipo?: TipoTraspaso | null;
  contactoId?: string | null;
}

const SELECT_TRASPASO = `
  SELECT t.id, t.tipo, t.fecha, t.precio, t.observaciones, t.adjuntos, t.animal_id AS animalId,
         coalesce(a.nombre, ia.valor, '') AS animal, ia.valor AS identificador,
         t.contacto_id AS contactoId, c.nombre || coalesce(' · ' || c.criadero, '') AS contacto,
         t.movimiento_id AS movimientoId
  FROM traspaso AS t
  JOIN animal AS a ON a.id = t.animal_id
  JOIN contacto AS c ON c.id = t.contacto_id
  LEFT JOIN identificador AS ia ON ia.animal_id = a.id AND ia.principal = 1 AND ia.eliminado_en IS NULL
  WHERE t.eliminado_en IS NULL`;

type FilaCruda = Omit<FilaTraspaso, "adjuntos"> & { adjuntos: string | null };

function aFilaTraspaso({ adjuntos, ...fila }: FilaCruda): FilaTraspaso {
  let lista: string[] = [];
  try {
    const leidos: unknown = adjuntos ? JSON.parse(adjuntos) : [];
    // Solo rutas que el programa mismo copió: una ruta de otro lugar nunca se muestra ni se abre.
    if (Array.isArray(leidos)) lista = leidos.filter((r): r is string => typeof r === "string" && esRutaDeAdjunto(r));
  } catch {
    lista = [];
  }
  return { ...fila, adjuntos: lista };
}

/** RF-50 y RF-16: compras y ventas, de la más reciente a la más antigua, con filtros por periodo, tipo y contacto. */
export async function listarTraspasos(conexion: Conexion, filtro: FiltroTraspasos = {}): Promise<FilaTraspaso[]> {
  const periodo = { desde: filtro.desde ?? null, hasta: filtro.hasta ?? null };
  rechazarSi(validarPeriodo(periodo));
  const filas = await conexion.consultar<FilaCruda>(
    `${SELECT_TRASPASO}
       AND (? IS NULL OR t.fecha >= ?) AND (? IS NULL OR t.fecha <= ?)
       AND (? IS NULL OR t.tipo = ?) AND (? IS NULL OR t.contacto_id = ?)
     ORDER BY t.fecha DESC, t.creado_en DESC, t.id`,
    [periodo.desde, periodo.desde, periodo.hasta, periodo.hasta, filtro.tipo ?? null, filtro.tipo ?? null, filtro.contactoId ?? null, filtro.contactoId ?? null],
  );
  return filas.map(aFilaTraspaso);
}

/** Los traspasos de un animal (su compra y su venta), del más reciente al más antiguo. */
export async function traspasosDeAnimal(conexion: Conexion, animalId: string): Promise<FilaTraspaso[]> {
  const filas = await conexion.consultar<FilaCruda>(`${SELECT_TRASPASO} AND t.animal_id = ? ORDER BY t.fecha DESC, t.creado_en DESC, t.id`, [animalId]);
  return filas.map(aFilaTraspaso);
}

/**
 * R32 y R20: crea después el gasto o el ingreso de un traspaso con precio, si al registrarlo no se aceptó. Una sola vez:
 * el traspaso queda enlazado con su movimiento.
 */
export async function crearMovimientoDeTraspaso(
  conexion: Conexion,
  traspasoId: string,
  contexto: ContextoCambio,
  descripcion: string | null = null,
): Promise<string> {
  exigirPermiso(contexto, "gestionar_traspasos");
  exigirPermiso(contexto, "gestionar_finanzas");
  const [t] = await conexion.consultar<{ animalId: string; tipo: TipoTraspaso; fecha: string; precio: number | null; movimientoId: string | null }>(
    "SELECT animal_id AS animalId, tipo, fecha, precio, movimiento_id AS movimientoId FROM traspaso WHERE id = ? AND eliminado_en IS NULL",
    [traspasoId],
  );
  if (!t) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  if (t.movimientoId) throw new ErrorDeRegistro([{ codigo: "traspaso_ya_con_movimiento" }]);
  const movimiento = movimientoDeTraspaso(t);
  if (!movimiento) throw new ErrorDeRegistro([{ codigo: "traspaso_sin_precio" }]);
  await validarCategoria(conexion, movimiento.categoriaId, movimiento.tipo, movimiento.valor, t.animalId);
  const cambios = new Cambios(contexto);
  const movimientoId = cambios.insertar("movimiento_economico", {
    fecha: movimiento.fecha,
    tipo: movimiento.tipo,
    categoria_id: movimiento.categoriaId,
    valor: movimiento.valor,
    animal_id: t.animalId,
    lote_id: null,
    descripcion: descripcion?.trim() || null,
  });
  cambios.actualizar("traspaso", traspasoId, { movimiento_id: null }, { movimiento_id: movimientoId });
  await cambios.aplicar(conexion);
  return movimientoId;
}

// ---------------------------------------------------------------- Inventario (RF-36)

/**
 * RF-36: el inventario del hato a una fecha (por defecto, hoy). Las filas salen de las mismas reglas del dominio que
 * el contador de Inicio: animales del hato que siguen activos, y los comprados desde su fecha de ingreso.
 */
export async function datosInventario(conexion: Conexion, hoy: string = fechaLocal()): Promise<Inventario> {
  const filas = await conexion.consultar<Omit<AnimalDeInventario, "enHato" | "razas"> & { enHato: number }>(
    `SELECT a.id, a.nombre, i.valor AS identificador,
            (SELECT x.valor FROM identificador AS x
             WHERE x.animal_id = a.id AND x.tipo = 'registro_asociacion' AND x.vigente = 1 AND x.eliminado_en IS NULL
             ORDER BY x.principal DESC, x.creado_en LIMIT 1) AS registroAsociacion,
            a.sexo, a.fecha_nacimiento AS fechaNacimiento, a.estado, a.origen, a.en_hato AS enHato,
            a.fecha_ingreso AS fechaIngreso, l.nombre AS lote, b.nombre AS libro
     FROM animal AS a
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     LEFT JOIN lote AS l ON l.id = a.lote_id
     LEFT JOIN libro AS b ON b.id = a.libro_id
     WHERE a.eliminado_en IS NULL AND a.en_hato = 1 AND a.origen <> 'externo' AND a.estado = 'activo'`,
  );
  const razas = await conexion.consultar<{ animalId: string; raza: string; fraccion: number }>(
    `SELECT c.animal_id AS animalId, r.nombre AS raza, c.fraccion
     FROM composicion_racial AS c
     JOIN raza AS r ON r.id = c.raza_id
     JOIN animal AS a ON a.id = c.animal_id
     WHERE c.eliminado_en IS NULL AND a.eliminado_en IS NULL AND a.en_hato = 1 AND a.origen <> 'externo' AND a.estado = 'activo'
     ORDER BY c.fraccion DESC, r.nombre`,
  );
  const porAnimal = new Map<string, { raza: string; fraccion: number }[]>();
  for (const r of razas) porAnimal.set(r.animalId, [...(porAnimal.get(r.animalId) ?? []), { raza: r.raza, fraccion: r.fraccion }]);
  return armarInventario(
    filas.map((f) => ({ ...f, enHato: f.enHato === 1, razas: porAnimal.get(f.id) ?? [] })),
    hoy,
  );
}

// ---------------------------------------------------------------- Hoja de venta (R21)

/**
 * R21: los datos de la hoja de venta de un animal (también uno ya vendido). La producción de leche se entrega siempre y
 * el dominio decide si va (la elige el vendedor). No lleva contactos ni precios (R28: datos mínimos).
 */
export async function datosHojaVenta(conexion: Conexion, animalId: string, { hoy = fechaLocal() }: { hoy?: string } = {}): Promise<EntradaHojaVenta> {
  const animal: Animal | null = await obtenerAnimal(conexion, animalId);
  if (!animal) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const finca = await obtenerDatosDeRegistro(conexion);
  const registro = await registroVigenteDe(conexion, animalId);
  const lactancias: LactanciaParaVenta[] =
    animal.sexo === "hembra"
      ? (await lactanciasDeHembra(conexion, animalId))
          .map((l) => ({
            fechaInicio: l.fechaInicio,
            fechaSecado: l.fechaSecado,
            acumuladoKg: l.proyeccion?.acumulado ?? null,
            promedioDiarioKg: l.proyeccion?.promedioDiario ?? null,
          }))
          .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))
      : [];
  return {
    fecha: hoy,
    finca: { nombre: finca.nombreFinca, criadero: finca.criadero, municipio: finca.municipio },
    animal: {
      nombre: animal.nombre,
      sexo: animal.sexo,
      fechaNacimiento: animal.fechaNacimiento,
      colorSenas: animal.colorSenas,
      libro: animal.libro,
      estado: animal.estado,
      identificadores: animal.identificadores.map((i) => ({ tipo: i.tipo as TipoIdentificador, valor: i.valor, principal: i.principal, vigente: i.vigente })),
      composicion: animal.composicion.map((c) => ({ raza: c.raza, fraccion: c.fraccion })),
      registroPropio: registro?.estado === "emitido" ? registro.numero : null,
    },
    pedigri: await pedigriDe(conexion, animalId),
    lactancias,
  };
}
