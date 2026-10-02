// R29 (especificación 2): animales de otras fincas. Sirven solo como padre, madre o ancestro de un animal propio.
import type { OrigenAnimal } from "./tipos";

export type ErrorExterno =
  | { codigo: "externo_sin_propietario" }
  | { codigo: "externo_en_lote" }
  | { codigo: "externo_ancestro_de_propio"; otro: string }
  | { codigo: "dato_obligatorio"; campo: string };

export interface OrigenDeAnimal {
  origen: OrigenAnimal;
  /** Campo de la versión 0.1.0: false = registrado solo para la genealogía. */
  enHato: boolean;
}

/**
 * ¿Es un animal del hato? Los de otras fincas no lo son, ni los registrados «solo para la genealogía» en la 0.1.0
 * (SUPOSICION: la migración los deja como «nacido_aqui», como pide la especificación 2, pero siguen fuera del hato).
 * Solo los del hato cuentan en el inventario, el ordeño, los servicios propios, las alertas y el tope de animales.
 */
export function esDelHato(a: OrigenDeAnimal): boolean {
  return a.origen !== "externo" && a.enHato;
}

/** R29: datos mínimos de un animal de otra finca (nombre, sexo y propietario) y sin lote de la finca. */
export function validarExterno(datos: { nombre: string | null; contactoId: string | null; loteId: string | null }): ErrorExterno[] {
  const errores: ErrorExterno[] = [];
  if (!datos.nombre?.trim()) errores.push({ codigo: "dato_obligatorio", campo: "nombre" });
  if (!datos.contactoId) errores.push({ codigo: "externo_sin_propietario" });
  if (datos.loteId) errores.push({ codigo: "externo_en_lote" });
  return errores;
}

/**
 * R29: un animal que no es del hato y es ancestro de un animal del hato no se puede retirar.
 * `descendientesDelHato` son los nombres de sus descendientes que sí son del hato (de cualquier generación).
 */
export function validarRetiroDeExterno(animal: OrigenDeAnimal, descendientesDelHato: readonly string[]): ErrorExterno[] {
  if (esDelHato(animal) || descendientesDelHato.length === 0) return [];
  return [{ codigo: "externo_ancestro_de_propio", otro: descendientesDelHato[0] }];
}
