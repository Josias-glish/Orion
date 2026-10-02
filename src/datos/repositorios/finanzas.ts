import { esFechaValida, fechaLocal } from "../../dominio/fechas";
import { esDelHato } from "../../dominio/externos";
import {
  resumirFinanzas,
  validarMovimiento,
  validarPeriodo,
  type CategoriaEconomica,
  type Movimiento,
  type Periodo,
  type ResumenFinanzas,
  type TipoMovimiento,
} from "../../dominio/finanzas";
import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio } from "../conexion";
import { ErrorDeRegistro, rechazarSi, type Motivo } from "../errores";
import { obtenerAnimalBasico } from "./reproduccion";

// RF-33 y RF-34 (R19): categorías, movimientos y resumen. Solo el propietario (R23): las escrituras exigen el permiso
// `gestionar_finanzas` y la pantalla exige `ver_finanzas`.

// ---------------------------------------------------------------- Categorías (catálogo editable)

export async function listarCategorias(
  conexion: Conexion,
  { tipo = null, soloActivas = false }: { tipo?: TipoMovimiento | null; soloActivas?: boolean } = {},
): Promise<CategoriaEconomica[]> {
  const filas = await conexion.consultar<Omit<CategoriaEconomica, "activo"> & { activo: number }>(
    `SELECT id, nombre, tipo, activo FROM categoria_economica
     WHERE eliminado_en IS NULL AND (? IS NULL OR tipo = ?) AND (? = 0 OR activo = 1)
     ORDER BY tipo, nombre COLLATE NOCASE`,
    [tipo, tipo, soloActivas ? 1 : 0],
  );
  return filas.map((f) => ({ ...f, activo: f.activo === 1 }));
}

async function validarNombreDeCategoria(conexion: Conexion, nombre: string, tipo: TipoMovimiento, idActual: string | null) {
  const motivos: Motivo[] = [];
  if (!nombre) motivos.push({ codigo: "dato_obligatorio", campo: "nombre" });
  const [repetido] = await conexion.consultar<{ n: number }>(
    `SELECT count(*) AS n FROM categoria_economica
     WHERE nombre = ? COLLATE NOCASE AND tipo = ? AND eliminado_en IS NULL AND id IS NOT ?`,
    [nombre, tipo, idActual],
  );
  if (nombre && repetido.n > 0) motivos.push({ codigo: "nombre_duplicado", nombre });
  rechazarSi(motivos);
}

export async function crearCategoria(
  conexion: Conexion,
  datos: { nombre: string; tipo: TipoMovimiento },
  contexto: ContextoCambio,
): Promise<string> {
  exigirPermiso(contexto, "gestionar_finanzas");
  const nombre = datos.nombre.trim();
  await validarNombreDeCategoria(conexion, nombre, datos.tipo, null);
  const cambios = new Cambios(contexto);
  const id = cambios.insertar("categoria_economica", { nombre, tipo: datos.tipo, activo: 1 });
  await cambios.aplicar(conexion);
  return id;
}

/** Cambia el nombre o el estado activo. El tipo no cambia, y las categorías no se borran: se desactivan. */
export async function actualizarCategoria(
  conexion: Conexion,
  id: string,
  datos: { nombre: string; activo: boolean },
  contexto: ContextoCambio,
): Promise<void> {
  exigirPermiso(contexto, "gestionar_finanzas");
  const actual = (await listarCategorias(conexion)).find((c) => c.id === id);
  if (!actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const nombre = datos.nombre.trim();
  await validarNombreDeCategoria(conexion, nombre, actual.tipo, id);
  const cambios = new Cambios(contexto);
  cambios.actualizar(
    "categoria_economica",
    id,
    { nombre: actual.nombre, activo: actual.activo ? 1 : 0 },
    { nombre, activo: datos.activo ? 1 : 0 },
  );
  await cambios.aplicar(conexion);
}

// ---------------------------------------------------------------- Movimientos

export interface DatosMovimientoNuevo {
  fecha: string;
  tipo: TipoMovimiento;
  categoriaId: string;
  /** Pesos enteros (S-70). */
  valor: number;
  animalId: string | null;
  loteId: string | null;
  descripcion: string | null;
}

export interface FilaMovimiento {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  categoriaId: string;
  categoria: string;
  valor: number;
  animalId: string | null;
  animal: string | null;
  loteId: string | null;
  lote: string | null;
  descripcion: string | null;
  /** R30: la monta de la que salió este gasto. */
  servicioId: string | null;
}

export interface FiltroMovimientos extends Partial<Periodo> {
  tipo?: TipoMovimiento | null;
  categoriaId?: string | null;
}

/** Movimientos vigentes, del más reciente al más antiguo, con el nombre de su categoría, animal y lote. */
export async function listarMovimientos(conexion: Conexion, filtro: FiltroMovimientos = {}): Promise<FilaMovimiento[]> {
  const periodo = { desde: filtro.desde ?? null, hasta: filtro.hasta ?? null };
  rechazarSi(validarPeriodo(periodo));
  return conexion.consultar<FilaMovimiento>(
    `SELECT m.id, m.fecha, m.tipo, m.categoria_id AS categoriaId, c.nombre AS categoria, m.valor,
            m.animal_id AS animalId, coalesce(a.nombre, ia.valor) AS animal,
            m.lote_id AS loteId, l.nombre AS lote, m.descripcion, m.evento_reproductivo_id AS servicioId
     FROM movimiento_economico AS m
     JOIN categoria_economica AS c ON c.id = m.categoria_id
     LEFT JOIN animal AS a ON a.id = m.animal_id
     LEFT JOIN identificador AS ia ON ia.animal_id = a.id AND ia.principal = 1 AND ia.eliminado_en IS NULL
     LEFT JOIN lote AS l ON l.id = m.lote_id
     WHERE m.eliminado_en IS NULL
       AND (? IS NULL OR m.fecha >= ?) AND (? IS NULL OR m.fecha <= ?)
       AND (? IS NULL OR m.tipo = ?) AND (? IS NULL OR m.categoria_id = ?)
     ORDER BY m.fecha DESC, m.creado_en DESC, m.id`,
    [
      periodo.desde,
      periodo.desde,
      periodo.hasta,
      periodo.hasta,
      filtro.tipo ?? null,
      filtro.tipo ?? null,
      filtro.categoriaId ?? null,
      filtro.categoriaId ?? null,
    ],
  );
}

/** Valida un movimiento (reglas del dominio y existencia del animal, el lote y la categoría). */
async function validarCompleto(conexion: Conexion, datos: DatosMovimientoNuevo, categoriaActualId: string | null): Promise<void> {
  const [categoria] = await conexion.consultar<{ tipo: TipoMovimiento; activo: number }>(
    "SELECT tipo, activo FROM categoria_economica WHERE id = ? AND eliminado_en IS NULL",
    [datos.categoriaId],
  );
  if (!categoria) throw new ErrorDeRegistro([{ codigo: "dato_obligatorio", campo: "categoria_id" }]);
  const motivos: Motivo[] = validarMovimiento(datos, { tipo: categoria.tipo, activo: categoria.activo === 1 }, datos.categoriaId === categoriaActualId);
  if (!esFechaValida(datos.fecha)) motivos.push({ codigo: "fecha_invalida", campo: "fecha" });
  else if (datos.fecha > fechaLocal()) motivos.push({ codigo: "fecha_futura", campo: "fecha" });
  if (datos.animalId) {
    const animal = await obtenerAnimalBasico(conexion, datos.animalId);
    if (!animal) motivos.push({ codigo: "no_encontrado" });
    else if (!esDelHato(animal)) motivos.push({ codigo: "movimiento_animal_no_elegible", otro: animal.nombre });
  }
  if (datos.loteId) {
    const [lote] = await conexion.consultar<{ id: string }>("SELECT id FROM lote WHERE id = ? AND eliminado_en IS NULL", [datos.loteId]);
    if (!lote) motivos.push({ codigo: "no_encontrado" });
  }
  rechazarSi(motivos);
}

const aFila = (d: DatosMovimientoNuevo) => ({
  fecha: d.fecha,
  tipo: d.tipo,
  categoria_id: d.categoriaId,
  valor: d.valor,
  animal_id: d.animalId,
  lote_id: d.loteId,
  descripcion: d.descripcion?.trim() || null,
});

export async function registrarMovimiento(conexion: Conexion, datos: DatosMovimientoNuevo, contexto: ContextoCambio): Promise<string> {
  exigirPermiso(contexto, "gestionar_finanzas");
  await validarCompleto(conexion, datos, null);
  const cambios = new Cambios(contexto);
  const id = cambios.insertar("movimiento_economico", aFila(datos));
  await cambios.aplicar(conexion);
  return id;
}

/** Corrige un movimiento (queda en el historial). El enlace con una monta no cambia. */
export async function actualizarMovimiento(
  conexion: Conexion,
  id: string,
  datos: DatosMovimientoNuevo,
  contexto: ContextoCambio,
): Promise<void> {
  exigirPermiso(contexto, "gestionar_finanzas");
  const [actual] = await conexion.consultar<Record<string, string | number | null>>(
    `SELECT fecha, tipo, categoria_id, valor, animal_id, lote_id, descripcion
     FROM movimiento_economico WHERE id = ? AND eliminado_en IS NULL`,
    [id],
  );
  if (!actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  await validarCompleto(conexion, datos, String(actual.categoria_id));
  const cambios = new Cambios(contexto);
  cambios.actualizar("movimiento_economico", id, actual, aFila(datos));
  await cambios.aplicar(conexion);
}

/** Borrado lógico: el movimiento deja de contar, pero queda en el historial. */
export async function retirarMovimiento(conexion: Conexion, id: string, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "gestionar_finanzas");
  const [actual] = await conexion.consultar<{ id: string }>("SELECT id FROM movimiento_economico WHERE id = ? AND eliminado_en IS NULL", [id]);
  if (!actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const cambios = new Cambios(contexto);
  cambios.eliminar("movimiento_economico", id);
  await cambios.aplicar(conexion);
}

// ---------------------------------------------------------------- Resumen (RF-34, R19)

/**
 * Costo por cabra, costo por lote y rentabilidad del periodo (R19). Los animales son los de esta finca (no los de otras
 * fincas); «activo» = activo y del hato. Los lotes retirados se incluyen para no perder su nombre en los movimientos viejos.
 */
export async function resumenFinanciero(
  conexion: Conexion,
  { periodo = { desde: null, hasta: null }, prorratear = false }: { periodo?: Periodo; prorratear?: boolean } = {},
): Promise<ResumenFinanzas> {
  rechazarSi(validarPeriodo(periodo));
  const movimientos = await conexion.consultar<Movimiento>(
    `SELECT id, fecha, tipo, categoria_id AS categoriaId, valor, animal_id AS animalId, lote_id AS loteId
     FROM movimiento_economico
     WHERE eliminado_en IS NULL AND (? IS NULL OR fecha >= ?) AND (? IS NULL OR fecha <= ?)`,
    [periodo.desde, periodo.desde, periodo.hasta, periodo.hasta],
  );
  const animales = await conexion.consultar<{ id: string; nombre: string; loteId: string | null; activo: number }>(
    `SELECT a.id, coalesce(a.nombre, i.valor, '') AS nombre, a.lote_id AS loteId,
            (a.estado = 'activo' AND a.en_hato = 1) AS activo
     FROM animal AS a
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE a.eliminado_en IS NULL AND a.origen <> 'externo'`,
  );
  const lotes = await conexion.consultar<{ id: string; nombre: string }>("SELECT id, nombre FROM lote");
  return resumirFinanzas({
    movimientos,
    animales: animales.map((a) => ({ ...a, activo: a.activo === 1 })),
    lotes,
    periodo,
    prorratear,
  });
}

// ---------------------------------------------------------------- Gasto de una monta (R30)

/** Ids de los servicios (de la lista) que ya tienen su gasto anotado. */
export async function serviciosConGasto(conexion: Conexion, servicioIds: readonly string[]): Promise<Set<string>> {
  if (servicioIds.length === 0) return new Set();
  const filas = await conexion.consultar<{ servicioId: string }>(
    `SELECT evento_reproductivo_id AS servicioId FROM movimiento_economico
     WHERE eliminado_en IS NULL AND evento_reproductivo_id IN (${servicioIds.map(() => "?").join(", ")})`,
    servicioIds,
  );
  return new Set(filas.map((f) => f.servicioId));
}

/**
 * R30: crea el gasto de una monta con costo. Toma del servicio la fecha, el costo y la hembra (el costo se asigna a la
 * hembra servida: SUPOSICION S-73) y deja el enlace para no ofrecerlo dos veces. `descripcion` la arma la pantalla.
 */
export async function crearGastoDeServicio(
  conexion: Conexion,
  servicioId: string,
  categoriaId: string,
  descripcion: string | null,
  contexto: ContextoCambio,
): Promise<string> {
  exigirPermiso(contexto, "gestionar_finanzas");
  const [servicio] = await conexion.consultar<{ hembraId: string; fecha: string; costo: number | null }>(
    "SELECT hembra_id AS hembraId, fecha, costo FROM evento_reproductivo WHERE id = ? AND eliminado_en IS NULL",
    [servicioId],
  );
  if (!servicio) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  if (!servicio.costo || servicio.costo <= 0) throw new ErrorDeRegistro([{ codigo: "servicio_sin_costo" }]);
  if ((await serviciosConGasto(conexion, [servicioId])).has(servicioId)) throw new ErrorDeRegistro([{ codigo: "gasto_ya_registrado" }]);
  const datos: DatosMovimientoNuevo = {
    fecha: servicio.fecha,
    tipo: "gasto",
    categoriaId,
    valor: servicio.costo,
    animalId: servicio.hembraId,
    loteId: null,
    descripcion,
  };
  await validarCompleto(conexion, datos, null);
  const cambios = new Cambios(contexto);
  const id = cambios.insertar("movimiento_economico", { ...aFila(datos), evento_reproductivo_id: servicioId });
  await cambios.aplicar(conexion);
  return id;
}
