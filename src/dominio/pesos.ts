import type { Sexo } from "./tipos";

export type TipoPesaje = "nacimiento" | "destete" | "control";
export const TIPOS_PESAJE: readonly TipoPesaje[] = ["nacimiento", "destete", "control"];

export interface PesajeCorporal {
  fecha: string;
  kilos: number;
}

/** R10. Ganancia diaria: diferencia de kilos dividida por los días entre dos pesajes. Null si son del mismo día. */
export function gananciaDiaria(anterior: PesajeCorporal, posterior: PesajeCorporal): number | null {
  void anterior;
  void posterior;
  throw new Error("gananciaDiaria: no implementado");
}

/** Ganancia respecto al pesaje anterior para cada pesaje (el primero no tiene). */
export function gananciasSucesivas(pesajes: readonly PesajeCorporal[]): (number | null)[] {
  void pesajes;
  throw new Error("gananciasSucesivas: no implementado");
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
  void metas;
  void sexo;
  void edadDias;
  throw new Error("metaParaEdad: no implementado");
}
