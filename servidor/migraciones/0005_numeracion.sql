-- Migración 0005: operaciones arbitradas, los números de registro genealógico (R31; Etapa 10; contrato: servidor/PROTOCOLO.md, sección 6).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- El servidor asigna los consecutivos de uno en uno, dentro del candado de la finca (el mismo de `sincronizar`), así dos equipos
-- que emitan a la vez sobre el mismo libro reciben números distintos y sin saltos. Todas son idempotentes por `p_cambio_id`: la
-- primera vez se guarda la respuesta en `llamada_arbitrada`; un reintento devuelve exactamente lo mismo y no consume otro número.
-- Los cambios que producen se guardan en `cambio` con `arbitrado = true`, el equipo que llamó, un `grupo_id` por llamada, `orden`
-- correlativo y UNA marca generada por el servidor (la siguiente a `marca_ultima`, equipo 00000000). El `cambio_id` de cada uno se
-- deriva del `p_cambio_id` y de su orden, así que es único y estable.

------------------------------------------------------------------------------------------------------------------------
-- Auxiliares (esquema `interno`)
------------------------------------------------------------------------------------------------------------------------

-- Entero de un valor JSON (número o texto numérico); `p_defecto` si no lo es.
create or replace function interno.entero_de_json(p_valor jsonb, p_defecto integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  v_numero numeric;
begin
  if jsonb_typeof(p_valor) = 'number' then
    v_numero := (p_valor #>> '{}')::numeric;
  elsif jsonb_typeof(p_valor) = 'string' and (p_valor #>> '{}') ~ '^[0-9]{1,9}$' then
    v_numero := (p_valor #>> '{}')::numeric;
  else
    return p_defecto;
  end if;
  if v_numero < -1000000000 or v_numero > 1000000000 then
    return p_defecto;
  end if;
  return floor(v_numero)::integer;
end $$;

-- ¿`campos` es un objeto no vacío de nombres válidos con valores texto, número o null?
create or replace function interno.campos_validos(p_campos jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_clave text;
  v_valor jsonb;
begin
  if jsonb_typeof(p_campos) is distinct from 'object' or p_campos = '{}'::jsonb then
    return false;
  end if;
  for v_clave, v_valor in select e.key, e.value from jsonb_each(p_campos) as e loop
    if v_clave !~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$' or jsonb_typeof(v_valor) not in ('string', 'number', 'null') then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- La instantánea (texto JSON) como objeto jsonb; null si no es un objeto JSON válido.
create or replace function interno.instantanea_objeto(p_texto text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_json jsonb;
begin
  v_json := p_texto::jsonb;
  if jsonb_typeof(v_json) <> 'object' then
    return null;
  end if;
  return v_json;
exception when others then
  return null;
end $$;

-- `cambio_id` de cada cambio que produce una llamada arbitrada: estable y único por (llamada, orden).
create or replace function interno.cambio_id_derivado(p_cambio_id uuid, p_orden integer) returns uuid
language sql immutable set search_path = '' as $$
  select md5(p_cambio_id::text || ':' || p_orden::text)::uuid
$$;

-- La respuesta guardada de una llamada anterior con el mismo `cambio_id` (null si es la primera vez). Reutilizar el `cambio_id`
-- en otra función es un error del programa.
create or replace function interno.llamada_previa(p_finca_id uuid, p_cambio_id uuid, p_funcion text) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_funcion text;
  v_resultado jsonb;
begin
  select l.funcion, l.resultado into v_funcion, v_resultado
    from public.llamada_arbitrada l
   where l.finca_id = p_finca_id and l.cambio_id = p_cambio_id;
  if not found then
    return null;
  end if;
  if v_funcion <> p_funcion then
    raise exception using errcode = 'P0001', message = 'cambio_id_reutilizado';
  end if;
  return v_resultado;
end $$;

create or replace function interno.guardar_llamada(p_finca_id uuid, p_cambio_id uuid, p_funcion text, p_dispositivo_id uuid, p_resultado jsonb)
returns void
language plpgsql volatile set search_path = '' as $$
begin
  insert into public.llamada_arbitrada (finca_id, cambio_id, funcion, dispositivo_id, resultado)
  values (p_finca_id, p_cambio_id, p_funcion, p_dispositivo_id, p_resultado);
end $$;

-- La marca de una llamada: la siguiente a la última de la finca. Bloquea la fila de la finca (el candado ya está tomado).
create or replace function interno.marca_de_llamada(p_finca_id uuid, p_ahora_ms bigint) returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_ultima text;
begin
  select f.marca_ultima into v_ultima from public.finca_servidor f where f.id = p_finca_id for update;
  return interno.marca_siguiente(v_ultima, p_ahora_ms);
end $$;

-- Aplica un cambio arbitrado: lo mezcla en `registro`, lo agrega a `cambio` (arbitrado) y sube `marca_ultima`. Devuelve su `seq`.
create or replace function interno.aplicar_arbitrado(
  p_finca_id uuid,
  p_dispositivo_id uuid,
  p_cambio_id uuid,
  p_grupo_id uuid,
  p_orden integer,
  p_entidad text,
  p_registro_id text,
  p_operacion text,
  p_campos jsonb,
  p_marca text,
  p_marca_original text,
  p_ahora timestamptz
) returns bigint
language plpgsql volatile set search_path = '' as $$
declare
  v_reg_campos jsonb;
  v_reg_marcas jsonb;
  v_fusion jsonb;
  v_seq bigint;
begin
  select r.campos, r.marcas into v_reg_campos, v_reg_marcas
    from public.registro r
   where r.finca_id = p_finca_id and r.entidad = p_entidad and r.registro_id = p_registro_id
     for update;
  v_fusion := public.fusionar_registro(v_reg_campos, v_reg_marcas, p_campos, p_marca);

  insert into public.cambio (
    finca_id, cambio_id, grupo_id, orden, dispositivo_id, usuario_id, entidad, registro_id, operacion, campos,
    marca, marca_original, arbitrado, recibido_en
  ) values (
    p_finca_id, interno.cambio_id_derivado(p_cambio_id, p_orden), p_grupo_id, p_orden, p_dispositivo_id, null,
    p_entidad, p_registro_id, p_operacion, p_campos, p_marca, p_marca_original, true, p_ahora
  ) returning seq into v_seq;

  insert into public.registro (finca_id, entidad, registro_id, campos, marcas, actualizado_seq)
  values (p_finca_id, p_entidad, p_registro_id, v_fusion -> 'campos', v_fusion -> 'marcas', v_seq)
  on conflict (finca_id, entidad, registro_id)
  do update set campos = excluded.campos, marcas = excluded.marcas, actualizado_seq = excluded.actualizado_seq;

  update public.finca_servidor
     set marca_ultima = p_marca
   where id = p_finca_id and (p_marca collate "C") > (marca_ultima collate "C");
  return v_seq;
end $$;

-- Los campos de un libro que no está eliminado (null si no existe o está eliminado).
create or replace function interno.libro_vigente(p_finca_id uuid, p_libro_id text) returns jsonb
language sql stable set search_path = '' as $$
  select r.campos
    from public.registro r
   where r.finca_id = p_finca_id and r.entidad = 'libro' and r.registro_id = p_libro_id
     and not public.registro_eliminado(r.campos, r.marcas)
$$;

-- El siguiente consecutivo de un libro: el contador (o, si no hay, `siguiente_numero` del libro o 1), nunca menor que el mayor
-- consecutivo que ya existe más uno.
create or replace function interno.siguiente_de_libro(p_finca_id uuid, p_libro_id text, p_libro jsonb) returns integer
language plpgsql volatile set search_path = '' as $$
declare
  v_siguiente integer;
  v_mayor numeric;
begin
  select n.siguiente into v_siguiente
    from public.libro_numeracion n
   where n.finca_id = p_finca_id and n.libro_id = p_libro_id;
  if v_siguiente is null then
    v_siguiente := greatest(interno.entero_de_json(p_libro -> 'siguiente_numero', 1), 1);
  end if;
  select max((r.campos ->> 'consecutivo')::numeric) into v_mayor
    from public.registro r
   where r.finca_id = p_finca_id and r.entidad = 'registro_genealogico'
     and r.campos ->> 'libro_id' = p_libro_id
     and jsonb_typeof(r.campos -> 'consecutivo') = 'number';
  if v_mayor is not null and v_mayor + 1 > v_siguiente then
    v_siguiente := (v_mayor + 1)::integer;
  end if;
  return v_siguiente;
end $$;

-- prefijo + separador + consecutivo con ceros a la izquierda hasta `p_digitos` (un consecutivo más largo no se recorta; `lpad` sí lo recortaría).
create or replace function interno.numero_de_registro(p_prefijo text, p_separador text, p_digitos integer, p_consecutivo integer)
returns text
language sql immutable set search_path = '' as $$
  select p_prefijo || p_separador || repeat('0', greatest(p_digitos - length(p_consecutivo::text), 0)) || p_consecutivo::text
$$;

------------------------------------------------------------------------------------------------------------------------
-- emitir_registros
------------------------------------------------------------------------------------------------------------------------

-- emitir_registros(p_finca_id, p_dispositivo_id, p_cambio_id, p_registros) → { resultados: [...], seq_final, hora_servidor_ms }
-- Cada elemento: { registro_id, animal_id, libro_id, fecha_registro, instantanea (texto JSON), responsable, observaciones }.
-- Valida TODO antes de asignar: si algo falla no se consume ningún número (la llamada entera se deshace).
create or replace function public.emitir_registros(p_finca_id uuid, p_dispositivo_id uuid, p_cambio_id uuid, p_registros jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_previo jsonb;
  v_ahora timestamptz;
  v_ahora_ms bigint;
  v_elemento jsonb;
  v_registro_id text;
  v_animal_id text;
  v_libro_id text;
  v_ids text[] := '{}';
  v_animales text[] := '{}';
  v_libro jsonb;
  v_existente jsonb;
  v_existente_marcas jsonb;
  v_estado text;
  v_prefijo text;
  v_separador text;
  v_digitos integer;
  v_contadores jsonb := '{}'::jsonb;
  v_libros text[] := '{}';
  v_consecutivo integer;
  v_numero text;
  v_marca text;
  v_grupo uuid := gen_random_uuid();
  v_orden integer := 0;
  v_seq bigint;
  v_campos jsonb;
  v_instantanea jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_resultado jsonb;
begin
  if p_cambio_id is null then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  perform interno.candado_de_finca(p_finca_id);
  perform interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_previo := interno.llamada_previa(p_finca_id, p_cambio_id, 'emitir_registros');
  if v_previo is not null then
    return v_previo;
  end if;

  if jsonb_typeof(p_registros) is distinct from 'array' or jsonb_array_length(p_registros) = 0 then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  if jsonb_array_length(p_registros) > 500 or octet_length(p_registros::text) > 8388608 then
    raise exception using errcode = 'P0001', message = 'demasiado_grande';
  end if;
  v_ahora := public.ahora_servidor();
  v_ahora_ms := interno.ms_de(v_ahora);

  -- Primero se valida todo, sin escribir nada.
  for v_elemento in select e.value from jsonb_array_elements(p_registros) as e loop
    if jsonb_typeof(v_elemento) is distinct from 'object'
       or jsonb_typeof(v_elemento -> 'registro_id') is distinct from 'string'
       or jsonb_typeof(v_elemento -> 'animal_id') is distinct from 'string'
       or jsonb_typeof(v_elemento -> 'libro_id') is distinct from 'string'
       or jsonb_typeof(v_elemento -> 'fecha_registro') is distinct from 'string'
       or jsonb_typeof(v_elemento -> 'instantanea') is distinct from 'string'
       or jsonb_typeof(v_elemento -> 'responsable') not in ('string', 'null')
       or jsonb_typeof(v_elemento -> 'observaciones') not in ('string', 'null')
       or length(v_elemento ->> 'registro_id') not between 1 and 100
       or (v_elemento ->> 'animal_id') = '' or (v_elemento ->> 'libro_id') = '' then
      raise exception using errcode = 'P0001', message = 'parametro_invalido';
    end if;
    -- La instantánea es un objeto JSON: el servidor le escribe el número asignado.
    if interno.instantanea_objeto(v_elemento ->> 'instantanea') is null then
      raise exception using errcode = 'P0001', message = 'parametro_invalido';
    end if;
    v_registro_id := v_elemento ->> 'registro_id';
    v_animal_id := v_elemento ->> 'animal_id';
    v_libro_id := v_elemento ->> 'libro_id';

    -- El libro existe y tiene prefijo.
    v_libro := interno.libro_vigente(p_finca_id, v_libro_id);
    if v_libro is null then
      raise exception using errcode = 'P0001', message = 'libro_no_encontrado';
    end if;
    if nullif(btrim(coalesce(v_libro ->> 'prefijo', '')), '') is null then
      raise exception using errcode = 'P0001', message = 'libro_sin_prefijo';
    end if;

    -- `registro_id` y `animal_id` no se repiten en la llamada.
    if v_registro_id = any (v_ids) then
      raise exception using errcode = 'P0001', message = 'parametro_invalido';
    end if;
    if v_animal_id = any (v_animales) then
      raise exception using errcode = 'P0001', message = 'animal_con_registro';
    end if;
    v_ids := array_append(v_ids, v_registro_id);
    v_animales := array_append(v_animales, v_animal_id);

    -- Si el registro ya existe debe ser un borrador de ese animal.
    select r.campos, r.marcas into v_existente, v_existente_marcas
      from public.registro r
     where r.finca_id = p_finca_id and r.entidad = 'registro_genealogico' and r.registro_id = v_registro_id;
    if v_existente is not null then
      v_estado := coalesce(v_existente ->> 'estado', 'borrador');
      if v_estado = 'anulado' then
        raise exception using errcode = 'P0001', message = 'registro_anulado';
      elsif v_estado <> 'borrador' then
        raise exception using errcode = 'P0001', message = 'registro_ya_emitido';
      end if;
      if public.registro_eliminado(v_existente, v_existente_marcas) then
        raise exception using errcode = 'P0001', message = 'registro_no_encontrado';
      end if;
      if (v_existente ->> 'animal_id') is distinct from v_animal_id then
        raise exception using errcode = 'P0001', message = 'registro_inconsistente';
      end if;
    end if;

    -- Ningún otro registro vigente (ni borrador) del mismo animal.
    if exists (
      select 1
        from public.registro r
       where r.finca_id = p_finca_id and r.entidad = 'registro_genealogico'
         and r.campos ->> 'animal_id' = v_animal_id
         and r.registro_id <> v_registro_id
         and coalesce(r.campos ->> 'estado', 'borrador') <> 'anulado'
         and not public.registro_eliminado(r.campos, r.marcas)
    ) then
      raise exception using errcode = 'P0001', message = 'animal_con_registro';
    end if;
  end loop;

  -- Todo es válido: se asignan los consecutivos EN EL ORDEN RECIBIDO.
  v_marca := interno.marca_de_llamada(p_finca_id, v_ahora_ms);
  for v_elemento in select e.value from jsonb_array_elements(p_registros) as e loop
    v_registro_id := v_elemento ->> 'registro_id';
    v_libro_id := v_elemento ->> 'libro_id';
    v_libro := interno.libro_vigente(p_finca_id, v_libro_id);
    v_prefijo := v_libro ->> 'prefijo';
    v_separador := coalesce(v_libro ->> 'separador_numero', '-');
    v_digitos := least(greatest(interno.entero_de_json(v_libro -> 'digitos_numero', 4), 0), 20);

    if (v_contadores ->> v_libro_id) is null then
      v_consecutivo := interno.siguiente_de_libro(p_finca_id, v_libro_id, v_libro);
      v_libros := array_append(v_libros, v_libro_id);
    else
      v_consecutivo := (v_contadores ->> v_libro_id)::integer;
    end if;
    v_contadores := v_contadores || jsonb_build_object(v_libro_id, v_consecutivo + 1);
    v_numero := interno.numero_de_registro(v_prefijo, v_separador, v_digitos, v_consecutivo);

    select r.campos into v_existente
      from public.registro r
     where r.finca_id = p_finca_id and r.entidad = 'registro_genealogico' and r.registro_id = v_registro_id;

    -- El programa arma la instantánea sin conocer el número (manda `numero: null`, `version: 1`): el servidor pone el número
    -- asignado y la versión 1, y la guarda de nuevo como texto. El resultado y el cambio llevan la instantánea ya corregida.
    v_instantanea := jsonb_set(
      jsonb_set(interno.instantanea_objeto(v_elemento ->> 'instantanea'), '{numero}', to_jsonb(v_numero), true),
      '{version}', '1'::jsonb, true
    );
    v_campos := jsonb_build_object(
      'libro_id', v_libro_id,
      'consecutivo', v_consecutivo,
      'numero', v_numero,
      'fecha_registro', v_elemento -> 'fecha_registro',
      'estado', 'emitido',
      'version', 1,
      'instantanea', to_jsonb(v_instantanea::text),
      'responsable', v_elemento -> 'responsable',
      'motivo_anulacion', null::text,
      'observaciones', v_elemento -> 'observaciones',
      'eliminado_en', null::text
    );
    if v_existente is null then
      -- `creado_en` es la hora de la marca (la del servidor, o la de `marca_ultima` si la hora no la supera).
      v_campos := v_campos || jsonb_build_object('animal_id', v_elemento -> 'animal_id', 'creado_en', substr(v_marca, 1, 24));
    end if;

    v_seq := interno.aplicar_arbitrado(
      p_finca_id, p_dispositivo_id, p_cambio_id, v_grupo, v_orden,
      'registro_genealogico', v_registro_id, case when v_existente is null then 'crear' else 'modificar' end,
      v_campos, v_marca, null, v_ahora
    );
    v_orden := v_orden + 1;
    v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
      'registro_id', v_registro_id, 'libro_id', v_libro_id, 'consecutivo', v_consecutivo, 'numero', v_numero, 'version', 1,
      'instantanea', v_instantanea::text));
  end loop;

  -- El nuevo contador de cada libro tocado.
  foreach v_libro_id in array v_libros loop
    v_consecutivo := (v_contadores ->> v_libro_id)::integer;
    insert into public.libro_numeracion (finca_id, libro_id, siguiente) values (p_finca_id, v_libro_id, v_consecutivo)
      on conflict (finca_id, libro_id) do update set siguiente = excluded.siguiente;
    v_seq := interno.aplicar_arbitrado(
      p_finca_id, p_dispositivo_id, p_cambio_id, v_grupo, v_orden,
      'libro', v_libro_id, 'modificar', jsonb_build_object('siguiente_numero', v_consecutivo), v_marca, null, v_ahora
    );
    v_orden := v_orden + 1;
  end loop;

  v_resultado := jsonb_build_object('resultados', v_resultados, 'seq_final', v_seq, 'hora_servidor_ms', v_ahora_ms);
  perform interno.guardar_llamada(p_finca_id, p_cambio_id, 'emitir_registros', p_dispositivo_id, v_resultado);
  return v_resultado;
end $$;

------------------------------------------------------------------------------------------------------------------------
-- reemitir_registro
------------------------------------------------------------------------------------------------------------------------

-- reemitir_registro(..., p_registro_id, p_version_base, p_campos) → { registro_id, numero, version, seq_final, hora_servidor_ms }
-- `p_campos` trae `instantanea` (obligatoria) y, si se quiere, `fecha_registro`, `responsable` y `observaciones`.
create or replace function public.reemitir_registro(
  p_finca_id uuid,
  p_dispositivo_id uuid,
  p_cambio_id uuid,
  p_registro_id text,
  p_version_base integer,
  p_campos jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_previo jsonb;
  v_ahora timestamptz;
  v_ahora_ms bigint;
  v_clave text;
  v_valor jsonb;
  v_actual jsonb;
  v_marcas jsonb;
  v_estado text;
  v_version integer;
  v_marca text;
  v_seq bigint;
  v_resultado jsonb;
begin
  if p_cambio_id is null then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  perform interno.candado_de_finca(p_finca_id);
  perform interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_previo := interno.llamada_previa(p_finca_id, p_cambio_id, 'reemitir_registro');
  if v_previo is not null then
    return v_previo;
  end if;

  if p_registro_id is null or p_version_base is null or jsonb_typeof(p_campos) is distinct from 'object'
     or jsonb_typeof(p_campos -> 'instantanea') is distinct from 'string' then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  for v_clave, v_valor in select e.key, e.value from jsonb_each(p_campos) as e loop
    if v_clave not in ('instantanea', 'fecha_registro', 'responsable', 'observaciones') then
      raise exception using errcode = 'P0001', message = 'campo_invalido';
    end if;
    if jsonb_typeof(v_valor) not in ('string', 'null') or (v_clave in ('instantanea', 'fecha_registro') and jsonb_typeof(v_valor) <> 'string') then
      raise exception using errcode = 'P0001', message = 'parametro_invalido';
    end if;
  end loop;

  select r.campos, r.marcas into v_actual, v_marcas
    from public.registro r
   where r.finca_id = p_finca_id and r.entidad = 'registro_genealogico' and r.registro_id = p_registro_id
     for update;
  if v_actual is null or public.registro_eliminado(v_actual, v_marcas) then
    raise exception using errcode = 'P0001', message = 'registro_no_encontrado';
  end if;
  v_estado := coalesce(v_actual ->> 'estado', 'borrador');
  if v_estado = 'anulado' then
    raise exception using errcode = 'P0001', message = 'registro_anulado';
  elsif v_estado <> 'emitido' then
    raise exception using errcode = 'P0001', message = 'registro_no_emitido';
  end if;
  v_version := interno.entero_de_json(v_actual -> 'version', 1);
  if v_version <> p_version_base then
    raise exception using errcode = 'P0001', message = 'version_cambio';
  end if;

  v_ahora := public.ahora_servidor();
  v_ahora_ms := interno.ms_de(v_ahora);
  v_marca := interno.marca_de_llamada(p_finca_id, v_ahora_ms);
  v_seq := interno.aplicar_arbitrado(
    p_finca_id, p_dispositivo_id, p_cambio_id, gen_random_uuid(), 0,
    'registro_genealogico', p_registro_id, 'modificar', p_campos || jsonb_build_object('version', p_version_base + 1),
    v_marca, null, v_ahora
  );
  v_resultado := jsonb_build_object(
    'registro_id', p_registro_id, 'numero', v_actual -> 'numero', 'version', p_version_base + 1,
    'seq_final', v_seq, 'hora_servidor_ms', v_ahora_ms
  );
  perform interno.guardar_llamada(p_finca_id, p_cambio_id, 'reemitir_registro', p_dispositivo_id, v_resultado);
  return v_resultado;
end $$;

------------------------------------------------------------------------------------------------------------------------
-- anular_registro
------------------------------------------------------------------------------------------------------------------------

-- anular_registro(..., p_registro_id, p_motivo) → { registro_id, numero, seq_final, hora_servidor_ms }
-- Un registro ya anulado devuelve { ya_anulado: true, ... } sin producir cambios (`seq_final` es el último `seq` de la finca).
create or replace function public.anular_registro(
  p_finca_id uuid,
  p_dispositivo_id uuid,
  p_cambio_id uuid,
  p_registro_id text,
  p_motivo text
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_previo jsonb;
  v_ahora timestamptz;
  v_ahora_ms bigint;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_actual jsonb;
  v_marcas jsonb;
  v_estado text;
  v_marca text;
  v_seq bigint;
  v_resultado jsonb;
begin
  if p_cambio_id is null or p_registro_id is null then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  perform interno.candado_de_finca(p_finca_id);
  perform interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_previo := interno.llamada_previa(p_finca_id, p_cambio_id, 'anular_registro');
  if v_previo is not null then
    return v_previo;
  end if;

  if v_motivo = '' then
    raise exception using errcode = 'P0001', message = 'motivo_requerido';
  end if;
  select r.campos, r.marcas into v_actual, v_marcas
    from public.registro r
   where r.finca_id = p_finca_id and r.entidad = 'registro_genealogico' and r.registro_id = p_registro_id
     for update;
  if v_actual is null or public.registro_eliminado(v_actual, v_marcas) then
    raise exception using errcode = 'P0001', message = 'registro_no_encontrado';
  end if;
  v_estado := coalesce(v_actual ->> 'estado', 'borrador');
  if v_estado = 'borrador' then
    raise exception using errcode = 'P0001', message = 'registro_no_emitido';
  end if;
  v_ahora := public.ahora_servidor();
  v_ahora_ms := interno.ms_de(v_ahora);

  if v_estado = 'anulado' then
    v_resultado := jsonb_build_object(
      'ya_anulado', true, 'registro_id', p_registro_id, 'numero', v_actual -> 'numero',
      'seq_final', coalesce((select max(c.seq) from public.cambio c where c.finca_id = p_finca_id), 0),
      'hora_servidor_ms', v_ahora_ms
    );
  else
    v_marca := interno.marca_de_llamada(p_finca_id, v_ahora_ms);
    v_seq := interno.aplicar_arbitrado(
      p_finca_id, p_dispositivo_id, p_cambio_id, gen_random_uuid(), 0,
      'registro_genealogico', p_registro_id, 'modificar',
      jsonb_build_object('estado', 'anulado', 'motivo_anulacion', v_motivo), v_marca, null, v_ahora
    );
    v_resultado := jsonb_build_object(
      'registro_id', p_registro_id, 'numero', v_actual -> 'numero', 'seq_final', v_seq, 'hora_servidor_ms', v_ahora_ms
    );
  end if;
  perform interno.guardar_llamada(p_finca_id, p_cambio_id, 'anular_registro', p_dispositivo_id, v_resultado);
  return v_resultado;
end $$;

------------------------------------------------------------------------------------------------------------------------
-- fijar_siguiente_numero
------------------------------------------------------------------------------------------------------------------------

-- fijar_siguiente_numero(..., p_libro_id, p_valor) → { siguiente, seq_final, hora_servidor_ms }
-- Solo si el libro no tiene ningún registro con número. Fija el contador y produce el `modificar` de `libro`.
create or replace function public.fijar_siguiente_numero(
  p_finca_id uuid,
  p_dispositivo_id uuid,
  p_cambio_id uuid,
  p_libro_id text,
  p_valor integer
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_previo jsonb;
  v_ahora timestamptz;
  v_ahora_ms bigint;
  v_marca text;
  v_seq bigint;
  v_resultado jsonb;
begin
  if p_cambio_id is null or p_libro_id is null then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  perform interno.candado_de_finca(p_finca_id);
  perform interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_previo := interno.llamada_previa(p_finca_id, p_cambio_id, 'fijar_siguiente_numero');
  if v_previo is not null then
    return v_previo;
  end if;

  if p_valor is null or p_valor < 1 then
    raise exception using errcode = 'P0001', message = 'numero_invalido';
  end if;
  if interno.libro_vigente(p_finca_id, p_libro_id) is null then
    raise exception using errcode = 'P0001', message = 'libro_no_encontrado';
  end if;
  if exists (
    select 1
      from public.registro r
     where r.finca_id = p_finca_id and r.entidad = 'registro_genealogico'
       and r.campos ->> 'libro_id' = p_libro_id
       and jsonb_typeof(r.campos -> 'consecutivo') = 'number'
  ) then
    raise exception using errcode = 'P0001', message = 'libro_con_registros';
  end if;

  v_ahora := public.ahora_servidor();
  v_ahora_ms := interno.ms_de(v_ahora);
  v_marca := interno.marca_de_llamada(p_finca_id, v_ahora_ms);
  insert into public.libro_numeracion (finca_id, libro_id, siguiente) values (p_finca_id, p_libro_id, p_valor)
    on conflict (finca_id, libro_id) do update set siguiente = excluded.siguiente;
  v_seq := interno.aplicar_arbitrado(
    p_finca_id, p_dispositivo_id, p_cambio_id, gen_random_uuid(), 0,
    'libro', p_libro_id, 'modificar', jsonb_build_object('siguiente_numero', p_valor), v_marca, null, v_ahora
  );
  v_resultado := jsonb_build_object('siguiente', p_valor, 'seq_final', v_seq, 'hora_servidor_ms', v_ahora_ms);
  perform interno.guardar_llamada(p_finca_id, p_cambio_id, 'fijar_siguiente_numero', p_dispositivo_id, v_resultado);
  return v_resultado;
end $$;

------------------------------------------------------------------------------------------------------------------------
-- importar_registros_emitidos
------------------------------------------------------------------------------------------------------------------------

-- importar_registros_emitidos(p_finca_id, p_dispositivo_id, p_cambio_id, p_registros) → { importados, seq_final, hora_servidor_ms }
-- Primera subida de una finca que ya tenía registros emitidos. Elementos: { registro_id, campos: {todas las columnas menos id y
-- modificado_en}, marca }. Solo si el servidor todavía no tiene ningún registro emitido ni anulado.
create or replace function public.importar_registros_emitidos(p_finca_id uuid, p_dispositivo_id uuid, p_cambio_id uuid, p_registros jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_previo jsonb;
  v_ahora timestamptz;
  v_ahora_ms bigint;
  v_elemento jsonb;
  v_campos jsonb;
  v_marca text;
  v_marca_final text;
  v_grupo uuid := gen_random_uuid();
  v_orden integer := 0;
  v_seq bigint;
  v_libro_id text;
  v_siguiente integer;
  v_resultado jsonb;
begin
  if p_cambio_id is null then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  perform interno.candado_de_finca(p_finca_id);
  perform interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_previo := interno.llamada_previa(p_finca_id, p_cambio_id, 'importar_registros_emitidos');
  if v_previo is not null then
    return v_previo;
  end if;

  if jsonb_typeof(p_registros) is distinct from 'array' or jsonb_array_length(p_registros) = 0 then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  if jsonb_array_length(p_registros) > 2000 or octet_length(p_registros::text) > 8388608 then
    raise exception using errcode = 'P0001', message = 'demasiado_grande';
  end if;
  if exists (
    select 1
      from public.registro r
     where r.finca_id = p_finca_id and r.entidad = 'registro_genealogico'
       and r.campos ->> 'estado' in ('emitido', 'anulado')
  ) then
    raise exception using errcode = 'P0001', message = 'importacion_no_permitida';
  end if;

  -- Cada fila: id, marca y campos con lo indispensable.
  for v_elemento in select e.value from jsonb_array_elements(p_registros) as e loop
    v_campos := v_elemento -> 'campos';
    if jsonb_typeof(v_elemento) is distinct from 'object'
       or jsonb_typeof(v_elemento -> 'registro_id') is distinct from 'string'
       or length(v_elemento ->> 'registro_id') not between 1 and 100
       or jsonb_typeof(v_elemento -> 'marca') is distinct from 'string'
       or not interno.marca_valida(v_elemento ->> 'marca')
       or not interno.campos_validos(v_campos)
       or (v_campos ->> 'estado') is null or (v_campos ->> 'estado') not in ('emitido', 'anulado')
       or jsonb_typeof(v_campos -> 'libro_id') is distinct from 'string' or (v_campos ->> 'libro_id') = ''
       or jsonb_typeof(v_campos -> 'numero') is distinct from 'string' or (v_campos ->> 'numero') = ''
       or jsonb_typeof(v_campos -> 'instantanea') is distinct from 'string'
       or jsonb_typeof(v_campos -> 'consecutivo') is distinct from 'number'
       or (case
             when jsonb_typeof(v_campos -> 'consecutivo') = 'number'
               then not ((v_campos ->> 'consecutivo')::numeric between 1 and 1000000000
                         and (v_campos ->> 'consecutivo')::numeric = trunc((v_campos ->> 'consecutivo')::numeric))
             else true
           end) then
      raise exception using errcode = 'P0001', message = 'importacion_invalida';
    end if;
  end loop;
  -- Sin repetir registros ni números; los consecutivos de cada libro, contiguos y sin repetir.
  if (select count(*) <> count(distinct e.value ->> 'registro_id') or count(*) <> count(distinct e.value -> 'campos' ->> 'numero')
        from jsonb_array_elements(p_registros) as e)
     or exists (
       select 1
         from (
           select e.value -> 'campos' ->> 'libro_id' as libro, ((e.value -> 'campos' ->> 'consecutivo')::numeric)::integer as c
             from jsonb_array_elements(p_registros) as e
         ) as t
        group by t.libro
       having count(*) <> count(distinct t.c) or count(*) <> max(t.c) - min(t.c) + 1
     ) then
    raise exception using errcode = 'P0001', message = 'importacion_invalida';
  end if;

  v_ahora := public.ahora_servidor();
  v_ahora_ms := interno.ms_de(v_ahora);
  for v_elemento in select e.value from jsonb_array_elements(p_registros) as e loop
    v_marca := v_elemento ->> 'marca';
    v_marca_final := interno.acortar_marca(v_marca, v_ahora_ms);
    v_seq := interno.aplicar_arbitrado(
      p_finca_id, p_dispositivo_id, p_cambio_id, v_grupo, v_orden,
      'registro_genealogico', v_elemento ->> 'registro_id', 'crear', v_elemento -> 'campos',
      v_marca_final, case when v_marca_final <> v_marca then v_marca else null end, v_ahora
    );
    v_orden := v_orden + 1;
  end loop;

  -- El contador de cada libro: el mayor consecutivo + 1.
  for v_libro_id, v_siguiente in
    select e.value -> 'campos' ->> 'libro_id', max(((e.value -> 'campos' ->> 'consecutivo')::numeric)::integer) + 1
      from jsonb_array_elements(p_registros) as e
     group by e.value -> 'campos' ->> 'libro_id'
  loop
    insert into public.libro_numeracion (finca_id, libro_id, siguiente) values (p_finca_id, v_libro_id, v_siguiente)
      on conflict (finca_id, libro_id) do update set siguiente = excluded.siguiente;
    -- Los demás equipos reciben el contador del libro como cualquier otro cambio (como en `emitir_registros`).
    v_seq := interno.aplicar_arbitrado(
      p_finca_id, p_dispositivo_id, p_cambio_id, v_grupo, v_orden,
      'libro', v_libro_id, 'modificar', jsonb_build_object('siguiente_numero', v_siguiente),
      interno.marca_de_llamada(p_finca_id, v_ahora_ms), null, v_ahora
    );
    v_orden := v_orden + 1;
  end loop;

  v_resultado := jsonb_build_object('importados', jsonb_array_length(p_registros), 'seq_final', v_seq, 'hora_servidor_ms', v_ahora_ms);
  perform interno.guardar_llamada(p_finca_id, p_cambio_id, 'importar_registros_emitidos', p_dispositivo_id, v_resultado);
  return v_resultado;
end $$;

------------------------------------------------------------------------------------------------------------------------
-- Permisos
------------------------------------------------------------------------------------------------------------------------

revoke all on function interno.entero_de_json(jsonb, integer) from public, anon, authenticated;
revoke all on function interno.campos_validos(jsonb) from public, anon, authenticated;
revoke all on function interno.instantanea_objeto(text) from public, anon, authenticated;
revoke all on function interno.cambio_id_derivado(uuid, integer) from public, anon, authenticated;
revoke all on function interno.llamada_previa(uuid, uuid, text) from public, anon, authenticated;
revoke all on function interno.guardar_llamada(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function interno.marca_de_llamada(uuid, bigint) from public, anon, authenticated;
revoke all on function interno.aplicar_arbitrado(uuid, uuid, uuid, uuid, integer, text, text, text, jsonb, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function interno.libro_vigente(uuid, text) from public, anon, authenticated;
revoke all on function interno.siguiente_de_libro(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function interno.numero_de_registro(text, text, integer, integer) from public, anon, authenticated;

revoke all on function public.emitir_registros(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.reemitir_registro(uuid, uuid, uuid, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.anular_registro(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fijar_siguiente_numero(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.importar_registros_emitidos(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.emitir_registros(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.reemitir_registro(uuid, uuid, uuid, text, integer, jsonb) to authenticated;
grant execute on function public.anular_registro(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.fijar_siguiente_numero(uuid, uuid, uuid, text, integer) to authenticated;
grant execute on function public.importar_registros_emitidos(uuid, uuid, uuid, jsonb) to authenticated;
