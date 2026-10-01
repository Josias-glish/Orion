import type { Rol } from "./tipos";

export type Accion =
  | "ver_fichas"
  | "crear_animal"
  | "editar_animal"
  | "editar_genealogia"
  | "ver_ajustes"
  | "exportar_respaldo"
  | "registrar_leche"
  | "registrar_parto"
  | "registrar_peso"
  | "registrar_tratamiento"
  | "registrar_servicio"
  | "editar_metas_peso";

/**
 * R14. El operario puede ver las fichas y registrar leche, partos, pesos y tratamientos.
 * SUPOSICION: tampoco crea ni edita fichas de animales (R14 no lo incluye entre lo permitido).
 */
const PERMITIDO_AL_OPERARIO: ReadonlySet<Accion> = new Set([
  "ver_fichas",
  "registrar_leche",
  "registrar_parto",
  "registrar_peso",
  "registrar_tratamiento",
]);

/** R14. ¿Puede este rol hacer esta acción? El propietario puede todo. */
export function puede(rol: Rol, accion: Accion): boolean {
  return rol === "propietario" || PERMITIDO_AL_OPERARIO.has(accion);
}
