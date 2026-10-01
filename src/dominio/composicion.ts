/** Fracción de una raza en un animal, como proporción entre 0 y 1 (0,5 = 50 %). */
export interface FraccionRacial {
  razaId: string;
  fraccion: number;
}

export type ErrorComposicion =
  | { codigo: "fraccion_invalida" }
  | { codigo: "raza_repetida" }
  | { codigo: "suma_distinta_de_100"; sumaPorcentaje: number };

/** Margen para errores de redondeo: 0,01 puntos porcentuales. */
export const TOLERANCIA_COMPOSICION = 0.0001;

export function sumaDeFracciones(fracciones: readonly FraccionRacial[]): number {
  void fracciones;
  throw new Error("sumaDeFracciones: no implementado");
}

/**
 * R3. Las fracciones de un animal suman 100 %.
 * SUPOSICION: una composición vacía es válida (raza aún no registrada).
 */
export function validarComposicion(fracciones: readonly FraccionRacial[]): ErrorComposicion[] {
  void fracciones;
  throw new Error("validarComposicion: no implementado");
}
