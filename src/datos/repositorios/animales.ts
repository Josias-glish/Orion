import { validarComposicion, type FraccionRacial } from "../../dominio/composicion";
import { esFechaValida, fechaLocal } from "../../dominio/fechas";
import { validarGenealogia } from "../../dominio/genealogia";
import {
  normalizarValor,
  validarIdentificadores,
  type IdentificadorEditable,
  type IdentificadorEnUso,
} from "../../dominio/identificadores";
import type { EstadoAnimal, FormaConcepcion, Sexo, TipoIdentificador } from "../../dominio/tipos";
import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio, ValorSql } from "../conexion";
import { ErrorDeRegistro, rechazarSi, type Motivo } from "../errores";
import { consultarDescendientes, consultarHijos, obtenerGenealogico } from "./genealogia";

export type { EstadoAnimal, Sexo, TipoIdentificador } from "../../dominio/tipos";

/** Datos que el formulario de un animal envía para crearlo o modificarlo. */
export interface DatosAnimal {
  nombre: string | null;
  sexo: Sexo;
  fechaNacimiento: string | null;
  colorSenas: string | null;
  estado: EstadoAnimal;
  /** SUPOSICION: false = registrado solo para la genealogía (nunca estuvo en la finca). */
  enHato: boolean;
  /** Ruta relativa a la carpeta de datos, por ejemplo «fotos/…jpg». */
  foto: string | null;
  libroId: string | null;
  loteId: string | null;
  formaConcepcion: FormaConcepcion | null;
  padreId: string | null;
  madreId: string | null;
  padreSinVerificar: boolean;
  madreSinVerificar: boolean;
  observaciones: string | null;
  identificadores: IdentificadorEditable[];
  composicion: FraccionRacial[];
}

export interface Pariente {
  id: string;
  nombre: string | null;
  identificador: string | null;
}

export interface FraccionConNombre extends FraccionRacial {
  raza: string;
}

/** Ficha completa de un animal. */
export interface Animal extends DatosAnimal {
  id: string;
  identificadores: (IdentificadorEditable & { id: string })[];
  composicion: FraccionConNombre[];
  padre: Pariente | null;
  madre: Pariente | null;
  libro: string | null;
  lote: string | null;
  creadoEn: string;
  modificadoEn: string;
}

export interface AnimalResumen {
  id: string;
  nombre: string | null;
  sexo: Sexo;
  fechaNacimiento: string | null;
  estado: EstadoAnimal;
  enHato: boolean;
  loteId: string | null;
  lote: string | null;
  tipoIdentificador: TipoIdentificador | null;
  identificador: string | null;
  observaciones: string | null;
  creadoEn: string;
}

/** RF-07: filtros de la lista de animales. Los campos vacíos no filtran. */
export interface FiltroAnimales {
  /** Busca en el nombre y en cualquier identificador (vigente o antiguo). */
  texto?: string;
  sexo?: Sexo | null;
  estado?: EstadoAnimal | null;
  loteId?: string | null;
  /** Por defecto solo se listan los animales del hato. */
  incluirSoloGenealogia?: boolean;
}

/** Datos vacíos para el formulario de un animal nuevo. */
export function animalVacio(): DatosAnimal {
  return {
    nombre: null,
    sexo: "hembra",
    fechaNacimiento: null,
    colorSenas: null,
    estado: "activo",
    enHato: true,
    foto: null,
    libroId: null,
    loteId: null,
    formaConcepcion: null,
    padreId: null,
    madreId: null,
    padreSinVerificar: false,
    madreSinVerificar: false,
    observaciones: null,
    identificadores: [],
    composicion: [],
  };
}

const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listarAnimales(conexion: Conexion, filtro: FiltroAnimales = {}): Promise<AnimalResumen[]> {
  const texto = filtro.texto?.trim() ? `%${escaparLike(filtro.texto.trim())}%` : null;
  const filas = await conexion.consultar<Omit<AnimalResumen, "enHato"> & { enHato: number }>(
    `SELECT a.id, a.nombre, a.sexo, a.fecha_nacimiento AS fechaNacimiento, a.estado, a.en_hato AS enHato,
            a.lote_id AS loteId, l.nombre AS lote,
            i.tipo AS tipoIdentificador, i.valor AS identificador,
            a.observaciones, a.creado_en AS creadoEn
     FROM animal AS a
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     LEFT JOIN lote AS l ON l.id = a.lote_id
     WHERE a.eliminado_en IS NULL
       AND (? IS NULL OR a.sexo = ?)
       AND (? IS NULL OR a.estado = ?)
       AND (? IS NULL OR a.lote_id = ?)
       AND (? = 1 OR a.en_hato = 1)
       AND (? IS NULL
            OR a.nombre LIKE ? ESCAPE '\\'
            OR EXISTS (SELECT 1 FROM identificador AS x
                       WHERE x.animal_id = a.id AND x.eliminado_en IS NULL AND x.valor LIKE ? ESCAPE '\\'))
     ORDER BY a.nombre COLLATE NOCASE, i.valor COLLATE NOCASE`,
    [
      filtro.sexo ?? null,
      filtro.sexo ?? null,
      filtro.estado ?? null,
      filtro.estado ?? null,
      filtro.loteId ?? null,
      filtro.loteId ?? null,
      filtro.incluirSoloGenealogia ? 1 : 0,
      texto,
      texto,
      texto,
    ],
  );
  return filas.map((f) => ({ ...f, enHato: f.enHato === 1 }));
}

/** Animales activos del hato, para el inicio. */
export async function contarAnimales(conexion: Conexion): Promise<{ total: number; hembras: number; machos: number }> {
  const [fila] = await conexion.consultar<{ total: number; hembras: number; machos: number }>(
    `SELECT count(*) AS total,
            coalesce(sum(sexo = 'hembra'), 0) AS hembras,
            coalesce(sum(sexo = 'macho'), 0) AS machos
     FROM animal WHERE eliminado_en IS NULL AND en_hato = 1 AND estado = 'activo'`,
  );
  return fila;
}

/** Candidatos a padre o madre en el formulario: todos los animales del sexo pedido, del hato o no. */
export function listarPosiblesPadres(conexion: Conexion, sexo: Sexo): Promise<AnimalResumen[]> {
  return listarAnimales(conexion, { sexo, incluirSoloGenealogia: true });
}

export async function obtenerAnimal(conexion: Conexion, id: string): Promise<Animal | null> {
  const [fila] = await conexion.consultar<Record<string, ValorSql>>(
    `SELECT a.*, l.nombre AS lote, b.nombre AS libro FROM animal AS a
     LEFT JOIN lote AS l ON l.id = a.lote_id
     LEFT JOIN libro AS b ON b.id = a.libro_id
     WHERE a.id = ? AND a.eliminado_en IS NULL`,
    [id],
  );
  if (!fila) return null;

  const identificadores = await conexion.consultar<{
    id: string;
    tipo: TipoIdentificador;
    valor: string;
    fecha: string | null;
    vigente: number;
    principal: number;
  }>(
    `SELECT id, tipo, valor, fecha, vigente, principal FROM identificador
     WHERE animal_id = ? AND eliminado_en IS NULL ORDER BY principal DESC, vigente DESC, creado_en`,
    [id],
  );
  const composicion = await conexion.consultar<FraccionConNombre>(
    `SELECT c.raza_id AS razaId, c.fraccion, r.nombre AS raza FROM composicion_racial AS c
     JOIN raza AS r ON r.id = c.raza_id
     WHERE c.animal_id = ? AND c.eliminado_en IS NULL ORDER BY c.fraccion DESC, r.nombre`,
    [id],
  );
  const pariente = async (parienteId: ValorSql): Promise<Pariente | null> => {
    if (typeof parienteId !== "string") return null;
    const [p] = await conexion.consultar<Pariente>(
      `SELECT a.id, a.nombre, i.valor AS identificador FROM animal AS a
       LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
       WHERE a.id = ?`,
      [parienteId],
    );
    return p ?? null;
  };

  const texto = (v: ValorSql) => (v === null ? null : String(v));
  return {
    id,
    nombre: texto(fila.nombre),
    sexo: fila.sexo as Sexo,
    fechaNacimiento: texto(fila.fecha_nacimiento),
    colorSenas: texto(fila.color_senas),
    estado: fila.estado as EstadoAnimal,
    enHato: fila.en_hato === 1,
    foto: texto(fila.foto),
    libroId: texto(fila.libro_id),
    loteId: texto(fila.lote_id),
    formaConcepcion: texto(fila.forma_concepcion) as FormaConcepcion | null,
    padreId: texto(fila.padre_id),
    madreId: texto(fila.madre_id),
    padreSinVerificar: fila.padre_sin_verificar === 1,
    madreSinVerificar: fila.madre_sin_verificar === 1,
    observaciones: texto(fila.observaciones),
    identificadores: identificadores.map((i) => ({ ...i, vigente: i.vigente === 1, principal: i.principal === 1 })),
    composicion,
    padre: await pariente(fila.padre_id),
    madre: await pariente(fila.madre_id),
    libro: texto(fila.libro),
    lote: texto(fila.lote),
    creadoEn: String(fila.creado_en),
    modificadoEn: String(fila.modificado_en),
  };
}

/** Columnas de la tabla animal a partir de los datos del formulario. */
function aFila(datos: DatosAnimal): Record<string, ValorSql> {
  const texto = (v: string | null) => v?.trim() || null;
  return {
    nombre: texto(datos.nombre),
    sexo: datos.sexo,
    fecha_nacimiento: texto(datos.fechaNacimiento),
    color_senas: texto(datos.colorSenas),
    estado: datos.estado,
    en_hato: datos.enHato ? 1 : 0,
    foto: datos.foto,
    libro_id: datos.libroId,
    lote_id: datos.loteId,
    forma_concepcion: datos.formaConcepcion,
    padre_id: datos.padreId,
    madre_id: datos.madreId,
    // R5: el padre puede quedar vacío y aun así marcado «sin verificar».
    padre_sin_verificar: datos.padreSinVerificar ? 1 : 0,
    madre_sin_verificar: datos.madreSinVerificar ? 1 : 0,
    observaciones: texto(datos.observaciones),
  };
}

/** Todas las reglas que debe cumplir un animal antes de guardarse (R1, R2, R3 y datos básicos). */
async function validarAnimal(
  conexion: Conexion,
  datos: DatosAnimal,
  animalId: string | null,
  hoy: string,
): Promise<Motivo[]> {
  const motivos: Motivo[] = [];

  if (datos.fechaNacimiento !== null) {
    if (!esFechaValida(datos.fechaNacimiento)) motivos.push({ codigo: "fecha_invalida", campo: "fechaNacimiento" });
    else if (datos.fechaNacimiento > hoy) motivos.push({ codigo: "fecha_futura", campo: "fechaNacimiento" });
  }
  // SUPOSICION: un animal debe poder reconocerse por su nombre o por algún identificador.
  if (!datos.nombre?.trim() && datos.identificadores.length === 0) motivos.push({ codigo: "sin_nombre_ni_identificador" });

  // R1
  const padre = datos.padreId ? await obtenerGenealogico(conexion, datos.padreId) : null;
  const madre = datos.madreId ? await obtenerGenealogico(conexion, datos.madreId) : null;
  if ((datos.padreId && !padre) || (datos.madreId && !madre)) motivos.push({ codigo: "no_encontrado" });
  const hijos = animalId ? await consultarHijos(conexion, animalId) : { comoPadre: [], comoMadre: [] };
  motivos.push(
    ...validarGenealogia({
      animal: { id: animalId ?? "", nombre: datos.nombre, sexo: datos.sexo, fechaNacimiento: datos.fechaNacimiento },
      padre,
      madre,
      descendientes: animalId ? await consultarDescendientes(conexion, animalId) : new Set(),
      hijosComoPadre: hijos.comoPadre,
      hijosComoMadre: hijos.comoMadre,
    }),
  );

  // R2
  motivos.push(...validarIdentificadores(datos.identificadores, await identificadoresEnUso(conexion, animalId)));
  if (datos.identificadores.some((i) => i.fecha !== null && !esFechaValida(i.fecha))) {
    motivos.push({ codigo: "fecha_invalida", campo: "identificador" });
  }

  // R3
  motivos.push(...validarComposicion(datos.composicion));
  return motivos;
}

/** Identificadores vigentes de los demás animales (para R2). */
export function identificadoresEnUso(conexion: Conexion, excluirAnimalId: string | null): Promise<IdentificadorEnUso[]> {
  return conexion.consultar<IdentificadorEnUso>(
    `SELECT i.tipo, i.valor, coalesce(a.nombre, i.valor) AS animal FROM identificador AS i
     JOIN animal AS a ON a.id = i.animal_id
     WHERE i.vigente = 1 AND i.eliminado_en IS NULL AND i.animal_id IS NOT ?`,
    [excluirAnimalId],
  );
}

/** Agrega a un lote de cambios un animal nuevo con sus identificadores y su composición, sin validar. */
export function prepararAnimalNuevo(cambios: Cambios, datos: DatosAnimal): string {
  const id = cambios.insertar("animal", aFila(datos));
  prepararIdentificadores(cambios, id, [], datos.identificadores);
  for (const f of datos.composicion) {
    cambios.insertar("composicion_racial", { animal_id: id, raza_id: f.razaId, fraccion: f.fraccion });
  }
  return id;
}

/**
 * Crea (sin `id`) o modifica un animal con sus identificadores y su composición racial.
 * Valida todo antes de escribir y anota cada campo cambiado en el historial. Devuelve el id.
 */
export async function guardarAnimal(
  conexion: Conexion,
  datos: DatosAnimal,
  contexto: ContextoCambio,
  id?: string,
): Promise<string> {
  exigirPermiso(contexto, id ? "editar_animal" : "crear_animal");
  const actual = id ? await obtenerAnimal(conexion, id) : null;
  if (id && !actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const tocaGenealogia =
    !actual ||
    actual.padreId !== datos.padreId ||
    actual.madreId !== datos.madreId ||
    actual.padreSinVerificar !== datos.padreSinVerificar ||
    actual.madreSinVerificar !== datos.madreSinVerificar;
  if (tocaGenealogia && (datos.padreId || datos.madreId || actual)) exigirPermiso(contexto, "editar_genealogia");
  rechazarSi(await validarAnimal(conexion, datos, id ?? null, fechaLocal()));

  const cambios = new Cambios(contexto);
  if (!actual) {
    const nuevoId = prepararAnimalNuevo(cambios, datos);
    await cambios.aplicar(conexion);
    return nuevoId;
  }
  cambios.actualizar("animal", actual.id, aFila(actual), aFila(datos));
  prepararIdentificadores(cambios, actual.id, actual.identificadores, datos.identificadores);
  await prepararComposicion(conexion, cambios, actual.id, datos.composicion);
  await cambios.aplicar(conexion);
  return actual.id;
}

function filaIdentificador(i: IdentificadorEditable): Record<string, ValorSql> {
  return {
    tipo: i.tipo,
    valor: normalizarValor(i.valor),
    fecha: i.fecha,
    vigente: i.vigente ? 1 : 0,
    principal: i.principal ? 1 : 0,
  };
}

/**
 * Compara los identificadores guardados con los del formulario. El orden importa por los índices únicos:
 * primero se retiran los que ya no están, después se modifican (primero los que dejan de ser principales)
 * y al final se crean los nuevos.
 */
function prepararIdentificadores(
  cambios: Cambios,
  animalId: string,
  antes: readonly (IdentificadorEditable & { id: string })[],
  despues: readonly IdentificadorEditable[],
): void {
  const idsNuevos = new Set(despues.map((i) => i.id).filter(Boolean));
  for (const viejo of antes) if (!idsNuevos.has(viejo.id)) cambios.eliminar("identificador", viejo.id);

  const modificados = despues
    .filter((i) => i.id && antes.some((a) => a.id === i.id))
    .sort((a, b) => Number(a.principal) - Number(b.principal) || Number(a.vigente) - Number(b.vigente));
  for (const i of modificados) {
    const viejo = antes.find((a) => a.id === i.id)!;
    cambios.actualizar("identificador", i.id!, filaIdentificador(viejo), filaIdentificador(i));
  }
  for (const i of despues.filter((i) => !i.id)) {
    cambios.insertar("identificador", { animal_id: animalId, ...filaIdentificador(i) });
  }
}

/** Compara la composición guardada con la del formulario, raza por raza. */
async function prepararComposicion(
  conexion: Conexion,
  cambios: Cambios,
  animalId: string,
  despues: readonly FraccionRacial[],
): Promise<void> {
  const antes = await conexion.consultar<{ id: string; razaId: string; fraccion: number }>(
    "SELECT id, raza_id AS razaId, fraccion FROM composicion_racial WHERE animal_id = ? AND eliminado_en IS NULL",
    [animalId],
  );
  for (const viejo of antes) {
    const nuevo = despues.find((f) => f.razaId === viejo.razaId);
    if (!nuevo) cambios.eliminar("composicion_racial", viejo.id);
    else cambios.actualizar("composicion_racial", viejo.id, { fraccion: viejo.fraccion }, { fraccion: nuevo.fraccion });
  }
  for (const f of despues.filter((f) => !antes.some((a) => a.razaId === f.razaId))) {
    cambios.insertar("composicion_racial", { animal_id: animalId, raza_id: f.razaId, fraccion: f.fraccion });
  }
}

/** Borrado lógico de un animal registrado por error, con sus identificadores y su composición. */
export async function eliminarAnimal(conexion: Conexion, animalId: string, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "editar_animal");
  const cambios = new Cambios(contexto);
  for (const tabla of ["identificador", "composicion_racial"] as const) {
    const filas = await conexion.consultar<{ id: string }>(
      `SELECT id FROM ${tabla} WHERE animal_id = ? AND eliminado_en IS NULL`,
      [animalId],
    );
    for (const { id } of filas) cambios.eliminar(tabla, id);
  }
  cambios.eliminar("animal", animalId);
  await cambios.aplicar(conexion);
}
