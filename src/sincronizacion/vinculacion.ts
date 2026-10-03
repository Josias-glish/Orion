// Vincular este equipo a una finca del servidor, unir un segundo equipo y desvincular (RF-40). Diseño: docs/SINCRONIZACION.md, sección 10.
import { nuevoId } from "../dominio/identidad";
import { calcularDesfase, codigoDeDispositivo } from "../dominio/sincronizacion/hlc";
import { ENTIDADES_SINCRONIZADAS } from "../dominio/sincronizacion/entidades";
import { ErrorDeRegistro } from "../datos/errores";
import { relojDe } from "../datos/sincronizacion/contexto";
import { entreComillas } from "../datos/sincronizacion/esquema";
import { CLAVES, sentenciaEstado, leerVinculo } from "../datos/sincronizacion/estado";
import type { Conexion, Sentencia } from "../datos/conexion";
import type { VinculoDelServidor } from "./protocolo";
import { ErrorDelServidor, type Red } from "./red";

export interface DatosDelEquipo {
  nombre: string;
  plataforma: string;
}

export interface FincaDeLaCuenta {
  finca_id: string;
  nombre: string;
  rol: string;
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** ¿Este equipo ya tiene datos? Un equipo que va a unirse a una finca ajena tiene que estar vacío (no se mezclan dos bases). */
export async function equipoTieneDatos(conexion: Conexion): Promise<boolean> {
  const [{ n }] = await conexion.consultar<{ n: number }>("SELECT (SELECT count(*) FROM animal) + (SELECT count(*) FROM finca) AS n");
  return n > 0;
}

/**
 * Las marcas de las filas que ya existen al vincular: la hora de su última modificación, con contador 0 y el equipo
 * de este dispositivo. Se crean antes de que el usuario haga cualquier cambio nuevo, así todo registro tiene marcas.
 */
export function sentenciasDeMarcasIniciales(codigoEquipo: string, ahoraIso: string): Sentencia[] {
  return ENTIDADES_SINCRONIZADAS.map(({ tabla }) => ({
    sql: `INSERT OR IGNORE INTO marca_registro (entidad, registro_id, marca_base, campos, eliminado_valor, modificado_en)
          SELECT '${tabla}', id, modificado_en || '-0000-' || ?, '{}', eliminado_en, ?
            FROM ${entreComillas(tabla)}`,
    parametros: [codigoEquipo, ahoraIso],
  }));
}

async function guardarVinculo(
  conexion: Conexion,
  vinculo: VinculoDelServidor,
  correo: string,
  datos: DatosDelEquipo,
  desfaseMs: number,
  inicial: { subida: boolean },
  ahoraIso: string,
): Promise<void> {
  const codigo = codigoDeDispositivo(vinculo.dispositivo_id);
  const sentencias: Sentencia[] = [
    { sql: "UPDATE dispositivo SET propio = 0, modificado_en = ? WHERE propio = 1", parametros: [ahoraIso] },
    {
      sql: `INSERT OR REPLACE INTO dispositivo (id, nombre, plataforma, propio, codigo_equipo, ultima_sincronizacion, revocado, creado_en, modificado_en)
            VALUES (?, ?, ?, 1, ?, NULL, 0, ?, ?)`,
      parametros: [vinculo.dispositivo_id, datos.nombre, datos.plataforma, vinculo.codigo_equipo, ahoraIso, ahoraIso],
    },
    sentenciaEstado(CLAVES.dispositivoId, vinculo.dispositivo_id, ahoraIso),
    sentenciaEstado(CLAVES.codigoEquipo, vinculo.codigo_equipo, ahoraIso),
    sentenciaEstado(CLAVES.cuentaCorreo, correo, ahoraIso),
    sentenciaEstado(CLAVES.desfaseMs, String(desfaseMs), ahoraIso),
    sentenciaEstado(CLAVES.cursorSeq, inicial.subida ? "0" : String(vinculo.seq_actual), ahoraIso),
    sentenciaEstado(CLAVES.versionEsquemaServidor, String(vinculo.version_esquema_minima), ahoraIso),
    sentenciaEstado(CLAVES.subidaInicial, inicial.subida ? "pendiente" : null, ahoraIso),
    sentenciaEstado(CLAVES.descargaInicial, inicial.subida ? null : "pendiente", ahoraIso),
    sentenciaEstado(CLAVES.esquemaAntiguo, null, ahoraIso),
    sentenciaEstado(CLAVES.revocado, null, ahoraIso),
    sentenciaEstado(CLAVES.ultimoError, null, ahoraIso),
    ...(inicial.subida ? sentenciasDeMarcasIniciales(codigo, ahoraIso) : []),
    // Al final: el equipo queda vinculado solo si todo lo anterior se guardó.
    sentenciaEstado(CLAVES.fincaServidor, vinculo.finca_id, ahoraIso),
  ];
  await conexion.ejecutarLote(sentencias);
}

async function medir<T extends { hora_servidor_ms: number }>(conexion: Conexion, llamada: () => Promise<T>): Promise<{ respuesta: T; desfase: number; ahoraIso: string }> {
  const reloj = relojDe(conexion);
  const inicio = reloj.ahoraMs();
  const respuesta = await llamada();
  const fin = reloj.ahoraMs();
  const desfase = calcularDesfase(inicio, fin, respuesta.hora_servidor_ms);
  return { respuesta, desfase, ahoraIso: iso(fin + desfase) };
}

export async function fincasDeLaCuenta(red: Red): Promise<FincaDeLaCuenta[]> {
  await red.rpc("registrar_cuenta", {});
  return red.rpc<FincaDeLaCuenta[]>("mis_fincas", {});
}

/**
 * El primer equipo: crea la finca en el servidor con el id de la finca local y queda vinculado. Los datos que ya tiene se
 * suben después (primera.ts). Solo pueden hacerlo las cuentas autorizadas (S-89).
 */
export async function vincularPrimerEquipo(conexion: Conexion, red: Red, datos: DatosDelEquipo, versionEsquema: number): Promise<VinculoDelServidor> {
  if (await leerVinculo(conexion)) throw new ErrorDeRegistro([{ codigo: "equipo_ya_vinculado" }]);
  const fincas = await conexion.consultar<{ id: string; nombre: string }>("SELECT id, nombre FROM finca WHERE eliminado_en IS NULL ORDER BY creado_en LIMIT 1");
  if (fincas.length === 0) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const sesion = red.sesionActual();
  await red.rpc("registrar_cuenta", {});
  const dispositivoId = nuevoId();
  const { respuesta: vinculo, desfase, ahoraIso } = await medir(conexion, () =>
    red.rpc<VinculoDelServidor>("crear_finca", {
      p_finca_id: fincas[0].id,
      p_nombre: fincas[0].nombre,
      p_version_esquema: versionEsquema,
      p_dispositivo: { id: dispositivoId, nombre: datos.nombre, plataforma: datos.plataforma },
    }),
  );
  await guardarVinculo(conexion, vinculo, sesion?.correo ?? "", datos, desfase, { subida: true }, ahoraIso);
  return vinculo;
}

/** Un código malo, vencido o usado vuelve como valor (no como error) para que el servidor cuente los intentos fallidos: aquí se vuelve error. */
async function unirseAlServidor(
  red: Red,
  dispositivoId: string,
  datos: DatosDelEquipo,
  versionEsquema: number,
  destino: { fincaId: string } | { codigo: string },
): Promise<VinculoDelServidor> {
  const vinculo = await red.rpc<VinculoDelServidor & { error?: string }>("unirse_a_finca", {
    p_finca_id: "fincaId" in destino ? destino.fincaId : null,
    p_codigo: "codigo" in destino ? destino.codigo : null,
    p_dispositivo: { id: dispositivoId, nombre: datos.nombre, plataforma: datos.plataforma },
    p_version_esquema: versionEsquema,
  });
  if (vinculo.error) throw new ErrorDelServidor(vinculo.error);
  return vinculo;
}

/**
 * Un equipo vacío se une a una finca que ya existe: con la misma cuenta (`fincaId`) o con un código de invitación.
 * Después se descarga todo (primera.ts).
 */
export async function vincularSegundoEquipo(
  conexion: Conexion,
  red: Red,
  datos: DatosDelEquipo,
  versionEsquema: number,
  destino: { fincaId: string } | { codigo: string },
): Promise<VinculoDelServidor> {
  if (await leerVinculo(conexion)) throw new ErrorDeRegistro([{ codigo: "equipo_ya_vinculado" }]);
  if (await equipoTieneDatos(conexion)) throw new ErrorDeRegistro([{ codigo: "equipo_con_datos" }]);
  const sesion = red.sesionActual();
  await red.rpc("registrar_cuenta", {});
  const dispositivoId = nuevoId();
  const { respuesta: vinculo, desfase, ahoraIso } = await medir(conexion, () =>
    unirseAlServidor(red, dispositivoId, datos, versionEsquema, destino),
  );
  await guardarVinculo(conexion, vinculo, sesion?.correo ?? "", datos, desfase, { subida: false }, ahoraIso);
  return vinculo;
}

/** Deja de sincronizar. Los datos de este equipo se quedan (no se borra nada). Devuelve cuántas acciones estaban sin enviar. */
export async function desvincular(conexion: Conexion, ahoraIso: string): Promise<number> {
  const [{ n }] = await conexion.consultar<{ n: number }>("SELECT count(DISTINCT grupo_id) AS n FROM cola_cambios WHERE enviado = 0 AND rechazo IS NULL");
  await conexion.ejecutarLote([
    sentenciaEstado(CLAVES.fincaServidor, null, ahoraIso),
    sentenciaEstado(CLAVES.subidaInicial, null, ahoraIso),
    sentenciaEstado(CLAVES.descargaInicial, null, ahoraIso),
    sentenciaEstado(CLAVES.ultimoError, null, ahoraIso),
    sentenciaEstado(CLAVES.sesionCaducada, null, ahoraIso),
    sentenciaEstado(CLAVES.revocado, null, ahoraIso),
    sentenciaEstado(CLAVES.esquemaAntiguo, null, ahoraIso),
  ]);
  return n;
}
