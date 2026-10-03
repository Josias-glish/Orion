// Aislamiento entre cuentas y fincas, a nivel de base de datos (docs/SINCRONIZACION.md, secciones 11 y 16; PROTOCOLO.md, sección 1).
//
// Qué se prueba:
//  1. Cada función pública, llamada por una cuenta que NO es de la finca, falla con `finca_inexistente` (el mismo error que una finca que
//     no existe: no se revela nada), y no cambia ni una fila. Llamada por `anon`, falla por falta de permiso (SQLSTATE 42501).
//  2. Ninguna tabla se puede leer ni escribir directamente con los roles `authenticated` y `anon`, y las funciones auxiliares de
//     `interno` tampoco se pueden ejecutar.
//  3. Un equipo revocado no puede llamar nada; un miembro que no es propietario no puede invitar ni revocar.
//
// LIMITACIÓN DEL DOBLE DE SUPABASE (servidor/pruebas/ayudas.ts): PGlite sí distingue los roles (`set local role anon|authenticated`) y
// aplica los permisos de GRANT/REVOKE y la RLS a quien no es dueño de la tabla, igual que Postgres. Lo que el doble NO imita es PostgREST:
// no hay capa HTTP, ni la verificación del JWT (la prueba pone `request.jwt.claims` a mano, como lo haría PostgREST después de validar
// la firma), ni el rol `service_role` (que en Supabase se salta la RLS y no debe salir del panel). Por eso estas pruebas demuestran que
// la base protege los datos aunque alguien tenga la clave pública del proyecto, pero no sustituyen una revisión en el proyecto real
// (docs/PRUEBAS.md).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ErrorDeServidor,
  VERSION_ESQUEMA_DE_PRUEBA,
  agregarEquipo,
  crearFincaDePrueba,
  crearServidorDePrueba,
  marca,
  operacion,
  sincronizarComo,
  uuid,
  HORA_BASE,
  type FincaDePrueba,
  type ServidorDePrueba,
} from "./ayudas";

let servidor: ServidorDePrueba;
/** La cuenta A con su finca y su primer equipo. */
let a: FincaDePrueba;
/** La cuenta B, de otra finca (otra cuenta, otro aprisco). */
let b: FincaDePrueba;

beforeAll(async () => {
  servidor = await crearServidorDePrueba();
});
afterAll(async () => {
  await servidor.cerrar();
});
beforeEach(async () => {
  await servidor.reiniciar();
  a = await crearFincaDePrueba(servidor, { correo: "a@ejemplo.com", nombre: "Finca de A" });
  b = await crearFincaDePrueba(servidor, { correo: "b@ejemplo.com", nombre: "Finca de B" });
});

async function falla(promesa: Promise<unknown>, codigo: string, sqlstate = "P0001"): Promise<void> {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `debía fallar con ${codigo}`).toBeInstanceOf(ErrorDeServidor);
  expect((error as ErrorDeServidor).codigo).toBe(codigo);
  expect((error as ErrorDeServidor).sqlstate).toBe(sqlstate);
}

/** Falla por falta de permiso de Postgres (42501), sin importar el texto (que cambia según el objeto). */
async function sinPermiso(promesa: Promise<unknown>, contexto: string): Promise<void> {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `${contexto}: debía fallar`).toBeInstanceOf(ErrorDeServidor);
  expect((error as ErrorDeServidor).sqlstate, `${contexto}: ${(error as ErrorDeServidor).message}`).toBe("42501");
}

// ---------------------------------------------------------------------------------------------------------------------------
// Las funciones públicas (todas las de PROTOCOLO.md que reciben una finca)
// ---------------------------------------------------------------------------------------------------------------------------

interface Objetivo {
  /** La finca y el equipo de una cuenta. */
  fincaId: string;
  dispositivoId: string;
}

interface FuncionPublica {
  nombre: string;
  /** ¿Recibe `p_dispositivo_id` como equipo que llama? (`revocar_dispositivo` lo recibe, pero como objetivo.) */
  conEquipo: boolean;
  parametros(o: Objetivo): Record<string, unknown>;
}

const unaOperacion = () =>
  operacion({ operacion: "crear", entidad: "animal", registro_id: uuid(), campos: { nombre: "Intrusa" }, marca: marca(HORA_BASE - 60_000) });

const FUNCIONES: FuncionPublica[] = [
  {
    nombre: "sincronizar",
    conEquipo: true,
    parametros: (o) => ({
      p_finca_id: o.fincaId,
      p_dispositivo_id: o.dispositivoId,
      p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA,
      p_desde: 0,
      p_cambios: [unaOperacion()],
      p_limite: 500,
    }),
  },
  { nombre: "resumen_finca", conEquipo: true, parametros: (o) => ({ p_finca_id: o.fincaId, p_dispositivo_id: o.dispositivoId }) },
  { nombre: "iniciar_descarga", conEquipo: true, parametros: (o) => ({ p_finca_id: o.fincaId, p_dispositivo_id: o.dispositivoId }) },
  {
    nombre: "descargar_pagina",
    conEquipo: true,
    parametros: (o) => ({ p_finca_id: o.fincaId, p_dispositivo_id: o.dispositivoId, p_entidad: "animal", p_despues_de: null, p_limite: 500 }),
  },
  { nombre: "crear_invitacion", conEquipo: false, parametros: (o) => ({ p_finca_id: o.fincaId }) },
  { nombre: "listar_dispositivos", conEquipo: false, parametros: (o) => ({ p_finca_id: o.fincaId }) },
  {
    nombre: "revocar_dispositivo",
    conEquipo: false,
    parametros: (o) => ({ p_finca_id: o.fincaId, p_dispositivo_id: o.dispositivoId }),
  },
  {
    nombre: "unirse_a_finca",
    conEquipo: false,
    parametros: (o) => ({
      p_finca_id: o.fincaId,
      p_codigo: null,
      p_dispositivo: { id: uuid(), nombre: "Equipo intruso", plataforma: "pruebas" },
      p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA,
    }),
  },
  {
    nombre: "emitir_registros",
    conEquipo: true,
    parametros: (o) => ({
      p_finca_id: o.fincaId,
      p_dispositivo_id: o.dispositivoId,
      p_cambio_id: uuid(),
      p_registros: [
        {
          registro_id: uuid(),
          animal_id: uuid(),
          libro_id: uuid(),
          fecha_registro: "2026-10-02",
          instantanea: JSON.stringify({ numero: null, version: 1 }),
          responsable: null,
          observaciones: null,
        },
      ],
    }),
  },
  {
    nombre: "reemitir_registro",
    conEquipo: true,
    parametros: (o) => ({
      p_finca_id: o.fincaId,
      p_dispositivo_id: o.dispositivoId,
      p_cambio_id: uuid(),
      p_registro_id: uuid(),
      p_version_base: 1,
      p_campos: { instantanea: JSON.stringify({ numero: "X-0001", version: 2 }) },
    }),
  },
  {
    nombre: "anular_registro",
    conEquipo: true,
    parametros: (o) => ({ p_finca_id: o.fincaId, p_dispositivo_id: o.dispositivoId, p_cambio_id: uuid(), p_registro_id: uuid(), p_motivo: "Prueba" }),
  },
  {
    nombre: "fijar_siguiente_numero",
    conEquipo: true,
    parametros: (o) => ({ p_finca_id: o.fincaId, p_dispositivo_id: o.dispositivoId, p_cambio_id: uuid(), p_libro_id: uuid(), p_valor: 100 }),
  },
  {
    nombre: "importar_registros_emitidos",
    conEquipo: true,
    parametros: (o) => ({
      p_finca_id: o.fincaId,
      p_dispositivo_id: o.dispositivoId,
      p_cambio_id: uuid(),
      p_registros: [{ registro_id: uuid(), campos: { libro_id: uuid(), consecutivo: 1, numero: "X-0001", estado: "emitido", instantanea: "{}" }, marca: marca(HORA_BASE - 1000) }],
    }),
  },
];

/** Una huella de todo el contenido de las tablas del servidor: si algo cambia (una fila de más, una columna distinta), cambia. */
async function huellaDeLasTablas(): Promise<Record<string, string>> {
  const tablas = ["cuenta", "cuenta_autorizada", "finca_servidor", "membresia", "dispositivo", "invitacion", "cambio", "registro", "libro_numeracion", "llamada_arbitrada"];
  const huellas: Record<string, string> = {};
  for (const tabla of tablas) {
    const filas = await servidor.sql<{ h: string }>(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h from public.${tabla} t`);
    huellas[tabla] = filas[0].h;
  }
  return huellas;
}

describe("funciones públicas: otra cuenta", () => {
  it("la lista cubre todas las funciones públicas que reciben una finca", async () => {
    // Si se agrega una función pública a una migración, esta prueba obliga a agregarla a la lista de arriba.
    const filas = await servidor.sql<{ nombre: string }>(
      `select p.proname as nombre
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
        order by 1`,
    );
    const sinFinca = ["registrar_cuenta", "crear_finca", "mis_fincas"];
    const conFinca = filas.map((f) => f.nombre).filter((nombre) => !sinFinca.includes(nombre));
    expect(conFinca).toEqual(FUNCIONES.map((f) => f.nombre).sort());
    expect(filas.map((f) => f.nombre)).toEqual(expect.arrayContaining(sinFinca));
  });

  for (const funcion of FUNCIONES) {
    it(`${funcion.nombre}: la cuenta B no puede usar la finca de A (mismo error que una finca que no existe) y no cambia nada`, async () => {
      const antes = await huellaDeLasTablas();
      // Con el equipo de A y con el equipo de B: da igual, la finca no es suya.
      await falla(servidor.rpc(funcion.nombre, funcion.parametros({ fincaId: a.fincaId, dispositivoId: a.dispositivoId }), { como: b.cuentaId }), "finca_inexistente");
      await falla(servidor.rpc(funcion.nombre, funcion.parametros({ fincaId: a.fincaId, dispositivoId: b.dispositivoId }), { como: b.cuentaId }), "finca_inexistente");
      // Una finca que no existe da exactamente el mismo error: no se puede averiguar si una finca existe.
      await falla(servidor.rpc(funcion.nombre, funcion.parametros({ fincaId: uuid(), dispositivoId: b.dispositivoId }), { como: b.cuentaId }), "finca_inexistente");
      expect(await huellaDeLasTablas()).toEqual(antes);
    });

    it(`${funcion.nombre}: sin sesión (anon) no se puede ejecutar`, async () => {
      const antes = await huellaDeLasTablas();
      await sinPermiso(servidor.rpc(funcion.nombre, funcion.parametros({ fincaId: a.fincaId, dispositivoId: a.dispositivoId }), { como: "anon" }), funcion.nombre);
      expect(await huellaDeLasTablas()).toEqual(antes);
    });

    if (funcion.conEquipo) {
      it(`${funcion.nombre}: un equipo de otra finca (o de otra cuenta) no vale, aunque la finca sea de quien llama`, async () => {
        const antes = await huellaDeLasTablas();
        // B llama a SU finca con el equipo de A.
        await falla(
          servidor.rpc(funcion.nombre, funcion.parametros({ fincaId: b.fincaId, dispositivoId: a.dispositivoId }), { como: b.cuentaId }),
          "dispositivo_desconocido",
        );
        // Un equipo que no existe.
        await falla(
          servidor.rpc(funcion.nombre, funcion.parametros({ fincaId: b.fincaId, dispositivoId: uuid() }), { como: b.cuentaId }),
          "dispositivo_desconocido",
        );
        expect(await huellaDeLasTablas()).toEqual(antes);
      });
    }
  }

  it("revocar_dispositivo: el equipo de A queda intacto tras el intento de B", async () => {
    await falla(servidor.rpc("revocar_dispositivo", { p_finca_id: a.fincaId, p_dispositivo_id: a.dispositivoId }, { como: b.cuentaId }), "finca_inexistente");
    const filas = await servidor.sql<{ revocado_en: string | null }>(`select revocado_en from public.dispositivo where id = $1`, [a.dispositivoId]);
    expect(filas[0].revocado_en).toBeNull();
    // Y A sigue pudiendo sincronizar.
    await expect(sincronizarComo(servidor, a, [])).resolves.toBeTruthy();
  });

  it("unirse_a_finca por finca_id: B no se vuelve miembro de la finca de A", async () => {
    await falla(
      servidor.rpc(
        "unirse_a_finca",
        { p_finca_id: a.fincaId, p_codigo: null, p_dispositivo: { id: uuid(), nombre: "Intruso", plataforma: "x" }, p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA },
        { como: b.cuentaId },
      ),
      "finca_inexistente",
    );
    const miembros = await servidor.sql<{ cuenta_id: string }>(`select cuenta_id from public.membresia where finca_id = $1`, [a.fincaId]);
    expect(miembros.map((m) => m.cuenta_id)).toEqual([a.cuentaId]);
  });

  it("los datos de A no aparecen en ninguna respuesta de B sobre su propia finca", async () => {
    await sincronizarComo(servidor, a, [operacion({ operacion: "crear", entidad: "animal", registro_id: "secreto-de-a", campos: { nombre: "Solo de A" }, marca: marca(HORA_BASE - 60_000) })]);
    const mia = { p_finca_id: b.fincaId, p_dispositivo_id: b.dispositivoId };

    const respuesta = await sincronizarComo(servidor, b, [], { desde: 0 });
    expect(respuesta.cambios).toEqual([]);
    expect(respuesta.seq_siguiente).toBe(0);

    const inicio = await servidor.rpc("iniciar_descarga", mia, { como: b.cuentaId });
    expect(inicio.conteos).toEqual({});
    const pagina = await servidor.rpc("descargar_pagina", { ...mia, p_entidad: "animal", p_despues_de: null, p_limite: 500 }, { como: b.cuentaId });
    expect(pagina).toEqual({ registros: [], siguiente: null });
    const resumen = await servidor.rpc("resumen_finca", mia, { como: b.cuentaId });
    expect(resumen.entidades).toEqual([]);

    const dispositivos = await servidor.rpc("listar_dispositivos", { p_finca_id: b.fincaId }, { como: b.cuentaId });
    expect(dispositivos.map((d: { id: string }) => d.id)).toEqual([b.dispositivoId]);
    const fincas = await servidor.rpc("mis_fincas", {}, { como: b.cuentaId });
    expect(fincas).toEqual([{ finca_id: b.fincaId, nombre: "Finca de B", rol: "propietario" }]);
    // El correo de A solo se ve en las listas de la finca de A.
    expect(JSON.stringify(dispositivos)).not.toContain("a@ejemplo.com");
  });

  it("una cuenta con dos fincas no mezcla los equipos de una con la otra", async () => {
    const segundaFinca = uuid();
    const segundoEquipo = uuid();
    await servidor.rpc(
      "crear_finca",
      { p_finca_id: segundaFinca, p_nombre: "Segunda finca de A", p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA, p_dispositivo: { id: segundoEquipo, nombre: "Equipo A2", plataforma: "x" } },
      { como: a.cuentaId },
    );
    // El equipo de la primera finca no vale en la segunda, ni al revés (misma cuenta, otra finca).
    await falla(
      servidor.rpc("resumen_finca", { p_finca_id: segundaFinca, p_dispositivo_id: a.dispositivoId }, { como: a.cuentaId }),
      "dispositivo_desconocido",
    );
    await falla(
      servidor.rpc("resumen_finca", { p_finca_id: a.fincaId, p_dispositivo_id: segundoEquipo }, { como: a.cuentaId }),
      "dispositivo_desconocido",
    );
    // Y no se puede registrar el mismo id de equipo en la otra finca (ni en una finca de otra cuenta).
    await falla(
      servidor.rpc(
        "unirse_a_finca",
        { p_finca_id: segundaFinca, p_codigo: null, p_dispositivo: { id: a.dispositivoId, nombre: "x", plataforma: "x" }, p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA },
        { como: a.cuentaId },
      ),
      "dispositivo_desconocido",
    );
  });

  it("B no puede quedarse con el equipo de A registrándolo en su finca", async () => {
    await falla(
      servidor.rpc(
        "unirse_a_finca",
        { p_finca_id: b.fincaId, p_codigo: null, p_dispositivo: { id: a.dispositivoId, nombre: "robado", plataforma: "x" }, p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA },
        { como: b.cuentaId },
      ),
      "dispositivo_desconocido",
    );
    const filas = await servidor.sql<{ finca_id: string; cuenta_id: string }>(`select finca_id, cuenta_id from public.dispositivo where id = $1`, [a.dispositivoId]);
    expect(filas).toEqual([{ finca_id: a.fincaId, cuenta_id: a.cuentaId }]);
  });

  it("crear_finca con el id de una finca ajena: no la toca ni revela nada a quien no está autorizado", async () => {
    const intrusa = await servidor.crearCuenta("intrusa@ejemplo.com"); // existe, pero no está en cuenta_autorizada
    const antes = await huellaDeLasTablas();
    await falla(
      servidor.rpc(
        "crear_finca",
        { p_finca_id: a.fincaId, p_nombre: "Mía ahora", p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA, p_dispositivo: { id: uuid(), nombre: "x", plataforma: "x" } },
        { como: intrusa },
      ),
      "no_autorizada",
    );
    // Quien sí está autorizada (B) solo recibe «finca_existente» y la finca de A sigue siendo de A.
    await falla(
      servidor.rpc(
        "crear_finca",
        { p_finca_id: a.fincaId, p_nombre: "Mía ahora", p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA, p_dispositivo: { id: uuid(), nombre: "x", plataforma: "x" } },
        { como: b.cuentaId },
      ),
      "finca_existente",
    );
    const despues = await huellaDeLasTablas();
    // `cuenta` cambia (la intrusa se registra) pero nada de la finca de A.
    expect({ ...despues, cuenta: "" }).toEqual({ ...antes, cuenta: "" });
    const finca = await servidor.sql<{ nombre: string; creada_por: string }>(`select nombre, creada_por from public.finca_servidor where id = $1`, [a.fincaId]);
    expect(finca).toEqual([{ nombre: "Finca de A", creada_por: a.cuentaId }]);
  });

  it("la cuenta de una intrusa que no es de ninguna finca no puede usar ninguna función con fincas ajenas", async () => {
    const sola = await servidor.crearCuenta("sola@ejemplo.com");
    await servidor.rpc("registrar_cuenta", {}, { como: sola });
    expect(await servidor.rpc("mis_fincas", {}, { como: sola })).toEqual([]);
    for (const funcion of FUNCIONES) {
      await falla(servidor.rpc(funcion.nombre, funcion.parametros({ fincaId: a.fincaId, dispositivoId: a.dispositivoId }), { como: sola }), "finca_inexistente");
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Las tablas, los privilegios y la RLS
// ---------------------------------------------------------------------------------------------------------------------------

const TABLAS = ["cambio", "registro", "dispositivo", "membresia", "invitacion", "finca_servidor", "cuenta", "libro_numeracion", "llamada_arbitrada", "cuenta_autorizada"];
/** Una columna de cada tabla para probar `update` (un `update` necesita una columna que exista). */
const COLUMNA_DE: Record<string, string> = {
  cambio: "cambio_id",
  registro: "registro_id",
  dispositivo: "nombre",
  membresia: "rol",
  invitacion: "rol",
  finca_servidor: "nombre",
  cuenta: "correo",
  libro_numeracion: "siguiente",
  llamada_arbitrada: "funcion",
  cuenta_autorizada: "correo",
};

describe("tablas: ni lectura ni escritura directa", () => {
  for (const rol of ["authenticated", "anon"] as const) {
    for (const tabla of TABLAS) {
      it(`${rol} no puede leer ni escribir public.${tabla}`, async () => {
        const actor = rol === "anon" ? "anon" : a.cuentaId;
        const sesion = servidor.como(actor);
        await sinPermiso(sesion.sql(`select * from public.${tabla}`), `select ${tabla}`);
        await sinPermiso(sesion.sql(`select count(*) from public.${tabla}`), `count ${tabla}`);
        await sinPermiso(sesion.sql(`insert into public.${tabla} default values`), `insert ${tabla}`);
        await sinPermiso(sesion.sql(`update public.${tabla} set ${COLUMNA_DE[tabla]} = ${COLUMNA_DE[tabla]}`), `update ${tabla}`);
        await sinPermiso(sesion.sql(`delete from public.${tabla}`), `delete ${tabla}`);
        await sinPermiso(sesion.sql(`truncate public.${tabla}`), `truncate ${tabla}`);
      });
    }
  }

  it("la secuencia de cambio.seq tampoco se puede tocar", async () => {
    for (const actor of [a.cuentaId, "anon"]) {
      const sesion = servidor.como(actor);
      await sinPermiso(sesion.sql(`select nextval(pg_get_serial_sequence('public.cambio', 'seq'))`), "nextval");
      await sinPermiso(sesion.sql(`select setval(pg_get_serial_sequence('public.cambio', 'seq'), 1)`), "setval");
    }
  });

  it("ni siquiera hay permisos por columna (privilegios revisados en el catálogo de Postgres)", async () => {
    const filas = await servidor.sql<{ rol: string; tabla: string; tabla_ok: boolean; columnas_ok: boolean }>(
      `select r.rol, c.relname as tabla,
              has_table_privilege(r.rol, c.oid, 'select,insert,update,delete,truncate,references,trigger') as tabla_ok,
              has_any_column_privilege(r.rol, c.oid, 'select,insert,update,references') as columnas_ok
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         cross join (values ('anon'), ('authenticated')) as r(rol)
        where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
        order by 2, 1`,
    );
    expect(filas.map((f) => f.tabla)).toEqual(expect.arrayContaining(TABLAS));
    // Ninguna tabla, vista ni vista materializada de `public` (la lista sale del catálogo: una tabla nueva queda cubierta sola).
    expect(filas.filter((f) => f.tabla_ok || f.columnas_ok)).toEqual([]);
    const secuencias = await servidor.sql<{ rol: string; secuencia: string; ok: boolean }>(
      `select r.rol, c.relname as secuencia, has_sequence_privilege(r.rol, c.oid, 'usage,select,update') as ok
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         cross join (values ('anon'), ('authenticated')) as r(rol)
        where n.nspname in ('public', 'interno') and c.relkind = 'S'`,
    );
    expect(secuencias.length).toBeGreaterThan(0);
    expect(secuencias.filter((s) => s.ok)).toEqual([]);
  });

  it("todas las tablas tienen RLS activa y ninguna tiene políticas", async () => {
    const filas = await servidor.sql<{ tabla: string; rls: boolean }>(
      `select c.relname as tabla, c.relrowsecurity as rls
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    expect(filas.map((f) => f.tabla).sort()).toEqual([...TABLAS].sort());
    expect(filas.filter((f) => !f.rls)).toEqual([]);
    const politicas = await servidor.sql(`select tablename, policyname from pg_policies where schemaname = 'public'`);
    expect(politicas).toEqual([]);
  });

  it("segunda barrera: aunque un descuido le diera todos los permisos a `authenticated`, la RLS sin políticas no deja ver ni escribir nada", async () => {
    await sincronizarComo(servidor, a, [operacion({ operacion: "crear", entidad: "animal", registro_id: uuid(), campos: { nombre: "Luna" }, marca: marca(HORA_BASE - 60_000) })]);
    const lista = TABLAS.map((t) => `public.${t}`).join(", ");
    await servidor.sql(`grant all on ${lista} to authenticated, anon`);
    try {
      for (const actor of [a.cuentaId, b.cuentaId, "anon"]) {
        const sesion = servidor.como(actor);
        for (const tabla of TABLAS) {
          expect(await sesion.sql(`select * from public.${tabla}`), `${actor} lee ${tabla}`).toEqual([]);
          // update y delete no ven ninguna fila: no afectan ninguna.
          expect(await sesion.sql(`with t as (update public.${tabla} set ${COLUMNA_DE[tabla]} = ${COLUMNA_DE[tabla]} returning 1) select count(*)::int as n from t`)).toEqual([{ n: 0 }]);
          expect(await sesion.sql(`with t as (delete from public.${tabla} returning 1) select count(*)::int as n from t`)).toEqual([{ n: 0 }]);
          // insert: la RLS lo rechaza (42501) antes de revisar las demás reglas de la fila.
          await sinPermiso(sesion.sql(`insert into public.${tabla} default values`), `insert ${tabla} como ${actor}`);
        }
      }
    } finally {
      await servidor.sql(`revoke all on ${lista} from authenticated, anon`);
    }
    // Y los datos siguen ahí (como administrador).
    expect(Number((await servidor.sql<{ n: number }>(`select count(*)::int as n from public.cambio`))[0].n)).toBe(1);
  });
});

describe("funciones: solo las públicas se ejecutan, y todas con search_path vacío", () => {
  const PUBLICAS = [
    "anular_registro",
    "crear_finca",
    "crear_invitacion",
    "descargar_pagina",
    "emitir_registros",
    "fijar_siguiente_numero",
    "importar_registros_emitidos",
    "iniciar_descarga",
    "listar_dispositivos",
    "mis_fincas",
    "reemitir_registro",
    "registrar_cuenta",
    "resumen_finca",
    "revocar_dispositivo",
    "sincronizar",
    "unirse_a_finca",
  ];

  it("`anon` no puede ejecutar ninguna función de public ni de interno, y `authenticated` solo las del protocolo (más la de la política de Storage)", async () => {
    const filas = await servidor.sql<{ esquema: string; nombre: string; anon: boolean; autenticada: boolean }>(
      `select n.nspname as esquema, p.proname as nombre,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as autenticada
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'interno')
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        order by 1, 2`,
    );
    expect(filas.length).toBeGreaterThan(30);
    expect(filas.filter((f) => f.anon)).toEqual([]);
    const concedidas = filas.filter((f) => f.autenticada).map((f) => `${f.esquema}.${f.nombre}`);
    expect(concedidas.sort()).toEqual([...PUBLICAS.map((n) => `public.${n}`), "interno.es_miembro_de_finca"].sort());
  });

  it("las funciones públicas son `security definer` con search_path vacío; las auxiliares no están al alcance de la API", async () => {
    const filas = await servidor.sql<{ nombre: string; definer: boolean; config: string[] | null }>(
      `select p.proname as nombre, p.prosecdef as definer, p.proconfig as config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any($1)`,
      [PUBLICAS],
    );
    expect(filas.map((f) => f.nombre).sort()).toEqual([...PUBLICAS].sort());
    for (const fila of filas) {
      expect(fila.definer, `${fila.nombre} debe ser security definer`).toBe(true);
      expect(fila.config?.some((c) => /^search_path=("")?$/.test(c)), `${fila.nombre} debe fijar search_path vacío (${fila.config})`).toBe(true);
    }
  });

  it("una cuenta no puede llamar a las funciones auxiliares de `interno` ni al reloj", async () => {
    const sesion = servidor.como(a.cuentaId);
    await sinPermiso(sesion.sql(`select interno.exigir_miembro($1::uuid)`, [a.fincaId]), "interno.exigir_miembro");
    await sinPermiso(sesion.sql(`select interno.candado_de_finca($1::uuid)`, [a.fincaId]), "interno.candado_de_finca");
    await sinPermiso(sesion.sql(`select public.ahora_servidor()`), "ahora_servidor");
    await sinPermiso(sesion.sql(`select public.marca_maxima('{}'::jsonb)`), "marca_maxima");
    // `anon` ni siquiera puede entrar al esquema `interno`.
    await sinPermiso(servidor.como("anon").sql(`select interno.a_uuid('x')`), "anon interno");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Equipos revocados y roles
// ---------------------------------------------------------------------------------------------------------------------------

describe("equipo revocado", () => {
  it("no puede llamar nada que lo mencione; el otro equipo de la misma cuenta sigue funcionando", async () => {
    const equipoB = await agregarEquipo(servidor, a, "Equipo B de A");
    await servidor.rpc("revocar_dispositivo", { p_finca_id: a.fincaId, p_dispositivo_id: equipoB.dispositivo_id }, { como: a.cuentaId });

    const antes = await huellaDeLasTablas();
    for (const funcion of FUNCIONES.filter((f) => f.conEquipo)) {
      await falla(
        servidor.rpc(funcion.nombre, funcion.parametros({ fincaId: a.fincaId, dispositivoId: equipoB.dispositivo_id }), { como: a.cuentaId }),
        "dispositivo_revocado",
      );
    }
    // Tampoco puede volver a registrarse con el mismo id (unirse_a_finca por finca ni crear_finca de nuevo).
    await falla(
      servidor.rpc(
        "unirse_a_finca",
        { p_finca_id: a.fincaId, p_codigo: null, p_dispositivo: { id: equipoB.dispositivo_id, nombre: "otra vez", plataforma: "x" }, p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA },
        { como: a.cuentaId },
      ),
      "dispositivo_revocado",
    );
    await falla(
      servidor.rpc(
        "crear_finca",
        { p_finca_id: a.fincaId, p_nombre: "x", p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA, p_dispositivo: { id: equipoB.dispositivo_id, nombre: "x", plataforma: "x" } },
        { como: a.cuentaId },
      ),
      "dispositivo_revocado",
    );
    expect(await huellaDeLasTablas()).toEqual(antes);

    // El primer equipo sigue sirviendo.
    await expect(sincronizarComo(servidor, a, [])).resolves.toBeTruthy();
    const lista = await servidor.rpc("listar_dispositivos", { p_finca_id: a.fincaId }, { como: a.cuentaId });
    expect(lista.map((d: { id: string; revocado: boolean }) => [d.id, d.revocado])).toEqual([
      [a.dispositivoId, false],
      [equipoB.dispositivo_id, true],
    ]);
  });

  it("un equipo puede revocarse a sí mismo (desvincular) y desde ese momento no llama nada", async () => {
    await servidor.rpc("revocar_dispositivo", { p_finca_id: a.fincaId, p_dispositivo_id: a.dispositivoId }, { como: a.cuentaId });
    for (const funcion of FUNCIONES.filter((f) => f.conEquipo)) {
      await falla(servidor.rpc(funcion.nombre, funcion.parametros({ fincaId: a.fincaId, dispositivoId: a.dispositivoId }), { como: a.cuentaId }), "dispositivo_revocado");
    }
  });

  it("revocar dos veces no cambia la fecha de la primera revocación", async () => {
    const llamada = { p_finca_id: a.fincaId, p_dispositivo_id: a.dispositivoId };
    await servidor.rpc("revocar_dispositivo", llamada, { como: a.cuentaId });
    const [primera] = await servidor.sql<{ revocado_en: string }>(`select revocado_en::text from public.dispositivo where id = $1`, [a.dispositivoId]);
    await servidor.avanzarHora(60_000);
    await servidor.rpc("revocar_dispositivo", llamada, { como: a.cuentaId });
    const [segunda] = await servidor.sql<{ revocado_en: string }>(`select revocado_en::text from public.dispositivo where id = $1`, [a.dispositivoId]);
    expect(segunda.revocado_en).toBe(primera.revocado_en);
  });

  it("revocar un equipo que no existe o es de otra finca: dispositivo_desconocido (y el de la otra finca no se toca)", async () => {
    await falla(servidor.rpc("revocar_dispositivo", { p_finca_id: a.fincaId, p_dispositivo_id: uuid() }, { como: a.cuentaId }), "dispositivo_desconocido");
    await falla(servidor.rpc("revocar_dispositivo", { p_finca_id: a.fincaId, p_dispositivo_id: b.dispositivoId }, { como: a.cuentaId }), "dispositivo_desconocido");
    const [fila] = await servidor.sql<{ revocado_en: string | null }>(`select revocado_en from public.dispositivo where id = $1`, [b.dispositivoId]);
    expect(fila.revocado_en).toBeNull();
  });
});

describe("miembro que no es propietario", () => {
  // Hoy el servidor solo tiene el rol `propietario` (un `check` lo exige; los demás roles son de la Etapa 14). Para probar que las
  // funciones miran el rol y no solo la membresía, la prueba amplía el `check` por un momento, crea a un miembro `lector` y lo restaura.
  async function conMiembroLector(prueba: (lectorId: string, dispositivoId: string) => Promise<void>): Promise<void> {
    const lectorId = await servidor.crearCuenta("lector@ejemplo.com");
    await servidor.rpc("registrar_cuenta", {}, { como: lectorId });
    const dispositivoId = uuid();
    await servidor.sql(`alter table public.membresia drop constraint membresia_rol_check`);
    try {
      await servidor.sql(`alter table public.membresia add constraint membresia_rol_check check (rol in ('propietario', 'lector'))`);
      await servidor.sql(`insert into public.membresia (cuenta_id, finca_id, rol) values ($1, $2, 'lector')`, [lectorId, a.fincaId]);
      // Se registra su equipo como lo haría `unirse_a_finca` (ya es miembro).
      await servidor.rpc(
        "unirse_a_finca",
        { p_finca_id: a.fincaId, p_codigo: null, p_dispositivo: { id: dispositivoId, nombre: "Equipo del lector", plataforma: "x" }, p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA },
        { como: lectorId },
      );
      await prueba(lectorId, dispositivoId);
    } finally {
      await servidor.sql(`delete from public.membresia where rol = 'lector'`).catch(() => undefined);
      await servidor.sql(`alter table public.membresia drop constraint if exists membresia_rol_check`);
      await servidor.sql(`alter table public.membresia add constraint membresia_rol_check check (rol in ('propietario'))`);
    }
  }

  it("no puede crear invitaciones ni revocar equipos, pero sí leer la lista de equipos y sincronizar", async () => {
    // `delete` está bloqueado por disparador solo en tablas de historial; `membresia` admite el borrado de la limpieza de arriba.
    await conMiembroLector(async (lectorId, dispositivoId) => {
      const antes = await huellaDeLasTablas();
      await falla(servidor.rpc("crear_invitacion", { p_finca_id: a.fincaId }, { como: lectorId }), "sin_permiso");
      await falla(servidor.rpc("revocar_dispositivo", { p_finca_id: a.fincaId, p_dispositivo_id: a.dispositivoId }, { como: lectorId }), "sin_permiso");
      // Ni siquiera su propio equipo.
      await falla(servidor.rpc("revocar_dispositivo", { p_finca_id: a.fincaId, p_dispositivo_id: dispositivoId }, { como: lectorId }), "sin_permiso");
      expect(await huellaDeLasTablas()).toEqual(antes);

      const lista = await servidor.rpc("listar_dispositivos", { p_finca_id: a.fincaId }, { como: lectorId });
      expect(lista).toHaveLength(2);
      await expect(
        sincronizarComo(servidor, { cuentaId: lectorId, fincaId: a.fincaId, dispositivoId }, []),
      ).resolves.toBeTruthy();
    });
    // Después de la prueba, todo vuelve a ser como era: solo el propietario.
    const roles = await servidor.sql<{ rol: string }>(`select distinct rol from public.membresia`);
    expect(roles).toEqual([{ rol: "propietario" }]);
  });

  it("una invitación canjeada conserva el rol que traía y nunca sube de propietario a lector ni al revés por el canje", async () => {
    // El rol de una invitación sale de `invitacion.rol` (hoy siempre propietario); quien ya era miembro no cambia de rol al canjear otro código.
    const invitacion = await servidor.rpc("crear_invitacion", { p_finca_id: a.fincaId }, { como: a.cuentaId });
    const vinculo = await servidor.rpc(
      "unirse_a_finca",
      { p_finca_id: null, p_codigo: invitacion.codigo, p_dispositivo: { id: uuid(), nombre: "Equipo de A, otra vez", plataforma: "x" }, p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA },
      { como: a.cuentaId },
    );
    expect(vinculo.finca_id).toBe(a.fincaId);
    const roles = await servidor.sql<{ rol: string }>(`select rol from public.membresia where cuenta_id = $1 and finca_id = $2`, [a.cuentaId, a.fincaId]);
    expect(roles).toEqual([{ rol: "propietario" }]);
  });
});
