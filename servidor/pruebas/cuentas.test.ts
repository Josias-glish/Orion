// Cuentas, fincas, equipos e invitaciones (PROTOCOLO.md, sección 4).
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ErrorDeServidor,
  HORA_BASE,
  VERSION_ESQUEMA_DE_PRUEBA,
  agregarEquipo,
  crearFincaDePrueba,
  crearServidorDePrueba,
  operacion,
  marca,
  uuid,
  type ServidorDePrueba,
  type Vinculo,
} from "./ayudas";

let servidor: ServidorDePrueba;

beforeAll(async () => {
  servidor = await crearServidorDePrueba();
});
afterAll(async () => {
  await servidor.cerrar();
});
beforeEach(async () => {
  await servidor.reiniciar();
});

/** Espera que la promesa falle con el código de PROTOCOLO.md (el mensaje del `raise exception`). */
async function falla(promesa: Promise<unknown>, codigo: string): Promise<void> {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `debía fallar con ${codigo}`).toBeInstanceOf(ErrorDeServidor);
  expect((error as ErrorDeServidor).codigo).toBe(codigo);
  expect((error as ErrorDeServidor).sqlstate).toBe("P0001");
}

const dispositivo = (nombre = "Equipo") => ({ id: uuid(), nombre, plataforma: "pruebas" });

/** Una cuenta sin autorización para crear fincas. */
async function cuentaSinAutorizar(correo: string): Promise<string> {
  return servidor.crearCuenta(correo);
}

function unirseConCodigo(cuentaId: string, codigo: string, version = VERSION_ESQUEMA_DE_PRUEBA, equipo = dispositivo()) {
  return servidor.rpc<Vinculo & { error?: string }>(
    "unirse_a_finca",
    { p_finca_id: null, p_codigo: codigo, p_dispositivo: equipo, p_version_esquema: version },
    { como: cuentaId },
  );
}

describe("registrar_cuenta", () => {
  it("crea la cuenta con el correo en minúsculas y dice si puede crear fincas", async () => {
    const id = await servidor.crearCuenta("  Josias@Ejemplo.COM ");
    const antes = await servidor.rpc("registrar_cuenta", {}, { como: id });
    expect(antes).toEqual({ cuenta_id: id, correo: "josias@ejemplo.com", puede_crear_finca: false });
    await servidor.autorizarCorreo("JOSIAS@ejemplo.com");
    const despues = await servidor.rpc("registrar_cuenta", {}, { como: id });
    expect(despues.puede_crear_finca).toBe(true);
    const filas = await servidor.sql(`select id, correo from public.cuenta`);
    expect(filas).toEqual([{ id, correo: "josias@ejemplo.com" }]);
  });

  it("es repetible: no duplica la cuenta", async () => {
    const id = await servidor.crearCuenta("a@ejemplo.com");
    await servidor.rpc("registrar_cuenta", {}, { como: id });
    await servidor.rpc("registrar_cuenta", {}, { como: id });
    expect(await servidor.sql(`select 1 from public.cuenta`)).toHaveLength(1);
  });

  it("sin sesión: `anon` no puede ejecutarla (42501) y un token sin `sub` da sin_sesion", async () => {
    const error = await servidor.rpc("registrar_cuenta", {}, { como: "anon" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeServidor);
    expect((error as ErrorDeServidor).sqlstate).toBe("42501");
    // Un rol `authenticated` sin `auth.uid()` (no debería pasar con Supabase, pero la función lo comprueba primero).
    await falla(
      servidor.db
        .transaction(async (tx) => {
          await tx.exec(`set local role authenticated`);
          await tx.query(`select set_config('request.jwt.claims', '{}', true), set_config('request.jwt.claim.sub', '', true)`);
          await tx.query(`select public.registrar_cuenta()`);
        })
        .catch((e: { message: string; code: string }) => {
          throw new ErrorDeServidor(e.message, e.code);
        }),
      "sin_sesion",
    );
  });
});

describe("crear_finca", () => {
  it("una cuenta autorizada crea la finca, queda propietaria y recibe el equipo A", async () => {
    const finca = await crearFincaDePrueba(servidor, { nombre: "  Aprisco El Paraíso " });
    expect(finca.vinculo).toMatchObject({
      finca_id: finca.fincaId,
      finca_nombre: "Aprisco El Paraíso",
      dispositivo_id: finca.dispositivoId,
      codigo_equipo: "A",
      hora_servidor_ms: HORA_BASE,
      seq_actual: 0,
      version_esquema_minima: VERSION_ESQUEMA_DE_PRUEBA,
    });
    expect(await servidor.rpc("mis_fincas", {}, { como: finca.cuentaId })).toEqual([{ finca_id: finca.fincaId, nombre: "Aprisco El Paraíso", rol: "propietario" }]);
  });

  it("sin autorización: no_autorizada, y no queda nada creado", async () => {
    const id = await cuentaSinAutorizar("intruso@ejemplo.com");
    await falla(servidor.rpc("crear_finca", { p_finca_id: uuid(), p_nombre: "X", p_version_esquema: 9, p_dispositivo: dispositivo() }, { como: id }), "no_autorizada");
    expect(await servidor.sql(`select 1 from public.finca_servidor`)).toHaveLength(0);
    expect(await servidor.sql(`select 1 from public.dispositivo`)).toHaveLength(0);
  });

  it("el correo autorizado se compara sin distinguir mayúsculas", async () => {
    const id = await servidor.crearCuenta("Mixto@Ejemplo.com");
    await servidor.autorizarCorreo("MIXTO@EJEMPLO.COM");
    const vinculo = await servidor.rpc<Vinculo>("crear_finca", { p_finca_id: uuid(), p_nombre: "X", p_version_esquema: 9, p_dispositivo: dispositivo() }, { como: id });
    expect(vinculo.codigo_equipo).toBe("A");
  });

  it("parámetros inválidos: nombre vacío o demasiado largo, versión menor que 1, equipo sin id", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const base = { p_finca_id: uuid(), p_nombre: "Finca", p_version_esquema: 9, p_dispositivo: dispositivo() };
    const como = { como: finca.cuentaId };
    await falla(servidor.rpc("crear_finca", { ...base, p_nombre: "   " }, como), "parametro_invalido");
    await falla(servidor.rpc("crear_finca", { ...base, p_nombre: "x".repeat(201) }, como), "parametro_invalido");
    await falla(servidor.rpc("crear_finca", { ...base, p_version_esquema: 0 }, como), "parametro_invalido");
    await falla(servidor.rpc("crear_finca", { ...base, p_dispositivo: { nombre: "sin id" } }, como), "parametro_invalido");
    await falla(servidor.rpc("crear_finca", { ...base, p_dispositivo: { id: "no-es-uuid" } }, como), "parametro_invalido");
  });

  it("es idempotente para el mismo equipo de un miembro (se perdió la respuesta) y no duplica nada", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const otra = await servidor.rpc<Vinculo>(
      "crear_finca",
      { p_finca_id: finca.fincaId, p_nombre: "Finca", p_version_esquema: 9, p_dispositivo: { id: finca.dispositivoId, nombre: "Equipo A", plataforma: "pruebas" } },
      { como: finca.cuentaId },
    );
    expect(otra.dispositivo_id).toBe(finca.dispositivoId);
    expect(otra.codigo_equipo).toBe("A");
    expect(await servidor.sql(`select 1 from public.dispositivo`)).toHaveLength(1);
    expect(await servidor.sql(`select 1 from public.membresia`)).toHaveLength(1);
  });

  it("finca_existente: un miembro con otro equipo, o una cuenta autorizada que no es miembro; una no autorizada recibe no_autorizada (no se entera)", async () => {
    const finca = await crearFincaDePrueba(servidor);
    await falla(
      servidor.rpc("crear_finca", { p_finca_id: finca.fincaId, p_nombre: "Finca", p_version_esquema: 9, p_dispositivo: dispositivo() }, { como: finca.cuentaId }),
      "finca_existente",
    );
    const autorizada = await crearFincaDePrueba(servidor); // otra cuenta autorizada, con su propia finca
    await falla(
      servidor.rpc("crear_finca", { p_finca_id: finca.fincaId, p_nombre: "Finca", p_version_esquema: 9, p_dispositivo: dispositivo() }, { como: autorizada.cuentaId }),
      "finca_existente",
    );
    const intrusa = await cuentaSinAutorizar("intrusa@ejemplo.com");
    await falla(
      servidor.rpc("crear_finca", { p_finca_id: finca.fincaId, p_nombre: "Finca", p_version_esquema: 9, p_dispositivo: dispositivo() }, { como: intrusa }),
      "no_autorizada",
    );
  });

  it("un equipo que ya pertenece a otra cuenta no se puede reutilizar: dispositivo_desconocido", async () => {
    const a = await crearFincaDePrueba(servidor);
    const b = await servidor.crearCuenta("b@ejemplo.com");
    await servidor.autorizarCorreo("b@ejemplo.com");
    await falla(
      servidor.rpc("crear_finca", { p_finca_id: uuid(), p_nombre: "Otra", p_version_esquema: 9, p_dispositivo: { id: a.dispositivoId, nombre: "Robado" } }, { como: b }),
      "dispositivo_desconocido",
    );
    expect(await servidor.sql(`select 1 from public.finca_servidor`)).toHaveLength(1);
  });
});

describe("mis_fincas", () => {
  it("solo lista las fincas de la cuenta que llama", async () => {
    const a = await crearFincaDePrueba(servidor, { nombre: "Finca A" });
    const b = await crearFincaDePrueba(servidor, { nombre: "Finca B" });
    expect((await servidor.rpc("mis_fincas", {}, { como: a.cuentaId })).map((f: { nombre: string }) => f.nombre)).toEqual(["Finca A"]);
    expect((await servidor.rpc("mis_fincas", {}, { como: b.cuentaId })).map((f: { nombre: string }) => f.nombre)).toEqual(["Finca B"]);
  });

  it("una cuenta sin fincas recibe un arreglo vacío", async () => {
    const id = await cuentaSinAutorizar("sola@ejemplo.com");
    await servidor.rpc("registrar_cuenta", {}, { como: id });
    expect(await servidor.rpc("mis_fincas", {}, { como: id })).toEqual([]);
  });
});

describe("equipos", () => {
  it("las letras avanzan A, B, … Z, AA, AB (único por finca)", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const letras = [finca.vinculo.codigo_equipo];
    for (let i = 0; i < 27; i++) letras.push((await agregarEquipo(servidor, finca)).codigo_equipo);
    expect(letras.slice(0, 3)).toEqual(["A", "B", "C"]);
    expect(letras[25]).toBe("Z");
    expect(letras[26]).toBe("AA");
    expect(letras[27]).toBe("AB");
    expect(new Set(letras).size).toBe(letras.length);
  });

  it("registrar el mismo equipo otra vez es idempotente (misma letra, nombre actualizado)", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const equipo = { id: uuid(), nombre: "Tablet", plataforma: "android" };
    const uno = await servidor.rpc<Vinculo>("unirse_a_finca", { p_finca_id: finca.fincaId, p_codigo: null, p_dispositivo: equipo, p_version_esquema: 9 }, { como: finca.cuentaId });
    const dos = await servidor.rpc<Vinculo>(
      "unirse_a_finca",
      { p_finca_id: finca.fincaId, p_codigo: null, p_dispositivo: { ...equipo, nombre: "Tablet de la sala" }, p_version_esquema: 9 },
      { como: finca.cuentaId },
    );
    expect(dos.codigo_equipo).toBe(uno.codigo_equipo);
    const lista = await servidor.rpc<{ nombre: string }[]>("listar_dispositivos", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    expect(lista).toHaveLength(2);
    expect(lista.map((d) => d.nombre)).toContain("Tablet de la sala");
  });

  it("el `id` de un equipo de otra cuenta o de otra finca da dispositivo_desconocido", async () => {
    const a = await crearFincaDePrueba(servidor);
    const b = await crearFincaDePrueba(servidor);
    await falla(
      servidor.rpc("unirse_a_finca", { p_finca_id: b.fincaId, p_codigo: null, p_dispositivo: { id: a.dispositivoId, nombre: "X" }, p_version_esquema: 9 }, { como: b.cuentaId }),
      "dispositivo_desconocido",
    );
  });

  it("listar_dispositivos: cualquier miembro; ordenados por letra; con el correo de la cuenta", async () => {
    const finca = await crearFincaDePrueba(servidor, { correo: "dueno@ejemplo.com" });
    await agregarEquipo(servidor, finca, "Portátil");
    const lista = await servidor.rpc<Record<string, unknown>[]>("listar_dispositivos", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    expect(lista.map((d) => d.codigo_equipo)).toEqual(["A", "B"]);
    expect(lista[0]).toMatchObject({ id: finca.dispositivoId, nombre: "Equipo A", plataforma: "pruebas", revocado: false, cuenta_correo: "dueno@ejemplo.com", ultima_sincronizacion_ms: null });
  });

  it("una cuenta ajena no puede listar ni revocar: finca_inexistente (igual que una finca que no existe)", async () => {
    const a = await crearFincaDePrueba(servidor);
    const b = await crearFincaDePrueba(servidor);
    await falla(servidor.rpc("listar_dispositivos", { p_finca_id: a.fincaId }, { como: b.cuentaId }), "finca_inexistente");
    await falla(servidor.rpc("listar_dispositivos", { p_finca_id: uuid() }, { como: b.cuentaId }), "finca_inexistente");
    await falla(servidor.rpc("revocar_dispositivo", { p_finca_id: a.fincaId, p_dispositivo_id: a.dispositivoId }, { como: b.cuentaId }), "finca_inexistente");
  });

  it("revocar: el equipo recibe dispositivo_revocado en sincronizar y no puede volver a registrarse; es repetible", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const b = await agregarEquipo(servidor, finca);
    expect(await servidor.rpc("revocar_dispositivo", { p_finca_id: finca.fincaId, p_dispositivo_id: b.dispositivo_id }, { como: finca.cuentaId })).toEqual({ ok: true });
    expect(await servidor.rpc("revocar_dispositivo", { p_finca_id: finca.fincaId, p_dispositivo_id: b.dispositivo_id }, { como: finca.cuentaId })).toEqual({ ok: true });
    const parametros = { p_finca_id: finca.fincaId, p_dispositivo_id: b.dispositivo_id, p_version_esquema: 9, p_desde: 0, p_cambios: [] };
    await falla(servidor.rpc("sincronizar", parametros, { como: finca.cuentaId }), "dispositivo_revocado");
    await falla(
      servidor.rpc("iniciar_descarga", { p_finca_id: finca.fincaId, p_dispositivo_id: b.dispositivo_id }, { como: finca.cuentaId }),
      "dispositivo_revocado",
    );
    await falla(
      servidor.rpc("unirse_a_finca", { p_finca_id: finca.fincaId, p_codigo: null, p_dispositivo: { id: b.dispositivo_id, nombre: "B" }, p_version_esquema: 9 }, { como: finca.cuentaId }),
      "dispositivo_revocado",
    );
    // El equipo A sigue funcionando.
    const r = await servidor.rpc("sincronizar", { ...parametros, p_dispositivo_id: finca.dispositivoId }, { como: finca.cuentaId });
    expect(r.rechazados).toEqual([]);
    const lista = await servidor.rpc<{ codigo_equipo: string; revocado: boolean }[]>("listar_dispositivos", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    expect(lista.map((d) => [d.codigo_equipo, d.revocado])).toEqual([["A", false], ["B", true]]);
  });

  it("un propietario puede revocar su propio equipo (así se desvincula); un equipo inexistente da dispositivo_desconocido", async () => {
    const finca = await crearFincaDePrueba(servidor);
    await servidor.rpc("revocar_dispositivo", { p_finca_id: finca.fincaId, p_dispositivo_id: finca.dispositivoId }, { como: finca.cuentaId });
    await falla(servidor.rpc("revocar_dispositivo", { p_finca_id: finca.fincaId, p_dispositivo_id: uuid() }, { como: finca.cuentaId }), "dispositivo_desconocido");
  });

  it("el equipo de otra cuenta no sirve para sincronizar aunque la finca sea la propia", async () => {
    const a = await crearFincaDePrueba(servidor);
    const b = await crearFincaDePrueba(servidor);
    await falla(
      servidor.rpc("sincronizar", { p_finca_id: a.fincaId, p_dispositivo_id: b.dispositivoId, p_version_esquema: 9, p_desde: 0, p_cambios: [] }, { como: a.cuentaId }),
      "dispositivo_desconocido",
    );
  });
});

describe("versión del esquema", () => {
  it("la finca parte con la versión del equipo que la crea: un equipo más antiguo recibe esquema_antiguo al unirse", async () => {
    const finca = await crearFincaDePrueba(servidor, { version: 9 });
    await falla(
      servidor.rpc("unirse_a_finca", { p_finca_id: finca.fincaId, p_codigo: null, p_dispositivo: dispositivo(), p_version_esquema: 8 }, { como: finca.cuentaId }),
      "esquema_antiguo",
    );
    expect(await servidor.sql(`select 1 from public.dispositivo`)).toHaveLength(1);
  });

  it("un equipo más nuevo sube la versión mínima de la finca", async () => {
    const finca = await crearFincaDePrueba(servidor, { version: 9 });
    const v = await servidor.rpc<Vinculo>("unirse_a_finca", { p_finca_id: finca.fincaId, p_codigo: null, p_dispositivo: dispositivo(), p_version_esquema: 11 }, { como: finca.cuentaId });
    expect(v.version_esquema_minima).toBe(11);
    await falla(
      servidor.rpc("sincronizar", { p_finca_id: finca.fincaId, p_dispositivo_id: finca.dispositivoId, p_version_esquema: 9, p_desde: 0, p_cambios: [] }, { como: finca.cuentaId }),
      "esquema_antiguo",
    );
  });

  it("el vínculo trae el seq actual y la hora del servidor", async () => {
    const finca = await crearFincaDePrueba(servidor);
    await servidor.rpc(
      "sincronizar",
      {
        p_finca_id: finca.fincaId,
        p_dispositivo_id: finca.dispositivoId,
        p_version_esquema: 9,
        p_desde: 0,
        p_cambios: [operacion({ campos: { nombre: "Luna" }, marca: marca(HORA_BASE) }), operacion({ campos: { nombre: "Sol" }, marca: marca(HORA_BASE) })],
      },
      { como: finca.cuentaId },
    );
    servidor.fijarHora(HORA_BASE + 5000);
    const v = await agregarEquipo(servidor, finca);
    expect(v.seq_actual).toBe(2);
    expect(v.hora_servidor_ms).toBe(HORA_BASE + 5000);
  });
});

describe("invitaciones", () => {
  it("crear_invitacion devuelve un código de diez caracteres del alfabeto sin confusiones y vence a las 24 horas", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const { codigo, vence_en } = await servidor.rpc<{ codigo: string; vence_en: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    expect(codigo).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    expect(Date.parse(vence_en)).toBe(HORA_BASE + 24 * 3600_000);
  });

  it("solo se guarda el SHA-256 del código normalizado, nunca el código", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const { codigo } = await servidor.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    const filas = await servidor.sql<Record<string, unknown>>(`select * from public.invitacion`);
    expect(filas).toHaveLength(1);
    expect(filas[0].codigo_hash).toBe(createHash("sha256").update(codigo.replace("-", "")).digest("hex"));
    expect(JSON.stringify(filas[0])).not.toContain(codigo.replace("-", ""));
  });

  it("los códigos no se repiten (100 invitaciones)", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const codigos = new Set<string>();
    for (let i = 0; i < 100; i++) codigos.add((await servidor.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId })).codigo);
    expect(codigos.size).toBe(100);
  });

  it("una cuenta ajena no puede invitar a una finca que no es suya: finca_inexistente", async () => {
    const a = await crearFincaDePrueba(servidor);
    const b = await crearFincaDePrueba(servidor);
    await falla(servidor.rpc("crear_invitacion", { p_finca_id: a.fincaId }, { como: b.cuentaId }), "finca_inexistente");
    await falla(servidor.rpc("crear_invitacion", { p_finca_id: uuid() }, { como: b.cuentaId }), "finca_inexistente");
  });

  it("unirse con el código: crea la membresía, registra el equipo y la finca aparece en mis_fincas", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const { codigo } = await servidor.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    const nueva = await cuentaSinAutorizar("socio@ejemplo.com"); // no hace falta estar autorizada para unirse
    const vinculo = await unirseConCodigo(nueva, codigo);
    expect(vinculo).toMatchObject({ finca_id: finca.fincaId, finca_nombre: "Aprisco de prueba", codigo_equipo: "B" });
    expect(await servidor.rpc("mis_fincas", {}, { como: nueva })).toEqual([{ finca_id: finca.fincaId, nombre: "Aprisco de prueba", rol: "propietario" }]);
    const [invitacion] = await servidor.sql<{ usada_por: string; usada_en: Date }>(`select usada_por, usada_en from public.invitacion`);
    expect(invitacion.usada_por).toBe(nueva);
    expect(invitacion.usada_en).not.toBeNull();
  });

  it("el código se acepta en minúsculas, sin guion y con espacios", async () => {
    const finca = await crearFincaDePrueba(servidor);
    for (const forma of [(c: string) => c.toLowerCase(), (c: string) => c.replace("-", ""), (c: string) => ` ${c.replace("-", " - ")} `]) {
      const { codigo } = await servidor.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
      const cuenta = await cuentaSinAutorizar(`${uuid().slice(0, 8)}@ejemplo.com`);
      const v = await unirseConCodigo(cuenta, forma(codigo));
      expect(v.finca_id).toBe(finca.fincaId);
    }
  });

  it("sirve una sola vez, aunque la use otra cuenta: codigo_invalido", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const { codigo } = await servidor.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    await unirseConCodigo(await cuentaSinAutorizar("uno@ejemplo.com"), codigo);
    expect(await unirseConCodigo(await cuentaSinAutorizar("dos@ejemplo.com"), codigo)).toEqual({ error: "codigo_invalido" });
  });

  it("vence a las 24 horas: justo antes sirve, justo después no", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const { codigo } = await servidor.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    const cuenta = await cuentaSinAutorizar("tarde@ejemplo.com");
    await servidor.fijarHora(HORA_BASE + 24 * 3600_000 + 1);
    expect(await unirseConCodigo(cuenta, codigo)).toEqual({ error: "codigo_invalido" });
    await servidor.fijarHora(HORA_BASE + 24 * 3600_000 - 1);
    expect((await unirseConCodigo(cuenta, codigo)).finca_id).toBe(finca.fincaId);
  });

  it("un código que no existe, vacío o mal escrito da siempre el mismo resultado", async () => {
    const cuenta = await cuentaSinAutorizar("x@ejemplo.com");
    for (const codigo of ["AAAAA-AAAAA", "ñ", "0123456789", "x".repeat(500)]) {
      expect(await unirseConCodigo(cuenta, codigo)).toEqual({ error: "codigo_invalido" });
    }
  });

  it("se da UNO de los dos: ni finca ni código, o los dos, es parametro_invalido", async () => {
    const finca = await crearFincaDePrueba(servidor);
    await falla(servidor.rpc("unirse_a_finca", { p_finca_id: null, p_codigo: null, p_dispositivo: dispositivo(), p_version_esquema: 9 }, { como: finca.cuentaId }), "parametro_invalido");
    await falla(servidor.rpc("unirse_a_finca", { p_finca_id: finca.fincaId, p_codigo: "ABCDE-FGHJK", p_dispositivo: dispositivo(), p_version_esquema: 9 }, { como: finca.cuentaId }), "parametro_invalido");
    await falla(servidor.rpc("unirse_a_finca", { p_finca_id: null, p_codigo: "   ", p_dispositivo: dispositivo(), p_version_esquema: 9 }, { como: finca.cuentaId }), "parametro_invalido");
  });

  it("unirse con p_finca_id sin ser miembro: finca_inexistente (no dice si existe)", async () => {
    const a = await crearFincaDePrueba(servidor);
    const cuenta = await cuentaSinAutorizar("curiosa@ejemplo.com");
    await falla(servidor.rpc("unirse_a_finca", { p_finca_id: a.fincaId, p_codigo: null, p_dispositivo: dispositivo(), p_version_esquema: 9 }, { como: cuenta }), "finca_inexistente");
    await falla(servidor.rpc("unirse_a_finca", { p_finca_id: uuid(), p_codigo: null, p_dispositivo: dispositivo(), p_version_esquema: 9 }, { como: cuenta }), "finca_inexistente");
  });

  it("si la cuenta ya era miembro, el código se consume y la membresía no cambia ni se duplica", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const { codigo } = await servidor.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    const v = await unirseConCodigo(finca.cuentaId, codigo);
    expect(v.finca_id).toBe(finca.fincaId);
    expect(await servidor.sql(`select 1 from public.membresia`)).toHaveLength(1);
  });

  it("un equipo antiguo que se une con código recibe esquema_antiguo y el código NO se consume", async () => {
    const finca = await crearFincaDePrueba(servidor, { version: 9 });
    const { codigo } = await servidor.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    const cuenta = await cuentaSinAutorizar("viejo@ejemplo.com");
    await falla(unirseConCodigo(cuenta, codigo, 8), "esquema_antiguo");
    expect(await servidor.rpc("mis_fincas", {}, { como: cuenta })).toEqual([]);
    expect((await unirseConCodigo(cuenta, codigo, 9)).finca_id).toBe(finca.fincaId);
  });
});

describe("bloqueo por intentos fallidos", () => {
  it("el contador de fallos sobrevive (no se deshace con la respuesta) y a los 5 la cuenta se bloquea una hora, incluso con un código bueno", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const { codigo } = await servidor.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    const cuenta = await cuentaSinAutorizar("insistente@ejemplo.com");
    for (let i = 1; i <= 4; i++) {
      expect(await unirseConCodigo(cuenta, "MALOS-MALOS")).toEqual({ error: "codigo_invalido" });
      expect((await servidor.sql<{ intentos_codigo: number }>(`select intentos_codigo from public.cuenta where id = $1`, [cuenta]))[0].intentos_codigo).toBe(i);
    }
    // Quinto fallo: bloqueo.
    expect(await unirseConCodigo(cuenta, "MALOS-MALOS")).toEqual({ error: "codigo_invalido" });
    const [fila] = await servidor.sql<{ bloqueo_hasta: Date }>(`select bloqueo_hasta from public.cuenta where id = $1`, [cuenta]);
    expect(fila.bloqueo_hasta.getTime()).toBe(HORA_BASE + 3600_000);
    // Bloqueada: el código bueno tampoco sirve, y sigue sin consumirse.
    expect(await unirseConCodigo(cuenta, codigo)).toEqual({ error: "codigo_invalido" });
    expect(await servidor.sql(`select 1 from public.invitacion where usada_en is not null`)).toHaveLength(0);
    await servidor.fijarHora(HORA_BASE + 3600_000 - 1);
    expect(await unirseConCodigo(cuenta, codigo)).toEqual({ error: "codigo_invalido" });
    // Vencido el bloqueo se empieza de nuevo.
    await servidor.fijarHora(HORA_BASE + 3600_000 + 1);
    expect((await unirseConCodigo(cuenta, codigo)).finca_id).toBe(finca.fincaId);
    expect((await servidor.sql<{ intentos_codigo: number; bloqueo_hasta: Date | null }>(`select intentos_codigo, bloqueo_hasta from public.cuenta where id = $1`, [cuenta]))[0]).toEqual({ intentos_codigo: 0, bloqueo_hasta: null });
  });

  it("un acierto pone el contador en cero (los fallos tienen que ser seguidos)", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const cuenta = await cuentaSinAutorizar("constante@ejemplo.com");
    for (let ronda = 0; ronda < 3; ronda++) {
      for (let i = 0; i < 4; i++) await unirseConCodigo(cuenta, "MALOS-MALOS");
      const { codigo } = await servidor.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
      expect((await unirseConCodigo(cuenta, codigo)).finca_id).toBe(finca.fincaId);
    }
    expect((await servidor.sql<{ bloqueo_hasta: Date | null }>(`select bloqueo_hasta from public.cuenta where id = $1`, [cuenta]))[0].bloqueo_hasta).toBeNull();
  });

  it("el bloqueo es de la cuenta que falla: otra cuenta no se ve afectada", async () => {
    const finca = await crearFincaDePrueba(servidor);
    const mala = await cuentaSinAutorizar("mala@ejemplo.com");
    for (let i = 0; i < 5; i++) await unirseConCodigo(mala, "MALOS-MALOS");
    const { codigo } = await servidor.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    const buena = await cuentaSinAutorizar("buena@ejemplo.com");
    expect((await unirseConCodigo(buena, codigo)).finca_id).toBe(finca.fincaId);
  });
});
