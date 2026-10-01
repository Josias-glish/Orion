/**
 * Camino desde un animal hasta uno de sus ancestros: una letra por generación,
 * «P» si se sube por el padre y «M» si se sube por la madre.
 * Ejemplos: «P» = padre; «PM» = madre del padre (abuela paterna); «MPP» = bisabuelo materno.
 */
export type Camino = string;

/** SUPOSICION: máximo de generaciones que se recorren (R6 propone seis); será configurable. */
export const MAX_GENERACIONES_POR_DEFECTO = 6;

export function esCaminoValido(camino: string): boolean {
  return /^[PM]+$/.test(camino);
}

/** 1 = padres, 2 = abuelos, 3 = bisabuelos… */
export function generacion(camino: Camino): number {
  return camino.length;
}

/** Línea por la que se llega al ancestro: la del padre o la de la madre del animal. */
export function linea(camino: Camino): "paterna" | "materna" {
  return camino.startsWith("P") ? "paterna" : "materna";
}

/** Sexo que debe tener el ancestro según el camino: la última letra dice si es padre o madre. */
export function sexoEsperado(camino: Camino): "macho" | "hembra" {
  return camino.endsWith("P") ? "macho" : "hembra";
}

/** Orden del árbol: primero las generaciones cercanas y, dentro de cada una, la línea paterna. */
export function compararCaminos(a: Camino, b: Camino): number {
  if (a.length !== b.length) return a.length - b.length;
  const clave = (c: Camino) => c.replaceAll("P", "0").replaceAll("M", "1");
  return clave(a).localeCompare(clave(b));
}
