// El ciclo de sincronización (R15, R16, R17): manda lo que hay en la cola, recibe lo de los demás equipos y lo aplica.
// Diseño: docs/SINCRONIZACION.md, sección 4. Corre en segundo plano: la pantalla nunca espera la red.
import { nuevoId } from "../dominio/identidad";
import { calcularDesfase } from "../dominio/sincronizacion/hlc";
import { aplicarCambios, reintentarConflictos, type ResultadoAplicar } from "../datos/sincronizacion/aplicador";
import { contarPendientes, sentenciaCorregirMarca, sentenciaRechazo, sentenciasEnviados, siguienteEnvio, type OperacionEnCola } from "../datos/sincronizacion/cola";
import { conCandado, relojDe } from "../datos/sincronizacion/contexto";
import { columnasQueViajan } from "../datos/sincronizacion/esquema";
import { CLAVES, leerEstado, leerVinculo, sentenciaEstado, type Vinculo } from "../datos/sincronizacion/estado";
import { clave, leerMarcas, sentenciaMarcas } from "../datos/sincronizacion/marcas";
import { canonizarMarcas } from "../dominio/sincronizacion/fusion";
import type { Conexion, Sentencia } from "../datos/conexion";
import type { OperacionEnviada, RespuestaSincronizar } from "./protocolo";
import { ErrorDeRed, ErrorDelServidor, type Red } from "./red";

export type EstadoDelCiclo =
  | "sin_vincular"
  | "preparando"
  | "al_dia"
  | "sin_conexion"
  | "sesion_caducada"
  | "esquema_antiguo"
  | "revocado"
  | "problema";

export interface ResultadoCiclo {
  estado: EstadoDelCiclo;
  enviados: number;
  recibidos: number;
  conflictos: number;
  rechazados: number;
  /** Código del error (del servidor o de la red), si hubo. */
  error?: string;
}

export interface OpcionesCliente {
  /** `VERSION_ESQUEMA` del programa. */
  versionEsquema: number;
  limiteEnvio?: number;
  limitePagina?: number;
  /** Se llama al terminar un ciclo bueno (por ejemplo, para bajar y subir archivos). No debe lanzar errores hacia el ciclo. */
  alTerminar?: (conexion: Conexion, red: Red) => Promise<void>;
}

const LIMITE_ENVIO = 200;
const LIMITE_PAGINA = 500;
const MAX_VUELTAS = 2000;

const iso = (ms: number): string => new Date(ms).toISOString();

export class ClienteDeSincronizacion {
  private enCurso: Promise<ResultadoCiclo> | null = null;
  private limiteEnvio: number;

  constructor(
    private readonly conexion: Conexion,
    private readonly red: Red,
    private readonly opciones: OpcionesCliente,
  ) {
    this.limiteEnvio = opciones.limiteEnvio ?? LIMITE_ENVIO;
  }

  /** Una sincronización completa (envía todo lo pendiente y recibe todo lo nuevo). Si ya hay una en marcha, espera esa. */
  sincronizar(): Promise<ResultadoCiclo> {
    this.enCurso ??= this.ciclo().finally(() => {
      this.enCurso = null;
    });
    return this.enCurso;
  }

  private async ciclo(): Promise<ResultadoCiclo> {
    const total: ResultadoCiclo = { estado: "al_dia", enviados: 0, recibidos: 0, conflictos: 0, rechazados: 0 };
    const vinculo = await leerVinculo(this.conexion);
    if (!vinculo) return { ...total, estado: "sin_vincular" };
    const estado = await leerEstado(this.conexion, [CLAVES.subidaInicial, CLAVES.descargaInicial, CLAVES.esquemaAntiguo, CLAVES.revocado]);
    if (estado[CLAVES.revocado]) return { ...total, estado: "revocado" };
    if ((estado[CLAVES.subidaInicial] && estado[CLAVES.subidaInicial] !== "completa") || (estado[CLAVES.descargaInicial] && estado[CLAVES.descargaInicial] !== "completa")) {
      return { ...total, estado: "preparando" };
    }
    try {
      if (!this.red.sesionActual() && !(await this.red.restaurarSesion())) throw new ErrorDeRed("sesion", "No hay sesión iniciada.");
      for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
        const r = await this.pasada(vinculo);
        total.enviados += r.enviados;
        total.recibidos += r.recibidos;
        total.conflictos += r.conflictos;
        total.rechazados += r.rechazados;
        if (!r.hayMas) break;
      }
      if (this.opciones.alTerminar) await this.opciones.alTerminar(this.conexion, this.red).catch(() => undefined);
      return total;
    } catch (error) {
      return this.fallo(total, error);
    }
  }

  private async pasada(vinculoInicial: Vinculo): Promise<{ enviados: number; recibidos: number; conflictos: number; rechazados: number; hayMas: boolean }> {
    const { conexion } = this;
    const lote = await siguienteEnvio(conexion, this.limiteEnvio);
    const e = await leerEstado(conexion, [CLAVES.cursorSeq]);
    const cursor = Number(e[CLAVES.cursorSeq] ?? 0) || 0;
    const reloj = relojDe(conexion);

    const cambios: OperacionEnviada[] = lote.map((o) => ({
      id: o.id,
      grupo_id: o.grupo_id,
      orden: o.orden,
      entidad: o.entidad,
      registro_id: o.registro_id,
      operacion: o.operacion,
      campos: JSON.parse(o.campos ?? "{}"),
      marca: o.marca,
      usuario_id: o.usuario_id,
    }));
    const inicio = reloj.ahoraMs();
    const respuesta = await this.red.rpc<RespuestaSincronizar>(
      "sincronizar",
      {
        p_finca_id: vinculoInicial.fincaId,
        p_dispositivo_id: vinculoInicial.dispositivoId,
        p_version_esquema: this.opciones.versionEsquema,
        p_desde: cursor,
        p_cambios: cambios,
        p_limite: this.opciones.limitePagina ?? LIMITE_PAGINA,
      },
      { tiempoMs: lote.length > 100 ? 60_000 : 30_000 },
    );
    const fin = reloj.ahoraMs();
    const { aplicado } = await aplicarRespuesta(conexion, respuesta, { cursor, inicio, fin }, async (iso) => this.anotarLoPropio(lote, respuesta, iso));
    const rechazados = aplicado.rechazados;
    const pendientes = (await siguienteEnvio(conexion, 1)).length > 0;
    return {
      enviados: respuesta.aceptados.length + respuesta.ya_aplicados.length,
      recibidos: respuesta.cambios.length,
      conflictos: aplicado.resultado.conflictos,
      rechazados,
      hayMas: respuesta.hay_mas || (pendientes && lote.length > 0),
    };
  }

  private async anotarLoPropio(lote: readonly OperacionEnCola[], r: RespuestaSincronizar, ahoraIso: string): Promise<number> {
    if (lote.length === 0) return 0;
    return conCandado(this.conexion, async () => {
      const sentencias: Sentencia[] = [];
      const porId = new Map(lote.map((o) => [o.id, o]));

      // Marcas corregidas por el servidor (reloj adelantado): se reemplazan exactamente igual en la cola y en las marcas por campo.
      let ultima = (await leerEstado(this.conexion, [CLAVES.marcaUltima]))[CLAVES.marcaUltima] || null;
      for (const c of r.corregidos) {
        const op = porId.get(c.cambio_id);
        if (!op) continue;
        sentencias.push(sentenciaCorregirMarca(op.id, c.marca_nueva, ahoraIso));
        const columnas = await columnasQueViajan(this.conexion, op.entidad);
        const previo = (await leerMarcas(this.conexion, op.entidad, [op.registro_id])).get(clave(op.entidad, op.registro_id));
        if (previo) {
          const porCampo: Record<string, string> = {};
          for (const columna of columnas) {
            const m = previo.marcas.campos[columna] ?? previo.marcas.base;
            porCampo[columna] = m === op.marca ? c.marca_nueva : m;
          }
          sentencias.push(sentenciaMarcas(op.entidad, op.registro_id, { marcas: canonizarMarcas(porCampo), eliminadoValor: previo.eliminadoValor }, ahoraIso));
        }
        if (ultima === op.marca) ultima = c.marca_nueva;
      }
      if (ultima !== null && r.corregidos.length > 0) sentencias.push(sentenciaEstado(CLAVES.marcaUltima, ultima, ahoraIso));

      sentencias.push(...sentenciasEnviados([...r.aceptados, ...r.ya_aplicados].filter((id) => porId.has(id)), ahoraIso));
      for (const rechazo of r.rechazados) {
        sentencias.push(sentenciaRechazo(rechazo.grupo_id, rechazo.motivo, ahoraIso));
        const entidades = [...new Set(lote.filter((o) => o.grupo_id === rechazo.grupo_id).map((o) => o.entidad))];
        sentencias.push({
          sql: `INSERT INTO aviso_sincronizacion (id, tipo, entidad, registro_id, detalle, creado_en, modificado_en)
                SELECT ?, 'rechazo', NULL, NULL, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM aviso_sincronizacion WHERE tipo = 'rechazo' AND resuelto_en IS NULL AND json_extract(detalle, '$.grupo_id') = ?)`,
          parametros: [nuevoId(), JSON.stringify({ grupo_id: rechazo.grupo_id, motivo: rechazo.motivo, entidades }), ahoraIso, ahoraIso, rechazo.grupo_id],
        });
      }
      if (sentencias.length > 0) await this.conexion.ejecutarLote(sentencias);
      return new Set(r.rechazados.map((x) => x.grupo_id)).size;
    });
  }

  private async fallo(total: ResultadoCiclo, error: unknown): Promise<ResultadoCiclo> {
    const ahoraIso = iso(relojDe(this.conexion).ahoraMs());
    const guardar = async (valores: Record<string, string | null>) => {
      await this.conexion
        .ejecutarLote(Object.entries(valores).map(([k, v]) => sentenciaEstado(k, v, ahoraIso)))
        .catch(() => undefined);
    };
    if (error instanceof ErrorDeRed) {
      if (error.tipo === "sesion") {
        await guardar({ [CLAVES.sesionCaducada]: "1", [CLAVES.ultimoError]: "sesion" });
        return { ...total, estado: "sesion_caducada", error: "sesion" };
      }
      // Un envío demasiado grande o que tarda demasiado se reduce a la mitad para el próximo intento.
      if (error.tipo === "tiempo" || error.estado === 413) this.limiteEnvio = Math.max(10, Math.floor(this.limiteEnvio / 2));
      const codigo = error.tipo === "http" ? `http_${error.estado ?? 0}` : error.tipo;
      await guardar({ [CLAVES.ultimoError]: codigo });
      return { ...total, estado: error.tipo === "no_configurado" ? "sin_vincular" : "sin_conexion", error: codigo };
    }
    if (error instanceof ErrorDelServidor) {
      if (error.codigo === "esquema_antiguo") {
        await guardar({ [CLAVES.esquemaAntiguo]: "1", [CLAVES.ultimoError]: error.codigo });
        return { ...total, estado: "esquema_antiguo", error: error.codigo };
      }
      if (error.codigo === "dispositivo_revocado") {
        await guardar({ [CLAVES.revocado]: "1", [CLAVES.ultimoError]: error.codigo });
        return { ...total, estado: "revocado", error: error.codigo };
      }
      if (error.codigo === "demasiado_grande") this.limiteEnvio = Math.max(10, Math.floor(this.limiteEnvio / 2));
      await guardar({ [CLAVES.ultimoError]: error.codigo });
      return { ...total, estado: "problema", error: error.codigo };
    }
    // Un error nuestro (de la base, por ejemplo): no se oculta, pero tampoco tumba el programa.
    const mensaje = error instanceof Error ? error.message.slice(0, 200) : "desconocido";
    await guardar({ [CLAVES.ultimoError]: `interno: ${mensaje}` });
    return { ...total, estado: "problema", error: `interno: ${mensaje}` };
  }
}

/** Cuántas acciones esperan para enviarse (para el indicador de estado). */
export function pendientesDeEnvio(conexion: Conexion): Promise<number> {
  return contarPendientes(conexion);
}

export interface MedidaDeRelojes {
  cursor: number;
  /** Hora local (sin corregir) justo antes de enviar y justo después de recibir, en milisegundos. */
  inicio: number;
  fin: number;
}

/**
 * Lo que se hace con una respuesta de `sincronizar`: anotar lo propio (`antes`), guardar el desfase del reloj y aplicar los
 * cambios ajenos junto con el cursor. La usan el ciclo normal y la primera subida.
 */
export async function aplicarRespuesta(
  conexion: Conexion,
  respuesta: RespuestaSincronizar,
  medida: MedidaDeRelojes,
  antes: (ahoraIso: string) => Promise<number>,
): Promise<{ ahoraIso: string; aplicado: { resultado: ResultadoAplicar; rechazados: number } }> {
  const desfase = calcularDesfase(medida.inicio, medida.fin, respuesta.hora_servidor_ms);
  const ahoraIso = iso(medida.fin + desfase);
  const rechazados = await antes(ahoraIso);
  const extra: Sentencia[] = [
    sentenciaEstado(CLAVES.cursorSeq, String(Math.max(medida.cursor, respuesta.seq_siguiente)), ahoraIso),
    sentenciaEstado(CLAVES.desfaseMs, String(desfase), ahoraIso),
    sentenciaEstado(CLAVES.versionEsquemaServidor, String(respuesta.version_esquema_minima), ahoraIso),
    sentenciaEstado(CLAVES.ultimaSincronizacion, ahoraIso, ahoraIso),
    sentenciaEstado(CLAVES.ultimoError, null, ahoraIso),
    sentenciaEstado(CLAVES.sesionCaducada, null, ahoraIso),
    sentenciaEstado(CLAVES.esquemaAntiguo, null, ahoraIso),
    { sql: "UPDATE dispositivo SET ultima_sincronizacion = ?, modificado_en = ? WHERE propio = 1", parametros: [ahoraIso, ahoraIso] },
  ];
  const resultado = await aplicarCambios(conexion, respuesta.cambios, { ahoraIso, ahoraMs: medida.fin + desfase, extra });
  if (respuesta.cambios.length > 0) await reintentarConflictos(conexion, { ahoraIso, ahoraMs: medida.fin + desfase });
  return { ahoraIso, aplicado: { resultado, rechazados } };
}
