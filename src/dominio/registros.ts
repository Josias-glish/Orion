// R31 (especificación 2): registro genealogico propio, el libro del propio criadero. Reglas puras, sin base de datos:
// formato del número, lista de verificación, numeración por libro, estados, instantánea y emisión en lote.
import { TOLERANCIA_COMPOSICION } from "./composicion";
import { esDelHato, type OrigenDeAnimal } from "./externos";
import type { ErrorGenealogia } from "./genealogia";
import type { FormaConcepcion, OrigenAnimal, Sexo, TipoIdentificador } from "./tipos";

export type EstadoRegistro = "borrador" | "emitido" | "anulado";
export const ESTADOS_REGISTRO: readonly EstadoRegistro[] = ["borrador", "emitido", "anulado"];

export type ErrorRegistro =
  | { codigo: "registro_incompleto"; faltantes: Requisito[] }
  | { codigo: "animal_no_elegible" }
  | { codigo: "registro_ya_vigente" }
  | { codigo: "registro_no_emitido" }
  | { codigo: "registro_no_borrador" }
  | { codigo: "registro_anulado" }
  | { codigo: "registro_libro_distinto" }
  | { codigo: "motivo_anulacion_obligatorio" }
  | { codigo: "formato_numero_invalido"; campo: "prefijo" | "separador" | "digitos" }
  | { codigo: "prefijo_repetido"; prefijo: string }
  | { codigo: "libro_con_registros" }
  | { codigo: "numero_inicial_invalido" }
  | { codigo: "dato_obligatorio"; campo: string };

// ---------------------------------------------------------------- Número

/** Cómo se escribe el número de un libro: prefijo + separador + consecutivo con ceros a la izquierda. */
export interface FormatoNumero {
  prefijo: string | null;
  separador: "" | "-";
  digitos: number;
}

/** SUPOSICION (S-59): el prefijo son 1 a 8 letras o números, sin espacios (el número también es el nombre del archivo). */
const PREFIJO_VALIDO = /^[A-Za-z0-9]{1,8}$/;
export const MAXIMO_DIGITOS = 8;

export function validarFormato(formato: FormatoNumero): ErrorRegistro[] {
  const errores: ErrorRegistro[] = [];
  if (formato.prefijo !== null && !PREFIJO_VALIDO.test(formato.prefijo)) errores.push({ codigo: "formato_numero_invalido", campo: "prefijo" });
  if (formato.separador !== "" && formato.separador !== "-") errores.push({ codigo: "formato_numero_invalido", campo: "separador" });
  if (!Number.isInteger(formato.digitos) || formato.digitos < 1 || formato.digitos > MAXIMO_DIGITOS) {
    errores.push({ codigo: "formato_numero_invalido", campo: "digitos" });
  }
  return errores;
}

/** «PPE-0001». Un consecutivo más largo que los dígitos configurados no se recorta. */
export function formatearNumero(formato: FormatoNumero, consecutivo: number): string {
  return `${formato.prefijo ?? ""}${formato.separador}${String(consecutivo).padStart(formato.digitos, "0")}`;
}

/** Número del documento de una versión (cada versión emitida tiene su propio archivo): «PPE-0001-v2». */
export function numeroDeDocumento(numero: string, version: number): string {
  return `${numero}-v${version}`;
}

/**
 * Siguiente consecutivo de un libro. Normalmente es el contador del libro; si el contador se quedó atrás de lo ya
 * emitido (una escritura que se cortó a medias), se sigue del último usado: un número nunca se reutiliza.
 */
export function siguienteConsecutivo(contadorDelLibro: number, ultimoUsado: number | null): number {
  return Math.max(contadorDelLibro, (ultimoUsado ?? 0) + 1);
}

// ---------------------------------------------------------------- Lista de verificación

/** Requisitos para emitir, en el orden en que se muestran. */
export const REQUISITOS = [
  "nombre",
  "sexo",
  "nacimiento",
  "identificador",
  "composicion",
  "libro",
  "prefijo",
  "padre",
  "madre",
  "genealogia",
  "criador",
  "propietario",
  "criadero",
] as const;
export type Requisito = (typeof REQUISITOS)[number];

export interface EntradaVerificacion {
  nombre: string | null;
  sexo: Sexo;
  fechaNacimiento: string | null;
  /** Valor del identificador principal y vigente, si lo hay. */
  identificadorPrincipal: string | null;
  composicion: readonly { fraccion: number }[];
  libro: { nombre: string; prefijo: string | null } | null;
  tienePadre: boolean;
  tieneMadre: boolean;
  /** Motivos con los que la genealogía incumple R1 (vacío si pasa). */
  erroresGenealogia: readonly ErrorGenealogia[];
  criador: string | null;
  propietario: string | null;
  criadero: string | null;
}

export interface ItemVerificacion {
  requisito: Requisito;
  cumple: boolean;
  /** No se exige en este caso (libro «Fundadores» sin padres; el prefijo cuando aún no hay libro). Cuenta como cumplido. */
  exento?: boolean;
}

export interface ListaDeVerificacion {
  items: ItemVerificacion[];
  cumple: boolean;
  faltantes: Requisito[];
}

const lleno = (valor: string | null | undefined) => (valor ?? "").trim() !== "";

/** El libro «Fundadores» admite animales sin padres. SUPOSICION (S-62): se reconoce por su nombre. */
export function esLibroFundadores(nombre: string | null): boolean {
  return (nombre ?? "").trim().toLowerCase() === "fundadores";
}

/** R31: requisitos para emitir. Si falta alguno no se emite, y esta lista dice cuál. */
export function verificarRequisitos(e: EntradaVerificacion): ListaDeVerificacion {
  const fundadores = esLibroFundadores(e.libro?.nombre ?? null);
  const suma = e.composicion.reduce((total, f) => total + f.fraccion, 0);
  const items: ItemVerificacion[] = [
    { requisito: "nombre", cumple: lleno(e.nombre) },
    { requisito: "sexo", cumple: e.sexo === "hembra" || e.sexo === "macho" },
    { requisito: "nacimiento", cumple: lleno(e.fechaNacimiento) },
    { requisito: "identificador", cumple: lleno(e.identificadorPrincipal) },
    { requisito: "composicion", cumple: e.composicion.length > 0 && Math.abs(suma - 1) <= TOLERANCIA_COMPOSICION },
    { requisito: "libro", cumple: e.libro !== null },
    e.libro === null ? { requisito: "prefijo", cumple: true, exento: true } : { requisito: "prefijo", cumple: lleno(e.libro.prefijo) },
    fundadores ? { requisito: "padre", cumple: true, exento: true } : { requisito: "padre", cumple: e.tienePadre },
    fundadores ? { requisito: "madre", cumple: true, exento: true } : { requisito: "madre", cumple: e.tieneMadre },
    { requisito: "genealogia", cumple: e.erroresGenealogia.length === 0 },
    { requisito: "criador", cumple: lleno(e.criador) },
    { requisito: "propietario", cumple: lleno(e.propietario) },
    { requisito: "criadero", cumple: lleno(e.criadero) },
  ];
  const faltantes = items.filter((i) => !i.cumple).map((i) => i.requisito);
  return { items, cumple: faltantes.length === 0, faltantes };
}

/** R31 + R29: solo un animal del hato tiene registro propio (no uno de otra finca ni uno «solo genealogía»). */
export function validarElegibilidad(animal: OrigenDeAnimal): ErrorRegistro[] {
  return esDelHato(animal) ? [] : [{ codigo: "animal_no_elegible" }];
}

// ---------------------------------------------------------------- Estados

export type AccionRegistro = "crear_borrador" | "editar" | "descartar" | "emitir" | "reemitir" | "anular";

/**
 * R31: qué se puede hacer según el estado del registro vigente del animal (`null` = no tiene registro vigente).
 *  - borrador: se edita, se descarta o se emite (todavía no tiene número);
 *  - emitido: se reemite (versión nueva, mismo número) o se anula;
 *  - anulado: no cambia más; el animal puede recibir otro registro con otro número.
 */
export function validarAccion(estado: EstadoRegistro | null, accion: AccionRegistro): ErrorRegistro[] {
  if (estado === null) return accion === "emitir" || accion === "crear_borrador" ? [] : [{ codigo: "registro_no_emitido" }];
  if (estado === "anulado") return [{ codigo: "registro_anulado" }];
  if (estado === "borrador") {
    if (accion === "editar" || accion === "descartar" || accion === "emitir") return [];
    return accion === "crear_borrador" ? [{ codigo: "registro_ya_vigente" }] : [{ codigo: "registro_no_emitido" }];
  }
  // emitido
  if (accion === "reemitir" || accion === "anular") return [];
  return accion === "emitir" || accion === "crear_borrador" ? [{ codigo: "registro_ya_vigente" }] : [{ codigo: "registro_no_borrador" }];
}

export function validarMotivoAnulacion(motivo: string | null): ErrorRegistro[] {
  return lleno(motivo) ? [] : [{ codigo: "motivo_anulacion_obligatorio" }];
}

// ---------------------------------------------------------------- Lote

export interface LibroNumeracion {
  formato: FormatoNumero;
  /** Siguiente consecutivo que corresponde al libro (ya considerando lo emitido). */
  siguiente: number;
}

export interface CandidatoLote {
  animalId: string;
  libroId: string | null;
  lista: ListaDeVerificacion;
  /** Ya tiene un registro vigente (borrador aparte: un borrador sí se emite). */
  yaTieneRegistro?: boolean;
}

export interface NumeroAsignado {
  animalId: string;
  libroId: string;
  consecutivo: number;
  numero: string;
}

export interface RechazoLote {
  animalId: string;
  motivo: "incompleto" | "ya_registrado";
  faltantes: Requisito[];
}

export interface PlanLote {
  emitir: NumeroAsignado[];
  rechazados: RechazoLote[];
  /** Nuevo contador de cada libro que recibió números. */
  siguientePorLibro: Map<string, number>;
}

/**
 * R31, emisión en lote: emite a los que cumplen y deja a los demás con lo que les falta. Los números se asignan
 * después de decidir quién cumple, en el orden recibido y por libro, así que los emitidos no dejan saltos.
 */
export function planificarLote(candidatos: readonly CandidatoLote[], libros: ReadonlyMap<string, LibroNumeracion>): PlanLote {
  const plan: PlanLote = { emitir: [], rechazados: [], siguientePorLibro: new Map() };
  for (const c of candidatos) {
    if (c.yaTieneRegistro) {
      plan.rechazados.push({ animalId: c.animalId, motivo: "ya_registrado", faltantes: [] });
      continue;
    }
    const libro = c.libroId ? libros.get(c.libroId) : undefined;
    if (!c.lista.cumple || !c.libroId || !libro) {
      const faltantes = c.lista.faltantes.length > 0 ? c.lista.faltantes : (["libro"] as Requisito[]);
      plan.rechazados.push({ animalId: c.animalId, motivo: "incompleto", faltantes });
      continue;
    }
    const consecutivo = plan.siguientePorLibro.get(c.libroId) ?? libro.siguiente;
    plan.emitir.push({ animalId: c.animalId, libroId: c.libroId, consecutivo, numero: formatearNumero(libro.formato, consecutivo) });
    plan.siguientePorLibro.set(c.libroId, consecutivo + 1);
  }
  return plan;
}

// ---------------------------------------------------------------- Instantánea

/** Un ancestro tal como figuraba al emitir. `camino`: P = padre, M = madre (PM = abuela paterna). */
export interface AncestroInstantanea {
  camino: string;
  nombre: string | null;
  sexo: Sexo;
  /** Identificador principal (arete, tatuaje…). */
  identificador: string | null;
  /** Número de registro de la asociación, si lo tiene (los ancestros de otras fincas lo llevan en el pedigrí). */
  registroAsociacion: string | null;
  externo: boolean;
  /** «Nombre · Criadero» del propietario de un ancestro de otra finca. */
  propietario: string | null;
  sinVerificar: boolean;
  fechaNacimiento: string | null;
}

export const GENERACIONES_GUARDADAS = 4;

export interface EntradaInstantanea {
  numero: string;
  version: number;
  fechaRegistro: string;
  fechaEmision: string;
  responsable: string | null;
  emitidoPor: string | null;
  finca: { nombre: string; criadero: string | null; municipio: string | null };
  criador: string;
  propietario: string;
  observaciones: string | null;
  animal: {
    id: string;
    nombre: string | null;
    sexo: Sexo;
    fechaNacimiento: string | null;
    colorSenas: string | null;
    libro: string;
    formaConcepcion: FormaConcepcion | null;
    origen: OrigenAnimal;
    identificadores: { tipo: TipoIdentificador; valor: string; principal: boolean }[];
    composicion: { raza: string; fraccion: number }[];
    consanguinidad: number | null;
  };
  /** Ancestros hasta `GENERACIONES_GUARDADAS` (sin el propio animal). */
  pedigri: AncestroInstantanea[];
}

/** Copia fija de los datos y del pedigrí al emitir (R31). Lo emitido no cambia aunque cambie el animal. */
export interface InstantaneaRegistro extends EntradaInstantanea {
  esquema: 1;
}

export const ESQUEMA_INSTANTANEA = 1;

export function armarInstantanea(entrada: EntradaInstantanea): InstantaneaRegistro {
  // JSON ida y vuelta: copia profunda, y solo lo que se puede guardar.
  return { esquema: ESQUEMA_INSTANTANEA, ...(JSON.parse(JSON.stringify(entrada)) as EntradaInstantanea) };
}

/** Lee la instantánea guardada. Falla si no es una instantánea que este programa entienda. */
export function leerInstantanea(json: string): InstantaneaRegistro {
  const dato = JSON.parse(json) as Partial<InstantaneaRegistro> | null;
  if (!dato || typeof dato !== "object") throw new Error("instantánea ilegible");
  if (dato.esquema !== ESQUEMA_INSTANTANEA) throw new Error(`esquema de instantánea desconocido: ${String(dato.esquema)}`);
  if (typeof dato.numero !== "string" || !dato.animal || !Array.isArray(dato.pedigri) || !dato.finca) {
    throw new Error("instantánea incompleta");
  }
  return dato as InstantaneaRegistro;
}
