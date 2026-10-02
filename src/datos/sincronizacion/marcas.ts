// Marcas por campo de cada registro (tabla `marca_registro`) y su conversión al estado que usa la mezcla (R16).
import { MARCA_CERO } from "../../dominio/sincronizacion/hlc";
import {
  canonizarMarcas,
  estaEliminado,
  marcaMaxima,
  marcasPorCampo,
  type EstadoRegistro,
  type Marcas,
  type ValorCampo,
} from "../../dominio/sincronizacion/fusion";
import type { Conexion, Sentencia } from "../conexion";

export interface RegistroMarcado {
  marcas: Marcas;
  /** Valor de `eliminado_en` tal cual se escribió; la fila de la tabla muestra el efecto calculado. */
  eliminadoValor: string | null;
}

export const clave = (entidad: string, id: string): string => `${entidad}|${id}`;

interface FilaMarcas {
  entidad: string;
  registro_id: string;
  marca_base: string;
  campos: string;
  eliminado_valor: string | null;
}

const POR_CONSULTA = 400;

/** Las marcas de los registros indicados (los que no tienen fila no aparecen en el resultado). */
export async function leerMarcas(conexion: Conexion, entidad: string, ids: readonly string[]): Promise<Map<string, RegistroMarcado>> {
  const resultado = new Map<string, RegistroMarcado>();
  const unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += POR_CONSULTA) {
    const lote = unicos.slice(i, i + POR_CONSULTA);
    const filas = await conexion.consultar<FilaMarcas>(
      `SELECT entidad, registro_id, marca_base, campos, eliminado_valor FROM marca_registro
        WHERE entidad = ? AND registro_id IN (${lote.map(() => "?").join(", ")})`,
      [entidad, ...lote],
    );
    for (const f of filas) {
      resultado.set(clave(f.entidad, f.registro_id), {
        marcas: { base: f.marca_base, campos: JSON.parse(f.campos) as Record<string, string> },
        eliminadoValor: f.eliminado_valor,
      });
    }
  }
  return resultado;
}

export function sentenciaMarcas(entidad: string, id: string, registro: RegistroMarcado, ahoraIso: string): Sentencia {
  return {
    sql: `INSERT INTO marca_registro (entidad, registro_id, marca_base, campos, eliminado_valor, modificado_en)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (entidad, registro_id) DO UPDATE SET
            marca_base = excluded.marca_base, campos = excluded.campos,
            eliminado_valor = excluded.eliminado_valor, modificado_en = excluded.modificado_en`,
    parametros: [entidad, id, registro.marcas.base, JSON.stringify(registro.marcas.campos), registro.eliminadoValor, ahoraIso],
  };
}

/**
 * El estado de un registro para la mezcla, a partir de sus marcas y de la lista de campos de la tabla. Los valores de
 * los campos que no sean `eliminado_en` no importan para decidir el borrado ni la mezcla de las marcas.
 */
export function estadoDesdeMarcas(registro: RegistroMarcado, columnas: readonly string[], valores?: Readonly<Record<string, ValorCampo>>): EstadoRegistro {
  const resultado: Record<string, ValorCampo> = {};
  for (const columna of columnas) resultado[columna] = valores?.[columna] ?? null;
  if (columnas.includes("eliminado_en")) resultado.eliminado_en = registro.eliminadoValor;
  return { valores: resultado, marcas: registro.marcas };
}

/**
 * Marcas después de que los campos `tocados` pasan a tener `marca` (todos los demás conservan la suya). Si el registro no
 * tenía marcas, los demás campos quedan con la marca más antigua posible: no se sabe cuándo se escribieron y cualquier
 * cambio recibido de otro equipo debe poder reemplazarlos.
 */
export function marcarCampos(actual: Marcas | null, columnas: readonly string[], tocados: readonly string[], marca: string): Marcas {
  const porCampo: Record<string, string> = {};
  if (actual) {
    for (const columna of columnas) porCampo[columna] = actual.campos[columna] ?? actual.base;
  }
  for (const campo of tocados) porCampo[campo] = marca;
  for (const columna of columnas) porCampo[columna] ??= MARCA_CERO;
  return canonizarMarcas(porCampo);
}

export function marcaMaximaDe(registro: RegistroMarcado, columnas: readonly string[]): string {
  return marcaMaxima(estadoDesdeMarcas(registro, columnas));
}

export function marcasPorCampoDe(registro: RegistroMarcado, columnas: readonly string[]): Record<string, string> {
  return marcasPorCampo(estadoDesdeMarcas(registro, columnas));
}

export function estaEliminadoRegistro(registro: RegistroMarcado, columnas: readonly string[]): boolean {
  return estaEliminado(estadoDesdeMarcas(registro, columnas));
}
