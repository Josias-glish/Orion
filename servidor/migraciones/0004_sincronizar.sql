-- Migración 0004: `sincronizar` (Etapa 10; contrato: servidor/PROTOCOLO.md, sección 5).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Todo el envío es UNA transacción; cada grupo de operaciones corre en su propia subtransacción (bloque con `exception`): si algo
-- de un grupo es inválido se deshace el grupo entero y los demás siguen. Solo se captura el rechazo propio (SQLSTATE 'RC001'):
-- cualquier otro error (un fallo transitorio, un bug) hace fallar la llamada completa para que el programa reintente, en vez de
-- dejar un grupo «rechazado para siempre».

-- Qué se rechaza de una operación (null si está bien). No toca la base. Motivos de PROTOCOLO.md: entidad_invalida,
-- operacion_invalida, marca_invalida, campo_invalido (valor que no es texto, número ni null, o `campos` vacío), campo_reservado.
-- Además `registro_invalido` (`registro_id` que no es un texto de 1 a 100 caracteres). Ver «Desviaciones del protocolo».
create or replace function interno.validar_operacion(p_op jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_entidad text;
  v_operacion text;
  v_campos jsonb;
  v_clave text;
  v_valor jsonb;
  v_ok boolean;
begin
  if jsonb_typeof(p_op -> 'entidad') is distinct from 'string' or (p_op ->> 'entidad') !~ '^[a-z][a-z_]{0,39}$' then
    return 'entidad_invalida';
  end if;
  v_entidad := p_op ->> 'entidad';

  if jsonb_typeof(p_op -> 'operacion') is distinct from 'string'
     or (p_op ->> 'operacion') not in ('crear', 'modificar', 'eliminar') then
    return 'operacion_invalida';
  end if;
  v_operacion := p_op ->> 'operacion';

  if jsonb_typeof(p_op -> 'marca') is distinct from 'string' or not interno.marca_valida(p_op ->> 'marca') then
    return 'marca_invalida';
  end if;

  if jsonb_typeof(p_op -> 'registro_id') is distinct from 'string' or length(p_op ->> 'registro_id') not between 1 and 100 then
    return 'registro_invalido';
  end if;

  v_campos := p_op -> 'campos';
  if jsonb_typeof(v_campos) is distinct from 'object' or v_campos = '{}'::jsonb then
    return 'campo_invalido';
  end if;
  for v_clave, v_valor in select e.key, e.value from jsonb_each(v_campos) as e loop
    if v_clave !~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$' or jsonb_typeof(v_valor) not in ('string', 'number', 'null') then
      return 'campo_invalido';
    end if;
  end loop;
  -- `eliminar` equivale a `modificar` de {eliminado_en}: solo ese campo.
  if v_operacion = 'eliminar'
     and ((select count(*) from jsonb_object_keys(v_campos)) <> 1 or (v_campos -> 'eliminado_en') is null) then
    return 'campo_invalido';
  end if;

  -- Campos que solo escribe el servidor (R31).
  if v_entidad = 'libro' then
    if (v_campos -> 'siguiente_numero') is not null then
      return 'campo_reservado';
    end if;
  elsif v_entidad = 'registro_genealogico' then
    if v_operacion = 'crear' then
      -- Excepción: un borrador. `estado` ausente o 'borrador'; `version` ausente o 1; el resto, ausente o null.
      if (v_campos -> 'estado') is not null and (v_campos ->> 'estado') is distinct from 'borrador' then
        return 'campo_reservado';
      end if;
      if (v_campos -> 'version') is not null then
        v_ok := case
          when jsonb_typeof(v_campos -> 'version') = 'number' then (v_campos ->> 'version')::numeric = 1
          else false
        end;
        if not v_ok then
          return 'campo_reservado';
        end if;
      end if;
      foreach v_clave in array array['consecutivo', 'numero', 'instantanea', 'motivo_anulacion'] loop
        if (v_campos -> v_clave) is not null and jsonb_typeof(v_campos -> v_clave) <> 'null' then
          return 'campo_reservado';
        end if;
      end loop;
    else
      foreach v_clave in array array['estado', 'consecutivo', 'numero', 'version', 'instantanea', 'motivo_anulacion'] loop
        if (v_campos -> v_clave) is not null then
          return 'campo_reservado';
        end if;
      end loop;
    end if;
  end if;
  return null;
end $$;

-- sincronizar(p_finca_id, p_dispositivo_id, p_version_esquema, p_desde, p_cambios, p_limite) → ver PROTOCOLO.md, sección 5.
create or replace function public.sincronizar(
  p_finca_id uuid,
  p_dispositivo_id uuid,
  p_version_esquema integer,
  p_desde bigint,
  p_cambios jsonb,
  p_limite integer default 500
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  -- 1. Sesión, membresía y equipo.
  v_cuenta uuid := interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_ahora timestamptz;
  v_ahora_ms bigint;
  v_minima integer;
  v_desde bigint := coalesce(p_desde, 0);
  v_limite integer := greatest(least(coalesce(p_limite, 500), 500), 0);
  v_cambios jsonb := coalesce(p_cambios, '[]'::jsonb);
  v_grupos jsonb;
  v_grupo jsonb;
  v_grupo_id uuid;
  v_op jsonb;
  v_nuevos jsonb;
  v_aceptados jsonb := '[]'::jsonb;
  v_ya jsonb := '[]'::jsonb;
  v_rechazados jsonb := '[]'::jsonb;
  v_corregidos jsonb := '[]'::jsonb;
  v_g_aceptados jsonb;
  v_g_corregidos jsonb;
  v_g_marca text;
  v_id uuid;
  v_entidad text;
  v_registro_id text;
  v_operacion text;
  v_campos jsonb;
  v_marca text;
  v_marca_final text;
  v_motivo text;
  v_reg_campos jsonb;
  v_reg_marcas jsonb;
  v_fusion jsonb;
  v_seq bigint;
  v_pagina jsonb;
  v_seq_siguiente bigint;
  v_hay_mas boolean;
begin
  -- Un solo escritor por finca a la vez: así el orden de `seq` es el de confirmación.
  perform interno.candado_de_finca(p_finca_id);
  -- Un equipo que se revocó mientras esperaba el candado ya no sincroniza.
  perform interno.exigir_equipo(p_finca_id, p_dispositivo_id);

  if p_version_esquema is null or p_version_esquema < 1 or jsonb_typeof(v_cambios) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  v_ahora := public.ahora_servidor();
  v_ahora_ms := interno.ms_de(v_ahora);

  -- 2. Versión del esquema del programa.
  select f.version_esquema_minima into v_minima from public.finca_servidor f where f.id = p_finca_id for update;
  if p_version_esquema < v_minima then
    raise exception using errcode = 'P0001', message = 'esquema_antiguo';
  end if;
  if p_version_esquema > v_minima then
    update public.finca_servidor set version_esquema_minima = p_version_esquema where id = p_finca_id;
    v_minima := p_version_esquema;
  end if;
  update public.dispositivo
     set version_esquema = p_version_esquema, ultima_sincronizacion = v_ahora
   where id = p_dispositivo_id;

  -- 3. Límites: 500 operaciones y 2 MB de JSON.
  if jsonb_array_length(v_cambios) > 500 or octet_length(v_cambios::text) > 2097152 then
    raise exception using errcode = 'P0001', message = 'demasiado_grande';
  end if;
  -- Forma de cada elemento: `id` y `grupo_id` son uuid, `orden` es un entero. Sin esto no se podría ni rechazar el grupo.
  if exists (
    select 1
      from jsonb_array_elements(v_cambios) as e
     where jsonb_typeof(e.value) is distinct from 'object'
        or interno.a_uuid(e.value ->> 'id') is null
        or interno.a_uuid(e.value ->> 'grupo_id') is null
        or case
             when jsonb_typeof(e.value -> 'orden') is null or jsonb_typeof(e.value -> 'orden') = 'null' then false
             when jsonb_typeof(e.value -> 'orden') = 'number' then not (
               (e.value ->> 'orden')::numeric between 0 and 1000000
               and (e.value ->> 'orden')::numeric = trunc((e.value ->> 'orden')::numeric))
             else true
           end
  ) then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;
  if (select count(*) <> count(distinct (e.value ->> 'id')::uuid) from jsonb_array_elements(v_cambios) as e) then
    raise exception using errcode = 'P0001', message = 'parametro_invalido';
  end if;

  -- 4. Grupos en el orden en que llegaron (por su primer elemento) y, dentro de cada uno, por `orden`.
  select coalesce(jsonb_agg(jsonb_build_object('grupo_id', g.grupo_id, 'ops', g.ops) order by g.primero), '[]'::jsonb)
    into v_grupos
    from (
      select (e.value ->> 'grupo_id')::uuid as grupo_id,
             min(e.n) as primero,
             jsonb_agg(e.value order by coalesce((e.value ->> 'orden')::numeric, 0), e.n) as ops
        from jsonb_array_elements(v_cambios) with ordinality as e(value, n)
       group by (e.value ->> 'grupo_id')::uuid
    ) as g;

  for v_grupo in select e.value from jsonb_array_elements(v_grupos) as e loop
    v_grupo_id := (v_grupo ->> 'grupo_id')::uuid;

    -- Los cambios que el servidor ya conoce no se aplican otra vez (idempotencia por `cambio_id`, R15).
    v_nuevos := '[]'::jsonb;
    for v_op in select e.value from jsonb_array_elements(v_grupo -> 'ops') as e loop
      if exists (
        select 1 from public.cambio c where c.finca_id = p_finca_id and c.cambio_id = (v_op ->> 'id')::uuid
      ) then
        v_ya := v_ya || jsonb_build_array(((v_op ->> 'id')::uuid)::text);
      else
        v_nuevos := v_nuevos || jsonb_build_array(v_op);
      end if;
    end loop;
    continue when jsonb_array_length(v_nuevos) = 0;

    v_g_aceptados := '[]'::jsonb;
    v_g_corregidos := '[]'::jsonb;
    v_g_marca := '';
    begin
      for v_op in select e.value from jsonb_array_elements(v_nuevos) as e loop
        v_motivo := interno.validar_operacion(v_op);
        if v_motivo is not null then
          raise exception using errcode = 'RC001', message = v_motivo;
        end if;
        v_id := (v_op ->> 'id')::uuid;
        v_entidad := v_op ->> 'entidad';
        v_registro_id := v_op ->> 'registro_id';
        v_operacion := v_op ->> 'operacion';
        v_campos := v_op -> 'campos';
        v_marca := v_op ->> 'marca';

        -- Marca más de 10 minutos en el futuro: se acorta a la hora del servidor y se avisa (R17, S-84).
        v_marca_final := interno.acortar_marca(v_marca, v_ahora_ms);

        select r.campos, r.marcas into v_reg_campos, v_reg_marcas
          from public.registro r
         where r.finca_id = p_finca_id and r.entidad = v_entidad and r.registro_id = v_registro_id
           for update;

        -- Un `crear` de borrador no puede devolver a borrador un registro ya emitido o anulado.
        if v_entidad = 'registro_genealogico' and v_operacion = 'crear' and v_reg_campos is not null
           and coalesce(v_reg_campos ->> 'estado', 'borrador') <> 'borrador' then
          raise exception using errcode = 'RC001', message = 'campo_reservado';
        end if;

        v_fusion := public.fusionar_registro(v_reg_campos, v_reg_marcas, v_campos, v_marca_final);

        insert into public.cambio (
          finca_id, cambio_id, grupo_id, orden, dispositivo_id, usuario_id, entidad, registro_id, operacion, campos,
          marca, marca_original, arbitrado, recibido_en
        ) values (
          p_finca_id, v_id, v_grupo_id, coalesce((v_op ->> 'orden')::numeric, 0)::integer, p_dispositivo_id,
          v_op ->> 'usuario_id', v_entidad, v_registro_id, v_operacion, v_campos,
          v_marca_final, case when v_marca_final <> v_marca then v_marca else null end, false, v_ahora
        ) returning seq into v_seq;

        insert into public.registro (finca_id, entidad, registro_id, campos, marcas, actualizado_seq)
        values (p_finca_id, v_entidad, v_registro_id, v_fusion -> 'campos', v_fusion -> 'marcas', v_seq)
        on conflict (finca_id, entidad, registro_id)
        do update set campos = excluded.campos, marcas = excluded.marcas, actualizado_seq = excluded.actualizado_seq;

        v_g_aceptados := v_g_aceptados || jsonb_build_array(v_id::text);
        if v_marca_final <> v_marca then
          v_g_corregidos := v_g_corregidos
            || jsonb_build_array(jsonb_build_object('cambio_id', v_id, 'marca_nueva', v_marca_final));
        end if;
        if (v_marca_final collate "C") > (v_g_marca collate "C") then
          v_g_marca := v_marca_final;
        end if;
      end loop;

      -- `marca_ultima` de la finca = la mayor marca aceptada.
      update public.finca_servidor
         set marca_ultima = v_g_marca
       where id = p_finca_id and (v_g_marca collate "C") > (marca_ultima collate "C");

      v_aceptados := v_aceptados || v_g_aceptados;
      v_corregidos := v_corregidos || v_g_corregidos;
    exception
      when sqlstate 'RC001' then
        -- Se deshizo todo el grupo: todos sus cambios nuevos quedan rechazados con el mismo motivo.
        v_motivo := sqlerrm;
        for v_op in select e.value from jsonb_array_elements(v_nuevos) as e loop
          v_rechazados := v_rechazados || jsonb_build_array(jsonb_build_object(
            'cambio_id', (v_op ->> 'id')::uuid, 'grupo_id', v_grupo_id, 'motivo', v_motivo));
        end loop;
    end;
  end loop;

  -- 5. Descarga: los cambios de la finca con `seq` mayor que el cursor, hasta el límite (contando también los propios).
  -- Solo se devuelven los de otros equipos y los arbitrados (que el equipo que llamó aún no ha aplicado).
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'seq', p.seq, 'cambio_id', p.cambio_id, 'grupo_id', p.grupo_id, 'orden', p.orden,
               'dispositivo_id', p.dispositivo_id, 'usuario_id', p.usuario_id, 'entidad', p.entidad,
               'registro_id', p.registro_id, 'operacion', p.operacion, 'campos', p.campos, 'marca', p.marca,
               'arbitrado', p.arbitrado
             ) order by p.seq
           ) filter (where p.dispositivo_id <> p_dispositivo_id or p.arbitrado),
           '[]'::jsonb
         ),
         max(p.seq)
    into v_pagina, v_seq_siguiente
    from (
      select c.*
        from public.cambio c
       where c.finca_id = p_finca_id and c.seq > v_desde
       order by c.seq
       limit v_limite
    ) as p;
  v_seq_siguiente := coalesce(v_seq_siguiente, v_desde);
  v_hay_mas := exists (select 1 from public.cambio c where c.finca_id = p_finca_id and c.seq > v_seq_siguiente);

  return jsonb_build_object(
    'hora_servidor_ms', v_ahora_ms,
    'aceptados', v_aceptados,
    'ya_aplicados', v_ya,
    'rechazados', v_rechazados,
    'corregidos', v_corregidos,
    'cambios', v_pagina,
    'seq_siguiente', v_seq_siguiente,
    'hay_mas', v_hay_mas,
    'version_esquema_minima', v_minima
  );
end $$;

revoke all on function interno.validar_operacion(jsonb) from public, anon, authenticated;
revoke all on function public.sincronizar(uuid, uuid, integer, bigint, jsonb, integer) from public, anon, authenticated;
grant execute on function public.sincronizar(uuid, uuid, integer, bigint, jsonb, integer) to authenticated;
