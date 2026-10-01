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
  return fracciones.reduce((suma, f) => suma + f.fraccion, 0);
}

/**
 * R3. Las fracciones de un animal suman 100 %.
 * SUPOSICION: una composición vacía es válida (raza aún no registrada).
 */
export function validarComposicion(fracciones: readonly FraccionRacial[]): ErrorComposicion[] {
  if (fracciones.length === 0) return [];
  const errores: ErrorComposicion[] = [];
  if (fracciones.some((f) => !Number.isFinite(f.fraccion) || f.fraccion <= 0 || f.fraccion > 1)) {
    errores.push({ codigo: "fraccion_invalida" });
  }
  if (new Set(fracciones.map((f) => f.razaId)).size !== fracciones.length) {
    errores.push({ codigo: "raza_repetida" });
  }
  const suma = sumaDeFracciones(fracciones);
  if (errores.length === 0 && Math.abs(suma - 1) > TOLERANCIA_COMPOSICION) {
    errores.push({ codigo: "suma_distinta_de_100", sumaPorcentaje: Math.round(suma * 10000) / 100 });
  }
  return errores;
}

/**
 * SUPOSICION: composición racial de una cría = promedio de la del padre y la de la madre.
 * Si falta alguna de las dos, queda vacía para que el propietario la complete.
 */
export function composicionDeCria(
  padre: readonly FraccionRacial[],
  madre: readonly FraccionRacial[],
): FraccionRacial[] {
  if (padre.length === 0 || madre.length === 0) return [];
  const suma = new Map<string, number>();
  for (const f of [...padre, ...madre]) suma.set(f.razaId, (suma.get(f.razaId) ?? 0) + f.fraccion / 2);
  return [...suma.entries()].map(([razaId, fraccion]) => ({ razaId, fraccion }));
}
