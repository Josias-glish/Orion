// Columnas de las tablas sincronizadas, tal como las tiene la base de este equipo (`pragma_table_info`).
// Los nombres de tablas y columnas van dentro del SQL, así que solo se aceptan tablas del registro de entidades y
// columnas que la base declara.
import { columnaSube, columnaViaja, seSincroniza } from "../../dominio/sincronizacion/entidades";
import type { Conexion } from "../conexion";

const memoria = new WeakMap<object, Map<string, string[]>>();

/** Todas las columnas de la tabla, en el orden en que la base las declara. */
export async function columnasDeTabla(conexion: Conexion, tabla: string): Promise<string[]> {
  if (!seSincroniza(tabla)) throw new Error(`La tabla ${tabla} no se sincroniza.`);
  let porTabla = memoria.get(conexion);
  if (!porTabla) {
    porTabla = new Map();
    memoria.set(conexion, porTabla);
  }
  let columnas = porTabla.get(tabla);
  if (!columnas) {
    const filas = await conexion.consultar<{ name: string }>(`SELECT name FROM pragma_table_info('${tabla}') ORDER BY cid`);
    columnas = filas.map((f) => f.name);
    porTabla.set(tabla, columnas);
  }
  return columnas;
}

/** Las columnas que viajan en las operaciones de la tabla: todas menos id, modificado_en y las excluidas. */
export async function columnasQueViajan(conexion: Conexion, tabla: string): Promise<string[]> {
  return (await columnasDeTabla(conexion, tabla)).filter((columna) => columnaViaja(tabla, columna));
}

/** Las columnas que este equipo envía: las que viajan menos las que solo escribe el servidor. */
export async function columnasQueSuben(conexion: Conexion, tabla: string): Promise<string[]> {
  return (await columnasDeTabla(conexion, tabla)).filter((columna) => columnaSube(tabla, columna));
}

export function entreComillas(identificador: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identificador)) throw new Error(`Nombre de columna no permitido: ${identificador}`);
  return `"${identificador}"`;
}
