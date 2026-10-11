// Estado de la sincronización de este equipo (tabla `sincronizacion_estado`: pares clave y valor).
// Nunca guarda contraseñas ni tokens: esos van al llavero del sistema. Diseño: docs/SINCRONIZACION.md, sección 13.
import type { Conexion, Sentencia, ValorSql } from "../conexion";

export const CLAVES = {
  fincaServidor: "finca_servidor",
  dispositivoId: "dispositivo_id",
  codigoEquipo: "codigo_equipo",
  cuentaCorreo: "cuenta_correo",
  cursorSeq: "cursor_seq",
  marcaUltima: "marca_ultima",
  desfaseMs: "desfase_ms",
  versionEsquemaServidor: "version_esquema_servidor",
  subidaInicial: "subida_inicial",
  descargaInicial: "descarga_inicial",
  ultimaSincronizacion: "ultima_sincronizacion",
  ultimoError: "ultimo_error",
  sesionCaducada: "sesion_caducada",
  informeVerificacion: "informe_verificacion",
  esquemaAntiguo: "esquema_antiguo",
  revocado: "equipo_revocado",
} as const;

export type ClaveEstado = (typeof CLAVES)[keyof typeof CLAVES];

/** Lo que identifica a un equipo vinculado a una finca del servidor. */
export interface Vinculo {
  fincaId: string;
  dispositivoId: string;
  codigoEquipo: string | null;
  marcaUltima: string | null;
  desfaseMs: number;
}

export async function leerEstado(conexion: Conexion, claves?: readonly string[]): Promise<Record<string, string | null>> {
  const filas = claves
    ? await conexion.consultar<{ clave: string; valor: string | null }>(
        `SELECT clave, valor FROM sincronizacion_estado WHERE clave IN (${claves.map(() => "?").join(", ")})`,
        claves,
      )
    : await conexion.consultar<{ clave: string; valor: string | null }>("SELECT clave, valor FROM sincronizacion_estado");
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}

export async function leerClave(conexion: Conexion, clave: string): Promise<string | null> {
  const filas = await conexion.consultar<{ valor: string | null }>("SELECT valor FROM sincronizacion_estado WHERE clave = ?", [clave]);
  return filas[0]?.valor ?? null;
}

/** Sentencia que guarda un valor (o lo deja vacío con null). No se borran filas: se deja el valor vacío. */
export function sentenciaEstado(clave: string, valor: ValorSql, ahoraIso: string): Sentencia {
  return {
    sql: `INSERT INTO sincronizacion_estado (clave, valor, modificado_en) VALUES (?, ?, ?)
          ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, modificado_en = excluded.modificado_en`,
    parametros: [clave, valor, ahoraIso],
  };
}

export async function escribirEstado(conexion: Conexion, valores: Readonly<Record<string, ValorSql>>, ahoraIso: string): Promise<void> {
  const sentencias = Object.entries(valores).map(([clave, valor]) => sentenciaEstado(clave, valor, ahoraIso));
  if (sentencias.length > 0) await conexion.ejecutarLote(sentencias);
}

/** El vínculo de este equipo, o null si no está vinculado (el programa funciona como antes de la Etapa 10). */
export async function leerVinculo(conexion: Conexion): Promise<Vinculo | null> {
  const e = await leerEstado(conexion, [CLAVES.fincaServidor, CLAVES.dispositivoId, CLAVES.codigoEquipo, CLAVES.marcaUltima, CLAVES.desfaseMs]);
  const fincaId = e[CLAVES.fincaServidor];
  const dispositivoId = e[CLAVES.dispositivoId];
  if (!fincaId || !dispositivoId) return null;
  return {
    fincaId,
    dispositivoId,
    codigoEquipo: e[CLAVES.codigoEquipo] || null,
    marcaUltima: e[CLAVES.marcaUltima] || null,
    desfaseMs: Number(e[CLAVES.desfaseMs] ?? 0) || 0,
  };
}
