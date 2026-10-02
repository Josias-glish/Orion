// La cola de cambios por enviar (R15): leer el próximo envío y anotar lo que el servidor confirmó o rechazó.
import type { Conexion, Sentencia } from "../conexion";

export interface OperacionEnCola {
  secuencia: number;
  id: string;
  grupo_id: string;
  orden: number;
  entidad: string;
  registro_id: string;
  operacion: "crear" | "modificar" | "eliminar";
  campos: string | null;
  marca: string;
  usuario_id: string | null;
}

const COLUMNAS = "secuencia, id, grupo_id, orden, entidad, registro_id, operacion, campos, marca, usuario_id";
const PENDIENTE = "enviado = 0 AND rechazo IS NULL";

/**
 * Hasta `limite` operaciones por enviar, en el orden en que se hicieron y sin partir un grupo (el servidor aplica un grupo
 * entero o nada). Un grupo más grande que el límite va solo.
 */
export async function siguienteEnvio(conexion: Conexion, limite: number): Promise<OperacionEnCola[]> {
  const lote = await conexion.consultar<OperacionEnCola>(`SELECT ${COLUMNAS} FROM cola_cambios WHERE ${PENDIENTE} ORDER BY secuencia LIMIT ?`, [limite]);
  if (lote.length === 0) return lote;
  const ultimoGrupo = lote[lote.length - 1].grupo_id;
  const [{ n }] = await conexion.consultar<{ n: number }>(`SELECT count(*) AS n FROM cola_cambios WHERE grupo_id = ? AND ${PENDIENTE}`, [ultimoGrupo]);
  const enElLote = lote.filter((o) => o.grupo_id === ultimoGrupo).length;
  if (n === enElLote) return lote;
  const completos = lote.filter((o) => o.grupo_id !== ultimoGrupo);
  if (completos.length > 0) return completos;
  return conexion.consultar<OperacionEnCola>(`SELECT ${COLUMNAS} FROM cola_cambios WHERE grupo_id = ? AND ${PENDIENTE} ORDER BY secuencia`, [lote[0].grupo_id]);
}

/** Cuántas acciones del usuario (grupos) esperan para enviarse. Los rechazados no cuentan. */
export async function contarPendientes(conexion: Conexion): Promise<number> {
  const [{ n }] = await conexion.consultar<{ n: number }>(`SELECT count(DISTINCT grupo_id) AS n FROM cola_cambios WHERE ${PENDIENTE}`);
  return n;
}

export async function contarRechazados(conexion: Conexion): Promise<number> {
  const [{ n }] = await conexion.consultar<{ n: number }>("SELECT count(DISTINCT grupo_id) AS n FROM cola_cambios WHERE enviado = 0 AND rechazo IS NOT NULL");
  return n;
}

/** El servidor ya tiene estos cambios: la fila queda (nada se borra) pero sin su contenido, así la tabla no crece sin freno. */
export function sentenciasEnviados(ids: readonly string[], ahoraIso: string): Sentencia[] {
  const resultado: Sentencia[] = [];
  for (let i = 0; i < ids.length; i += 400) {
    const lote = ids.slice(i, i + 400);
    resultado.push({
      sql: `UPDATE cola_cambios SET enviado = 1, enviado_en = ?, campos = NULL, modificado_en = ? WHERE id IN (${lote.map(() => "?").join(", ")})`,
      parametros: [ahoraIso, ahoraIso, ...lote],
    });
  }
  return resultado;
}

export function sentenciaRechazo(grupoId: string, motivo: string, ahoraIso: string): Sentencia {
  return {
    sql: "UPDATE cola_cambios SET rechazo = ?, modificado_en = ? WHERE grupo_id = ? AND enviado = 0",
    parametros: [motivo, ahoraIso, grupoId],
  };
}

export function sentenciaCorregirMarca(id: string, marcaNueva: string, ahoraIso: string): Sentencia {
  return { sql: "UPDATE cola_cambios SET marca = ?, modificado_en = ? WHERE id = ?", parametros: [marcaNueva, ahoraIso, id] };
}
