import type { Rol } from "./tipos";

export interface UsuarioConRol {
  id: string;
  rol: Rol;
}

/**
 * ¿Sigue habiendo al menos un propietario si el usuario `id` pasa a tener `nuevoRol` (o se retira, con null)?
 * SUPOSICION: siempre debe quedar un propietario activo; si no, nadie podría entrar a Ajustes.
 */
export function quedaAlgunPropietario(usuarios: readonly UsuarioConRol[], id: string, nuevoRol: Rol | null): boolean {
  return usuarios.some((u) => (u.id === id ? nuevoRol : u.rol) === "propietario");
}
