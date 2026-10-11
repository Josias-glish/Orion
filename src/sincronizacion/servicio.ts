// El servicio que sincroniza en segundo plano: unos segundos después de guardar, cada cinco minutos, cuando vuelve la red
// y cuando el usuario lo pide. La pantalla nunca espera: solo mira su estado. Diseño: docs/SINCRONIZACION.md, sección 4.
import type { Conexion } from "../datos/conexion";
import { alGuardar } from "../datos/sincronizacion/contexto";
import { contarPendientes, contarRechazados } from "../datos/sincronizacion/cola";
import { CLAVES, leerEstado, leerVinculo } from "../datos/sincronizacion/estado";
import type { ClienteDeSincronizacion, EstadoDelCiclo, ResultadoCiclo } from "./cliente";

/** Lo que el indicador muestra. «pendiente» = hay cambios por enviar y no se está enviando ahora. */
export type FaseVisible = "sin_vincular" | "preparando" | "al_dia" | "sincronizando" | "pendiente" | "sin_conexion" | "sesion_caducada" | "esquema_antiguo" | "revocado" | "problema";

export interface EstadoVisible {
  fase: FaseVisible;
  pendientes: number;
  /** Grupos de cambios que el servidor no aceptó (esperan decisión del propietario). */
  rechazados: number;
  /** Avisos de conflicto sin resolver. */
  conflictos: number;
  /** ISO UTC de la última sincronización buena, o null. */
  ultimaSincronizacion: string | null;
  error: string | null;
}

export interface OpcionesDelServicio {
  esperaTrasGuardarMs?: number;
  intervaloMs?: number;
  programar?: (tarea: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
}

const ESTADO_INICIAL: EstadoVisible = { fase: "sin_vincular", pendientes: 0, rechazados: 0, conflictos: 0, ultimaSincronizacion: null, error: null };

export class ServicioDeSincronizacion {
  private estado: EstadoVisible = ESTADO_INICIAL;
  private readonly oyentes = new Set<(e: EstadoVisible) => void>();
  private temporizadorGuardado: unknown = null;
  private temporizadorPeriodico: unknown = null;
  private quitarOyente: (() => void) | null = null;
  private sincronizando = false;
  private enLinea = true;
  private detenido = true;
  private readonly programar: (tarea: () => void, ms: number) => unknown;
  private readonly cancelar: (id: unknown) => void;
  private readonly espera: number;
  private readonly intervalo: number;

  constructor(
    private readonly conexion: Conexion,
    private readonly cliente: ClienteDeSincronizacion,
    opciones: OpcionesDelServicio = {},
  ) {
    this.programar = opciones.programar ?? ((tarea, ms) => setTimeout(tarea, ms));
    this.cancelar = opciones.cancelar ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
    this.espera = opciones.esperaTrasGuardarMs ?? 3000;
    this.intervalo = opciones.intervaloMs ?? 5 * 60 * 1000;
  }

  obtenerEstado(): EstadoVisible {
    return this.estado;
  }

  /** Para React (useSyncExternalStore) y para las pruebas. Devuelve cómo dejar de oír. */
  suscribir(oyente: (e: EstadoVisible) => void): () => void {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  }

  async iniciar(): Promise<void> {
    if (!this.detenido) return;
    this.detenido = false;
    this.quitarOyente = alGuardar(this.conexion, () => this.pedirEnvio());
    await this.refrescar();
    this.programarPeriodico();
    // Al abrir el programa se sincroniza una vez, sin esperar a que el usuario guarde algo.
    void this.sincronizarAhora();
  }

  detener(): void {
    this.detenido = true;
    this.quitarOyente?.();
    this.quitarOyente = null;
    if (this.temporizadorGuardado !== null) this.cancelar(this.temporizadorGuardado);
    if (this.temporizadorPeriodico !== null) this.cancelar(this.temporizadorPeriodico);
    this.temporizadorGuardado = null;
    this.temporizadorPeriodico = null;
  }

  /** La ventana avisa que volvió o se perdió la red. Al volver se sincroniza enseguida. */
  redCambio(enLinea: boolean): void {
    this.enLinea = enLinea;
    if (enLinea) void this.sincronizarAhora();
    else void this.refrescar();
  }

  /** Programa un envío unos segundos después de guardar (los guardados seguidos se juntan en uno). */
  pedirEnvio(): void {
    if (this.detenido) return;
    void this.refrescar();
    if (this.temporizadorGuardado !== null) this.cancelar(this.temporizadorGuardado);
    this.temporizadorGuardado = this.programar(() => {
      this.temporizadorGuardado = null;
      void this.sincronizarAhora();
    }, this.espera);
  }

  async sincronizarAhora(): Promise<ResultadoCiclo> {
    this.sincronizando = true;
    await this.refrescar();
    let resultado: ResultadoCiclo;
    try {
      resultado = await this.cliente.sincronizar();
    } finally {
      this.sincronizando = false;
    }
    await this.refrescar(resultado.estado);
    return resultado;
  }

  private programarPeriodico(): void {
    this.temporizadorPeriodico = this.programar(() => {
      this.temporizadorPeriodico = null;
      if (this.detenido) return;
      void this.sincronizarAhora().finally(() => {
        if (!this.detenido) this.programarPeriodico();
      });
    }, this.intervalo);
  }

  /** Vuelve a leer de la base lo que muestra el indicador. */
  async refrescar(estadoDelCiclo?: EstadoDelCiclo): Promise<void> {
    const vinculo = await leerVinculo(this.conexion).catch(() => null);
    let siguiente: EstadoVisible;
    if (!vinculo) {
      siguiente = ESTADO_INICIAL;
    } else {
      const e = await leerEstado(this.conexion, [CLAVES.ultimaSincronizacion, CLAVES.ultimoError, CLAVES.subidaInicial, CLAVES.descargaInicial, CLAVES.revocado, CLAVES.esquemaAntiguo, CLAVES.sesionCaducada]);
      const pendientes = await contarPendientes(this.conexion);
      const rechazados = await contarRechazados(this.conexion);
      const [{ n: conflictos }] = await this.conexion.consultar<{ n: number }>("SELECT count(*) AS n FROM aviso_sincronizacion WHERE tipo = 'conflicto' AND resuelto_en IS NULL");
      const preparando = Boolean((e[CLAVES.subidaInicial] && e[CLAVES.subidaInicial] !== "completa") || (e[CLAVES.descargaInicial] && e[CLAVES.descargaInicial] !== "completa"));
      let fase: FaseVisible;
      if (e[CLAVES.revocado]) fase = "revocado";
      else if (preparando) fase = "preparando";
      else if (this.sincronizando) fase = "sincronizando";
      else if (e[CLAVES.esquemaAntiguo]) fase = "esquema_antiguo";
      else if (e[CLAVES.sesionCaducada]) fase = "sesion_caducada";
      else if (estadoDelCiclo === "sin_conexion" || !this.enLinea) fase = "sin_conexion";
      else if (estadoDelCiclo === "problema") fase = "problema";
      else if (pendientes > 0) fase = "pendiente";
      else fase = "al_dia";
      siguiente = {
        fase,
        pendientes,
        rechazados,
        conflictos,
        ultimaSincronizacion: e[CLAVES.ultimaSincronizacion] ?? null,
        error: e[CLAVES.ultimoError] ?? null,
      };
    }
    if (JSON.stringify(siguiente) === JSON.stringify(this.estado)) return;
    this.estado = siguiente;
    for (const oyente of this.oyentes) oyente(siguiente);
  }
}
