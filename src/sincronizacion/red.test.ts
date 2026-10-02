import { describe, expect, it } from "vitest";
import { crearRedTauri, ErrorDeRed, ErrorDelServidor, type AlmacenDeSesion, type FetchCompatible } from "./red";

const CONFIG = { url: "https://proyecto.supabase.example/", claveAnonima: "clave-publica" };

function almacenEnMemoria(inicial: string | null = null): AlmacenDeSesion & { valor: string | null } {
  const a = {
    valor: inicial,
    async leer() {
      return a.valor;
    },
    async guardar(v: string) {
      a.valor = v;
    },
    async borrar() {
      a.valor = null;
    },
  };
  return a;
}

const json = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });
const token = (n: number, expira = 4_000_000_000) => ({ access_token: `acceso-${n}`, refresh_token: `renovar-${n}`, expires_at: expira, user: { id: "u1", email: "Ana@Correo.com" } });

interface Llamada {
  url: string;
  metodo: string;
  encabezados: Record<string, string>;
  cuerpo: unknown;
  init: Record<string, unknown>;
}

function red(respuestas: (Response | Error | ((l: Llamada) => Response))[], almacen = almacenEnMemoria()) {
  const llamadas: Llamada[] = [];
  const fetchPropio: FetchCompatible = async (url, init) => {
    const l: Llamada = { url, metodo: String(init?.method), encabezados: (init?.headers ?? {}) as Record<string, string>, cuerpo: init?.body, init: (init ?? {}) as Record<string, unknown> };
    llamadas.push(l);
    const siguiente = respuestas.shift();
    if (!siguiente) throw new Error("sin respuesta preparada");
    if (siguiente instanceof Error) throw siguiente;
    return typeof siguiente === "function" ? siguiente(l) : siguiente;
  };
  return { red: crearRedTauri({ configuracion: CONFIG, almacen, fetchPropio, ahoraMs: () => 1_000_000_000_000 }), llamadas, almacen };
}

describe("red: cuentas", () => {
  it("inicia sesión con correo y contraseña por /auth/v1/token y guarda solo lo necesario en el llavero", async () => {
    const { red: r, llamadas, almacen } = red([json(token(1))]);
    const sesion = await r.iniciarSesion(" Ana@Correo.com ", "secreta");
    expect(sesion).toMatchObject({ usuarioId: "u1", correo: "ana@correo.com", accessToken: "acceso-1" });
    expect(llamadas[0].url).toBe("https://proyecto.supabase.example/auth/v1/token?grant_type=password");
    expect(llamadas[0].encabezados.apikey).toBe("clave-publica");
    expect(JSON.parse(String(llamadas[0].cuerpo))).toEqual({ email: "ana@correo.com", password: "secreta" });
    expect(llamadas[0].init.maxRedirections).toBe(0);
    const guardado = JSON.parse(almacen.valor!);
    expect(guardado.refreshToken).toBe("renovar-1");
    expect(guardado.accessToken).toBe("");
    expect(almacen.valor).not.toContain("secreta");
  });

  it("una contraseña incorrecta es un error de sesión, no de red", async () => {
    const { red: r } = red([json({ msg: "Invalid login credentials" }, 400)]);
    await expect(r.iniciarSesion("a@b.c", "x")).rejects.toMatchObject({ tipo: "sesion" });
  });

  it("crear cuenta con confirmación por correo no devuelve sesión", async () => {
    const { red: r } = red([json({ id: "u1", email: "a@b.c" })]);
    expect(await r.crearCuenta("a@b.c", "una-clave-larga")).toEqual({ sesion: null, requiereConfirmacion: true });
  });

  it("restaura la sesión guardada renovándola, y si ya no sirve la olvida", async () => {
    const guardada = JSON.stringify({ accessToken: "", refreshToken: "viejo", expiraEnMs: 0, usuarioId: "u1", correo: "a@b.c" });
    const bueno = red([json(token(2))], almacenEnMemoria(guardada));
    expect((await bueno.red.restaurarSesion())?.accessToken).toBe("acceso-2");
    expect(JSON.parse(bueno.llamadas[0].cuerpo as string)).toEqual({ refresh_token: "viejo" });
    expect(bueno.llamadas[0].url).toContain("grant_type=refresh_token");

    const malo = red([json({ error: "invalid_grant" }, 400)], almacenEnMemoria(guardada));
    expect(await malo.red.restaurarSesion()).toBeNull();
    expect(malo.almacen.valor).toBeNull();
  });

  it("sin red al restaurar no se pierde la sesión guardada", async () => {
    const guardada = JSON.stringify({ accessToken: "", refreshToken: "viejo", expiraEnMs: 0, usuarioId: "u1", correo: "a@b.c" });
    const { red: r, almacen } = red([new TypeError("fallo de red")], almacenEnMemoria(guardada));
    await expect(r.restaurarSesion()).rejects.toMatchObject({ tipo: "sin_conexion" });
    expect(almacen.valor).toBe(guardada);
  });
});

describe("red: funciones del servidor", () => {
  async function conSesion(respuestas: Parameters<typeof red>[0]) {
    const x = red([json(token(1)), ...respuestas]);
    await x.red.iniciarSesion("a@b.c", "x");
    x.llamadas.length = 0;
    return x;
  }

  it("llama a /rest/v1/rpc/<función> con el token de la sesión y devuelve el resultado", async () => {
    const { red: r, llamadas } = await conSesion([json({ hora_servidor_ms: 5 })]);
    expect(await r.rpc("sincronizar", { p_desde: 0 })).toEqual({ hora_servidor_ms: 5 });
    expect(llamadas[0].url).toBe("https://proyecto.supabase.example/rest/v1/rpc/sincronizar");
    expect(llamadas[0].encabezados.Authorization).toBe("Bearer acceso-1");
    expect(JSON.parse(llamadas[0].cuerpo as string)).toEqual({ p_desde: 0 });
  });

  it("el error P0001 de una función llega como ErrorDelServidor con su código", async () => {
    const { red: r } = await conSesion([json({ code: "P0001", message: "esquema_antiguo", details: null, hint: null }, 400)]);
    const error = (await r.rpc("sincronizar", {}).catch((e: unknown) => e)) as ErrorDelServidor;
    expect(error).toBeInstanceOf(ErrorDelServidor);
    expect(error.codigo).toBe("esquema_antiguo");
  });

  it("un 401 renueva el token una vez y repite la petición", async () => {
    const { red: r, llamadas } = await conSesion([json({ message: "JWT expired" }, 401), json(token(2)), json({ ok: true })]);
    expect(await r.rpc("mis_fincas", {})).toEqual({ ok: true });
    expect(llamadas.map((l) => l.url.split("/").slice(3).join("/"))).toEqual(["rest/v1/rpc/mis_fincas", "auth/v1/token?grant_type=refresh_token", "rest/v1/rpc/mis_fincas"]);
    expect(llamadas[2].encabezados.Authorization).toBe("Bearer acceso-2");
  });

  it("errores 5xx, 429 y 413 son errores de red con su estado; un corte es «sin conexión»", async () => {
    const x = await conSesion([json({}, 503), json({}, 413), new TypeError("fallo")]);
    await expect(x.red.rpc("f", {})).rejects.toMatchObject({ tipo: "http", estado: 503 });
    await expect(x.red.rpc("f", {})).rejects.toMatchObject({ tipo: "http", estado: 413 });
    await expect(x.red.rpc("f", {})).rejects.toMatchObject({ tipo: "sin_conexion" });
  });

  it("no acepta nombres de función raros ni hace llamadas sin sesión", async () => {
    const { red: r } = red([]);
    await expect(r.rpc("mis_fincas", {})).rejects.toMatchObject({ tipo: "sesion" });
    const x = await conSesion([]);
    await expect(x.red.rpc("../auth/v1/admin", {})).rejects.toThrow(/no permitido/);
  });
});

describe("red: configuración", () => {
  it("no hace ninguna llamada si la dirección no es https o es la de ejemplo", async () => {
    for (const url of ["http://servidor.example", "https://servidor-no-configurado.invalid"]) {
      let llamadas = 0;
      const r = crearRedTauri({ configuracion: { url, claveAnonima: "k" }, almacen: almacenEnMemoria(), fetchPropio: async () => (llamadas++, json({})) });
      await expect(r.iniciarSesion("a@b.c", "x")).rejects.toMatchObject({ tipo: "no_configurado" });
      expect(llamadas).toBe(0);
    }
  });
});

describe("red: archivos", () => {
  it("sube a <finca>/<ruta> sin sobrescribir y baja con la ruta autenticada; un archivo repetido no es un error", async () => {
    const x = red([json(token(1)), json({ Key: "ok" }), json({ error: "Duplicate" }, 409), new Response(new Uint8Array([1, 2, 3]))]);
    await x.red.iniciarSesion("a@b.c", "x");
    x.llamadas.length = 0;
    await x.red.subirArchivo("f1", "fotos/a b.jpg", new Uint8Array([9]), "image/jpeg");
    await x.red.subirArchivo("f1", "fotos/a b.jpg", new Uint8Array([9]), "image/jpeg");
    expect(x.llamadas[0].url).toBe("https://proyecto.supabase.example/storage/v1/object/archivos/f1/fotos/a%20b.jpg");
    expect(x.llamadas[0].encabezados["x-upsert"]).toBe("false");
    expect(Array.from(await x.red.bajarArchivo("f1", "fotos/a.jpg"))).toEqual([1, 2, 3]);
    expect(x.llamadas[2].url).toBe("https://proyecto.supabase.example/storage/v1/object/authenticated/archivos/f1/fotos/a.jpg");
  });
});

void ErrorDeRed;
