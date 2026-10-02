// R16: mezcla por campo. Funciones puras. Diseño: docs/SINCRONIZACION.md, sección 6.
//
// Cada campo de un registro tiene su propia marca (hlc.ts). Una operación que llega se aplica campo por campo:
// el valor nuevo se queda si su marca es mayor o igual que la guardada para ese campo. Un campo que el registro
// nunca tuvo se aplica siempre. Un `crear` es un `modificar` de todos los campos. La mezcla es conmutativa,
// asociativa e idempotente: los equipos y el servidor convergen aunque reciban los cambios en otro orden o repetidos.
//
// El mismo algoritmo existe en SQL (servidor/migraciones) y las dos versiones corren contra los mismos vectores
// (servidor/vectores-fusion.json).
import { compararMarcas, marcaMayor } from "./hlc";

export type ValorCampo = string | number | null;

/** Marcas en forma canónica: `base` es la menor de todas y `campos` solo tiene las que difieren de ella. */
export interface Marcas {
  base: string;
  campos: Record<string, string>;
}

export interface EstadoRegistro {
  /** Valor guardado de cada campo (el de `eliminado_en` es el valor tal cual se escribió, aunque el registro esté restaurado). */
  valores: Record<string, ValorCampo>;
  marcas: Marcas;
}

export interface OperacionFusion {
  campos: Record<string, ValorCampo>;
  marca: string;
}

export interface CampoFusionado {
  campo: string;
  anterior: ValorCampo | undefined;
  nuevo: ValorCampo;
  /** false si el campo ya tenía una marca mayor y el valor recibido no se quedó. */
  aplicado: boolean;
}

export interface ResultadoFusion {
  estado: EstadoRegistro | null;
  campos: CampoFusionado[];
}

/** Campos que no cuentan como «edición» al decidir si un borrado se restaura (S-85). */
export const CAMPOS_SIN_EDICION: ReadonlySet<string> = new Set(["creado_en", "modificado_en", "eliminado_en"]);
export const CAMPO_ELIMINADO = "eliminado_en";

/** Marca explícita de cada campo que el registro tiene. */
export function marcasPorCampo(estado: EstadoRegistro): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const campo of Object.keys(estado.valores)) resultado[campo] = estado.marcas.campos[campo] ?? estado.marcas.base;
  return resultado;
}

/** Forma canónica: la base es la menor marca y solo se listan los campos con otra marca. */
export function canonizarMarcas(porCampo: Readonly<Record<string, string>>): Marcas {
  const todas = Object.values(porCampo);
  if (todas.length === 0) return { base: "", campos: {} };
  const base = todas.reduce((menor, marca) => (compararMarcas(marca, menor) < 0 ? marca : menor));
  const campos: Record<string, string> = {};
  for (const campo of Object.keys(porCampo).sort()) if (porCampo[campo] !== base) campos[campo] = porCampo[campo];
  return { base, campos };
}

/** La marca más reciente de cualquier campo del registro («» si no tiene ninguno). */
export function marcaMaxima(estado: EstadoRegistro): string {
  return Object.values(marcasPorCampo(estado)).reduce(marcaMayor, "");
}

/**
 * R16 (S-85): el registro está eliminado si `eliminado_en` tiene valor y su marca no es anterior a la de ninguna otra
 * edición. Si queda una edición posterior al borrado, el registro se restaura. Con marcas iguales (el borrado y las demás
 * ediciones son de la misma operación del usuario) sigue eliminado.
 */
export function estaEliminado(estado: EstadoRegistro): boolean {
  if ((estado.valores[CAMPO_ELIMINADO] ?? null) === null) return false;
  const porCampo = marcasPorCampo(estado);
  const delBorrado = porCampo[CAMPO_ELIMINADO] ?? "";
  let ultimaEdicion = "";
  for (const [campo, marca] of Object.entries(porCampo)) {
    if (!CAMPOS_SIN_EDICION.has(campo)) ultimaEdicion = marcaMayor(ultimaEdicion, marca);
  }
  return compararMarcas(ultimaEdicion, delBorrado) <= 0;
}

/** Valor de `eliminado_en` que debe mostrar la fila: el del borrado si está eliminado; si no, vacío. */
export function eliminadoEfectivo(estado: EstadoRegistro): string | null {
  return estaEliminado(estado) ? (estado.valores[CAMPO_ELIMINADO] as string) : null;
}

/** Aplica una operación a un registro (o crea el registro si no existía, con `estado` null). No modifica sus argumentos. */
export function fusionar(estado: EstadoRegistro | null, operacion: OperacionFusion): ResultadoFusion {
  const nombres = Object.keys(operacion.campos);
  if (nombres.length === 0) return { estado, campos: [] };

  const valores: Record<string, ValorCampo> = { ...(estado?.valores ?? {}) };
  const porCampo = estado ? marcasPorCampo(estado) : {};
  const campos: CampoFusionado[] = [];

  for (const campo of nombres) {
    const nuevo = operacion.campos[campo];
    const actual = porCampo[campo];
    const aplicado = actual === undefined || compararMarcas(operacion.marca, actual) >= 0;
    campos.push({ campo, anterior: campo in valores ? valores[campo] : undefined, nuevo, aplicado });
    if (aplicado) {
      valores[campo] = nuevo;
      porCampo[campo] = operacion.marca;
    }
  }
  return { estado: { valores, marcas: canonizarMarcas(porCampo) }, campos };
}

/** Aplica varias operaciones en el orden dado. */
export function fusionarTodas(estado: EstadoRegistro | null, operaciones: readonly OperacionFusion[]): EstadoRegistro | null {
  return operaciones.reduce<EstadoRegistro | null>((actual, op) => fusionar(actual, op).estado, estado);
}
