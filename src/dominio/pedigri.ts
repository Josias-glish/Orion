// R31: pedigrí en columnas a partir de los ancestros guardados en la instantánea del registro.
// Tres generaciones = padres, abuelos y bisabuelos (SUPOSICION S-63); la opción de cuatro agrega los tatarabuelos.
import { compararCaminos } from "./genealogia";
import type { FraccionConRaza } from "./expediente";
import type { AncestroInstantanea } from "./registros";
import type { OrigenAnimal, Sexo } from "./tipos";

export const GENERACIONES_PEDIGRI = [3, 4] as const;
export type GeneracionesPedigri = (typeof GENERACIONES_PEDIGRI)[number];

/** Caminos de una generación, de la línea paterna a la materna: 1 → P, M; 2 → PP, PM, MP, MM… */
export function caminosDeGeneracion(generacion: number): string[] {
  let caminos = [""];
  for (let i = 0; i < generacion; i++) caminos = caminos.flatMap((c) => [`${c}P`, `${c}M`]);
  return caminos.sort(compararCaminos);
}

/**
 * Una columna por generación (la 1 son los padres) con 2^generación lugares. Un ancestro que no se conoce deja su
 * lugar vacío (null) sin mover a los demás.
 */
export function columnasDelPedigri(pedigri: readonly AncestroInstantanea[], generaciones: number): (AncestroInstantanea | null)[][] {
  const porCamino = new Map(pedigri.map((a) => [a.camino, a]));
  return Array.from({ length: generaciones }, (_, i) => caminosDeGeneracion(i + 1).map((c) => porCamino.get(c) ?? null));
}

/** Lo que lleva el pedigrí imprimible de un animal (R31), tenga o no registro propio. */
export interface DatosPedigri {
  fecha: string;
  finca: { nombre: string; criadero: string | null; municipio: string | null };
  animal: {
    nombre: string | null;
    sexo: Sexo;
    fechaNacimiento: string | null;
    libro: string | null;
    identificador: string | null;
    registroAsociacion: string | null;
    composicion: FraccionConRaza[];
    origen: OrigenAnimal;
    /** «Nombre · Criadero» si es de otra finca. */
    propietario: string | null;
    registro: { numero: string; estado: "borrador" | "emitido" | "anulado" } | null;
  };
  pedigri: AncestroInstantanea[];
}
