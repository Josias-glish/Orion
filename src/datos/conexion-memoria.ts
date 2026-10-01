// Solo para pruebas y scripts de desarrollo (Node). El programa usa conexion-tauri.ts.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { Conexion } from "./conexion";

export const CARPETA_MIGRACIONES = fileURLToPath(new URL("./migraciones/", import.meta.url));

/** Archivos de migración en orden: «0001_algo.sql», «0002_otra.sql»… */
export function archivosDeMigracion(): string[] {
  return readdirSync(CARPETA_MIGRACIONES)
    .filter((nombre) => /^\d{4}_[a-z0-9_]+\.sql$/.test(nombre))
    .sort();
}

export function leerMigracion(archivo: string): string {
  return readFileSync(join(CARPETA_MIGRACIONES, archivo), "utf8");
}

export interface ConexionMemoria extends Conexion {
  /** Ejecuta varias sentencias seguidas, como hace el plugin con cada migración. */
  ejecutarScript(sql: string): void;
  cerrar(): void;
}

/** SQLite con claves foráneas activas, igual que la conexión del plugin. Por defecto, en memoria. */
export function abrirConexionMemoria(archivo = ":memory:"): ConexionMemoria {
  const db = new DatabaseSync(archivo, { timeout: 5000 });
  db.exec("PRAGMA foreign_keys = ON;");
  return {
    async ejecutar(sql, parametros = []) {
      db.prepare(sql).run(...parametros);
    },
    async consultar<T>(sql: string, parametros: readonly (string | number | null)[] = []) {
      return db.prepare(sql).all(...parametros) as T[];
    },
    async ejecutarLote(sentencias) {
      db.exec("BEGIN");
      try {
        for (const { sql, parametros } of sentencias) db.prepare(sql).run(...parametros);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    ejecutarScript(sql) {
      db.exec(sql);
    },
    cerrar() {
      db.close();
    },
  };
}

/** Base en memoria con todas las migraciones aplicadas en orden. */
export function crearBaseDePrueba(): ConexionMemoria {
  const conexion = abrirConexionMemoria();
  for (const archivo of archivosDeMigracion()) {
    conexion.ejecutarScript(leerMigracion(archivo));
  }
  return conexion;
}
