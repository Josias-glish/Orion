// Ayudas para probar el servidor de sincronización (Etapa 10) sin Supabase real: un Postgres de PGlite con un doble mínimo de lo que
// Supabase ya trae (roles, `auth`, `storage`) y las migraciones de servidor/migraciones/ aplicadas. Documentación y ejemplo: servidor/LEEME.md.
//
// El doble vive SOLO aquí: nunca en las migraciones (en Supabase esos esquemas ya existen). Imita también los permisos por defecto de
// Supabase (tablas, funciones y secuencias nuevas de `public` con permisos para `anon`, `authenticated` y `service_role`), para que las
// pruebas descubran una migración que olvide revocarlos.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite, type Transaction } from "@electric-sql/pglite";

/** Una hora fija cómoda para las pruebas: 2026-10-02 12:00:00 UTC, en milisegundos desde 1970. */
export const HORA_BASE = Date.UTC(2026, 9, 2, 12, 0, 0);

/** Las migraciones del servidor, en orden. */
export interface Migracion {
  archivo: string;
  sql: string;
}

const CARPETA_MIGRACIONES = new URL("../migraciones/", import.meta.url);

export function leerMigraciones(): Migracion[] {
  return readdirSync(CARPETA_MIGRACIONES)
    .filter((nombre) => /^\d{4}_.+\.sql$/.test(nombre))
    .sort()
    .map((archivo) => ({ archivo, sql: readFileSync(new URL(archivo, CARPETA_MIGRACIONES), "utf8") }));
}

export function huellaDe(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

/**
 * Lo mínimo de Supabase que las migraciones necesitan: los tres roles de la API, `auth.users` y `auth.uid()`, `storage.buckets`,
 * `storage.objects` (con RLS activa) y `storage.foldername()`. `auth.uid()` lee el claim `sub` como lo hace Supabase (PostgREST lo pone
 * en `request.jwt.claims`). Se puede ejecutar en PGlite o en un Postgres real vacío (la prueba del candado real lo hace).
 */
export const DOBLE_DE_SUPABASE = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- Permisos por defecto de Supabase para lo que se cree en \`public\` (guía «Securing your API»).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

/** Quién ejecuta: una cuenta (su uuid, rol `authenticated` con `auth.uid()` = ese uuid), `anon`/null (sin sesión) o `admin` (superusuario, sin JWT). */
export type Actor = string | "anon" | "admin" | null;

/** Error de Postgres normalizado: `codigo` es el mensaje del `raise exception` (el código de PROTOCOLO.md) y `sqlstate` el SQLSTATE (P0001, 42501…). */
export class ErrorDeServidor extends Error {
  readonly codigo: string;
  readonly sqlstate: string;
  constructor(mensaje: string, sqlstate: string) {
    super(mensaje);
    this.name = "ErrorDeServidor";
    this.codigo = mensaje;
    this.sqlstate = sqlstate;
  }
}

function normalizarError(error: unknown): Error {
  if (error instanceof Error && typeof (error as { code?: unknown }).code === "string") {
    return new ErrorDeServidor(error.message, (error as unknown as { code: string }).code);
  }
  return error instanceof Error ? error : new Error(String(error));
}

export interface OpcionesDeLlamada {
  como?: Actor;
}

/** Algo que ejecuta SQL y llama funciones como un actor concreto. */
export interface Sesion {
  /** Llama `public.<nombre>(p_a => ..., p_b => ...)` como lo hace PostgREST (parámetros con nombre) y devuelve el jsonb. Lanza `ErrorDeServidor`. */
  rpc<T = any>(nombre: string, parametros?: Record<string, unknown>): Promise<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Ejecuta una sentencia (con parámetros `$1`, `$2`…) y devuelve las filas. Lanza `ErrorDeServidor`. */
  sql<T = any>(texto: string, parametros?: unknown[]): Promise<T[]>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ServidorDePrueba extends Sesion {
  /** La base de PGlite, por si una prueba necesita algo especial. */
  readonly db: PGlite;
  /** Como `Sesion.rpc` pero eligiendo el actor en cada llamada (por defecto `admin`). */
  rpc<T = any>(nombre: string, parametros?: Record<string, unknown>, opciones?: OpcionesDeLlamada): Promise<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
  sql<T = any>(texto: string, parametros?: unknown[], opciones?: OpcionesDeLlamada): Promise<T[]>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Una sesión atada a un actor: `servidor.como(cuentaId).rpc("mis_fincas")`. */
  como(actor: Actor): Sesion;
  /** Inserta una cuenta en `auth.users` y devuelve su uuid. */
  crearCuenta(correo: string): Promise<string>;
  /** Autoriza un correo a crear fincas (`cuenta_autorizada`). */
  autorizarCorreo(correo: string): Promise<void>;
  /** Fija la hora del servidor (`public.ahora_servidor()`), en milisegundos desde 1970. */
  fijarHora(ms: number): Promise<void>;
  /** Adelanta la hora fijada (si no había, parte de la real). */
  avanzarHora(ms: number): Promise<void>;
  /** Devuelve la hora del servidor al reloj real. */
  liberarHora(): Promise<void>;
  /** La hora fijada (null si el reloj es el real). */
  horaFijada(): number | null;
  /** Vacía todas las tablas del servidor, `auth.users` y `storage.objects` (deja el bucket) y fija la hora en `horaInicial` (por defecto `HORA_BASE`). */
  reiniciar(): Promise<void>;
  /** Sube un archivo al bucket `archivos` como el actor (la política de Storage decide). Devuelve el id del objeto. */
  subirArchivo(ruta: string, opciones?: OpcionesDeLlamada): Promise<string>;
  /** Rutas de los objetos del bucket `archivos` que el actor puede ver. */
  listarArchivos(opciones?: OpcionesDeLlamada): Promise<string[]>;
  cerrar(): Promise<void>;
}

export interface OpcionesDelServidor {
  /** Hora (ms) con la que arranca y a la que vuelve `reiniciar()`. Por defecto `HORA_BASE`. Con `null`, el reloj real. */
  horaInicial?: number | null;
}

const TABLAS_DEL_SERVIDOR = [
  "public.llamada_arbitrada",
  "public.libro_numeracion",
  "public.registro",
  "public.cambio",
  "public.invitacion",
  "public.dispositivo",
  "public.membresia",
  "public.finca_servidor",
  "public.cuenta",
  "public.cuenta_autorizada",
  "auth.users",
];

const SQL_RELOJ_REAL = `create or replace function public.ahora_servidor() returns timestamptz
  language sql volatile set search_path = '' as $$ select clock_timestamp() $$`;

function sqlRelojFijo(ms: number): string {
  if (!Number.isSafeInteger(ms)) throw new Error(`Hora inválida: ${ms}`);
  return `create or replace function public.ahora_servidor() returns timestamptz
  language sql volatile set search_path = '' as $$ select timestamptz 'epoch' + ${ms}::bigint * interval '1 millisecond' $$`;
}

/** Un servidor de PGlite con el doble de Supabase y todas las migraciones. Reutiliza uno por archivo de pruebas y llama a `reiniciar()` entre casos. */
export async function crearServidorDePrueba(opciones: OpcionesDelServidor = {}): Promise<ServidorDePrueba> {
  const horaInicial = opciones.horaInicial === undefined ? HORA_BASE : opciones.horaInicial;
  const db = new PGlite();
  await db.waitReady;
  await db.exec(DOBLE_DE_SUPABASE);
  for (const migracion of leerMigraciones()) {
    try {
      await db.exec(migracion.sql);
    } catch (error) {
      throw new Error(`La migración ${migracion.archivo} falló: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let hora: number | null = null;

  /** Ejecuta `f` en una transacción, con el rol y los claims del actor (como una petición de PostgREST). */
  async function conActor<T>(actor: Actor, f: (tx: Transaction) => Promise<T>): Promise<T> {
    try {
      return await db.transaction(async (tx) => {
        const quien = actor ?? "anon";
        if (quien !== "admin") {
          await tx.exec(`set local role ${quien === "anon" ? "anon" : "authenticated"}`);
          const claims = quien === "anon" ? { role: "anon" } : { sub: quien, role: "authenticated" };
          await tx.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
            JSON.stringify(claims),
            quien === "anon" ? "" : quien,
          ]);
        }
        return await f(tx);
      });
    } catch (error) {
      throw normalizarError(error);
    }
  }

  async function ejecutarRpc(actor: Actor, nombre: string, parametros: Record<string, unknown>): Promise<unknown> {
    if (!/^[a-z_][a-z0-9_]*$/.test(nombre)) throw new Error(`Nombre de función inválido: ${nombre}`);
    const claves = Object.keys(parametros).filter((clave) => parametros[clave] !== undefined);
    for (const clave of claves) if (!/^p_[a-z0-9_]+$/.test(clave)) throw new Error(`Parámetro inválido: ${clave}`);
    const texto = `select public.${nombre}(${claves.map((clave, i) => `${clave} => $${i + 1}`).join(", ")}) as resultado`;
    const valores = claves.map((clave) => parametros[clave]);
    return conActor(actor, async (tx) => (await tx.query<{ resultado: unknown }>(texto, valores)).rows[0].resultado);
  }

  async function ejecutarSql(actor: Actor, texto: string, parametros: unknown[]): Promise<unknown[]> {
    return conActor(actor, async (tx) => (await tx.query(texto, parametros)).rows);
  }

  async function definirHora(ms: number | null): Promise<void> {
    await db.exec(ms === null ? SQL_RELOJ_REAL : sqlRelojFijo(ms));
    hora = ms;
  }

  const servidor: ServidorDePrueba = {
    db,
    rpc: (nombre: string, parametros: Record<string, unknown> = {}, opciones: OpcionesDeLlamada = {}) =>
      ejecutarRpc(opciones.como === undefined ? "admin" : opciones.como, nombre, parametros) as Promise<never>,
    sql: (texto: string, parametros: unknown[] = [], opciones: OpcionesDeLlamada = {}) =>
      ejecutarSql(opciones.como === undefined ? "admin" : opciones.como, texto, parametros) as Promise<never[]>,
    como: (actor: Actor): Sesion => ({
      rpc: (nombre: string, parametros: Record<string, unknown> = {}) => ejecutarRpc(actor, nombre, parametros) as Promise<never>,
      sql: (texto: string, parametros: unknown[] = []) => ejecutarSql(actor, texto, parametros) as Promise<never[]>,
    }),
    async crearCuenta(correo: string): Promise<string> {
      const id = randomUUID();
      await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, correo]);
      return id;
    },
    async autorizarCorreo(correo: string): Promise<void> {
      await db.query(`insert into public.cuenta_autorizada (correo) values ($1) on conflict do nothing`, [correo.toLowerCase()]);
    },
    fijarHora: (ms: number) => definirHora(ms),
    avanzarHora: (ms: number) => definirHora((hora ?? Date.now()) + ms),
    liberarHora: () => definirHora(null),
    horaFijada: () => hora,
    async reiniciar(): Promise<void> {
      await db.exec(`delete from storage.objects; truncate table ${TABLAS_DEL_SERVIDOR.join(", ")} restart identity cascade`);
      await definirHora(horaInicial);
    },
    async subirArchivo(ruta: string, opciones: OpcionesDeLlamada = {}): Promise<string> {
      const actor = opciones.como === undefined ? "admin" : opciones.como;
      const filas = await ejecutarSql(
        actor,
        `insert into storage.objects (bucket_id, name, owner) values ('archivos', $1, $2) returning id`,
        [ruta, actor !== "admin" && actor !== "anon" && actor !== null ? actor : null],
      );
      return (filas[0] as { id: string }).id;
    },
    async listarArchivos(opciones: OpcionesDeLlamada = {}): Promise<string[]> {
      const filas = await ejecutarSql(
        opciones.como === undefined ? "admin" : opciones.como,
        `select name from storage.objects where bucket_id = 'archivos' order by name`,
        [],
      );
      return (filas as { name: string }[]).map((fila) => fila.name);
    },
    cerrar: () => db.close(),
  };

  await definirHora(horaInicial);
  return servidor;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Constructores de datos
// ---------------------------------------------------------------------------------------------------------------------------

export function uuid(): string {
  return randomUUID();
}

/** Una marca (R17): hora en milisegundos desde 1970, contador y equipo (8 hexadecimales). */
export function marca(ms: number, contador = 0, equipo = "aaaaaaaa"): string {
  return `${new Date(ms).toISOString()}-${contador.toString(16).padStart(4, "0")}-${equipo}`;
}

export type ValorCampo = string | number | null;

export interface OperacionDeSincronizacion {
  id: string;
  grupo_id: string;
  orden: number;
  entidad: string;
  registro_id: string;
  operacion: "crear" | "modificar" | "eliminar";
  campos: Record<string, ValorCampo>;
  marca: string;
  usuario_id: string | null;
}

/** Una operación de `p_cambios` con valores por defecto (su propio grupo, `orden` 0, entidad `animal`). */
export function operacion(
  datos: Partial<OperacionDeSincronizacion> & Pick<OperacionDeSincronizacion, "campos" | "marca">,
): OperacionDeSincronizacion {
  return {
    id: uuid(),
    grupo_id: uuid(),
    orden: 0,
    entidad: "animal",
    registro_id: uuid(),
    operacion: "modificar",
    usuario_id: null,
    ...datos,
  };
}

export const VERSION_ESQUEMA_DE_PRUEBA = 9;

export interface Vinculo {
  finca_id: string;
  finca_nombre: string;
  dispositivo_id: string;
  codigo_equipo: string;
  hora_servidor_ms: number;
  seq_actual: number;
  version_esquema_minima: number;
}

export interface FincaDePrueba {
  cuentaId: string;
  correo: string;
  fincaId: string;
  dispositivoId: string;
  vinculo: Vinculo;
}

/** Crea una cuenta autorizada con una finca y su primer equipo (`crear_finca`). */
export async function crearFincaDePrueba(
  servidor: ServidorDePrueba,
  opciones: { correo?: string; nombre?: string; version?: number } = {},
): Promise<FincaDePrueba> {
  const correo = opciones.correo ?? `${randomUUID().slice(0, 8)}@ejemplo.com`;
  const cuentaId = await servidor.crearCuenta(correo);
  await servidor.autorizarCorreo(correo);
  const fincaId = uuid();
  const dispositivoId = uuid();
  const vinculo = await servidor.rpc<Vinculo>(
    "crear_finca",
    {
      p_finca_id: fincaId,
      p_nombre: opciones.nombre ?? "Aprisco de prueba",
      p_version_esquema: opciones.version ?? VERSION_ESQUEMA_DE_PRUEBA,
      p_dispositivo: { id: dispositivoId, nombre: "Equipo A", plataforma: "pruebas" },
    },
    { como: cuentaId },
  );
  return { cuentaId, correo, fincaId, dispositivoId, vinculo };
}

/** Registra otro equipo de la misma cuenta en la finca (`unirse_a_finca` por finca). Devuelve el vínculo. */
export async function agregarEquipo(servidor: ServidorDePrueba, finca: Pick<FincaDePrueba, "cuentaId" | "fincaId">, nombre = "Equipo B"): Promise<Vinculo> {
  return servidor.rpc<Vinculo>(
    "unirse_a_finca",
    {
      p_finca_id: finca.fincaId,
      p_codigo: null,
      p_dispositivo: { id: uuid(), nombre, plataforma: "pruebas" },
      p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA,
    },
    { como: finca.cuentaId },
  );
}

/** Texto de la huella de `resumen_finca` calculada en el programa (el contrato: SHA-256 hexadecimal de las líneas `registro_id|marca_maxima\n`). */
export function calcularHuella(filas: { registro_id: string; marca_maxima: string }[]): string {
  const ordenadas = [...filas].sort((a, b) => Buffer.compare(Buffer.from(a.registro_id, "utf8"), Buffer.from(b.registro_id, "utf8")));
  return createHash("sha256")
    .update(ordenadas.map((fila) => `${fila.registro_id}|${fila.marca_maxima}\n`).join(""), "utf8")
    .digest("hex");
}

/** La respuesta de `sincronizar` (PROTOCOLO.md, sección 5). */
export interface RespuestaDeSincronizar {
  hora_servidor_ms: number;
  aceptados: string[];
  ya_aplicados: string[];
  rechazados: { cambio_id: string; grupo_id: string; motivo: string }[];
  corregidos: { cambio_id: string; marca_nueva: string }[];
  cambios: {
    seq: number;
    cambio_id: string;
    grupo_id: string;
    orden: number;
    dispositivo_id: string;
    usuario_id: string | null;
    entidad: string;
    registro_id: string;
    operacion: string;
    campos: Record<string, unknown>;
    marca: string;
    arbitrado: boolean;
  }[];
  seq_siguiente: number;
  hay_mas: boolean;
  version_esquema_minima: number;
}

export interface OpcionesDeSincronizar {
  desde?: number;
  limite?: number;
  version?: number;
  /** Equipo que llama (por defecto el primero de la finca). */
  dispositivo?: string;
  /** Cuenta que llama (por defecto la dueña de la finca). */
  como?: string;
  /** Finca (por defecto la de `finca`). */
  fincaId?: string;
}

/** Llama `sincronizar` como el equipo de `finca` (o el que se indique). */
export function sincronizarComo(
  servidor: ServidorDePrueba,
  finca: Pick<FincaDePrueba, "cuentaId" | "fincaId" | "dispositivoId">,
  cambios: unknown[],
  opciones: OpcionesDeSincronizar = {},
): Promise<RespuestaDeSincronizar> {
  return servidor.rpc<RespuestaDeSincronizar>(
    "sincronizar",
    {
      p_finca_id: opciones.fincaId ?? finca.fincaId,
      p_dispositivo_id: opciones.dispositivo ?? finca.dispositivoId,
      p_version_esquema: opciones.version ?? VERSION_ESQUEMA_DE_PRUEBA,
      p_desde: opciones.desde ?? 0,
      p_cambios: cambios,
      p_limite: opciones.limite,
    },
    { como: opciones.como ?? finca.cuentaId },
  );
}
