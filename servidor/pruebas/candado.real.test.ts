// El candado de la finca con un Postgres REAL (docs/SINCRONIZACION.md, sección 16; PROTOCOLO.md, secciones 5 y 6).
//
// PGlite tiene una sola conexión y no puede probar concurrencia de verdad. Esta prueba abre varias conexiones a un Postgres de verdad y
// comprueba que `pg_advisory_xact_lock(hashtext('finca:' || finca_id))` serializa a quienes escriben en la misma finca:
//   - los números de registro son consecutivos y no se repiten;
//   - `cambio.seq` crece en el orden en que se confirman las transacciones;
//   - quien espera el candado, cuando entra, ve lo que confirmó quien lo tenía;
//   - fincas distintas no se esperan entre sí;
//   - un reintento simultáneo con el mismo `p_cambio_id` no consume otro número.
//
// SE SALTA SOLA si no existe la variable de entorno POSTGRES_URL_PRUEBAS. Cómo correrla (docs: servidor/LEEME.md):
//   export POSTGRES_URL_PRUEBAS="postgres://USUARIO@127.0.0.1:5432/postgres"   (la contraseña, si hace falta, va en la URL o en PGPASSWORD)
//   npx vitest run servidor/pruebas/candado.real.test.ts
// Requisitos de esa URL: un Postgres 15 o superior DESECHABLE (nunca el de Supabase real, ni uno con datos) y un usuario que pueda crear
// bases de datos y roles (en un Postgres de pruebas, el superusuario). La prueba crea una base nueva con nombre al azar, aplica en ella
// el doble de Supabase y las migraciones, y la borra al terminar. Los tres roles (`anon`, `authenticated`, `service_role`) son del
// servidor completo, no de una base: quedan creados (sin permisos sobre nada) cuando termina.
// Usa el paquete `pg` (ya está en package.json como dependencia de desarrollo).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DOBLE_DE_SUPABASE, VERSION_ESQUEMA_DE_PRUEBA, leerMigraciones, marca } from "./ayudas";

const URL_ADMIN = process.env.POSTGRES_URL_PRUEBAS;

// Tipos mínimos de lo que se usa de `pg` (se importa dentro de `beforeAll` para que, sin la variable de entorno, ni se cargue).
interface ClienteBd {
  connect(): Promise<void>;
  query<T = any>(texto: string, valores?: unknown[]): Promise<{ rows: T[] }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  end(): Promise<void>;
}
interface FabricaPg {
  Client: new (opciones: { connectionString: string; application_name?: string }) => ClienteBd;
}

describe.skipIf(!URL_ADMIN)("candado de la finca con Postgres real", () => {
  const nombreBase = `candado_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  let pg: FabricaPg;
  let admin: ClienteBd; // conexión al servidor (para crear y borrar la base)
  let sup: ClienteBd; // conexión de superusuario a la base de pruebas (para mirar tablas y bloqueos)
  let urlDeLaBase: string;
  const abiertas: ClienteBd[] = [];

  beforeAll(async () => {
    pg = (await import("pg")).default as unknown as FabricaPg;
    admin = new pg.Client({ connectionString: URL_ADMIN!, application_name: "candado-admin" });
    await admin.connect();
    await admin.query(`create database ${nombreBase}`);
    const direccion = new URL(URL_ADMIN!);
    direccion.pathname = `/${nombreBase}`;
    urlDeLaBase = direccion.toString();
    sup = new pg.Client({ connectionString: urlDeLaBase, application_name: "candado-sup" });
    await sup.connect();
    await sup.query(DOBLE_DE_SUPABASE);
    for (const migracion of leerMigraciones()) {
      try {
        await sup.query(migracion.sql);
      } catch (error) {
        throw new Error(`La migración ${migracion.archivo} falló en Postgres real: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }, 60_000);

  afterAll(async () => {
    await Promise.allSettled(abiertas.map((c) => c.end()));
    await sup?.end().catch(() => undefined);
    await admin?.query(`drop database if exists ${nombreBase} with (force)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  }, 60_000);

  // -------------------------------------------------------------------------------------------------------------------------
  // Ayudas: una transacción abierta como una cuenta (como lo hace PostgREST: rol `authenticated` y `request.jwt.claims`)
  // -------------------------------------------------------------------------------------------------------------------------

  class Transaccion {
    private constructor(private readonly cliente: ClienteBd) {}

    static async abrir(cuentaId: string, nombre: string): Promise<Transaccion> {
      const cliente = new pg.Client({ connectionString: urlDeLaBase, application_name: nombre });
      await cliente.connect();
      abiertas.push(cliente);
      await cliente.query("begin");
      await cliente.query(`set local role authenticated`);
      await cliente.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
        JSON.stringify({ sub: cuentaId, role: "authenticated" }),
        cuentaId,
      ]);
      return new Transaccion(cliente);
    }

    async consulta<T = any>(texto: string, valores: unknown[] = []): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
      return (await this.cliente.query<T>(texto, valores)).rows;
    }

    async emitir(finca: Finca, dispositivoId: string, registros: unknown[], cambioId: string = randomUUID()) {
      const [fila] = await this.consulta(`select public.emitir_registros($1::uuid, $2::uuid, $3::uuid, $4::jsonb) as r`, [
        finca.id,
        dispositivoId,
        cambioId,
        JSON.stringify(registros),
      ]);
      return fila.r as { resultados: { registro_id: string; consecutivo: number; numero: string }[]; seq_final: number };
    }

    async sincronizar(finca: Finca, dispositivoId: string, cambios: unknown[], desde = 0) {
      const [fila] = await this.consulta(`select public.sincronizar($1::uuid, $2::uuid, $3::int, $4::bigint, $5::jsonb, $6::int) as r`, [
        finca.id,
        dispositivoId,
        VERSION_ESQUEMA_DE_PRUEBA,
        desde,
        JSON.stringify(cambios),
        500,
      ]);
      return fila.r as {
        aceptados: string[];
        ya_aplicados: string[];
        rechazados: unknown[];
        cambios: { seq: number; cambio_id: string; entidad: string; registro_id: string; arbitrado: boolean }[];
        seq_siguiente: number;
      };
    }

    async confirmar(): Promise<void> {
      await this.cliente.query("commit");
      await this.cliente.end();
    }

    async deshacer(): Promise<void> {
      await this.cliente.query("rollback").catch(() => undefined);
      await this.cliente.end().catch(() => undefined);
    }
  }

  interface Finca {
    id: string;
    cuentaId: string;
    libroId: string;
    /** Equipos de la cuenta (el primero lo crea `crear_finca`). */
    equipos: string[];
  }

  /** Una cuenta autorizada con una finca, `n` equipos y un libro con prefijo, como lo dejaría el programa tras sincronizar. */
  async function crearFinca(nombre: string, equipos = 3): Promise<Finca> {
    const cuentaId = randomUUID();
    const correo = `${nombre}-${cuentaId.slice(0, 6)}@ejemplo.com`;
    await sup.query(`insert into auth.users (id, email) values ($1, $2)`, [cuentaId, correo]);
    await sup.query(`insert into public.cuenta_autorizada (correo) values ($1)`, [correo]);
    const finca: Finca = { id: randomUUID(), cuentaId, libroId: randomUUID(), equipos: [] };
    const t = await Transaccion.abrir(cuentaId, "preparar");
    const primero = randomUUID();
    await t.consulta(`select public.crear_finca($1::uuid, $2, $3::int, $4::jsonb)`, [finca.id, nombre, VERSION_ESQUEMA_DE_PRUEBA, JSON.stringify({ id: primero, nombre: "Equipo A", plataforma: "pruebas" })]);
    finca.equipos.push(primero);
    for (let i = 1; i < equipos; i++) {
      const id = randomUUID();
      await t.consulta(`select public.unirse_a_finca($1::uuid, null, $2::jsonb, $3::int)`, [finca.id, JSON.stringify({ id, nombre: `Equipo ${i}`, plataforma: "pruebas" }), VERSION_ESQUEMA_DE_PRUEBA]);
      finca.equipos.push(id);
    }
    await t.sincronizar(finca, primero, [
      {
        id: randomUUID(),
        grupo_id: randomUUID(),
        orden: 0,
        entidad: "libro",
        registro_id: finca.libroId,
        operacion: "crear",
        campos: { nombre: "Libro", prefijo: "PPE", separador_numero: "-", digitos_numero: 4, eliminado_en: null },
        marca: marca(Date.now() - 60_000, 0, "aaaaaaaa"),
        usuario_id: null,
      },
    ]);
    await t.confirmar();
    return finca;
  }

  /** `n` registros nuevos para `emitir_registros`, cada uno de un animal distinto. */
  function registrosNuevos(finca: Finca, n: number): unknown[] {
    return Array.from({ length: n }, () => {
      const animal = randomUUID();
      return {
        registro_id: randomUUID(),
        animal_id: animal,
        libro_id: finca.libroId,
        fecha_registro: "2026-10-02",
        instantanea: JSON.stringify({ numero: null, version: 1, animal: { id: animal } }),
        responsable: null,
        observaciones: null,
      };
    });
  }

  function operacionAnimal(nombre: string) {
    return {
      id: randomUUID(),
      grupo_id: randomUUID(),
      orden: 0,
      entidad: "animal",
      registro_id: randomUUID(),
      operacion: "crear",
      campos: { nombre },
      marca: marca(Date.now() - 30_000, 0, "bbbbbbbb"),
      usuario_id: null,
    };
  }

  /** ¿Hay alguna transacción esperando un candado de aviso (advisory)? */
  async function hayAlguienEsperandoElCandado(): Promise<boolean> {
    const [fila] = (await sup.query(`select count(*)::int as n from pg_locks where locktype = 'advisory' and not granted`)).rows;
    return fila.n > 0;
  }

  async function esperarHastaQueHayaEspera(): Promise<void> {
    for (let i = 0; i < 200; i++) {
      if (await hayAlguienEsperandoElCandado()) return;
      await new Promise((resolver) => setTimeout(resolver, 25));
    }
    throw new Error("Nadie esperó el candado en 5 segundos: ¿se tomó el candado de la finca?");
  }

  /** Dice si una promesa ya terminó, sin esperarla. */
  function seguimiento<T>(promesa: Promise<T>): { terminado: () => boolean; promesa: Promise<T> } {
    let listo = false;
    const final = promesa.then(
      (v) => {
        listo = true;
        return v;
      },
      (e) => {
        listo = true;
        throw e;
      },
    );
    return { terminado: () => listo, promesa: final };
  }

  const xmin = `xmin::text::bigint`;

  // -------------------------------------------------------------------------------------------------------------------------

  it("las migraciones se aplican en un Postgres real y el doble de Supabase no estorba", async () => {
    const [fila] = (await sup.query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'emitir_registros'`)).rows;
    expect(fila.n).toBe(1);
  });

  it("una transacción que tiene el candado hace esperar a la otra, y al confirmar la otra entra y ve lo confirmado (números 1 y 2, seq crecientes)", async () => {
    const finca = await crearFinca("espera");
    const t1 = await Transaccion.abrir(finca.cuentaId, "t1");
    const primera = await t1.emitir(finca, finca.equipos[0], registrosNuevos(finca, 1)); // T1 tiene el candado y NO ha confirmado

    const t2 = await Transaccion.abrir(finca.cuentaId, "t2");
    const segunda = seguimiento(t2.emitir(finca, finca.equipos[1], registrosNuevos(finca, 1)));
    await esperarHastaQueHayaEspera();
    // Aunque pasó tiempo, T2 sigue esperando: no se adelantó ni asignó el mismo número.
    await new Promise((resolver) => setTimeout(resolver, 150));
    expect(segunda.terminado()).toBe(false);

    await t1.confirmar();
    const r2 = await segunda.promesa;
    await t2.confirmar();

    expect(primera.resultados[0].consecutivo).toBe(1);
    expect(r2.resultados[0].consecutivo).toBe(2);
    expect(r2.resultados[0].numero).toBe("PPE-0002");
    expect(r2.seq_final).toBeGreaterThan(primera.seq_final);
    const [libro] = (await sup.query(`select siguiente from public.libro_numeracion where finca_id = $1 and libro_id = $2`, [finca.id, finca.libroId])).rows;
    expect(libro.siguiente).toBe(3);
  }, 30_000);

  it("quien espera el candado, al entrar, descarga lo que confirmó quien lo tenía (no se pierde ningún cambio por orden de seq)", async () => {
    const finca = await crearFinca("descarga");
    const t1 = await Transaccion.abrir(finca.cuentaId, "emisor");
    const emitida = await t1.emitir(finca, finca.equipos[0], registrosNuevos(finca, 2));

    const t2 = await Transaccion.abrir(finca.cuentaId, "sincronizador");
    const operacion = operacionAnimal("Mientras tanto");
    const espera = seguimiento(t2.sincronizar(finca, finca.equipos[1], [operacion], 0));
    await esperarHastaQueHayaEspera();
    expect(espera.terminado()).toBe(false);
    await t1.confirmar();
    const respuesta = await espera.promesa;
    await t2.confirmar();

    expect(respuesta.aceptados).toEqual([operacion.id]);
    // El equipo 2 recibe los cambios arbitrados del equipo 1 (2 registros + el libro), todos con seq menor que el suyo.
    const arbitrados = respuesta.cambios.filter((c) => c.arbitrado);
    expect(arbitrados.length).toBe(3);
    expect(Math.max(...arbitrados.map((c) => c.seq))).toBe(emitida.seq_final);
    const [propio] = (await sup.query(`select seq from public.cambio where finca_id = $1 and cambio_id = $2`, [finca.id, operacion.id])).rows;
    expect(Number(propio.seq)).toBeGreaterThan(emitida.seq_final);
    expect(respuesta.seq_siguiente).toBeGreaterThanOrEqual(emitida.seq_final);
  }, 30_000);

  it("fincas distintas no se esperan: el candado es por finca", async () => {
    const lenta = await crearFinca("lenta");
    const libre = await crearFinca("libre");
    const t1 = await Transaccion.abrir(lenta.cuentaId, "tiene-el-candado");
    await t1.emitir(lenta, lenta.equipos[0], registrosNuevos(lenta, 1)); // sin confirmar

    const t2 = await Transaccion.abrir(libre.cuentaId, "otra-finca");
    const respuesta = await Promise.race([
      t2.emitir(libre, libre.equipos[0], registrosNuevos(libre, 1)),
      new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error("La otra finca quedó esperando el candado de la primera")), 5_000)),
    ]);
    expect(respuesta.resultados[0].consecutivo).toBe(1);
    await t2.confirmar();
    await t1.confirmar();
  }, 30_000);

  it("una transacción que se deshace libera el candado y no consume ningún número", async () => {
    const finca = await crearFinca("deshacer");
    const t1 = await Transaccion.abrir(finca.cuentaId, "se-arrepiente");
    await t1.emitir(finca, finca.equipos[0], registrosNuevos(finca, 3));
    const t2 = await Transaccion.abrir(finca.cuentaId, "espera-y-sigue");
    const segunda = seguimiento(t2.emitir(finca, finca.equipos[1], registrosNuevos(finca, 1)));
    await esperarHastaQueHayaEspera();
    await t1.deshacer();
    const r2 = await segunda.promesa;
    await t2.confirmar();
    expect(r2.resultados.map((r) => r.consecutivo)).toEqual([1]); // los 3 números de la transacción deshecha no se perdieron
  }, 30_000);

  it("carrera de verdad: muchas emisiones y sincronizaciones a la vez dan números 1..N sin repetir y seq en el orden de confirmación", async () => {
    const finca = await crearFinca("carrera", 4);
    const EMISIONES = 14;
    const POR_EMISION = 3;
    const SINCRONIZACIONES = 8;

    const tareas: Promise<unknown>[] = [];
    const numeros: { consecutivo: number; numero: string }[] = [];
    for (let i = 0; i < EMISIONES; i++) {
      tareas.push(
        (async () => {
          const t = await Transaccion.abrir(finca.cuentaId, `emision-${i}`);
          try {
            const r = await t.emitir(finca, finca.equipos[i % finca.equipos.length], registrosNuevos(finca, POR_EMISION));
            numeros.push(...r.resultados);
            await t.confirmar();
          } catch (error) {
            await t.deshacer();
            throw error;
          }
        })(),
      );
    }
    for (let i = 0; i < SINCRONIZACIONES; i++) {
      tareas.push(
        (async () => {
          const t = await Transaccion.abrir(finca.cuentaId, `sincronizacion-${i}`);
          try {
            const r = await t.sincronizar(finca, finca.equipos[(i + 1) % finca.equipos.length], [operacionAnimal(`Cabra ${i}`), operacionAnimal(`Cabrita ${i}`)], 0);
            expect(r.rechazados).toEqual([]);
            await t.confirmar();
          } catch (error) {
            await t.deshacer();
            throw error;
          }
        })(),
      );
    }
    await Promise.all(tareas);

    // 1. Los consecutivos son exactamente 1..N, sin repetir ni saltar, y cada número tiene su texto.
    const total = EMISIONES * POR_EMISION;
    expect(numeros).toHaveLength(total);
    expect(numeros.map((n) => n.consecutivo).sort((x, y) => x - y)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(new Set(numeros.map((n) => n.numero)).size).toBe(total);
    const enTabla = (await sup.query(`select (campos->>'consecutivo')::int as c from public.registro where finca_id = $1 and entidad = 'registro_genealogico' order by 1`, [finca.id])).rows;
    expect(enTabla.map((f: { c: number }) => f.c)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    const [libro] = (await sup.query(`select siguiente from public.libro_numeracion where finca_id = $1 and libro_id = $2`, [finca.id, finca.libroId])).rows;
    expect(libro.siguiente).toBe(total + 1);

    // 2. `seq` sin repetidos, y crece con el orden de las transacciones: el `xmin` (la transacción que escribió) no baja nunca al subir `seq`.
    //    Como cada transacción toma el candado ANTES de su primera escritura y lo suelta al confirmar, el orden de las transacciones
    //    es el de confirmación; si el candado fallara, un `seq` menor podría confirmarse después y aparecería un `xmin` menor más arriba.
    const filas = (await sup.query(`select seq::bigint as seq, ${xmin} as xid, arbitrado from public.cambio where finca_id = $1 order by seq`, [finca.id])).rows;
    expect(new Set(filas.map((f: { seq: string }) => f.seq)).size).toBe(filas.length);
    const xids = filas.map((f: { xid: string }) => Number(f.xid));
    for (let i = 1; i < xids.length; i++) expect(xids[i], `xmin baja en la posición ${i}`).toBeGreaterThanOrEqual(xids[i - 1]);
    // Cada transacción de emisión dejó un bloque contiguo de seq: 1 (libro, de la preparación) + 3 registros + 1 (contador del libro).
    const arbitrados = filas.filter((f: { arbitrado: boolean }) => f.arbitrado).length;
    expect(arbitrados).toBe(EMISIONES * (POR_EMISION + 1));
    // Un `seq` de más (alguien se saltó el candado) rompería la contigüidad dentro de una misma transacción.
    const porTransaccion = new Map<number, number[]>();
    filas.forEach((f: { seq: string; xid: string }) => porTransaccion.set(Number(f.xid), [...(porTransaccion.get(Number(f.xid)) ?? []), Number(f.seq)]));
    for (const [xid, seqs] of porTransaccion) {
      expect(seqs[seqs.length - 1] - seqs[0] + 1, `la transacción ${xid} no escribió seq contiguos`).toBe(seqs.length);
    }

    // 3. Si el servidor tiene `track_commit_timestamp = on`, se comprueba también con la hora real de confirmación.
    const [ajuste] = (await sup.query(`show track_commit_timestamp`)).rows;
    if (ajuste.track_commit_timestamp === "on") {
      const confirmaciones = (await sup.query(`select seq::bigint as seq, pg_xact_commit_timestamp(xmin) as hora from public.cambio where finca_id = $1 order by seq`, [finca.id])).rows;
      for (let i = 1; i < confirmaciones.length; i++) {
        expect(new Date(confirmaciones[i].hora).getTime()).toBeGreaterThanOrEqual(new Date(confirmaciones[i - 1].hora).getTime());
      }
    }
  }, 120_000);

  it("el mismo `p_cambio_id` enviado a la vez muchas veces (reintento simultáneo) consume un solo número", async () => {
    const finca = await crearFinca("reintento");
    const registros = registrosNuevos(finca, 2);
    const cambioId = randomUUID();
    const copias = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const t = await Transaccion.abrir(finca.cuentaId, `reintento-${i}`);
        try {
          const r = await t.emitir(finca, finca.equipos[0], registros, cambioId);
          await t.confirmar();
          return r;
        } catch (error) {
          await t.deshacer();
          throw error;
        }
      }),
    );
    for (const copia of copias) expect(copia).toEqual(copias[0]);
    expect(copias[0].resultados.map((r) => r.consecutivo)).toEqual([1, 2]);
    const [libro] = (await sup.query(`select siguiente from public.libro_numeracion where finca_id = $1 and libro_id = $2`, [finca.id, finca.libroId])).rows;
    expect(libro.siguiente).toBe(3);
    const [cuenta] = (await sup.query(`select count(*)::int as n from public.llamada_arbitrada where finca_id = $1 and cambio_id = $2`, [finca.id, cambioId])).rows;
    expect(cuenta.n).toBe(1);
  }, 60_000);

  it("el mismo envío de `sincronizar` entregado dos veces a la vez se aplica una sola vez (aceptado y ya_aplicado)", async () => {
    const finca = await crearFinca("duplicado");
    const operacion = operacionAnimal("Una sola vez");
    const respuestas = await Promise.all(
      [0, 1, 2, 3].map(async (i) => {
        const t = await Transaccion.abrir(finca.cuentaId, `duplicado-${i}`);
        try {
          const r = await t.sincronizar(finca, finca.equipos[i % finca.equipos.length], [operacion], 0);
          await t.confirmar();
          return r;
        } catch (error) {
          await t.deshacer();
          throw error;
        }
      }),
    );
    expect(respuestas.filter((r) => r.aceptados.includes(operacion.id))).toHaveLength(1);
    expect(respuestas.filter((r) => r.ya_aplicados.includes(operacion.id))).toHaveLength(3);
    const [cuenta] = (await sup.query(`select count(*)::int as n from public.cambio where finca_id = $1 and cambio_id = $2`, [finca.id, operacion.id])).rows;
    expect(cuenta.n).toBe(1);
  }, 60_000);
});
