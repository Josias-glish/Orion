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
  void fechaServicio;
  void diasGestacion;
  throw new Error("fechaProbableParto: no implementado");
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
  void servicios;
  void fechaParto;
  throw new Error("padreDelParto: no implementado");
}

/** R9. Días entre partos consecutivos de la misma hembra, en orden. */
export function intervalosEntrePartos(fechasDePartos: readonly string[]): number[] {
  void fechasDePartos;
  throw new Error("intervalosEntrePartos: no implementado");
}

export function promedio(valores: readonly number[]): number | null {
  void valores;
  throw new Error("promedio: no implementado");
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
  void madreId;
  void fechaParto;
  void padre;
  void crias;
  throw new Error("planificarCrias: no implementado");
}
