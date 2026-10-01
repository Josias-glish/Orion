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
  | "registrar_tratamiento";

/** R14. ¿Puede este rol hacer esta acción? */
export function puede(rol: Rol, accion: Accion): boolean {
  void rol;
  void accion;
  throw new Error("puede: no implementado");
}
