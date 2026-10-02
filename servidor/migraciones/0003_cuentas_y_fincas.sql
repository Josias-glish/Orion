-- Migración 0003: cuentas, fincas, equipos e invitaciones (Etapa 10; contrato: servidor/PROTOCOLO.md, sección 4).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Todas las funciones públicas son `security definer`, con `set search_path = ''`, y lo primero que hacen es comprobar
-- `auth.uid()`. La membresía se revisa contra la tabla, nunca contra lo que diga el cliente. Una finca ajena y una finca que
-- no existe dan el mismo error (`finca_inexistente`). Los errores son `raise exception using errcode = 'P0001', message = '<codigo>'`
-- y nunca llevan datos de otra cuenta.

------------------------------------------------------------------------------------------------------------------------
-- Auxiliares (esquema `interno`, sin ningún permiso para la API)
------------------------------------------------------------------------------------------------------------------------

-- La cuenta de la sesión. Sin sesión: `sin_sesion`.
create or replace function interno.cuenta_actual() returns uuid
language plpgsql volatile set search_path = '' as $$
declare
  v_cuenta uuid := auth.uid();
begin
  if v_cuenta is null then
    raise exception using errcode = 'P0001', message = 'sin_sesion';
  end if;
  return v_cuenta;
end $$;

-- Un uuid escrito como texto; null si no lo es (el cast directo lanzaría un error).
create or replace function interno.a_uuid(p_texto text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  if p_texto is not null and p_texto ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return p_texto::uuid;
  end if;
  return null;
end $$;

-- La sesión debe ser miembro de la finca. Devuelve la cuenta. Finca ajena e inexistente: el mismo error.
create or replace function interno.exigir_miembro(p_finca_id uuid) returns uuid
language plpgsql volatile set search_path = '' as $$
declare
  v_cuenta uuid := interno.cuenta_actual();
begin
  if p_finca_id is null
     or not exists (select 1 from public.membresia m where m.cuenta_id = v_cuenta and m.finca_id = p_finca_id) then
    raise exception using errcode = 'P0001', message = 'finca_inexistente';
  end if;
  return v_cuenta;
end $$;

-- Miembro de la finca con el rol de propietario (hoy es el único rol).
create or replace function interno.exigir_propietario(p_finca_id uuid) returns uuid
language plpgsql volatile set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_miembro(p_finca_id);
begin
  if not exists (
    select 1 from public.membresia m where m.cuenta_id = v_cuenta and m.finca_id = p_finca_id and m.rol = 'propietario'
  ) then
    raise exception using errcode = 'P0001', message = 'sin_permiso';
  end if;
  return v_cuenta;
end $$;

-- Miembro de la finca con un equipo suyo y vigente. Un equipo de otra cuenta o de otra finca es «desconocido»; uno revocado
-- recibe `dispositivo_revocado`. Devuelve la cuenta.
create or replace function interno.exigir_equipo(p_finca_id uuid, p_dispositivo_id uuid) returns uuid
language plpgsql volatile set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_miembro(p_finca_id);
  v_revocado timestamptz;
begin
  select d.revocado_en
    into v_revocado
    from public.dispositivo d
   where d.id = p_dispositivo_id and d.finca_id = p_finca_id and d.cuenta_id = v_cuenta;
  if not found then
    raise exception using errcode = 'P0001', message = 'dispositivo_desconocido';
  end if;
  if v_revocado is not null then
    raise exception using errcode = 'P0001', message = 'dispositivo_revocado';
  end if;
  return v_cuenta;
end $$;

-- El candado de la finca: un solo escritor a la vez, así `seq` se asigna en el orden de confirmación (PROTOCOLO.md, sección 5).
create or replace function interno.candado_de_finca(p_finca_id uuid) returns void
language plpgsql volatile set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('finca:' || p_finca_id::text));
end $$;

-- Crea o actualiza la fila de `cuenta` desde `auth.users` (correo en minúsculas). Devuelve el correo.
create or replace function interno.asegurar_cuenta(p_cuenta uuid) returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_correo text;
begin
  insert into public.cuenta (id, correo)
  select u.id, lower(btrim(coalesce(u.email, '')))
    from auth.users u
   where u.id = p_cuenta
  on conflict (id) do update set correo = excluded.correo
  returning correo into v_correo;
  if v_correo is null then
    raise exception using errcode = 'P0001', message = 'sin_sesion';
  end if;
  return v_correo;
end $$;

-- 1 → A, 2 → B, …, 26 → Z, 27 → AA, 28 → AB… (letras de equipo, únicas por finca).
create or replace function interno.letras_de_equipo(p_numero integer) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_n integer := p_numero;
  v_letras text := '';
begin
  while v_n > 0 loop
    v_n := v_n - 1;
    v_letras := chr(65 + v_n % 26) || v_letras;
    v_n := v_n / 26;
  end loop;
  return v_letras;
end $$;

-- Registra un equipo en la finca (con el candado de la finca ya tomado). `p_dispositivo` = {"id": uuid, "nombre", "plataforma"}.
-- Idempotente si el equipo ya es de esta cuenta y de esta finca; si es de otra cuenta u otra finca: `dispositivo_desconocido`;
-- si estaba revocado: `dispositivo_revocado`. Devuelve el id del equipo.
create or replace function interno.registrar_equipo(p_finca_id uuid, p_cuenta uuid, p_dispositivo jsonb, p_version_esquema integer)
returns uuid
language plpgsql volatile set search_path = '' as $$
declare
  v_id uuid;
  v_nombre text;
  v_plataforma text;
  v_existente public.dispositivo;
  v_numero integer;
begin
  if p_dispositivo is null or jsonb_typeof(p_dispositivo) <> 'object' then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  v_id := interno.a_uuid(p_dispositivo ->> 'id');
  if v_id is null then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  v_nombre := left(coalesce(nullif(btrim(p_dispositivo ->> 'nombre'), ''), 'Equipo'), 100);
  v_plataforma := left(coalesce(btrim(p_dispositivo ->> 'plataforma'), ''), 40);

  select d.* into v_existente from public.dispositivo d where d.id = v_id;
  if found then
    if v_existente.finca_id <> p_finca_id or v_existente.cuenta_id <> p_cuenta then
      raise exception using errcode = 'P0001', message = 'dispositivo_desconocido';
    end if;
    if v_existente.revocado_en is not null then
      raise exception using errcode = 'P0001', message = 'dispositivo_revocado';
    end if;
    update public.dispositivo
       set nombre = v_nombre, plataforma = v_plataforma, version_esquema = p_version_esquema
     where id = v_id;
    return v_id;
  end if;

  update public.finca_servidor set siguiente_equipo = siguiente_equipo + 1
   where id = p_finca_id
  returning siguiente_equipo - 1 into v_numero;
  insert into public.dispositivo (id, finca_id, cuenta_id, nombre, plataforma, codigo_equipo, version_esquema)
  values (v_id, p_finca_id, p_cuenta, v_nombre, v_plataforma, interno.letras_de_equipo(v_numero), p_version_esquema);
  return v_id;
end $$;

-- El «objeto de vínculo» que devuelven crear_finca y unirse_a_finca.
create or replace function interno.vinculo(p_finca_id uuid, p_dispositivo_id uuid) returns jsonb
language sql volatile set search_path = '' as $$
  select jsonb_build_object(
    'finca_id', f.id,
    'finca_nombre', f.nombre,
    'dispositivo_id', d.id,
    'codigo_equipo', d.codigo_equipo,
    'hora_servidor_ms', interno.ms_de(public.ahora_servidor()),
    'seq_actual', coalesce((select max(c.seq) from public.cambio c where c.finca_id = f.id), 0),
    'version_esquema_minima', f.version_esquema_minima
  )
  from public.finca_servidor f
  join public.dispositivo d on d.id = p_dispositivo_id and d.finca_id = f.id
  where f.id = p_finca_id
$$;

------------------------------------------------------------------------------------------------------------------------
-- Funciones públicas
------------------------------------------------------------------------------------------------------------------------

-- registrar_cuenta() → { cuenta_id, correo, puede_crear_finca }
create or replace function public.registrar_cuenta() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.cuenta_actual();
  v_correo text;
begin
  v_correo := interno.asegurar_cuenta(v_cuenta);
  return jsonb_build_object(
    'cuenta_id', v_cuenta,
    'correo', v_correo,
    'puede_crear_finca', exists (select 1 from public.cuenta_autorizada a where a.correo = v_correo)
  );
end $$;

-- crear_finca(...) → objeto de vínculo. Solo correos autorizados (S-89). Idempotente para el mismo equipo de un miembro.
create or replace function public.crear_finca(p_finca_id uuid, p_nombre text, p_version_esquema integer, p_dispositivo jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.cuenta_actual();
  v_correo text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_autorizada boolean;
  v_dispositivo uuid;
begin
  if p_finca_id is null or p_version_esquema is null or p_version_esquema < 1
     or v_nombre = '' or length(v_nombre) > 200 then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  v_correo := interno.asegurar_cuenta(v_cuenta);
  perform interno.candado_de_finca(p_finca_id);

  if exists (select 1 from public.finca_servidor f where f.id = p_finca_id) then
    if exists (select 1 from public.membresia m where m.cuenta_id = v_cuenta and m.finca_id = p_finca_id) then
      -- Reintento (por ejemplo, se perdió la respuesta): idempotente si es el mismo equipo.
      v_dispositivo := interno.a_uuid(p_dispositivo ->> 'id');
      if v_dispositivo is not null and exists (
        select 1 from public.dispositivo d
         where d.id = v_dispositivo and d.finca_id = p_finca_id and d.cuenta_id = v_cuenta
      ) then
        perform interno.registrar_equipo(p_finca_id, v_cuenta, p_dispositivo, p_version_esquema);
        return interno.vinculo(p_finca_id, v_dispositivo);
      end if;
      raise exception using errcode = 'P0001', message = 'finca_existente';
    end if;
    -- Quien no es miembro y no está autorizado no se entera de que la finca existe.
    if not exists (select 1 from public.cuenta_autorizada a where a.correo = v_correo) then
      raise exception using errcode = 'P0001', message = 'no_autorizada';
    end if;
    raise exception using errcode = 'P0001', message = 'finca_existente';
  end if;

  select exists (select 1 from public.cuenta_autorizada a where a.correo = v_correo) into v_autorizada;
  if not v_autorizada then
    raise exception using errcode = 'P0001', message = 'no_autorizada';
  end if;

  -- La versión del equipo que crea la finca es la mínima de partida: un equipo más antiguo no puede unirse.
  insert into public.finca_servidor (id, nombre, creada_por, version_esquema_minima)
  values (p_finca_id, v_nombre, v_cuenta, p_version_esquema);
  insert into public.membresia (cuenta_id, finca_id, rol) values (v_cuenta, p_finca_id, 'propietario');
  v_dispositivo := interno.registrar_equipo(p_finca_id, v_cuenta, p_dispositivo, p_version_esquema);
  return interno.vinculo(p_finca_id, v_dispositivo);
end $$;

-- mis_fincas() → [ { finca_id, nombre, rol } ]
create or replace function public.mis_fincas() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.cuenta_actual();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('finca_id', f.id, 'nombre', f.nombre, 'rol', m.rol) order by f.creado_en, f.id)
      from public.membresia m
      join public.finca_servidor f on f.id = m.finca_id
     where m.cuenta_id = v_cuenta
  ), '[]'::jsonb);
end $$;

-- crear_invitacion(p_finca_id) → { codigo: 'ABCDE-FGHJK', vence_en }. Solo un propietario. Diez caracteres de un alfabeto sin letras
-- que se confunden (50 bits), al azar con gen_random_uuid() (que usa un generador criptográfico y no depende de pgcrypto). Vence a las
-- 24 horas y sirve una vez. Solo se guarda el SHA-256 del código en mayúsculas y sin guion.
create or replace function public.crear_invitacion(p_finca_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_propietario(p_finca_id);
  v_ahora timestamptz := public.ahora_servidor();
  v_vence timestamptz := v_ahora + interval '24 hours';
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  -- Posiciones de los bytes de un uuid v4 que son totalmente aleatorios (el 6 y el 8 llevan la versión y la variante).
  v_posiciones constant integer[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11];
  v_bytes bytea;
  v_posicion integer;
  v_codigo text;
begin
  loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_codigo := '';
    foreach v_posicion in array v_posiciones loop
      -- 256 es múltiplo de 32: sin sesgo.
      v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, v_posicion) & 31) + 1, 1);
    end loop;
    begin
      insert into public.invitacion (finca_id, codigo_hash, creada_por, vence_en)
      values (p_finca_id, encode(sha256(convert_to(v_codigo, 'UTF8')), 'hex'), v_cuenta, v_vence);
      exit;
    exception when unique_violation then
      null; -- código repetido (casi imposible): se genera otro
    end;
  end loop;
  return jsonb_build_object('codigo', substr(v_codigo, 1, 5) || '-' || substr(v_codigo, 6), 'vence_en', interno.iso_de(v_vence));
end $$;

-- unirse_a_finca(p_finca_id, p_codigo, p_dispositivo, p_version_esquema) → objeto de vínculo. Se da UNO de los dos: la finca (la
-- cuenta ya es miembro) o el código de invitación.
-- Un código que no sirve (no existe, venció, ya se usó, está mal escrito o la cuenta está bloqueada) da SIEMPRE el mismo resultado,
-- {"error": "codigo_invalido"}, y NO se lanza como excepción: si se lanzara, Postgres desharía la transacción y con ella la cuenta del
-- intento fallido, y el límite de 5 intentos no serviría de nada. Ver «Desviaciones del protocolo» en servidor/LEEME.md.
create or replace function public.unirse_a_finca(p_finca_id uuid, p_codigo text, p_dispositivo jsonb, p_version_esquema integer)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.cuenta_actual();
  v_ahora timestamptz := public.ahora_servidor();
  v_codigo text := nullif(btrim(coalesce(p_codigo, '')), '');
  v_finca uuid;
  v_invitacion public.invitacion;
  v_bloqueo timestamptz;
  v_minima integer;
  v_dispositivo uuid;
begin
  if p_version_esquema is null or p_version_esquema < 1 or (p_finca_id is null) = (v_codigo is null) then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  perform interno.asegurar_cuenta(v_cuenta);

  if p_finca_id is not null then
    perform interno.exigir_miembro(p_finca_id);
    v_finca := p_finca_id;
    perform interno.candado_de_finca(v_finca);
  else
    select c.bloqueo_hasta into v_bloqueo from public.cuenta c where c.id = v_cuenta for update;
    if v_bloqueo is not null and v_bloqueo > v_ahora then
      return jsonb_build_object('error', 'codigo_invalido');
    end if;
    if v_bloqueo is not null then
      -- Venció el bloqueo: se empieza de nuevo.
      update public.cuenta set bloqueo_hasta = null, intentos_codigo = 0 where id = v_cuenta;
    end if;

    select i.* into v_invitacion
      from public.invitacion i
     where i.codigo_hash = encode(sha256(convert_to(upper(regexp_replace(v_codigo, '[\s-]', '', 'g')), 'UTF8')), 'hex')
       and i.usada_en is null
       and i.vence_en > v_ahora
       for update;
    if not found then
      update public.cuenta
         set intentos_codigo = intentos_codigo + 1,
             bloqueo_hasta = case when intentos_codigo + 1 >= 5 then v_ahora + interval '1 hour' else null end
       where id = v_cuenta;
      return jsonb_build_object('error', 'codigo_invalido');
    end if;

    v_finca := v_invitacion.finca_id;
    perform interno.candado_de_finca(v_finca);
    update public.invitacion set usada_por = v_cuenta, usada_en = v_ahora where id = v_invitacion.id;
    -- Si ya era miembro, el rol no cambia.
    insert into public.membresia (cuenta_id, finca_id, rol) values (v_cuenta, v_finca, v_invitacion.rol)
      on conflict (cuenta_id, finca_id) do nothing;
    update public.cuenta set intentos_codigo = 0, bloqueo_hasta = null where id = v_cuenta;
  end if;

  select f.version_esquema_minima into v_minima from public.finca_servidor f where f.id = v_finca for update;
  if p_version_esquema < v_minima then
    raise exception using errcode = 'P0001', message = 'esquema_antiguo';
  end if;
  if p_version_esquema > v_minima then
    update public.finca_servidor set version_esquema_minima = p_version_esquema where id = v_finca;
  end if;

  v_dispositivo := interno.registrar_equipo(v_finca, v_cuenta, p_dispositivo, p_version_esquema);
  return interno.vinculo(v_finca, v_dispositivo);
end $$;

-- listar_dispositivos(p_finca_id) → [ { id, nombre, plataforma, codigo_equipo, ultima_sincronizacion_ms, revocado, cuenta_correo } ]
create or replace function public.listar_dispositivos(p_finca_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_miembro(p_finca_id);
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'nombre', d.nombre,
        'plataforma', d.plataforma,
        'codigo_equipo', d.codigo_equipo,
        'ultima_sincronizacion_ms', case when d.ultima_sincronizacion is null then null else interno.ms_de(d.ultima_sincronizacion) end,
        'revocado', d.revocado_en is not null,
        'cuenta_correo', c.correo
      )
      order by length(d.codigo_equipo), d.codigo_equipo
    )
      from public.dispositivo d
      left join public.cuenta c on c.id = d.cuenta_id
     where d.finca_id = p_finca_id
  ), '[]'::jsonb);
end $$;

-- revocar_dispositivo(p_finca_id, p_dispositivo_id) → { ok: true }. Un propietario (puede ser el propio equipo: así se desvincula).
create or replace function public.revocar_dispositivo(p_finca_id uuid, p_dispositivo_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_propietario(p_finca_id);
begin
  update public.dispositivo
     set revocado_en = coalesce(revocado_en, public.ahora_servidor())
   where id = p_dispositivo_id and finca_id = p_finca_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'dispositivo_desconocido';
  end if;
  return jsonb_build_object('ok', true);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- Permisos
------------------------------------------------------------------------------------------------------------------------

revoke all on function interno.cuenta_actual() from public, anon, authenticated;
revoke all on function interno.a_uuid(text) from public, anon, authenticated;
revoke all on function interno.exigir_miembro(uuid) from public, anon, authenticated;
revoke all on function interno.exigir_propietario(uuid) from public, anon, authenticated;
revoke all on function interno.exigir_equipo(uuid, uuid) from public, anon, authenticated;
revoke all on function interno.candado_de_finca(uuid) from public, anon, authenticated;
revoke all on function interno.asegurar_cuenta(uuid) from public, anon, authenticated;
revoke all on function interno.letras_de_equipo(integer) from public, anon, authenticated;
revoke all on function interno.registrar_equipo(uuid, uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function interno.vinculo(uuid, uuid) from public, anon, authenticated;

revoke all on function public.registrar_cuenta() from public, anon, authenticated;
revoke all on function public.crear_finca(uuid, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.mis_fincas() from public, anon, authenticated;
revoke all on function public.crear_invitacion(uuid) from public, anon, authenticated;
revoke all on function public.unirse_a_finca(uuid, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.listar_dispositivos(uuid) from public, anon, authenticated;
revoke all on function public.revocar_dispositivo(uuid, uuid) from public, anon, authenticated;

grant execute on function public.registrar_cuenta() to authenticated;
grant execute on function public.crear_finca(uuid, text, integer, jsonb) to authenticated;
grant execute on function public.mis_fincas() to authenticated;
grant execute on function public.crear_invitacion(uuid) to authenticated;
grant execute on function public.unirse_a_finca(uuid, text, jsonb, integer) to authenticated;
grant execute on function public.listar_dispositivos(uuid) to authenticated;
grant execute on function public.revocar_dispositivo(uuid, uuid) to authenticated;
