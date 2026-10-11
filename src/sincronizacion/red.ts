// ÚNICO archivo del programa que hace llamadas de red (Etapa 10, sección 14 del diseño; src/seguridad.test.ts lo vigila).
// Habla con el servidor por HTTPS usando el plugin HTTP de Tauri: la petición la hace Rust, solo a la dirección declarada
// en src-tauri/capabilities/sincronizacion.json, sin cookies y sin seguir redirecciones a otras direcciones.
//   - Cuentas: Supabase Auth (correo y contraseña): POST /auth/v1/token, /auth/v1/signup, /auth/v1/logout.
//   - Datos: funciones de Postgres por PostgREST: POST /rest/v1/rpc/<función>.
//   - Archivos: Supabase Storage (bucket privado `archivos`): POST /storage/v1/object/... y GET .../authenticated/...
// Nunca se escriben en ningún registro las contraseñas, los tokens ni los cuerpos de las peticiones.
import { fetch as fetchDeTauri } from "@tauri-apps/plugin-http";
import type { ConfiguracionDelServidor } from "./config";

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  /** Milisegundos desde 1970 en que caduca el token de acceso. */
  expiraEnMs: number;
  usuarioId: string;
  correo: string;
}

export type TipoErrorDeRed = "sin_conexion" | "tiempo" | "http" | "no_configurado" | "sesion" | "respuesta_invalida";

/** No se pudo hablar con el servidor, o contestó algo que no es una respuesta de nuestras funciones. */
export class ErrorDeRed extends Error {
  constructor(
    readonly tipo: TipoErrorDeRed,
    mensaje: string,
    readonly estado?: number,
  ) {
    super(mensaje);
    this.name = "ErrorDeRed";
  }
}

/** El servidor contestó con un error de una de nuestras funciones: `codigo` es el texto del `raise exception` (servidor/PROTOCOLO.md). */
export class ErrorDelServidor extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
    this.name = "ErrorDelServidor";
  }
}

export interface OpcionesRpc {
  tiempoMs?: number;
}

export type ResultadoDeRegistro = { sesion: Sesion } | { sesion: null; requiereConfirmacion: true };

/** Lo que el resto del programa necesita de la red. Las pruebas usan `RedSimulada` (red-simulada.ts). */
export interface Red {
  rpc<T>(funcion: string, parametros: Record<string, unknown>, opciones?: OpcionesRpc): Promise<T>;
  iniciarSesion(correo: string, contrasena: string): Promise<Sesion>;
  crearCuenta(correo: string, contrasena: string): Promise<ResultadoDeRegistro>;
  /** Recupera la sesión guardada (llavero) y la renueva si hace falta. null si no hay o ya no sirve. */
  restaurarSesion(): Promise<Sesion | null>;
  cerrarSesion(): Promise<void>;
  sesionActual(): Sesion | null;
  subirArchivo(fincaId: string, ruta: string, contenido: Uint8Array, tipo: string): Promise<void>;
  bajarArchivo(fincaId: string, ruta: string): Promise<Uint8Array>;
}

/** Dónde se guarda la sesión: el llavero del sistema (src/sincronizacion/llavero.ts). */
export interface AlmacenDeSesion {
  leer(): Promise<string | null>;
  guardar(valor: string): Promise<void>;
  borrar(): Promise<void>;
}

export type FetchCompatible = (entrada: string, init?: RequestInit & { connectTimeout?: number; maxRedirections?: number }) => Promise<Response>;

export interface OpcionesRedTauri {
  configuracion: ConfiguracionDelServidor;
  almacen: AlmacenDeSesion;
  /** Solo para probar este archivo sin Tauri. */
  fetchPropio?: FetchCompatible;
  ahoraMs?: () => number;
}

const TIEMPO_CONEXION_MS = 10_000;
const TIEMPO_RESPUESTA_MS = 30_000;
/** Se renueva el token un poco antes de que caduque. */
const MARGEN_RENOVACION_MS = 60_000;

interface RespuestaDeToken {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: { id?: string; email?: string };
}

export function crearRedTauri(opciones: OpcionesRedTauri): Red {
  const { configuracion, almacen } = opciones;
  const ahora = opciones.ahoraMs ?? (() => Date.now());
  const enviar: FetchCompatible = opciones.fetchPropio ?? ((entrada, init) => fetchDeTauri(entrada, init));
  let sesion: Sesion | null = null;
  let renovando: Promise<Sesion> | null = null;

  function base(): string {
    let direccion: URL;
    try {
      direccion = new URL(configuracion.url);
    } catch {
      throw new ErrorDeRed("no_configurado", "La dirección del servidor no es válida.");
    }
    if (direccion.protocol !== "https:" || direccion.hostname.endsWith(".invalid") || configuracion.claveAnonima === "") {
      throw new ErrorDeRed("no_configurado", "El servidor de sincronización no está configurado.");
    }
    return configuracion.url.replace(/\/+$/, "");
  }

  async function peticion(
    ruta: string,
    init: { metodo: "GET" | "POST"; cuerpo?: BodyInit; json?: unknown; token?: string | null; tipo?: string; encabezados?: Record<string, string> },
    tiempoMs = TIEMPO_RESPUESTA_MS,
  ): Promise<Response> {
    const encabezados: Record<string, string> = { apikey: configuracion.claveAnonima, ...(init.encabezados ?? {}) };
    if (init.token) encabezados.Authorization = `Bearer ${init.token}`;
    let cuerpo = init.cuerpo;
    if (init.json !== undefined) {
      cuerpo = JSON.stringify(init.json);
      encabezados["Content-Type"] = "application/json";
    } else if (init.tipo) {
      encabezados["Content-Type"] = init.tipo;
    }
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), tiempoMs);
    try {
      return await enviar(`${base()}${ruta}`, {
        method: init.metodo,
        headers: encabezados,
        body: cuerpo,
        signal: control.signal,
        connectTimeout: TIEMPO_CONEXION_MS,
        maxRedirections: 0,
      });
    } catch (error) {
      if (error instanceof ErrorDeRed) throw error;
      if (control.signal.aborted) throw new ErrorDeRed("tiempo", "El servidor no contestó a tiempo.");
      throw new ErrorDeRed("sin_conexion", "No hay conexión con el servidor.");
    } finally {
      clearTimeout(reloj);
    }
  }

  async function leerJson(respuesta: Response): Promise<unknown> {
    const texto = await respuesta.text();
    if (texto === "") return null;
    try {
      return JSON.parse(texto);
    } catch {
      throw new ErrorDeRed("respuesta_invalida", "El servidor contestó algo que no se entiende.", respuesta.status);
    }
  }

  function aSesion(r: RespuestaDeToken): Sesion {
    if (!r.access_token || !r.refresh_token || !r.user?.id) throw new ErrorDeRed("respuesta_invalida", "La respuesta de la cuenta no trae la sesión.");
    const expiraEnMs = r.expires_at ? r.expires_at * 1000 : ahora() + (r.expires_in ?? 3600) * 1000;
    return { accessToken: r.access_token, refreshToken: r.refresh_token, expiraEnMs, usuarioId: r.user.id, correo: (r.user.email ?? "").toLowerCase() };
  }

  async function guardarSesion(nueva: Sesion): Promise<Sesion> {
    sesion = nueva;
    try {
      // Solo el token de renovación y quién es: el de acceso es largo (el llavero de Windows admite pocos bytes) y se vuelve a pedir.
      await almacen.guardar(JSON.stringify({ ...nueva, accessToken: "", expiraEnMs: 0 }));
    } catch {
      // Sin llavero la sesión vive solo mientras el programa está abierto: nunca se guarda en otro lugar.
    }
    return nueva;
  }

  async function olvidarSesion(): Promise<void> {
    sesion = null;
    try {
      await almacen.borrar();
    } catch {
      // nada que borrar
    }
  }

  function renovar(refreshToken: string): Promise<Sesion> {
    renovando ??= (async () => {
      try {
        const respuesta = await peticion("/auth/v1/token?grant_type=refresh_token", { metodo: "POST", json: { refresh_token: refreshToken } });
        if (respuesta.status === 400 || respuesta.status === 401 || respuesta.status === 403) {
          await olvidarSesion();
          throw new ErrorDeRed("sesion", "La sesión caducó: hay que iniciar sesión otra vez.", respuesta.status);
        }
        if (!respuesta.ok) throw new ErrorDeRed("http", "No se pudo renovar la sesión.", respuesta.status);
        return await guardarSesion(aSesion((await leerJson(respuesta)) as RespuestaDeToken));
      } finally {
        renovando = null;
      }
    })();
    return renovando;
  }

  /** Token de acceso vigente (renovándolo si está por caducar). */
  async function tokenVigente(): Promise<string> {
    if (!sesion) throw new ErrorDeRed("sesion", "No hay sesión iniciada.");
    if (sesion.expiraEnMs - MARGEN_RENOVACION_MS <= ahora()) return (await renovar(sesion.refreshToken)).accessToken;
    return sesion.accessToken;
  }

  /** Una petición con sesión: si el servidor dice 401 se renueva el token una vez y se repite. */
  async function conSesion(ruta: string, init: Parameters<typeof peticion>[1], tiempoMs?: number): Promise<Response> {
    let respuesta = await peticion(ruta, { ...init, token: await tokenVigente() }, tiempoMs);
    if (respuesta.status === 401 && sesion) {
      const nueva = await renovar(sesion.refreshToken);
      respuesta = await peticion(ruta, { ...init, token: nueva.accessToken }, tiempoMs);
    }
    if (respuesta.status === 401) throw new ErrorDeRed("sesion", "La sesión no es válida.", 401);
    return respuesta;
  }

  async function errorDe(respuesta: Response): Promise<Error> {
    let cuerpo: unknown = null;
    try {
      cuerpo = await leerJson(respuesta);
    } catch {
      // el cuerpo no es JSON
    }
    const datos = cuerpo as { code?: string; message?: string } | null;
    // Nuestras funciones lanzan P0001 con el código del error como mensaje (servidor/PROTOCOLO.md, sección 1).
    if (datos?.code === "P0001" && typeof datos.message === "string") return new ErrorDelServidor(datos.message);
    return new ErrorDeRed("http", `El servidor respondió con el error ${respuesta.status}.`, respuesta.status);
  }

  return {
    sesionActual: () => sesion,

    async iniciarSesion(correo, contrasena) {
      const respuesta = await peticion("/auth/v1/token?grant_type=password", { metodo: "POST", json: { email: correo.trim().toLowerCase(), password: contrasena } });
      if (respuesta.status === 400 || respuesta.status === 401 || respuesta.status === 403) throw new ErrorDeRed("sesion", "Correo o contraseña incorrectos.", respuesta.status);
      if (!respuesta.ok) throw new ErrorDeRed("http", "No se pudo iniciar sesión.", respuesta.status);
      return guardarSesion(aSesion((await leerJson(respuesta)) as RespuestaDeToken));
    },

    async crearCuenta(correo, contrasena) {
      const respuesta = await peticion("/auth/v1/signup", { metodo: "POST", json: { email: correo.trim().toLowerCase(), password: contrasena } });
      if (!respuesta.ok) throw new ErrorDeRed("http", "No se pudo crear la cuenta.", respuesta.status);
      const datos = (await leerJson(respuesta)) as RespuestaDeToken;
      // Con la confirmación por correo activada, el servidor devuelve el usuario sin sesión.
      if (!datos.access_token) return { sesion: null, requiereConfirmacion: true };
      return { sesion: await guardarSesion(aSesion(datos)) };
    },

    async restaurarSesion() {
      if (sesion) return sesion;
      let guardada: Sesion | null = null;
      try {
        const texto = await almacen.leer();
        guardada = texto ? (JSON.parse(texto) as Sesion) : null;
      } catch {
        guardada = null;
      }
      if (!guardada?.refreshToken) return null;
      sesion = guardada;
      if (guardada.expiraEnMs - MARGEN_RENOVACION_MS > ahora()) return guardada;
      try {
        return await renovar(guardada.refreshToken);
      } catch (error) {
        if (error instanceof ErrorDeRed && error.tipo === "sesion") return null;
        throw error; // sin red: la sesión guardada sigue siendo la que hay
      }
    },

    async cerrarSesion() {
      const actual = sesion;
      await olvidarSesion();
      if (actual) {
        // Se avisa al servidor si hay red; si no, igual queda cerrada aquí.
        await peticion("/auth/v1/logout?scope=local", { metodo: "POST", token: actual.accessToken }).catch(() => undefined);
      }
    },

    async rpc<T>(funcion: string, parametros: Record<string, unknown>, opciones?: OpcionesRpc): Promise<T> {
      if (!/^[a-z_][a-z0-9_]*$/.test(funcion)) throw new Error("Nombre de función no permitido.");
      const respuesta = await conSesion(`/rest/v1/rpc/${funcion}`, { metodo: "POST", json: parametros }, opciones?.tiempoMs);
      if (!respuesta.ok) throw await errorDe(respuesta);
      return (await leerJson(respuesta)) as T;
    },

    async subirArchivo(fincaId, ruta, contenido, tipo) {
      const respuesta = await conSesion(
        `/storage/v1/object/archivos/${fincaId}/${ruta.split("/").map(encodeURIComponent).join("/")}`,
        { metodo: "POST", cuerpo: contenido as unknown as BodyInit, tipo, encabezados: { "x-upsert": "false" } },
        120_000,
      );
      // 409: el archivo ya estaba (los archivos son inmutables): no es un error.
      if (!respuesta.ok && respuesta.status !== 409) {
        const detalle = await respuesta.text().catch(() => "");
        if (respuesta.status === 400 && /Duplicate|already exists/i.test(detalle)) return;
        throw new ErrorDeRed("http", `No se pudo subir el archivo (${respuesta.status}).`, respuesta.status);
      }
    },

    async bajarArchivo(fincaId, ruta) {
      const respuesta = await conSesion(
        `/storage/v1/object/authenticated/archivos/${fincaId}/${ruta.split("/").map(encodeURIComponent).join("/")}`,
        { metodo: "GET" },
        120_000,
      );
      if (!respuesta.ok) throw new ErrorDeRed("http", `No se pudo bajar el archivo (${respuesta.status}).`, respuesta.status);
      return new Uint8Array(await respuesta.arrayBuffer());
    },
  };
}
