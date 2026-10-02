import { nuevoId } from "../dominio/identidad";
import { puede, type Accion } from "../dominio/permisos";
import type { Conexion, ContextoCambio, Sentencia, ValorSql } from "./conexion";
import { ErrorDeRegistro } from "./errores";

/** Tablas que se pueden modificar. Los nombres van dentro del SQL, así que solo se aceptan estos. */
export type Tabla =
  | "finca"
  | "usuario"
  | "raza"
  | "libro"
  | "lote"
  | "contacto"
  | "animal"
  | "identificador"
  | "composicion_racial"
  | "evento_reproductivo"
  | "parto"
  | "lactancia"
  | "pesaje_leche"
  | "pesaje_corporal"
  | "meta_peso"
  | "evento_salud"
  | "certificado"
  | "registro_genealogico";

/** Campos que no se anotan uno por uno: el id va en registro_id y las fechas comunes se deducen. */
const CAMPOS_NO_ANOTADOS = new Set(["id", "creado_en", "modificado_en"]);
/** Campos cuyo valor no se copia al historial. */
const CAMPOS_PROTEGIDOS = new Set(["pin_hash"]);
const VALOR_PROTEGIDO = "[protegido]";
const FILAS_POR_SENTENCIA = 200;

/** R14: lanza un error si el rol del contexto no puede hacer la acción. */
export function exigirPermiso(contexto: ContextoCambio, accion: Accion): void {
  if (!puede(contexto.rol, accion)) throw new ErrorDeRegistro([{ codigo: "sin_permiso" }]);
}

/**
 * Junta los cambios de una operación y su historial, y los aplica de una vez con `ejecutarLote`.
 * Toda modificación pasa por aquí: así ningún cambio queda sin anotar en historial_cambios.
 */
export class Cambios {
  private readonly sentencias: Sentencia[] = [];
  private readonly historial: ValorSql[][] = [];
  private readonly contexto: ContextoCambio;

  constructor(contexto: ContextoCambio) {
    this.contexto = contexto;
  }

  get vacio(): boolean {
    return this.sentencias.length === 0;
  }

  /** Inserta una fila nueva (con id, creado_en y modificado_en) y devuelve su id. */
  insertar(tabla: Tabla, valores: Record<string, ValorSql>): string {
    const id = typeof valores.id === "string" ? valores.id : nuevoId();
    const fila = { ...valores, id, creado_en: this.contexto.marcaTiempo, modificado_en: this.contexto.marcaTiempo };
    const columnas = Object.keys(fila);
    this.sentencias.push({
      sql: `INSERT INTO ${tabla} (${columnas.join(", ")}) VALUES (${columnas.map(() => "?").join(", ")})`,
      parametros: Object.values(fila),
    });
    for (const [campo, valor] of Object.entries(fila)) {
      if (valor !== null) this.anotar(tabla, id, campo, null, valor);
    }
    return id;
  }

  /** Actualiza solo los campos que cambiaron respecto a `antes`. Devuelve si hubo algún cambio. */
  actualizar(tabla: Tabla, id: string, antes: Readonly<Record<string, ValorSql>>, despues: Record<string, ValorSql>): boolean {
    const cambiados = Object.keys(despues).filter((campo) => (antes[campo] ?? null) !== despues[campo]);
    if (cambiados.length === 0) return false;
    this.sentencias.push({
      sql: `UPDATE ${tabla} SET ${cambiados.map((c) => `${c} = ?`).join(", ")}, modificado_en = ? WHERE id = ?`,
      parametros: [...cambiados.map((c) => despues[c]), this.contexto.marcaTiempo, id],
    });
    for (const campo of cambiados) this.anotar(tabla, id, campo, antes[campo] ?? null, despues[campo]);
    return true;
  }

  /** Borrado lógico. */
  eliminar(tabla: Tabla, id: string): void {
    this.sentencias.push({
      sql: `UPDATE ${tabla} SET eliminado_en = ?, modificado_en = ? WHERE id = ? AND eliminado_en IS NULL`,
      parametros: [this.contexto.marcaTiempo, this.contexto.marcaTiempo, id],
    });
    this.anotar(tabla, id, "eliminado_en", null, this.contexto.marcaTiempo);
  }

  async aplicar(conexion: Conexion): Promise<void> {
    if (this.vacio) return;
    await conexion.ejecutarLote([...this.sentencias, ...this.sentenciasDeHistorial()]);
  }

  private anotar(tabla: Tabla, id: string, campo: string, anterior: ValorSql, nuevo: ValorSql): void {
    if (CAMPOS_NO_ANOTADOS.has(campo)) return;
    const comoTexto = (v: ValorSql) => (v === null ? null : CAMPOS_PROTEGIDOS.has(campo) ? VALOR_PROTEGIDO : String(v));
    const t = this.contexto.marcaTiempo;
    this.historial.push([nuevoId(), tabla, id, campo, comoTexto(anterior), comoTexto(nuevo), t, this.contexto.usuarioId, t, t]);
  }

  private sentenciasDeHistorial(): Sentencia[] {
    const resultado: Sentencia[] = [];
    for (let i = 0; i < this.historial.length; i += FILAS_POR_SENTENCIA) {
      const filas = this.historial.slice(i, i + FILAS_POR_SENTENCIA);
      resultado.push({
        sql: `INSERT INTO historial_cambios
                (id, entidad, registro_id, campo, valor_anterior, valor_nuevo, marca_tiempo, usuario_id, creado_en, modificado_en)
              VALUES ${filas.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
        parametros: filas.flat(),
      });
    }
    return resultado;
  }
}
