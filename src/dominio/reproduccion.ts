import { esDelHato } from "./externos";
import { diasEntre, sumarDias } from "./fechas";
import type { EstadoAnimal, FormaConcepcion, OrigenAnimal, Sexo } from "./tipos";

export type TipoServicio = "monta" | "inseminacion";
export type ResultadoServicio = "pendiente" | "prenada" | "vacia" | "aborto";

export interface ServicioResumido {
  id: string;
  fecha: string;
  tipo: TipoServicio;
  machoId: string | null;
  /** Código de la pajilla, cuando el donante no está registrado. */
  pajilla?: string | null;
  resultado: ResultadoServicio;
}

/** R4. Fecha probable de parto: fecha del servicio más los días de gestación de la finca. */
export function fechaProbableParto(fechaServicio: string, diasGestacion: number): string {
  return sumarDias(fechaServicio, diasGestacion);
}

export interface PadreDelParto {
  /** Servicio usado (el último «preñada» anterior al parto), o null si no hay. */
  servicioId: string | null;
  padreId: string | null;
  /** R5: sin servicio, o con una inseminación sin macho registrado, el padre queda «sin verificar». */
  padreSinVerificar: boolean;
  formaConcepcion: FormaConcepcion | null;
}

const PADRE_DESCONOCIDO: PadreDelParto = { servicioId: null, padreId: null, padreSinVerificar: true, formaConcepcion: null };

/** El padre que sale de un servicio: su macho (o vacío y «sin verificar» si fue una pajilla sin macho registrado). */
function padreDelServicio(s: ServicioResumido, sinVerificar = false): PadreDelParto {
  return {
    servicioId: s.id,
    padreId: s.machoId,
    padreSinVerificar: sinVerificar || s.machoId === null,
    formaConcepcion: s.tipo === "monta" ? "monta_natural" : "inseminacion_artificial",
  };
}

/**
 * R5. Padre de las crías: el macho del último servicio de la hembra con resultado «preñada» anterior al parto.
 * Desde la Etapa 6 no se usan los servicios del parto anterior o de antes (`fechaPartoAnterior`): ese servicio ya
 * dio sus crías.
 */
export function padreDelParto(
  servicios: readonly ServicioResumido[],
  fechaParto: string,
  fechaPartoAnterior: string | null = null,
): PadreDelParto {
  const ultimo = servicios
    .filter((s) => s.resultado === "prenada" && s.fecha < fechaParto && (fechaPartoAnterior === null || s.fecha > fechaPartoAnterior))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  return ultimo ? padreDelServicio(ultimo) : PADRE_DESCONOCIDO;
}

/** R9. Días entre partos consecutivos de la misma hembra, en orden. */
export function intervalosEntrePartos(fechasDePartos: readonly string[]): number[] {
  const ordenadas = [...fechasDePartos].sort();
  return ordenadas.slice(1).map((fecha, i) => diasEntre(ordenadas[i], fecha));
}

export function promedio(valores: readonly number[]): number | null {
  return valores.length === 0 ? null : valores.reduce((a, b) => a + b, 0) / valores.length;
}

/** Lo que se anota de cada cría al registrar el parto (Flujo 1). */
export interface CriaAnotada {
  sexo: "hembra" | "macho";
  nombre: string | null;
  arete: string | null;
  pesoNacimiento: number | null;
  /** SUPOSICION: una cría que nace muerta también tiene ficha, en estado «muerto». */
  nacioMuerta: boolean;
}

/** Ficha que se creará para cada cría (R5). */
export interface CriaPlanificada extends CriaAnotada {
  fechaNacimiento: string;
  madreId: string;
  padreId: string | null;
  padreSinVerificar: boolean;
  madreSinVerificar: false;
  estado: "activo" | "muerto";
  formaConcepcion: FormaConcepcion | null;
  /** R5: el libro queda vacío para que lo asigne el propietario. */
  libroId: null;
}

/** R5. Una ficha por cría, con la madre asignada y el padre del último servicio «preñada». */
export function planificarCrias(
  madreId: string,
  fechaParto: string,
  padre: PadreDelParto,
  crias: readonly CriaAnotada[],
): CriaPlanificada[] {
  return crias.map((cria) => ({
    ...cria,
    fechaNacimiento: fechaParto,
    madreId,
    padreId: padre.padreId,
    padreSinVerificar: padre.padreSinVerificar,
    madreSinVerificar: false,
    estado: cria.nacioMuerta ? "muerto" : "activo",
    formaConcepcion: padre.formaConcepcion,
    libroId: null,
  }));
}

// ---------------------------------------------------------------- R30 (especificación 2, Etapa 6)

export type ErrorReproduccion =
  | { codigo: "debe_ser_hembra"; otro: string }
  | { codigo: "debe_ser_macho"; otro: string }
  | { codigo: "animal_no_disponible"; otro: string }
  | { codigo: "monta_sin_macho" }
  | { codigo: "inseminacion_sin_dato" }
  | { codigo: "costo_solo_externo" }
  | { codigo: "costo_invalido" }
  | { codigo: "padre_no_candidato" };

/** Lo que las reglas del servicio necesitan saber de la hembra y del macho. */
export interface AnimalDelServicio {
  nombre: string;
  sexo: Sexo;
  estado: EstadoAnimal;
  origen: OrigenAnimal;
  enHato: boolean;
}

export interface ServicioAValidar {
  tipo: TipoServicio;
  pajilla: string | null;
  /** Pesos colombianos, sin centavos (SUPOSICION). Solo con un macho de otra finca. */
  costo: number | null;
  /** Condiciones acordadas con el dueño del macho. Solo con un macho de otra finca. */
  condiciones: string | null;
}

/**
 * R30 y R11. El macho puede ser del hato, de otra finca (R29) o no estar registrado (solo la pajilla, en una
 * inseminación). La hembra debe ser del hato y estar activa; el macho, activo. SUPOSICION: una monta necesita el
 * macho; una inseminación, el macho o la pajilla.
 */
export function validarServicio(
  datos: ServicioAValidar,
  hembra: AnimalDelServicio,
  macho: AnimalDelServicio | null,
): ErrorReproduccion[] {
  const errores: ErrorReproduccion[] = [];
  if (hembra.sexo !== "hembra") errores.push({ codigo: "debe_ser_hembra", otro: hembra.nombre });
  if (hembra.estado !== "activo" || !esDelHato(hembra)) errores.push({ codigo: "animal_no_disponible", otro: hembra.nombre });
  if (macho) {
    if (macho.sexo !== "macho") errores.push({ codigo: "debe_ser_macho", otro: macho.nombre });
    if (macho.estado !== "activo") errores.push({ codigo: "animal_no_disponible", otro: macho.nombre });
  }
  if (datos.tipo === "monta" && !macho) errores.push({ codigo: "monta_sin_macho" });
  if (datos.tipo === "inseminacion" && !macho && !datos.pajilla?.trim()) errores.push({ codigo: "inseminacion_sin_dato" });
  const acordado = datos.costo !== null || Boolean(datos.condiciones?.trim());
  if (acordado && (!macho || esDelHato(macho))) errores.push({ codigo: "costo_solo_externo" });
  else if (datos.costo !== null && !(Number.isInteger(datos.costo) && datos.costo >= 0)) errores.push({ codigo: "costo_invalido" });
  return errores;
}

/** SUPOSICION (R30): margen de la ventana de gestación, en días, antes y después de los días de gestación. */
export const MARGEN_GESTACION_POR_DEFECTO = 10;

/**
 * R30. Fechas de servicio que pueden haber dado un parto: desde el parto menos (gestación + margen) hasta el parto
 * menos (gestación − margen), ambas incluidas.
 */
export function ventanaDeGestacion(fechaParto: string, diasGestacion: number, margen: number): { desde: string; hasta: string } {
  return { desde: sumarDias(fechaParto, -(diasGestacion + margen)), hasta: sumarDias(fechaParto, -(diasGestacion - margen)) };
}

/** Un servicio que pudo dar el parto. */
export interface CandidatoPadre {
  servicioId: string;
  fecha: string;
  tipo: TipoServicio;
  machoId: string | null;
  pajilla: string | null;
  resultado: ResultadoServicio;
}

export interface AnalisisPaternidad {
  /** R5: el padre que el programa propone (último servicio «preñada»). */
  propuesto: PadreDelParto;
  ventana: { desde: string; hasta: string };
  /** Servicios dentro de la ventana, uno por cada padre posible (el más reciente de cada uno), del más reciente al más antiguo. */
  candidatos: CandidatoPadre[];
  /** R30: hay dos o más padres posibles dentro de la ventana. */
  incierta: boolean;
}

/**
 * R30 y CA-15. Paternidad del parto: los servicios dentro de la ventana de gestación pueden ser el origen de las crías.
 * Si hay machos distintos (o un macho y una pajilla de un donante sin registrar), la paternidad es incierta.
 * SUPOSICION: no cuentan los servicios con diagnóstico «vacía» o «aborto», ni los anteriores al parto previo.
 */
export function analizarPaternidad(
  servicios: readonly ServicioResumido[],
  fechaParto: string,
  diasGestacion: number,
  margen: number,
  fechaPartoAnterior: string | null = null,
): AnalisisPaternidad {
  const ventana = ventanaDeGestacion(fechaParto, diasGestacion, margen);
  const enVentana = servicios
    .filter(
      (s) =>
        s.fecha >= ventana.desde &&
        s.fecha <= ventana.hasta &&
        s.resultado !== "vacia" &&
        s.resultado !== "aborto" &&
        (fechaPartoAnterior === null || s.fecha > fechaPartoAnterior),
    )
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const vistos = new Set<string>();
  const candidatos: CandidatoPadre[] = [];
  for (const s of enVentana) {
    const padre = s.machoId ? `macho:${s.machoId}` : `pajilla:${(s.pajilla ?? "").trim().toUpperCase()}`;
    if (vistos.has(padre)) continue;
    vistos.add(padre);
    candidatos.push({ servicioId: s.id, fecha: s.fecha, tipo: s.tipo, machoId: s.machoId, pajilla: s.pajilla ?? null, resultado: s.resultado });
  }
  return {
    propuesto: padreDelParto(servicios, fechaParto, fechaPartoAnterior),
    ventana,
    candidatos,
    incierta: candidatos.length >= 2,
  };
}

/** Lo que elige el usuario cuando la paternidad es incierta. `servicioId` null = padre desconocido. */
export interface EleccionPadre {
  servicioId: string | null;
  sinVerificar: boolean;
}

/**
 * R30 y CA-15. El padre elegido por el usuario: uno de los servicios posibles (o el propuesto por R5), o ninguno.
 * Puede marcarlo «sin verificar»; un padre desconocido siempre queda «sin verificar».
 */
export function elegirPadre(analisis: AnalisisPaternidad, eleccion: EleccionPadre): { padre: PadreDelParto; motivos: ErrorReproduccion[] } {
  if (eleccion.servicioId === null) return { padre: PADRE_DESCONOCIDO, motivos: [] };
  const candidato = analisis.candidatos.find((c) => c.servicioId === eleccion.servicioId);
  if (candidato) {
    return {
      padre: padreDelServicio({ id: candidato.servicioId, fecha: candidato.fecha, tipo: candidato.tipo, machoId: candidato.machoId, resultado: candidato.resultado }, eleccion.sinVerificar),
      motivos: [],
    };
  }
  if (analisis.propuesto.servicioId === eleccion.servicioId) {
    return {
      padre: { ...analisis.propuesto, padreSinVerificar: analisis.propuesto.padreSinVerificar || eleccion.sinVerificar },
      motivos: [],
    };
  }
  return { padre: PADRE_DESCONOCIDO, motivos: [{ codigo: "padre_no_candidato" }] };
}
