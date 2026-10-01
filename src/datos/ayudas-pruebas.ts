// Ayudas para las pruebas automáticas (Vitest). No las usa el programa.
import type { ContextoCambio } from "./conexion";
import { animalVacio, guardarAnimal, type DatosAnimal } from "./repositorios/animales";
import type { Conexion } from "./conexion";

export const AHORA = "2026-10-01T12:00:00.000Z";
export const PROPIETARIO: ContextoCambio = { usuarioId: null, rol: "propietario", marcaTiempo: AHORA };
export const OPERARIO: ContextoCambio = { usuarioId: null, rol: "operario", marcaTiempo: AHORA };

/** Crea un animal con los datos mínimos más los indicados; devuelve su id. */
export function crearAnimalDePrueba(conexion: Conexion, datos: Partial<DatosAnimal>, contexto = PROPIETARIO) {
  return guardarAnimal(conexion, { ...animalVacio(), ...datos }, contexto);
}

/** Arete principal y vigente para usar en `identificadores`. */
export function arete(valor: string, principal = true) {
  return { tipo: "arete" as const, valor, fecha: null, vigente: true, principal };
}
