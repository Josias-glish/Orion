import { diasEntre } from "./fechas";

export type Jornada = "manana" | "tarde";
export const JORNADAS: readonly Jornada[] = ["manana", "tarde"];

export interface PesajeLeche {
  fecha: string;
  jornada: Jornada;
  kilos: number;
}

/** Día de lactancia de una fecha. SUPOSICION: el día del parto es el día 1. */
export function diaDeLactancia(fechaInicio: string, fecha: string): number {
  return diasEntre(fechaInicio, fecha) + 1;
}

export interface PuntoCurva {
  fecha: string;
  dia: number;
  kilos: number;
}

/** Producción de cada día (suma de las jornadas), en orden de fecha. */
export function produccionDiaria(fechaInicio: string, pesajes: readonly PesajeLeche[]): PuntoCurva[] {
  const porFecha = new Map<string, number>();
  for (const p of pesajes) porFecha.set(p.fecha, (porFecha.get(p.fecha) ?? 0) + p.kilos);
  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, kilos]) => ({ fecha, dia: diaDeLactancia(fechaInicio, fecha), kilos }));
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
  const dias = produccionDiaria(fechaInicio, pesajes);
  if (dias.length === 0) return null;
  const ultimos = dias.slice(-DIAS_PARA_EL_PROMEDIO);
  return calcularProyeccion(diasLactancia, {
    acumulado: dias.reduce((s, d) => s + d.kilos, 0),
    sumaUltimosDias: ultimos.reduce((s, d) => s + d.kilos, 0),
    cantidadUltimosDias: ultimos.length,
    diaUltimoRegistro: dias[dias.length - 1].dia,
  });
}

/** R8: cuántos días con registro se promedian. */
export const DIAS_PARA_EL_PROMEDIO = 7;

/** Lo que necesita la fórmula de R8; la lista de lactancias lo calcula directamente en SQLite. */
export interface ResumenLactancia {
  acumulado: number;
  sumaUltimosDias: number;
  cantidadUltimosDias: number;
  diaUltimoRegistro: number;
}

/** La fórmula de R8, en un solo lugar. */
export function calcularProyeccion(diasLactancia: number, r: ResumenLactancia): Proyeccion {
  const promedioDiario = r.sumaUltimosDias / r.cantidadUltimosDias;
  const diasRestantes = Math.max(0, diasLactancia - r.diaUltimoRegistro);
  return {
    acumulado: r.acumulado,
    promedioDiario,
    diasPromediados: r.cantidadUltimosDias,
    diaActual: r.diaUltimoRegistro,
    diasRestantes,
    proyeccion: r.acumulado + promedioDiario * diasRestantes,
  };
}

/** Convierte lo que se escribe en el ordeño («2,5», «2.5», « 3 ») a número. Devuelve null si no es válido. */
export function leerKilos(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  return Number(limpio);
}
