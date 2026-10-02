// RF-49 y R31: registro genealógico propio. Configuración de los libros (prefijo y formato del número), lista de
// verificación, borradores, emisión (sola o en lote), reemisión, anulación y los datos del libro genealógico.
import { esFechaValida, fechaLocal } from "../../dominio/fechas";
import { descendientesDe, validarGenealogia, type AnimalGenealogico } from "../../dominio/genealogia";
import { esDelHato } from "../../dominio/externos";
import type { RegistroDeLibro } from "../../dominio/libro-genealogico";
import type { DatosPedigri } from "../../dominio/pedigri";
import {
  armarInstantanea,
  formatearNumero,
  leerInstantanea,
  numeroDeDocumento,
  planificarLote,
  siguienteConsecutivo,
  validarAccion,
  validarFormato,
  validarMotivoAnulacion,
  verificarRequisitos,
  GENERACIONES_GUARDADAS,
  type AccionRegistro,
  type AncestroInstantanea,
  type CandidatoLote,
  type ErrorRegistro,
  type EstadoRegistro,
  type FormatoNumero,
  type InstantaneaRegistro,
  type LibroNumeracion,
  type ListaDeVerificacion,
  type Requisito,
} from "../../dominio/registros";
import type { OrigenAnimal, Sexo } from "../../dominio/tipos";
import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio } from "../conexion";
import { ErrorDeRegistro, rechazarSi, type Motivo } from "../errores";
import { obtenerAnimal } from "./animales";
import { calcularConsanguinidad, consultarArbol } from "./genealogia";
import { listarHistorialEntidad, type EntradaHistorial } from "./historial";

// ---------------------------------------------------------------- Configuración

export interface ConfigLibro extends FormatoNumero {
  id: string;
  nombre: string;
  activo: boolean;
  separador: "" | "-";
  /** Siguiente consecutivo que recibirá un registro de este libro. */
  siguienteNumero: number;
  /** Registros de este libro que ya tienen número (emitidos y anulados). */
  registros: number;
  /** Cómo se vería el próximo número, o null si el libro aún no tiene prefijo. */
  ejemplo: string | null;
}

interface FilaLibro {
  id: string;
  nombre: string;
  activo: number;
  prefijo: string | null;
  separador: "" | "-";
  digitos: number;
  contador: number;
  registros: number;
  ultimo: number | null;
}

const SQL_LIBROS = `SELECT l.id, l.nombre, l.activo, l.prefijo, l.separador_numero AS separador, l.digitos_numero AS digitos,
        l.siguiente_numero AS contador,
        (SELECT count(*) FROM registro_genealogico AS r WHERE r.libro_id = l.id AND r.consecutivo IS NOT NULL) AS registros,
        (SELECT max(r.consecutivo) FROM registro_genealogico AS r WHERE r.libro_id = l.id) AS ultimo
 FROM libro AS l WHERE l.eliminado_en IS NULL ORDER BY l.nombre COLLATE NOCASE`;

function aConfig(f: FilaLibro): ConfigLibro {
  const formato: FormatoNumero = { prefijo: f.prefijo, separador: f.separador, digitos: f.digitos };
  const siguiente = siguienteConsecutivo(f.contador, f.ultimo);
  return {
    ...formato,
    id: f.id,
    nombre: f.nombre,
    activo: f.activo === 1,
    separador: f.separador,
    siguienteNumero: siguiente,
    registros: f.registros,
    ejemplo: f.prefijo ? formatearNumero(formato, siguiente) : null,
  };
}

export async function listarConfigLibros(conexion: Conexion): Promise<ConfigLibro[]> {
  return (await conexion.consultar<FilaLibro>(SQL_LIBROS)).map(aConfig);
}

export interface DatosConfigLibro {
  prefijo: string | null;
  separador: "" | "-";
  digitos: number;
  siguienteNumero: number;
}

/**
 * R31: prefijo y formato del número de un libro, y el número desde el que empieza. Solo mientras el libro no tenga
 * registros con número: después, los números emitidos no se reordenan ni se reutilizan.
 */
export async function guardarConfigLibro(conexion: Conexion, libroId: string, datos: DatosConfigLibro, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "gestionar_registros");
  const actual = (await listarConfigLibros(conexion)).find((l) => l.id === libroId);
  if (!actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const prefijo = datos.prefijo?.trim() || null;
  const motivos: Motivo[] = validarFormato({ prefijo, separador: datos.separador, digitos: datos.digitos });
  if (!Number.isInteger(datos.siguienteNumero) || datos.siguienteNumero < 1) motivos.push({ codigo: "numero_inicial_invalido" });
  if (prefijo) {
    const [repetido] = await conexion.consultar<{ id: string }>(
      "SELECT id FROM libro WHERE prefijo = ? COLLATE NOCASE AND eliminado_en IS NULL AND id <> ?",
      [prefijo, libroId],
    );
    if (repetido) motivos.push({ codigo: "prefijo_repetido", prefijo });
  }
  rechazarSi(motivos);

  const sinCambios =
    prefijo === actual.prefijo && datos.separador === actual.separador && datos.digitos === actual.digitos && datos.siguienteNumero === actual.siguienteNumero;
  if (sinCambios) return;
  if (actual.registros > 0) throw new ErrorDeRegistro([{ codigo: "libro_con_registros" }]);

  const cambios = new Cambios(contexto);
  cambios.actualizar(
    "libro",
    libroId,
    { prefijo: actual.prefijo, separador_numero: actual.separador, digitos_numero: actual.digitos, siguiente_numero: actual.siguienteNumero },
    { prefijo, separador_numero: datos.separador, digitos_numero: datos.digitos, siguiente_numero: datos.siguienteNumero },
  );
  await cambios.aplicar(conexion);
}

/** Datos del criadero para el certificado de registro propio. */
export interface DatosDeRegistro {
  nombreFinca: string;
  criadero: string | null;
  municipio: string | null;
  criador: string;
  propietario: string;
  /** Quien firma el certificado. Si está vacío, firma quien emite. */
  responsable: string | null;
}

export interface DatosEditablesDeRegistro {
  criador: string | null;
  propietario: string | null;
  responsable: string | null;
}

interface FilaFincaRegistro {
  id: string;
  nombre: string;
  criadero: string | null;
  municipio: string | null;
  criador: string | null;
  propietario: string | null;
  responsable: string | null;
}

async function leerFincaDeRegistro(conexion: Conexion): Promise<FilaFincaRegistro | null> {
  const [f] = await conexion.consultar<FilaFincaRegistro>(
    `SELECT id, nombre, criadero, municipio, criador, propietario, responsable_registros AS responsable
     FROM finca WHERE eliminado_en IS NULL ORDER BY creado_en LIMIT 1`,
  );
  return f ?? null;
}

/**
 * SUPOSICION (S-60): si no se escriben el criador y el propietario, son el nombre del propietario de la finca
 * (como en el certificado interno de la Etapa 4).
 */
export async function obtenerDatosDeRegistro(conexion: Conexion): Promise<DatosDeRegistro> {
  const finca = await leerFincaDeRegistro(conexion);
  const [dueno] = await conexion.consultar<{ nombre: string }>(
    "SELECT nombre FROM usuario WHERE rol = 'propietario' AND eliminado_en IS NULL ORDER BY creado_en LIMIT 1",
  );
  const respaldo = dueno?.nombre ?? "";
  return {
    nombreFinca: finca?.nombre ?? "",
    criadero: finca?.criadero?.trim() || null,
    municipio: finca?.municipio ?? null,
    criador: finca?.criador?.trim() || respaldo,
    propietario: finca?.propietario?.trim() || respaldo,
    responsable: finca?.responsable?.trim() || null,
  };
}

export async function guardarDatosDeRegistro(conexion: Conexion, datos: DatosEditablesDeRegistro, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "gestionar_registros");
  const finca = await leerFincaDeRegistro(conexion);
  if (!finca) throw new Error("No hay finca registrada");
  const texto = (v: string | null) => v?.trim() || null;
  const cambios = new Cambios(contexto);
  cambios.actualizar(
    "finca",
    finca.id,
    { criador: finca.criador, propietario: finca.propietario, responsable_registros: finca.responsable },
    { criador: texto(datos.criador), propietario: texto(datos.propietario), responsable_registros: texto(datos.responsable) },
  );
  await cambios.aplicar(conexion);
}

// ---------------------------------------------------------------- Lista de verificación

export interface RegistroVigente {
  id: string;
  estado: EstadoRegistro;
  numero: string | null;
  version: number;
}

export interface Verificacion {
  animalId: string;
  nombre: string | null;
  identificador: string | null;
  /** Solo los animales del hato tienen registro propio. */
  elegible: boolean;
  libroId: string | null;
  libro: string | null;
  lista: ListaDeVerificacion;
  /** Registro vigente (borrador o emitido), si lo hay. */
  registro: RegistroVigente | null;
}

interface AnimalBase {
  id: string;
  nombre: string | null;
  sexo: Sexo;
  fechaNacimiento: string | null;
  libroId: string | null;
  padreId: string | null;
  madreId: string | null;
  origen: OrigenAnimal;
  enHato: boolean;
}

/** Todo lo que se necesita para verificar a varios animales, leído de una vez (pocas consultas aunque haya 500 animales). */
interface BaseDeVerificacion {
  animales: Map<string, AnimalBase>;
  hijos: Map<string, { comoPadre: AnimalGenealogico[]; comoMadre: AnimalGenealogico[] }>;
  libros: Map<string, FilaLibro>;
  identificadores: Map<string, string>;
  fracciones: Map<string, number[]>;
  vigentes: Map<string, RegistroVigente>;
  datos: DatosDeRegistro;
}

const genealogico = (a: AnimalBase): AnimalGenealogico => ({ id: a.id, nombre: a.nombre, sexo: a.sexo, fechaNacimiento: a.fechaNacimiento });

async function cargarBase(conexion: Conexion): Promise<BaseDeVerificacion> {
  const filas = await conexion.consultar<Omit<AnimalBase, "enHato"> & { enHato: number }>(
    `SELECT id, nombre, sexo, fecha_nacimiento AS fechaNacimiento, libro_id AS libroId, padre_id AS padreId, madre_id AS madreId,
            origen, en_hato AS enHato
     FROM animal WHERE eliminado_en IS NULL`,
  );
  const animales = new Map(filas.map((f) => [f.id, { ...f, enHato: f.enHato === 1 }]));
  const hijos = new Map<string, { comoPadre: AnimalGenealogico[]; comoMadre: AnimalGenealogico[] }>();
  const de = (id: string) => hijos.get(id) ?? hijos.set(id, { comoPadre: [], comoMadre: [] }).get(id)!;
  for (const a of animales.values()) {
    if (a.padreId) de(a.padreId).comoPadre.push(genealogico(a));
    if (a.madreId) de(a.madreId).comoMadre.push(genealogico(a));
  }
  const libros = new Map((await conexion.consultar<FilaLibro>(SQL_LIBROS)).map((l) => [l.id, l]));
  const identificadores = new Map(
    (
      await conexion.consultar<{ animalId: string; valor: string }>(
        "SELECT animal_id AS animalId, valor FROM identificador WHERE principal = 1 AND vigente = 1 AND eliminado_en IS NULL",
      )
    ).map((i) => [i.animalId, i.valor]),
  );
  const fracciones = new Map<string, number[]>();
  for (const c of await conexion.consultar<{ animalId: string; fraccion: number }>(
    "SELECT animal_id AS animalId, fraccion FROM composicion_racial WHERE eliminado_en IS NULL",
  )) {
    fracciones.set(c.animalId, [...(fracciones.get(c.animalId) ?? []), c.fraccion]);
  }
  const vigentes = new Map(
    (
      await conexion.consultar<RegistroVigente & { animalId: string }>(
        `SELECT id, animal_id AS animalId, estado, numero, version FROM registro_genealogico
         WHERE eliminado_en IS NULL AND estado <> 'anulado'`,
      )
    ).map((r) => [r.animalId, { id: r.id, estado: r.estado, numero: r.numero, version: r.version }]),
  );
  return { animales, hijos, libros, identificadores, fracciones, vigentes, datos: await obtenerDatosDeRegistro(conexion) };
}

function verificarConBase(base: BaseDeVerificacion, animalId: string): Verificacion | null {
  const animal = base.animales.get(animalId);
  if (!animal) return null;
  const libro = animal.libroId ? (base.libros.get(animal.libroId) ?? null) : null;
  const padre = animal.padreId ? (base.animales.get(animal.padreId) ?? null) : null;
  const madre = animal.madreId ? (base.animales.get(animal.madreId) ?? null) : null;
  const padres = new Map([...base.animales.values()].map((a) => [a.id, { padreId: a.padreId, madreId: a.madreId }]));
  const hijos = base.hijos.get(animal.id) ?? { comoPadre: [], comoMadre: [] };
  const erroresGenealogia = validarGenealogia({
    animal: genealogico(animal),
    padre: padre ? genealogico(padre) : null,
    madre: madre ? genealogico(madre) : null,
    descendientes: descendientesDe(animal.id, padres),
    hijosComoPadre: hijos.comoPadre,
    hijosComoMadre: hijos.comoMadre,
  });
  const lista = verificarRequisitos({
    nombre: animal.nombre,
    sexo: animal.sexo,
    fechaNacimiento: animal.fechaNacimiento,
    identificadorPrincipal: base.identificadores.get(animal.id) ?? null,
    composicion: (base.fracciones.get(animal.id) ?? []).map((fraccion) => ({ fraccion })),
    libro: libro ? { nombre: libro.nombre, prefijo: libro.prefijo } : null,
    tienePadre: animal.padreId !== null,
    tieneMadre: animal.madreId !== null,
    erroresGenealogia,
    criador: base.datos.criador,
    propietario: base.datos.propietario,
    criadero: base.datos.criadero,
  });
  return {
    animalId: animal.id,
    nombre: animal.nombre,
    identificador: base.identificadores.get(animal.id) ?? null,
    elegible: esDelHato(animal),
    libroId: animal.libroId,
    libro: libro?.nombre ?? null,
    lista,
    registro: base.vigentes.get(animal.id) ?? null,
  };
}

export async function verificarAnimal(conexion: Conexion, animalId: string): Promise<Verificacion> {
  const v = verificarConBase(await cargarBase(conexion), animalId);
  if (!v) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  return v;
}

export interface FiltroVerificaciones {
  texto?: string;
  libroId?: string | null;
  /** `listos`: cumplen y no tienen registro; `faltantes`: les falta algo; `con_registro`; `sin_registro`. */
  situacion?: "listos" | "faltantes" | "con_registro" | "sin_registro" | null;
}

/** Lista de verificación de todos los animales del hato (los de otras fincas no tienen registro propio). */
export async function listarVerificaciones(conexion: Conexion, filtro: FiltroVerificaciones = {}): Promise<Verificacion[]> {
  const base = await cargarBase(conexion);
  const texto = filtro.texto?.trim().toLowerCase();
  const resultado: Verificacion[] = [];
  for (const id of base.animales.keys()) {
    const v = verificarConBase(base, id)!;
    if (!v.elegible) continue;
    if (filtro.libroId && v.libroId !== filtro.libroId) continue;
    if (texto && !`${v.nombre ?? ""} ${v.identificador ?? ""}`.toLowerCase().includes(texto)) continue;
    if (filtro.situacion === "listos" && !(v.lista.cumple && !v.registro)) continue;
    if (filtro.situacion === "faltantes" && v.lista.cumple) continue;
    if (filtro.situacion === "con_registro" && !v.registro) continue;
    if (filtro.situacion === "sin_registro" && v.registro) continue;
    resultado.push(v);
  }
  return resultado.sort((a, b) => (a.nombre ?? a.identificador ?? "").localeCompare(b.nombre ?? b.identificador ?? "", "es"));
}

// ---------------------------------------------------------------- Consultas de registros

export interface Registro {
  id: string;
  animalId: string;
  animal: string;
  identificador: string | null;
  libroId: string | null;
  libro: string | null;
  consecutivo: number | null;
  numero: string | null;
  fechaRegistro: string;
  estado: EstadoRegistro;
  version: number;
  responsable: string | null;
  motivoAnulacion: string | null;
  observaciones: string | null;
  /** Copia fija de lo emitido (null en un borrador). */
  instantanea: InstantaneaRegistro | null;
  creadoEn: string;
  modificadoEn: string;
}

const SQL_REGISTRO = `SELECT r.id, r.animal_id AS animalId, coalesce(a.nombre, i.valor, '') AS animal, i.valor AS identificador,
        r.libro_id AS libroId, l.nombre AS libro, r.consecutivo, r.numero, r.fecha_registro AS fechaRegistro, r.estado, r.version,
        r.responsable, r.motivo_anulacion AS motivoAnulacion, r.observaciones, r.instantanea,
        r.creado_en AS creadoEn, r.modificado_en AS modificadoEn
 FROM registro_genealogico AS r
 JOIN animal AS a ON a.id = r.animal_id
 LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
 LEFT JOIN libro AS l ON l.id = r.libro_id`;

type FilaRegistro = Omit<Registro, "instantanea"> & { instantanea: string | null };
const aRegistro = (f: FilaRegistro): Registro => ({ ...f, instantanea: f.instantanea ? leerInstantanea(f.instantanea) : null });

export async function obtenerRegistro(conexion: Conexion, id: string): Promise<Registro | null> {
  const [fila] = await conexion.consultar<FilaRegistro>(`${SQL_REGISTRO} WHERE r.id = ? AND r.eliminado_en IS NULL`, [id]);
  return fila ? aRegistro(fila) : null;
}

/** Registro vigente de un animal: el borrador o el emitido (los anulados ya no cuentan). */
export async function registroVigenteDe(conexion: Conexion, animalId: string): Promise<Registro | null> {
  const [fila] = await conexion.consultar<FilaRegistro>(
    `${SQL_REGISTRO} WHERE r.animal_id = ? AND r.estado <> 'anulado' AND r.eliminado_en IS NULL`,
    [animalId],
  );
  return fila ? aRegistro(fila) : null;
}

/** Todos los registros de un animal, también los anulados, del más reciente al más antiguo. */
export async function listarRegistrosDeAnimal(conexion: Conexion, animalId: string): Promise<Registro[]> {
  return (
    await conexion.consultar<FilaRegistro>(`${SQL_REGISTRO} WHERE r.animal_id = ? AND r.eliminado_en IS NULL ORDER BY r.creado_en DESC`, [animalId])
  ).map(aRegistro);
}

export interface FiltroRegistros {
  libroId?: string | null;
  /** Nombre de una raza: entran los animales cuya composición la incluye. */
  raza?: string | null;
  /** Fecha de registro, extremos incluidos. */
  desde?: string | null;
  hasta?: string | null;
  estado?: EstadoRegistro | null;
  texto?: string;
}

export interface RegistroResumen {
  id: string;
  animalId: string;
  animal: string;
  identificador: string | null;
  libroId: string | null;
  libro: string | null;
  consecutivo: number | null;
  numero: string | null;
  estado: EstadoRegistro;
  version: number;
  fechaRegistro: string;
  razas: string[];
}

/** Lista de registros con sus filtros. Los borradores se filtran por la raza actual del animal; los demás, por la emitida. */
export async function listarRegistros(conexion: Conexion, filtro: FiltroRegistros = {}): Promise<RegistroResumen[]> {
  const filas = await conexion.consultar<FilaRegistro>(
    `${SQL_REGISTRO}
     WHERE r.eliminado_en IS NULL
       AND (? IS NULL OR r.libro_id = ?) AND (? IS NULL OR r.estado = ?)
       AND (? IS NULL OR r.fecha_registro >= ?) AND (? IS NULL OR r.fecha_registro <= ?)
     ORDER BY l.nombre COLLATE NOCASE, r.consecutivo IS NULL, r.consecutivo, r.creado_en`,
    [
      filtro.libroId ?? null, filtro.libroId ?? null,
      filtro.estado ?? null, filtro.estado ?? null,
      filtro.desde ?? null, filtro.desde ?? null,
      filtro.hasta ?? null, filtro.hasta ?? null,
    ],
  );
  const borradores = filas.filter((f) => f.estado === "borrador").map((f) => f.animalId);
  const vivas = new Map<string, string[]>();
  if (borradores.length > 0) {
    for (const c of await conexion.consultar<{ animalId: string; raza: string }>(
      `SELECT c.animal_id AS animalId, r.nombre AS raza FROM composicion_racial AS c JOIN raza AS r ON r.id = c.raza_id
       WHERE c.eliminado_en IS NULL AND c.animal_id IN (${borradores.map(() => "?").join(", ")}) AND c.fraccion > 0`,
      borradores,
    )) {
      vivas.set(c.animalId, [...(vivas.get(c.animalId) ?? []), c.raza]);
    }
  }
  const texto = filtro.texto?.trim().toLowerCase();
  const resultado: RegistroResumen[] = [];
  for (const fila of filas) {
    const razas = fila.instantanea
      ? leerInstantanea(fila.instantanea).animal.composicion.filter((c) => c.fraccion > 0).map((c) => c.raza)
      : (vivas.get(fila.animalId) ?? []);
    if (filtro.raza && !razas.includes(filtro.raza)) continue;
    if (texto && !`${fila.animal} ${fila.identificador ?? ""} ${fila.numero ?? ""}`.toLowerCase().includes(texto)) continue;
    const { instantanea: _i, creadoEn: _c, modificadoEn: _m, responsable: _r, motivoAnulacion: _a, observaciones: _o, ...resumen } = fila;
    resultado.push({ ...resumen, razas });
  }
  return resultado;
}

/** Registros con número (emitidos y anulados) y su instantánea, para armar el libro genealógico. */
export async function listarRegistrosDelLibro(conexion: Conexion): Promise<RegistroDeLibro[]> {
  const filas = await conexion.consultar<FilaRegistro>(
    `${SQL_REGISTRO} WHERE r.eliminado_en IS NULL AND r.estado <> 'borrador' ORDER BY l.nombre COLLATE NOCASE, r.consecutivo`,
  );
  return filas.map((f) => {
    const r = aRegistro(f);
    return {
      id: r.id,
      numero: r.numero!,
      consecutivo: r.consecutivo!,
      libroId: r.libroId!,
      libro: r.libro!,
      estado: r.estado,
      version: r.version,
      fechaRegistro: r.fechaRegistro,
      instantanea: r.instantanea!,
    };
  });
}

export function historialDeRegistro(conexion: Conexion, registroId: string): Promise<EntradaHistorial[]> {
  return listarHistorialEntidad(conexion, "registro_genealogico", registroId);
}

// ---------------------------------------------------------------- Instantánea

interface DatosDeEmision {
  numero: string;
  version: number;
  fechaRegistro: string;
  fechaEmision: string;
  responsable: string | null;
  emitidoPor: string | null;
  observaciones: string | null;
}

/** Ancestros del animal hasta cuatro generaciones, con su número de asociación y, si son de otra finca, su propietario. */
async function pedigriDe(conexion: Conexion, animalId: string): Promise<AncestroInstantanea[]> {
  const nodos = (await consultarArbol(conexion, animalId, GENERACIONES_GUARDADAS)).filter((n) => n.camino !== "");
  const registros = new Map<string, string>();
  if (nodos.length > 0) {
    const filas = await conexion.consultar<{ animalId: string; valor: string }>(
      `SELECT animal_id AS animalId, valor FROM identificador
       WHERE tipo = 'registro_asociacion' AND vigente = 1 AND eliminado_en IS NULL AND animal_id IN (${nodos.map(() => "?").join(", ")})
       ORDER BY principal DESC, creado_en DESC`,
      nodos.map((n) => n.id),
    );
    // Primero el principal y, entre varios, el más antiguo: se recorre al revés para que el último en escribir gane.
    for (const f of filas) registros.set(f.animalId, f.valor);
  }
  return nodos.map((n) => ({
    camino: n.camino,
    nombre: n.nombre,
    sexo: n.sexo,
    identificador: n.identificador,
    registroAsociacion: registros.get(n.id) ?? null,
    externo: n.origen === "externo",
    propietario: n.propietario,
    sinVerificar: n.sinVerificar,
    fechaNacimiento: n.fechaNacimiento,
  }));
}

/** Datos del pedigrí imprimible de cualquier animal, tenga o no registro propio (también los de otras fincas). */
export async function datosPedigri(conexion: Conexion, animalId: string, hoy: string = fechaLocal()): Promise<DatosPedigri> {
  const animal = await obtenerAnimal(conexion, animalId);
  if (!animal) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const datos = await obtenerDatosDeRegistro(conexion);
  const vigente = await registroVigenteDe(conexion, animalId);
  return {
    fecha: hoy,
    finca: { nombre: datos.nombreFinca, criadero: datos.criadero, municipio: datos.municipio },
    animal: {
      nombre: animal.nombre,
      sexo: animal.sexo,
      fechaNacimiento: animal.fechaNacimiento,
      libro: animal.libro,
      identificador: animal.identificadores.find((i) => i.principal && i.vigente)?.valor ?? null,
      registroAsociacion: animal.identificadores.find((i) => i.tipo === "registro_asociacion" && i.vigente)?.valor ?? null,
      composicion: animal.composicion.map((c) => ({ raza: c.raza, fraccion: c.fraccion })),
      origen: animal.origen,
      propietario: animal.propietario ? `${animal.propietario.nombre}${animal.propietario.criadero ? ` · ${animal.propietario.criadero}` : ""}` : null,
      registro: vigente?.estado === "emitido" ? { numero: vigente.numero!, estado: "emitido" } : null,
    },
    pedigri: await pedigriDe(conexion, animalId),
  };
}

/** Copia fija de los datos del animal y de su pedigrí (cuatro generaciones) en este momento. */
async function construirInstantanea(
  conexion: Conexion,
  base: BaseDeVerificacion,
  animalId: string,
  e: DatosDeEmision,
): Promise<InstantaneaRegistro> {
  const animal = (await obtenerAnimal(conexion, animalId))!;
  const pedigri = await pedigriDe(conexion, animalId);
  return armarInstantanea({
    ...e,
    finca: { nombre: base.datos.nombreFinca, criadero: base.datos.criadero, municipio: base.datos.municipio },
    criador: base.datos.criador,
    propietario: base.datos.propietario,
    animal: {
      id: animal.id,
      nombre: animal.nombre,
      sexo: animal.sexo,
      fechaNacimiento: animal.fechaNacimiento,
      colorSenas: animal.colorSenas,
      libro: animal.libro ?? "",
      formaConcepcion: animal.formaConcepcion,
      origen: animal.origen,
      identificadores: animal.identificadores
        .filter((i) => i.vigente)
        .map((i) => ({ tipo: i.tipo, valor: i.valor, principal: i.principal })),
      composicion: animal.composicion.map((c) => ({ raza: c.raza, fraccion: c.fraccion })),
      consanguinidad: (await calcularConsanguinidad(conexion, animalId)).coeficiente,
    },
    pedigri,
  });
}

// ---------------------------------------------------------------- Escrituras

export interface OpcionesEmision {
  /** Hoy, para la fecha de emisión (por defecto, la fecha local). */
  hoy?: string;
  /** Fecha del registro; por defecto la del borrador o hoy. */
  fechaRegistro?: string;
  observaciones?: string | null;
}

export interface ResultadoEmision {
  registroId: string;
  numero: string;
  version: number;
}

function rechazar(errores: ErrorRegistro[]): void {
  if (errores.length > 0) throw new ErrorDeRegistro(errores);
}

function validarFechaRegistro(fecha: string | undefined, hoy: string): void {
  if (fecha === undefined) return;
  if (!esFechaValida(fecha)) throw new ErrorDeRegistro([{ codigo: "fecha_invalida", campo: "fechaRegistro" }]);
  if (fecha > hoy) throw new ErrorDeRegistro([{ codigo: "fecha_futura", campo: "fechaRegistro" }]);
}

async function nombreDelUsuario(conexion: Conexion, contexto: ContextoCambio): Promise<string | null> {
  if (!contexto.usuarioId) return null;
  const [u] = await conexion.consultar<{ nombre: string }>("SELECT nombre FROM usuario WHERE id = ?", [contexto.usuarioId]);
  return u?.nombre ?? null;
}

export interface EmitidoEnLote {
  animalId: string;
  nombre: string;
  registroId: string;
  numero: string;
}

export interface RechazadoEnLote {
  animalId: string;
  nombre: string;
  motivo: "incompleto" | "ya_registrado" | "no_elegible";
  /** Lo que le falta, para mostrarlo y poder corregirlo. */
  faltantes: Requisito[];
}

export interface ResultadoLote {
  emitidos: EmitidoEnLote[];
  rechazados: RechazadoEnLote[];
}

/**
 * Emite a los animales indicados (R31). Los que cumplen la lista de verificación reciben un número consecutivo de su
 * libro, sin saltos; a los demás no se les asigna ninguno y se devuelven con lo que les falta. Si ya había un borrador,
 * se emite ese. Todo se valida antes de escribir y se escribe junto (D-004).
 */
export async function emitirEnLote(conexion: Conexion, animalIds: readonly string[], contexto: ContextoCambio, opciones: OpcionesEmision = {}): Promise<ResultadoLote> {
  exigirPermiso(contexto, "gestionar_registros");
  const hoy = opciones.hoy ?? fechaLocal();
  validarFechaRegistro(opciones.fechaRegistro, hoy);
  const base = await cargarBase(conexion);
  const responsable = base.datos.responsable ?? (await nombreDelUsuario(conexion, contexto));
  const emitidoPor = await nombreDelUsuario(conexion, contexto);

  const rechazadosPorId = new Map<string, RechazadoEnLote>();
  const candidatos: CandidatoLote[] = [];
  const unicos = [...new Set(animalIds)];
  for (const animalId of unicos) {
    const v = verificarConBase(base, animalId);
    if (!v) {
      rechazadosPorId.set(animalId, { animalId, nombre: "", motivo: "no_elegible", faltantes: [] });
    } else if (!v.elegible) {
      rechazadosPorId.set(animalId, { animalId, nombre: v.nombre ?? v.identificador ?? "", motivo: "no_elegible", faltantes: [] });
    } else {
      candidatos.push({ animalId, libroId: v.libroId, lista: v.lista, yaTieneRegistro: v.registro?.estado === "emitido" });
    }
  }

  const ultimos = new Map(
    (
      await conexion.consultar<{ libroId: string; ultimo: number }>(
        "SELECT libro_id AS libroId, max(consecutivo) AS ultimo FROM registro_genealogico WHERE consecutivo IS NOT NULL GROUP BY libro_id",
      )
    ).map((u) => [u.libroId, u.ultimo]),
  );
  const libros = new Map<string, LibroNumeracion>();
  for (const [id, l] of base.libros) {
    libros.set(id, {
      formato: { prefijo: l.prefijo, separador: l.separador, digitos: l.digitos },
      siguiente: siguienteConsecutivo(l.contador, ultimos.get(id) ?? null),
    });
  }
  const plan = planificarLote(candidatos, libros);
  const nombreDe = (id: string) => base.animales.get(id)?.nombre ?? base.identificadores.get(id) ?? "";
  for (const r of plan.rechazados) {
    rechazadosPorId.set(r.animalId, { animalId: r.animalId, nombre: nombreDe(r.animalId), motivo: r.motivo, faltantes: r.faltantes });
  }
  // Los rechazados salen en el orden en que se eligieron.
  const rechazados = unicos.filter((id) => rechazadosPorId.has(id)).map((id) => rechazadosPorId.get(id)!);

  // Todo lo que puede fallar se calcula antes de escribir.
  const cambios = new Cambios(contexto);
  const emitidos: EmitidoEnLote[] = [];
  for (const n of plan.emitir) {
    const borrador = (await registroVigenteDe(conexion, n.animalId)) ?? null;
    const fechaRegistro = opciones.fechaRegistro ?? borrador?.fechaRegistro ?? hoy;
    const observaciones = opciones.observaciones !== undefined ? opciones.observaciones : (borrador?.observaciones ?? null);
    const instantanea = await construirInstantanea(conexion, base, n.animalId, {
      numero: n.numero,
      version: 1,
      fechaRegistro,
      fechaEmision: hoy,
      responsable,
      emitidoPor,
      observaciones,
    });
    const fila = {
      libro_id: n.libroId,
      consecutivo: n.consecutivo,
      numero: n.numero,
      fecha_registro: fechaRegistro,
      estado: "emitido",
      version: 1,
      instantanea: JSON.stringify(instantanea),
      responsable,
      observaciones,
    };
    let registroId: string;
    if (borrador) {
      registroId = borrador.id;
      cambios.actualizar(
        "registro_genealogico",
        borrador.id,
        { libro_id: borrador.libroId, consecutivo: null, numero: null, fecha_registro: borrador.fechaRegistro, estado: "borrador", version: 1, instantanea: null, responsable: borrador.responsable, observaciones: borrador.observaciones },
        fila,
      );
    } else {
      registroId = cambios.insertar("registro_genealogico", { animal_id: n.animalId, ...fila });
    }
    emitidos.push({ animalId: n.animalId, nombre: nombreDe(n.animalId), registroId, numero: n.numero });
  }
  // El contador de cada libro avanza junto con sus registros (si una escritura se cortara, el siguiente número se
  // calcula del último usado: nunca se repite ni deja huecos).
  for (const [libroId, siguiente] of plan.siguientePorLibro) {
    cambios.actualizar("libro", libroId, { siguiente_numero: base.libros.get(libroId)!.contador }, { siguiente_numero: siguiente });
  }
  await cambios.aplicar(conexion);
  return { emitidos, rechazados };
}

/** Emite el registro de un animal (R31). Si no cumple, lanza `registro_incompleto` con lo que falta. */
export async function emitirRegistro(conexion: Conexion, animalId: string, contexto: ContextoCambio, opciones: OpcionesEmision = {}): Promise<ResultadoEmision> {
  exigirPermiso(contexto, "gestionar_registros");
  const resultado = await emitirEnLote(conexion, [animalId], contexto, opciones);
  const rechazado = resultado.rechazados[0];
  if (rechazado) {
    if (rechazado.motivo === "ya_registrado") throw new ErrorDeRegistro([{ codigo: "registro_ya_vigente" }]);
    if (rechazado.motivo === "no_elegible") {
      const existe = (await conexion.consultar("SELECT 1 AS x FROM animal WHERE id = ? AND eliminado_en IS NULL", [animalId])).length > 0;
      throw new ErrorDeRegistro([existe ? { codigo: "animal_no_elegible" } : { codigo: "no_encontrado" }]);
    }
    throw new ErrorDeRegistro([{ codigo: "registro_incompleto", faltantes: rechazado.faltantes }]);
  }
  const emitido = resultado.emitidos[0];
  return { registroId: emitido.registroId, numero: emitido.numero, version: 1 };
}

/** Crea un borrador (todavía sin número) para un animal del hato. */
export async function crearBorrador(
  conexion: Conexion,
  animalId: string,
  datos: { fechaRegistro?: string; observaciones?: string | null },
  contexto: ContextoCambio,
  hoy: string = fechaLocal(),
): Promise<string> {
  exigirPermiso(contexto, "gestionar_registros");
  validarFechaRegistro(datos.fechaRegistro, hoy);
  const base = await cargarBase(conexion);
  const v = verificarConBase(base, animalId);
  if (!v) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  if (!v.elegible) throw new ErrorDeRegistro([{ codigo: "animal_no_elegible" }]);
  rechazar(validarAccion(v.registro?.estado ?? null, "crear_borrador"));
  const cambios = new Cambios(contexto);
  const id = cambios.insertar("registro_genealogico", {
    animal_id: animalId,
    libro_id: v.libroId,
    fecha_registro: datos.fechaRegistro ?? hoy,
    estado: "borrador",
    version: 1,
    observaciones: datos.observaciones?.trim() || null,
  });
  await cambios.aplicar(conexion);
  return id;
}

async function registroExistente(conexion: Conexion, id: string, accion: AccionRegistro): Promise<Registro> {
  const registro = await obtenerRegistro(conexion, id);
  if (!registro) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  rechazar(validarAccion(registro.estado, accion));
  return registro;
}

export async function editarBorrador(
  conexion: Conexion,
  registroId: string,
  datos: { fechaRegistro?: string; observaciones?: string | null },
  contexto: ContextoCambio,
  hoy: string = fechaLocal(),
): Promise<void> {
  exigirPermiso(contexto, "gestionar_registros");
  const registro = await registroExistente(conexion, registroId, "editar");
  validarFechaRegistro(datos.fechaRegistro, hoy);
  const cambios = new Cambios(contexto);
  cambios.actualizar(
    "registro_genealogico",
    registroId,
    { fecha_registro: registro.fechaRegistro, observaciones: registro.observaciones },
    {
      fecha_registro: datos.fechaRegistro ?? registro.fechaRegistro,
      observaciones: datos.observaciones !== undefined ? datos.observaciones?.trim() || null : registro.observaciones,
    },
  );
  await cambios.aplicar(conexion);
}

/** Descarta un borrador (borrado lógico). No deja saltos: el borrador no tenía número. */
export async function descartarBorrador(conexion: Conexion, registroId: string, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "gestionar_registros");
  await registroExistente(conexion, registroId, "descartar");
  const cambios = new Cambios(contexto);
  cambios.eliminar("registro_genealogico", registroId);
  await cambios.aplicar(conexion);
}

/**
 * Reemite un registro: versión nueva con el mismo número y una instantánea nueva de los datos actuales. La versión
 * anterior queda en el historial como reemplazada. Debe seguir cumpliendo la lista de verificación y el animal debe
 * seguir en el mismo libro (si cambió de libro, se anula y se emite uno nuevo).
 */
export async function reemitirRegistro(
  conexion: Conexion,
  registroId: string,
  contexto: ContextoCambio,
  opciones: { hoy?: string; observaciones?: string | null } = {},
): Promise<ResultadoEmision> {
  exigirPermiso(contexto, "gestionar_registros");
  const registro = await registroExistente(conexion, registroId, "reemitir");
  const base = await cargarBase(conexion);
  const v = verificarConBase(base, registro.animalId);
  if (!v) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  if (!v.elegible) throw new ErrorDeRegistro([{ codigo: "animal_no_elegible" }]);
  if (!v.lista.cumple) throw new ErrorDeRegistro([{ codigo: "registro_incompleto", faltantes: v.lista.faltantes }]);
  if (v.libroId !== registro.libroId) throw new ErrorDeRegistro([{ codigo: "registro_libro_distinto" }]);

  const hoy = opciones.hoy ?? fechaLocal();
  const version = registro.version + 1;
  const responsable = base.datos.responsable ?? (await nombreDelUsuario(conexion, contexto));
  const observaciones = opciones.observaciones !== undefined ? opciones.observaciones : registro.observaciones;
  const instantanea = await construirInstantanea(conexion, base, registro.animalId, {
    numero: registro.numero!,
    version,
    fechaRegistro: registro.fechaRegistro,
    fechaEmision: hoy,
    responsable,
    emitidoPor: await nombreDelUsuario(conexion, contexto),
    observaciones,
  });
  const cambios = new Cambios(contexto);
  cambios.actualizar(
    "registro_genealogico",
    registroId,
    { version: registro.version, instantanea: JSON.stringify(registro.instantanea), responsable: registro.responsable, observaciones: registro.observaciones },
    { version, instantanea: JSON.stringify(instantanea), responsable, observaciones },
  );
  await cambios.aplicar(conexion);
  return { registroId, numero: registro.numero!, version };
}

/** Anula un registro emitido. Conserva su número, su instantánea y su historial; el número no se reutiliza. */
export async function anularRegistro(conexion: Conexion, registroId: string, motivo: string, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "gestionar_registros");
  await registroExistente(conexion, registroId, "anular");
  rechazar(validarMotivoAnulacion(motivo));
  const cambios = new Cambios(contexto);
  cambios.actualizar("registro_genealogico", registroId, { estado: "emitido", motivo_anulacion: null }, { estado: "anulado", motivo_anulacion: motivo.trim() });
  await cambios.aplicar(conexion);
}

// ---------------------------------------------------------------- Documentos

/**
 * Anota en `certificado` el PDF de la versión vigente de un registro emitido (tipo «registro_propio»). Cada versión
 * tiene su documento: «PPE-0001-v1», «PPE-0001-v2». Si ya está anotado, no lo duplica.
 */
export async function registrarDocumentoDeRegistro(
  conexion: Conexion,
  registroId: string,
  archivo: string | null,
  contexto: ContextoCambio,
  hoy: string = fechaLocal(),
): Promise<string> {
  exigirPermiso(contexto, "gestionar_registros");
  const registro = await obtenerRegistro(conexion, registroId);
  if (!registro) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  if (registro.estado !== "emitido") throw new ErrorDeRegistro([{ codigo: "registro_no_emitido" }]);
  const numero = numeroDeDocumento(registro.numero!, registro.version);
  const [existente] = await conexion.consultar<{ id: string }>("SELECT id FROM certificado WHERE numero = ? AND eliminado_en IS NULL", [numero]);
  if (existente) return existente.id;
  const cambios = new Cambios(contexto);
  const id = cambios.insertar("certificado", { animal_id: registro.animalId, tipo: "registro_propio", numero, fecha: hoy, archivo });
  await cambios.aplicar(conexion);
  return id;
}
