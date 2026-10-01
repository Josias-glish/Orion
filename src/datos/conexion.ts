import type { Rol } from "../dominio/tipos";

/** Valor que se envía a SQLite como parámetro. Los sí/no se guardan como 0 o 1. */
export type ValorSql = string | number | null;

export interface Sentencia {
  sql: string;
  parametros: readonly ValorSql[];
}

/**
 * Acceso mínimo a la base de datos. Los repositorios solo conocen esta interfaz:
 * el programa usa el plugin SQL de Tauri y las pruebas usan SQLite en memoria de Node.
 * Los parámetros se marcan con «?» en el orden en que aparecen en la sentencia.
 */
export interface Conexion {
  /** Ejecuta una sentencia que no devuelve filas (INSERT, UPDATE…). */
  ejecutar(sql: string, parametros?: readonly ValorSql[]): Promise<void>;
  /** Ejecuta una consulta y devuelve sus filas como objetos. */
  consultar<T>(sql: string, parametros?: readonly ValorSql[]): Promise<T[]>;
  /**
   * Ejecuta varias sentencias que forman un solo cambio (por ejemplo, un animal con sus identificadores
   * y su historial). En memoria van en una transacción. En el programa, ver la decisión D-004.
   */
  ejecutarLote(sentencias: readonly Sentencia[]): Promise<void>;
}

/** Quién hace un cambio y cuándo; se guarda en historial_cambios y decide los permisos (R14). */
export interface ContextoCambio {
  usuarioId: string | null;
  rol: Rol;
  marcaTiempo: string;
}
