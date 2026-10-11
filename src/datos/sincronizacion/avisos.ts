// Los avisos de la sincronización que el propietario revisa en Ajustes (conflictos, rechazos, nombres repetidos…).
import type { Conexion } from "../conexion";

export type TipoDeAviso = "restaurado" | "renombrado" | "conflicto" | "revision" | "reloj" | "rechazo";

export interface AvisoDeSincronizacion {
  id: string;
  tipo: TipoDeAviso;
  entidad: string | null;
  registroId: string | null;
  detalle: Record<string, unknown>;
  creadoEn: string;
}

interface Fila {
  id: string;
  tipo: TipoDeAviso;
  entidad: string | null;
  registroId: string | null;
  detalle: string;
  creadoEn: string;
}

/** Los avisos sin resolver, los más recientes primero. */
export async function listarAvisos(conexion: Conexion, limite = 200): Promise<AvisoDeSincronizacion[]> {
  const filas = await conexion.consultar<Fila>(
    `SELECT id, tipo, entidad, registro_id AS registroId, detalle, creado_en AS creadoEn
       FROM aviso_sincronizacion WHERE resuelto_en IS NULL AND eliminado_en IS NULL
      ORDER BY creado_en DESC, id LIMIT ?`,
    [limite],
  );
  return filas.map((f) => ({ ...f, detalle: JSON.parse(f.detalle) as Record<string, unknown> }));
}

/** Marca un aviso como atendido. No borra nada: la fila queda con su fecha de resolución. */
export async function resolverAviso(conexion: Conexion, id: string, ahoraIso: string): Promise<void> {
  await conexion.ejecutarLote([
    { sql: "UPDATE aviso_sincronizacion SET resuelto_en = ?, visto_en = COALESCE(visto_en, ?), modificado_en = ? WHERE id = ? AND resuelto_en IS NULL", parametros: [ahoraIso, ahoraIso, ahoraIso, id] },
  ]);
}

/** Un cambio de este equipo que el servidor no aceptó vuelve a la cola para enviarse otra vez. */
export async function reintentarRechazo(conexion: Conexion, id: string, ahoraIso: string): Promise<void> {
  const [aviso] = await conexion.consultar<{ detalle: string }>("SELECT detalle FROM aviso_sincronizacion WHERE id = ? AND tipo = 'rechazo'", [id]);
  if (!aviso) return;
  const { grupo_id: grupoId } = JSON.parse(aviso.detalle) as { grupo_id?: string };
  const sentencias = [
    { sql: "UPDATE aviso_sincronizacion SET resuelto_en = ?, visto_en = COALESCE(visto_en, ?), modificado_en = ? WHERE id = ?", parametros: [ahoraIso, ahoraIso, ahoraIso, id] },
  ];
  if (grupoId) sentencias.unshift({ sql: "UPDATE cola_cambios SET rechazo = NULL, modificado_en = ? WHERE grupo_id = ? AND enviado = 0", parametros: [ahoraIso, grupoId] });
  await conexion.ejecutarLote(sentencias);
}
