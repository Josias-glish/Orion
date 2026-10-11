// Un registro con sus marcas por campo se puede contar como una lista de operaciones que, aplicadas con `fusionar`, lo
// reconstruyen. La primera subida y la descarga inicial usan esto para no tener una segunda forma de mezclar.
// Funciones puras. Diseño: docs/SINCRONIZACION.md, sección 12.
import { compararMarcas } from "./hlc";
import { marcasPorCampo, type Marcas, type OperacionFusion, type ValorCampo } from "./fusion";

export interface OpcionesInstantanea {
  /** Campos que no entran (por ejemplo, los que apuntan a la misma tabla en la primera pasada). */
  omitir?: ReadonlySet<string>;
  /** Solo estos campos. */
  solo?: ReadonlySet<string>;
}

/**
 * Operaciones que reconstruyen el registro: primero una con TODOS los campos y la marca más antigua (así el registro se
 * puede crear con sus campos obligatorios completos), y luego una por cada marca más nueva con los campos que la tienen.
 */
export function operacionesDeInstantanea(valores: Readonly<Record<string, ValorCampo>>, marcas: Marcas, opciones: OpcionesInstantanea = {}): OperacionFusion[] {
  const campos = Object.keys(valores).filter((c) => (!opciones.omitir || !opciones.omitir.has(c)) && (!opciones.solo || opciones.solo.has(c)));
  if (campos.length === 0) return [];
  const porCampo = marcasPorCampo({ valores: Object.fromEntries(campos.map((c) => [c, valores[c]])), marcas });
  const grupos = new Map<string, Record<string, ValorCampo>>();
  for (const campo of campos) {
    const marca = porCampo[campo];
    (grupos.get(marca) ?? grupos.set(marca, {}).get(marca)!)[campo] = valores[campo];
  }
  const ordenadas = [...grupos.keys()].sort(compararMarcas);
  const menor = ordenadas[0];
  const todos: Record<string, ValorCampo> = {};
  for (const campo of campos) todos[campo] = valores[campo];
  return [{ campos: todos, marca: menor }, ...ordenadas.slice(1).map((marca) => ({ campos: grupos.get(marca)!, marca }))];
}
