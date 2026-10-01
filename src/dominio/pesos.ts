import { diasEntre } from "./fechas";
import type { Sexo } from "./tipos";

export type TipoPesaje = "nacimiento" | "destete" | "control";
export const TIPOS_PESAJE: readonly TipoPesaje[] = ["nacimiento", "destete", "control"];

export interface PesajeCorporal {
  fecha: string;
  kilos: number;
}

/** R10. Ganancia diaria: diferencia de kilos dividida por los días entre dos pesajes. Null si son del mismo día. */
export function gananciaDiaria(anterior: PesajeCorporal, posterior: PesajeCorporal): number | null {
  const dias = diasEntre(anterior.fecha, posterior.fecha);
  return dias === 0 ? null : (posterior.kilos - anterior.kilos) / dias;
}

/** Ganancia respecto al pesaje anterior para cada pesaje (el primero no tiene). */
export function gananciasSucesivas(pesajes: readonly PesajeCorporal[]): (number | null)[] {
  const ordenados = [...pesajes].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return ordenados.map((p, i) => (i === 0 ? null : gananciaDiaria(ordenados[i - 1], p)));
}

export interface MetaPeso {
  sexo: Sexo;
  edadMeses: number;
  kilos: number;
}

/** SUPOSICION: un mes = 30,4375 días (365,25 / 12). */
export const DIAS_POR_MES = 30.4375;

/**
 * RF-31 (SUPOSICION): peso meta para un animal de `sexo` con `edadDias`, interpolando en línea recta entre las dos
 * metas de su sexo que rodean esa edad. Fuera del rango de metas definidas no hay comparación (null).
 */
export function metaParaEdad(metas: readonly MetaPeso[], sexo: Sexo, edadDias: number): number | null {
  const puntos = metas
    .filter((m) => m.sexo === sexo)
    .map((m) => ({ dias: m.edadMeses * DIAS_POR_MES, kilos: m.kilos }))
    .sort((a, b) => a.dias - b.dias);
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i];
    if (Math.abs(a.dias - edadDias) < 1e-9) return a.kilos;
    const b = puntos[i + 1];
    if (b && edadDias > a.dias && edadDias < b.dias) {
      return a.kilos + ((b.kilos - a.kilos) * (edadDias - a.dias)) / (b.dias - a.dias);
    }
  }
  return null;
}
