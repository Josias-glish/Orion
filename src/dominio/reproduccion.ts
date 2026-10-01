import { diasEntre, sumarDias } from "./fechas";
import type { FormaConcepcion } from "./tipos";

export type TipoServicio = "monta" | "inseminacion";
export type ResultadoServicio = "pendiente" | "prenada" | "vacia" | "aborto";

export interface ServicioResumido {
  id: string;
  fecha: string;
  tipo: TipoServicio;
  machoId: string | null;
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

/** R5. Padre de las crías: el macho del último servicio de la hembra con resultado «preñada» anterior al parto. */
export function padreDelParto(servicios: readonly ServicioResumido[], fechaParto: string): PadreDelParto {
  const ultimo = servicios
    .filter((s) => s.resultado === "prenada" && s.fecha < fechaParto)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  if (!ultimo) return { servicioId: null, padreId: null, padreSinVerificar: true, formaConcepcion: null };
  return {
    servicioId: ultimo.id,
    padreId: ultimo.machoId,
    padreSinVerificar: ultimo.machoId === null,
    formaConcepcion: ultimo.tipo === "monta" ? "monta_natural" : "inseminacion_artificial",
  };
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
