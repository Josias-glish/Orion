/** Valor que se envía a SQLite como parámetro. Los sí/no se guardan como 0 o 1. */
export type ValorSql = string | number | null;

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
}

/** Quién hace un cambio y cuándo; se guarda en historial_cambios. */
export interface ContextoCambio {
  usuarioId: string | null;
  marcaTiempo: string;
}

/** Error esperado de una regla del programa; la interfaz muestra el texto según el código. */
export class ErrorDeRegistro extends Error {
  constructor(
    readonly codigo: "identificador_duplicado" | "animal_no_existe",
    readonly detalle?: string,
  ) {
    super(detalle ? `${codigo}: ${detalle}` : codigo);
    this.name = "ErrorDeRegistro";
  }
}
