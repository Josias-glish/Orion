-- Migración 0001: tablas del servidor de sincronización (Etapa 10; contrato: servidor/PROTOCOLO.md, sección 3).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Se aplica con la CLI de Supabase (servidor/LEEME.md) y, en las pruebas, sobre PGlite con un doble mínimo de los esquemas
-- `auth` y `storage` y de los roles `anon`, `authenticated` y `service_role` (servidor/pruebas/ayudas.ts). El doble nunca
-- vive en las migraciones: en Supabase todo eso ya existe.
--
-- Seguridad (PROTOCOLO.md, sección 1):
--  - Ninguna tabla se lee ni se escribe por la API: RLS activa SIN políticas y sin ningún permiso para `anon` ni `authenticated`.
--    Lo único que la API puede hacer es ejecutar las funciones públicas (migraciones 0003 a 0006), que son `security definer`.
--  - Supabase concede por defecto permisos sobre las tablas, las funciones y las secuencias nuevas de `public` a `anon`,
--    `authenticated` y `service_role` (guía «Securing your API», sección «Default privileges»). Por eso cada objeto de estas
--    migraciones revoca todo de forma explícita y solo después concede lo mínimo. `service_role` no se toca: es la clave del panel.
--  - `interno` es un esquema que la API no expone: guarda las funciones auxiliares. Ninguna se puede llamar por `rpc`.
--  - El servidor no conoce el esquema del programa: cada registro es un `jsonb` con la marca de cada campo.

create schema if not exists interno;
comment on schema interno is 'Funciones auxiliares del servidor de sincronización. No se expone por la API.';
revoke all on schema interno from public;
-- La política de Storage (0007) llama a una función de este esquema con el rol `authenticated`.
grant usage on schema interno to authenticated;

-- La hora SOLO se lee con esta función (PROTOCOLO.md, sección 1). Las pruebas la reemplazan para fijar el reloj.
create or replace function public.ahora_servidor() returns timestamptz
language sql volatile set search_path = '' as $$ select clock_timestamp() $$;
revoke all on function public.ahora_servidor() from public, anon, authenticated;

-- Cuentas (una por usuario de Supabase Auth). `intentos_codigo` y `bloqueo_hasta` frenan la prueba de códigos de invitación.
create table public.cuenta (
  id uuid primary key references auth.users (id) on delete cascade,
  correo text not null check (correo = lower(correo)),
  intentos_codigo integer not null default 0 check (intentos_codigo >= 0),
  bloqueo_hasta timestamptz,
  creado_en timestamptz not null default public.ahora_servidor()
);

-- Quién puede crear una finca (S-89). La administra el propietario del proyecto desde el panel de Supabase:
--   insert into public.cuenta_autorizada (correo) values ('persona@ejemplo.com');
create table public.cuenta_autorizada (
  correo text primary key check (correo = lower(btrim(correo)) and correo <> ''),
  creado_en timestamptz not null default public.ahora_servidor()
);

-- Una finca en el servidor. Su id es el de la `finca` local. `marca_ultima` es la mayor marca aceptada o emitida (R17).
create table public.finca_servidor (
  id uuid primary key,
  nombre text not null check (btrim(nombre) <> ''),
  creada_por uuid not null,
  version_esquema_minima integer not null default 1 check (version_esquema_minima >= 1),
  marca_ultima text collate "C" not null default '',
  siguiente_equipo integer not null default 1 check (siguiente_equipo >= 1),
  creado_en timestamptz not null default public.ahora_servidor()
);

create table public.membresia (
  cuenta_id uuid not null references public.cuenta (id) on delete cascade,
  finca_id uuid not null references public.finca_servidor (id),
  rol text not null default 'propietario' check (rol in ('propietario')),
  creado_en timestamptz not null default public.ahora_servidor(),
  primary key (cuenta_id, finca_id)
);
create index membresia_por_finca on public.membresia (finca_id);

-- Equipos (programas instalados) de una finca. `cuenta_id` no tiene clave foránea: es historia de quién registró el equipo.
create table public.dispositivo (
  id uuid primary key,
  finca_id uuid not null references public.finca_servidor (id),
  cuenta_id uuid not null,
  nombre text not null,
  plataforma text not null default '',
  codigo_equipo text not null check (codigo_equipo ~ '^[A-Z]{1,3}$'),
  version_esquema integer,
  ultima_sincronizacion timestamptz,
  revocado_en timestamptz,
  creado_en timestamptz not null default public.ahora_servidor(),
  unique (finca_id, codigo_equipo)
);
create index dispositivo_por_cuenta on public.dispositivo (cuenta_id);

-- Códigos de invitación: solo se guarda el SHA-256 hexadecimal del código normalizado (mayúsculas, sin guion).
create table public.invitacion (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references public.finca_servidor (id),
  codigo_hash text not null unique check (codigo_hash ~ '^[0-9a-f]{64}$'),
  rol text not null default 'propietario' check (rol in ('propietario')),
  creada_por uuid not null,
  vence_en timestamptz not null,
  usada_por uuid,
  usada_en timestamptz,
  creado_en timestamptz not null default public.ahora_servidor(),
  check ((usada_por is null) = (usada_en is null))
);
create index invitacion_por_finca on public.invitacion (finca_id);

-- Bitácora: solo se agrega (disparadores más abajo). `seq` crece en el orden de confirmación porque quien lo asigna tiene el
-- candado de la finca (PROTOCOLO.md, sección 5). Las marcas se comparan SIEMPRE como texto con COLLATE "C" (R17).
create table public.cambio (
  seq bigint generated always as identity primary key,
  finca_id uuid not null references public.finca_servidor (id),
  cambio_id uuid not null,
  grupo_id uuid not null,
  orden integer not null default 0,
  dispositivo_id uuid not null references public.dispositivo (id),
  usuario_id text,
  entidad text not null check (entidad ~ '^[a-z][a-z_]{0,39}$'),
  registro_id text collate "C" not null check (length(registro_id) between 1 and 100),
  operacion text not null check (operacion in ('crear', 'modificar', 'eliminar')),
  campos jsonb not null check (jsonb_typeof(campos) = 'object'),
  marca text collate "C" not null
    check (marca ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z-[0-9a-f]{4}-[0-9a-f]{8}$'),
  marca_original text collate "C",
  arbitrado boolean not null default false,
  recibido_en timestamptz not null default public.ahora_servidor(),
  unique (finca_id, cambio_id)
);
create index cambio_por_finca_y_seq on public.cambio (finca_id, seq);

create or replace function interno.cambio_solo_se_agrega() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'cambio_solo_se_agrega';
end $$;

create trigger cambio_sin_actualizar before update on public.cambio
  for each row execute function interno.cambio_solo_se_agrega();
create trigger cambio_sin_borrar before delete on public.cambio
  for each row execute function interno.cambio_solo_se_agrega();

-- Estado actual de cada registro: sus campos y la marca de cada uno en forma canónica (`base` = la menor, `campos` = los demás).
create table public.registro (
  finca_id uuid not null references public.finca_servidor (id),
  entidad text not null check (entidad ~ '^[a-z][a-z_]{0,39}$'),
  registro_id text collate "C" not null check (length(registro_id) between 1 and 100),
  campos jsonb not null check (jsonb_typeof(campos) = 'object'),
  marcas jsonb not null check (jsonb_typeof(marcas) = 'object'),
  actualizado_seq bigint,
  primary key (finca_id, entidad, registro_id)
);
-- Los números de registro (R31) se buscan por animal y por libro.
create index registro_genealogico_por_animal on public.registro (finca_id, (campos ->> 'animal_id'))
  where entidad = 'registro_genealogico';
create index registro_genealogico_por_libro on public.registro (finca_id, (campos ->> 'libro_id'))
  where entidad = 'registro_genealogico';

-- Siguiente consecutivo de cada libro (R31).
create table public.libro_numeracion (
  finca_id uuid not null references public.finca_servidor (id),
  libro_id text collate "C" not null,
  siguiente integer not null check (siguiente >= 1),
  primary key (finca_id, libro_id)
);

-- Respuesta guardada de cada llamada arbitrada: un reintento con el mismo `cambio_id` devuelve lo mismo sin consumir otro número.
create table public.llamada_arbitrada (
  finca_id uuid not null references public.finca_servidor (id),
  cambio_id uuid not null,
  funcion text not null,
  dispositivo_id uuid not null,
  resultado jsonb not null,
  creado_en timestamptz not null default public.ahora_servidor(),
  primary key (finca_id, cambio_id)
);

-- Permisos: RLS activa sin políticas y nada para los roles de la API.
alter table public.cuenta enable row level security;
alter table public.cuenta_autorizada enable row level security;
alter table public.finca_servidor enable row level security;
alter table public.membresia enable row level security;
alter table public.dispositivo enable row level security;
alter table public.invitacion enable row level security;
alter table public.cambio enable row level security;
alter table public.registro enable row level security;
alter table public.libro_numeracion enable row level security;
alter table public.llamada_arbitrada enable row level security;

revoke all on table
  public.cuenta, public.cuenta_autorizada, public.finca_servidor, public.membresia, public.dispositivo, public.invitacion,
  public.cambio, public.registro, public.libro_numeracion, public.llamada_arbitrada
  from public, anon, authenticated;

-- La secuencia de `cambio.seq` también recibe permisos por defecto en Supabase.
do $$
begin
  execute format('revoke all on sequence %s from public, anon, authenticated', pg_get_serial_sequence('public.cambio', 'seq'));
end $$;
