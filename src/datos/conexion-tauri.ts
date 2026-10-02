import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { URL_BASE_DATOS_DESARROLLO, URL_BASE_DATOS_INSTALADA } from "./bases";
import type { Conexion } from "./conexion";

/**
 * Base de datos que abre la interfaz. En desarrollo (`npm run tauri dev`) se usa una base
 * aparte para que las pruebas y los datos de ejemplo nunca toquen los datos reales.
 */
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
      // D-004 (D-054): el plugin reparte las órdenes entre varias conexiones, así que no se puede enviar BEGIN/COMMIT
      // por separado. El lote entero va a un comando de Rust (`ejecutar_lote`, src-tauri/src/lote.rs) que lo aplica
      // en una sola transacción sobre el mismo pool: o se escribe todo o no se escribe nada.
      async ejecutarLote(sentencias) {
        if (sentencias.length === 0) return;
        await invoke("ejecutar_lote", {
          db: URL_BASE_DATOS,
          sentencias: sentencias.map(({ sql, parametros }) => ({ sql, parametros: [...parametros] })),
        });
      },
    }),
  );
  conexionAbierta.catch(() => {
    conexionAbierta = null; // permite reintentar si falló
  });
  return conexionAbierta;
}
