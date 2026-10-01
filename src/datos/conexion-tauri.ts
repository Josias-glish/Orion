import Database from "@tauri-apps/plugin-sql";
import type { Conexion } from "./conexion";

/**
 * Base de datos que abre la interfaz. En desarrollo (`npm run tauri dev`) se usa una base
 * aparte para que las pruebas y los datos de ejemplo nunca toquen los datos reales.
 * Deben coincidir con BASES_DE_DATOS en src-tauri/src/lib.rs (lo comprueba una prueba).
 */
export const URL_BASE_DATOS_INSTALADA = "sqlite:registro-caprino.db";
export const URL_BASE_DATOS_DESARROLLO = "sqlite:registro-caprino-desarrollo.db";
export const URL_BASE_DATOS = import.meta.env.DEV ? URL_BASE_DATOS_DESARROLLO : URL_BASE_DATOS_INSTALADA;

let conexionAbierta: Promise<Conexion> | null = null;

/**
 * Abre la base una sola vez por ejecución del programa. Cada llamada a Database.load crea
 * un pool de conexiones nuevo y reemplaza al anterior, así que no conviene repetirla.
 * Al abrirla, el plugin aplica las migraciones pendientes.
 */
export function abrirConexionTauri(): Promise<Conexion> {
  conexionAbierta ??= Database.load(URL_BASE_DATOS).then(
    (db): Conexion => ({
      async ejecutar(sql, parametros = []) {
        await db.execute(sql, [...parametros]);
      },
      consultar<T>(sql: string, parametros: readonly (string | number | null)[] = []) {
        return db.select<T[]>(sql, [...parametros]);
      },
    }),
  );
  conexionAbierta.catch(() => {
    conexionAbierta = null; // permite reintentar si falló
  });
  return conexionAbierta;
}
