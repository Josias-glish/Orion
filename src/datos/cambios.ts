import { nuevoId } from "../dominio/identidad";
import { puede, type Accion } from "../dominio/permisos";
import type { Conexion, ContextoCambio, Sentencia, ValorSql } from "./conexion";
import { ErrorDeRegistro } from "./errores";
import { prepararCaptura, type OperacionLocal } from "./sincronizacion/captura";
import { avisarGuardado, conCandado } from "./sincronizacion/contexto";
import { leerVinculo } from "./sincronizacion/estado";

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
  | "registro_genealogico"
  | "categoria_economica"
  | "movimiento_economico"
  | "traspaso";

/** Campos que no se anotan uno por uno: el id va en registro_id y las fechas comunes se deducen. */
export const CAMPOS_NO_ANOTADOS: ReadonlySet<string> = new Set(["id", "creado_en", "modificado_en"]);
/** Campos cuyo valor no se copia al historial. */
export const CAMPOS_PROTEGIDOS: ReadonlySet<string> = new Set(["pin_hash"]);
export const VALOR_PROTEGIDO = "[protegido]";
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
  /** Cada fila del historial y la operación (posición en `operaciones`) a la que pertenece. */
  private readonly historial: { fila: ValorSql[]; operacion: number }[] = [];
  /** Qué se hizo, para la cola de sincronización (R15). Solo se usa en un equipo vinculado. */
  private readonly operaciones: OperacionLocal[] = [];
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
    const operacion = this.operaciones.push({ tabla, id, tipo: "crear", campos: fila }) - 1;
    for (const [campo, valor] of Object.entries(fila)) {
      if (valor !== null) this.anotar(tabla, id, campo, null, valor, operacion);
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
    const operacion =
      this.operaciones.push({ tabla, id, tipo: "modificar", campos: Object.fromEntries(cambiados.map((c) => [c, despues[c]])) }) - 1;
    for (const campo of cambiados) this.anotar(tabla, id, campo, antes[campo] ?? null, despues[campo], operacion);
    return true;
  }

  /** Borrado lógico. */
  eliminar(tabla: Tabla, id: string): void {
    this.sentencias.push({
      sql: `UPDATE ${tabla} SET eliminado_en = ?, modificado_en = ? WHERE id = ? AND eliminado_en IS NULL`,
      parametros: [this.contexto.marcaTiempo, this.contexto.marcaTiempo, id],
    });
    const operacion = this.operaciones.push({ tabla, id, tipo: "eliminar", campos: { eliminado_en: this.contexto.marcaTiempo } }) - 1;
    this.anotar(tabla, id, "eliminado_en", null, this.contexto.marcaTiempo, operacion);
  }

  /**
   * Aplica todo en una sola transacción. En un equipo vinculado a un servidor (Etapa 10) el mismo lote lleva también la cola
   * de cambios por enviar, las marcas de cada campo y el reloj híbrido: o se guarda todo junto o nada.
   */
  async aplicar(conexion: Conexion): Promise<void> {
    if (this.vacio) return;
    await this.guardar(conexion);
    avisarGuardado(conexion);
  }

  private async guardar(conexion: Conexion): Promise<void> {
    if ((await leerVinculo(conexion)) === null) {
      await conexion.ejecutarLote([...this.sentencias, ...this.sentenciasDeHistorial(null, null)]);
      return;
    }
    await conCandado(conexion, async () => {
      // Se vuelve a leer dentro del candado: el reloj guardado pudo cambiar mientras esperaba su turno.
      const vinculo = await leerVinculo(conexion);
      if (!vinculo) {
        await conexion.ejecutarLote([...this.sentencias, ...this.sentenciasDeHistorial(null, null)]);
        return;
      }
      const captura = await prepararCaptura(conexion, vinculo, this.contexto, this.operaciones);
      await conexion.ejecutarLote([...this.sentencias, ...this.sentenciasDeHistorial(captura.marcas, vinculo.dispositivoId), ...captura.sentencias]);
    });
  }

  private anotar(tabla: Tabla, id: string, campo: string, anterior: ValorSql, nuevo: ValorSql, operacion: number): void {
    if (CAMPOS_NO_ANOTADOS.has(campo)) return;
    const comoTexto = (v: ValorSql) => (v === null ? null : CAMPOS_PROTEGIDOS.has(campo) ? VALOR_PROTEGIDO : String(v));
    const t = this.contexto.marcaTiempo;
    this.historial.push({ fila: [nuevoId(), tabla, id, campo, comoTexto(anterior), comoTexto(nuevo), t, this.contexto.usuarioId, t, t], operacion });
  }

  /** En un equipo vinculado cada fila lleva además la marca de su operación y el equipo que la hizo (R16). */
  private sentenciasDeHistorial(marcas: readonly (string | null)[] | null, dispositivoId: string | null): Sentencia[] {
    const resultado: Sentencia[] = [];
    const vinculado = marcas !== null;
    const columnas = `id, entidad, registro_id, campo, valor_anterior, valor_nuevo, marca_tiempo, usuario_id, creado_en, modificado_en${vinculado ? ", marca, dispositivo_id" : ""}`;
    const huecos = vinculado ? "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" : "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    for (let i = 0; i < this.historial.length; i += FILAS_POR_SENTENCIA) {
      const filas = this.historial.slice(i, i + FILAS_POR_SENTENCIA);
      resultado.push({
        sql: `INSERT INTO historial_cambios (${columnas}) VALUES ${filas.map(() => huecos).join(", ")}`,
        parametros: filas.flatMap(({ fila, operacion }) => (vinculado ? [...fila, marcas[operacion] ?? null, dispositivoId] : fila)),
      });
    }
    return resultado;
  }
}
