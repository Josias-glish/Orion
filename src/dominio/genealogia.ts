import type { Sexo } from "./tipos";

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

/** Lo mínimo que necesitan las reglas de genealogía de cada animal. */
export interface AnimalGenealogico {
  id: string;
  nombre: string | null;
  sexo: Sexo;
  fechaNacimiento: string | null;
}

export type ErrorGenealogia =
  | { codigo: "padre_es_el_mismo_animal" }
  | { codigo: "madre_es_el_mismo_animal" }
  | { codigo: "padre_es_descendiente"; otro: string }
  | { codigo: "madre_es_descendiente"; otro: string }
  | { codigo: "padre_no_es_macho"; otro: string }
  | { codigo: "madre_no_es_hembra"; otro: string }
  | { codigo: "padre_nacio_despues"; otro: string }
  | { codigo: "madre_nacio_despues"; otro: string }
  | { codigo: "sexo_no_coincide_con_hijos"; otro: string }
  | { codigo: "hijo_nacio_antes"; otro: string };

export interface EntradaGenealogia {
  /** El animal con los datos que se quieren guardar (sexo y fecha nuevos). */
  animal: AnimalGenealogico;
  padre: AnimalGenealogico | null;
  madre: AnimalGenealogico | null;
  /** Ids de todos los descendientes del animal, de cualquier generación. */
  descendientes: ReadonlySet<string>;
  /** Hijos ya registrados en los que este animal figura como padre o como madre. */
  hijosComoPadre: readonly AnimalGenealogico[];
  hijosComoMadre: readonly AnimalGenealogico[];
}

/**
 * R1. Integridad de la genealogía. Devuelve la lista de motivos de rechazo (vacía si todo está bien).
 * SUPOSICION: si falta alguna de las dos fechas de nacimiento, no se puede comparar y no se rechaza.
 */
export function validarGenealogia(entrada: EntradaGenealogia): ErrorGenealogia[] {
  void entrada;
  throw new Error("validarGenealogia: no implementado");
}

/** Descendientes de un animal (de cualquier generación) a partir de la lista de padres de cada animal. */
export function descendientesDe(
  animalId: string,
  padres: ReadonlyMap<string, { padreId: string | null; madreId: string | null }>,
): Set<string> {
  void animalId;
  void padres;
  throw new Error("descendientesDe: no implementado");
}
