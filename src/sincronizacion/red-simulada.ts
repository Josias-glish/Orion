// Una red falsa para las pruebas (Vitest): habla con un servidor de prueba (Postgres en memoria, servidor/pruebas/ayudas.ts)
// y permite provocar los fallos que una red real produce: cortes antes de que llegue la petición, cortes después de que el
// servidor la procesó (la respuesta se pierde), entregas repetidas y falta de conexión. No la usa el programa.
import { ErrorDeRed, ErrorDelServidor, type Red, type ResultadoDeRegistro, type Sesion } from "./red";

/** Lo que la red simulada necesita del servidor de pruebas. */
export interface ServidorRemoto {
  rpc(nombre: string, parametros?: Record<string, unknown>, opciones?: { como?: string | null }): Promise<unknown>;
}

export type FalloDeRed = "cortar_antes" | "cortar_despues" | "duplicar";

interface FalloProgramado {
  funcion: string | "*";
  fallo: FalloDeRed;
  /** Cuántas llamadas se saltan antes de aplicar el fallo (0 = la próxima). */
  saltar: number;
  veces: number;
}

export interface OpcionesRedSimulada {
  servidor: ServidorRemoto;
  /** Cuenta con la que habla (su uuid en `auth.users`). Sin ella no hay sesión. */
  cuentaId: string | null;
  correo?: string;
  /** Correos y contraseñas que `iniciarSesion` acepta. */
  cuentas?: Map<string, { id: string; contrasena: string }>;
  /** Archivos del almacenamiento (compartido entre las redes simuladas de una prueba). */
  archivos?: Map<string, Uint8Array>;
}

export interface LlamadaRegistrada {
  funcion: string;
  resultado: "ok" | "cortada_antes" | "cortada_despues" | "duplicada" | "error_del_servidor" | "sin_conexion";
}

const copiar = <T>(valor: T): T => (valor === undefined ? valor : (JSON.parse(JSON.stringify(valor)) as T));

export class RedSimulada implements Red {
  enLinea = true;
  readonly llamadas: LlamadaRegistrada[] = [];
  readonly archivos: Map<string, Uint8Array>;
  private sesion: Sesion | null = null;
  private fallos: FalloProgramado[] = [];

  constructor(private readonly opciones: OpcionesRedSimulada) {
    this.archivos = opciones.archivos ?? new Map();
    if (opciones.cuentaId) this.sesion = this.crearSesion(opciones.cuentaId, opciones.correo ?? "cuenta@ejemplo.com");
  }

  private crearSesion(id: string, correo: string): Sesion {
    return { accessToken: "token-de-prueba", refreshToken: "renovacion-de-prueba", expiraEnMs: Number.MAX_SAFE_INTEGER, usuarioId: id, correo };
  }

  /** Programa un fallo para las próximas llamadas a `funcion` (o a cualquiera con «*»). */
  provocar(funcion: string | "*", fallo: FalloDeRed, opciones: { saltar?: number; veces?: number } = {}): void {
    this.fallos.push({ funcion, fallo, saltar: opciones.saltar ?? 0, veces: opciones.veces ?? 1 });
  }

  quitarFallos(): void {
    this.fallos = [];
  }

  private tomarFallo(funcion: string): FalloDeRed | null {
    const programado = this.fallos.find((f) => (f.funcion === "*" || f.funcion === funcion) && f.veces > 0);
    if (!programado) return null;
    if (programado.saltar > 0) {
      programado.saltar -= 1;
      return null;
    }
    programado.veces -= 1;
    return programado.fallo;
  }

  async rpc<T>(funcion: string, parametros: Record<string, unknown>): Promise<T> {
    if (!this.enLinea) {
      this.llamadas.push({ funcion, resultado: "sin_conexion" });
      throw new ErrorDeRed("sin_conexion", "Sin conexión (simulada).");
    }
    if (!this.sesion) throw new ErrorDeRed("sesion", "No hay sesión iniciada.");
    const fallo = this.tomarFallo(funcion);
    if (fallo === "cortar_antes") {
      this.llamadas.push({ funcion, resultado: "cortada_antes" });
      throw new ErrorDeRed("sin_conexion", "Corte antes de llegar (simulado).");
    }
    const enviar = async (): Promise<T> => {
      try {
        // Lo que viaja por la red se serializa: así no se cuelan objetos vivos ni `undefined`.
        return copiar((await this.opciones.servidor.rpc(funcion, copiar(parametros), { como: this.sesion?.usuarioId ?? null })) as T);
      } catch (error) {
        const codigo = (error as { codigo?: unknown }).codigo;
        if (typeof codigo === "string") {
          this.llamadas.push({ funcion, resultado: "error_del_servidor" });
          throw new ErrorDelServidor(codigo);
        }
        throw error;
      }
    };
    const resultado = await enviar();
    if (fallo === "duplicar") {
      this.llamadas.push({ funcion, resultado: "duplicada" });
      // El servidor recibe la misma petición otra vez; el equipo solo ve una respuesta.
      await enviar().catch(() => undefined);
      return resultado;
    }
    if (fallo === "cortar_despues") {
      this.llamadas.push({ funcion, resultado: "cortada_despues" });
      throw new ErrorDeRed("sin_conexion", "Corte después de procesar (simulado): la respuesta se perdió.");
    }
    this.llamadas.push({ funcion, resultado: "ok" });
    return resultado;
  }

  async iniciarSesion(correo: string, contrasena: string): Promise<Sesion> {
    const cuenta = this.opciones.cuentas?.get(correo.toLowerCase());
    if (!cuenta || cuenta.contrasena !== contrasena) throw new ErrorDeRed("sesion", "Correo o contraseña incorrectos.", 400);
    this.sesion = this.crearSesion(cuenta.id, correo);
    return this.sesion;
  }

  async crearCuenta(correo: string, contrasena: string): Promise<ResultadoDeRegistro> {
    if (!this.opciones.cuentas) throw new ErrorDeRed("http", "No se puede crear la cuenta (simulado).", 422);
    this.opciones.cuentas.set(correo.toLowerCase(), { id: `cuenta-${correo}`, contrasena });
    return { sesion: await this.iniciarSesion(correo, contrasena) };
  }

  async restaurarSesion(): Promise<Sesion | null> {
    return this.sesion;
  }

  async cerrarSesion(): Promise<void> {
    this.sesion = null;
  }

  sesionActual(): Sesion | null {
    return this.sesion;
  }

  async subirArchivo(fincaId: string, ruta: string, contenido: Uint8Array): Promise<void> {
    if (!this.enLinea) throw new ErrorDeRed("sin_conexion", "Sin conexión (simulada).");
    const clave = `${fincaId}/${ruta}`;
    if (!this.archivos.has(clave)) this.archivos.set(clave, new Uint8Array(contenido));
  }

  async bajarArchivo(fincaId: string, ruta: string): Promise<Uint8Array> {
    if (!this.enLinea) throw new ErrorDeRed("sin_conexion", "Sin conexión (simulada).");
    const guardado = this.archivos.get(`${fincaId}/${ruta}`);
    if (!guardado) throw new ErrorDeRed("http", "No existe (simulado).", 404);
    return new Uint8Array(guardado);
  }
}
