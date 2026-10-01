export type Jornada = "manana" | "tarde";
export const JORNADAS: readonly Jornada[] = ["manana", "tarde"];

export interface PesajeLeche {
  fecha: string;
  jornada: Jornada;
  kilos: number;
}

/** Día de lactancia de una fecha. SUPOSICION: el día del parto es el día 1. */
export function diaDeLactancia(fechaInicio: string, fecha: string): number {
  void fechaInicio;
  void fecha;
  throw new Error("diaDeLactancia: no implementado");
}

export interface PuntoCurva {
  fecha: string;
  dia: number;
  kilos: number;
}

/** Producción de cada día (suma de las jornadas), en orden de fecha. */
export function produccionDiaria(fechaInicio: string, pesajes: readonly PesajeLeche[]): PuntoCurva[] {
  void fechaInicio;
  void pesajes;
  throw new Error("produccionDiaria: no implementado");
}

export interface Proyeccion {
  acumulado: number;
  /** Promedio diario de los últimos 7 días con registro (o de los que haya, si son menos). */
  promedioDiario: number;
  diasPromediados: number;
  /** Día de lactancia del último registro. */
  diaActual: number;
  diasRestantes: number;
  proyeccion: number;
}

/**
 * R8 (SUPOSICION, documentada en docs/SUPOSICIONES.md):
 *   proyección = acumulado + promedio diario de los últimos 7 días con registro × días que faltan
 *   hasta los días de lactancia de la finca, contados desde el día del último registro.
 * Devuelve null si no hay pesajes.
 */
export function proyectarLactancia(
  fechaInicio: string,
  diasLactancia: number,
  pesajes: readonly PesajeLeche[],
): Proyeccion | null {
  void fechaInicio;
  void diasLactancia;
  void pesajes;
  throw new Error("proyectarLactancia: no implementado");
}

/** Convierte lo que se escribe en el ordeño («2,5», «2.5», « 3 ») a número. Devuelve null si no es válido. */
export function leerKilos(texto: string): number | null {
  void texto;
  throw new Error("leerKilos: no implementado");
}
