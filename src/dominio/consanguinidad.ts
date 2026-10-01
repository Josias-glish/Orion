import { MAX_GENERACIONES_POR_DEFECTO } from "./genealogia";

export interface NodoPedigri {
  padreId: string | null;
  madreId: string | null;
}

/** Padre y madre de cada animal conocido. Un animal que no está en el mapa es desconocido. */
export type Pedigri = ReadonlyMap<string, NodoPedigri>;

/**
 * R6. Coeficiente de consanguinidad de Wright (de 0 a 1) del animal, sobre su pedigrí,
 * mirando hasta `maxGeneraciones` hacia atrás. Un ancestro desconocido cuenta como no emparentado.
 */
export function coeficienteConsanguinidad(
  animalId: string,
  pedigri: Pedigri,
  maxGeneraciones: number = MAX_GENERACIONES_POR_DEFECTO,
): number {
  void animalId;
  void pedigri;
  void maxGeneraciones;
  throw new Error("coeficienteConsanguinidad: no implementado");
}
