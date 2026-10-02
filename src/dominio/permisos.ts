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
  | "editar_metas_peso"
  | "emitir_documento"
  | "ver_contactos"
  | "editar_contactos"
  | "ver_registros"
  | "gestionar_registros"
  | "ver_finanzas"
  | "gestionar_finanzas";

/**
 * R14. El operario puede ver las fichas y registrar leche, partos, pesos y tratamientos.
 * SUPOSICION: tampoco crea ni edita fichas de animales (R14 no lo incluye entre lo permitido).
 * R23 (especificación 2): ve las fichas de los animales de otras fincas, pero no los crea ni los edita, y no crea
 * ni edita contactos. SUPOSICION (R28, datos mínimos): tampoco ve la lista de contactos con teléfonos y correos.
 * R23 y R31: el operario no ve la pantalla Registros ni crea, emite o anula registros genealógicos; solo el propietario.
 * R23: el operario tampoco ve Finanzas ni registra ingresos o gastos; solo el propietario. La calidad de la leche (R18)
 * se anota junto al ordeño, así que la registra quien registra leche.
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
