-- Migración 0006: descarga inicial y verificación (Etapa 10; contrato: servidor/PROTOCOLO.md, sección 7).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Son de solo lectura y no toman el candado de la finca. `iniciar_descarga` y `resumen_finca` calculan todo en UNA sola sentencia
-- para que `seq_actual` y los conteos o huellas salgan de la misma instantánea de la base. Los registros eliminados cuentan.

-- iniciar_descarga(p_finca_id, p_dispositivo_id) → { seq_inicial, hora_servidor_ms, conteos: { entidad: n } }
-- Quien baja el estado empieza a pedir cambios en `seq_inicial` cuando termine: como la mezcla es idempotente no importa que las páginas
-- ya incluyeran algunos.
create or replace function public.iniciar_descarga(p_finca_id uuid, p_dispositivo_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_resultado jsonb;
begin
  select jsonb_build_object(
           'seq_inicial', coalesce((select max(c.seq) from public.cambio c where c.finca_id = p_finca_id), 0),
           'hora_servidor_ms', interno.ms_de(public.ahora_servidor()),
           'conteos', coalesce((
             select jsonb_object_agg(t.entidad, t.n)
               from (
                 select r.entidad, count(*) as n
                   from public.registro r
                  where r.finca_id = p_finca_id
                  group by r.entidad
               ) as t
           ), '{}'::jsonb)
         )
    into v_resultado;
  return v_resultado;
end $$;

-- descargar_pagina(p_finca_id, p_dispositivo_id, p_entidad, p_despues_de, p_limite) → { registros: [ { registro_id, campos, marcas } ], siguiente }
-- Ordenados por `registro_id` con COLLATE "C". `p_despues_de` vacío o null para empezar. `siguiente` es el último `registro_id` de la
-- página, o null cuando no queda nada más. Tope de `p_limite`: 500.
create or replace function public.descargar_pagina(
  p_finca_id uuid,
  p_dispositivo_id uuid,
  p_entidad text,
  p_despues_de text,
  p_limite integer default 500
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_limite integer := greatest(least(coalesce(p_limite, 500), 500), 1);
  v_registros jsonb;
  v_cantidad integer;
  v_siguiente text;
begin
  if p_entidad is null or p_entidad !~ '^[a-z][a-z_]{0,39}$' then
    raise exception using errcode = 'P0001', message = 'entidad_invalida';
  end if;

  -- Se piden `limite + 1` para saber si quedan más sin una segunda consulta.
  select coalesce(jsonb_agg(jsonb_build_object('registro_id', p.registro_id, 'campos', p.campos, 'marcas', p.marcas) order by p.registro_id collate "C")
                  filter (where p.n <= v_limite), '[]'::jsonb),
         count(*)
    into v_registros, v_cantidad
    from (
      select r.registro_id, r.campos, r.marcas, row_number() over (order by r.registro_id collate "C") as n
        from public.registro r
       where r.finca_id = p_finca_id and r.entidad = p_entidad
         and (coalesce(p_despues_de, '') = '' or (r.registro_id collate "C") > (p_despues_de collate "C"))
       order by r.registro_id collate "C"
       limit v_limite + 1
    ) as p;

  if v_cantidad > v_limite then
    v_siguiente := v_registros -> (v_limite - 1) ->> 'registro_id';
  end if;
  return jsonb_build_object('registros', v_registros, 'siguiente', v_siguiente);
end $$;

-- resumen_finca(p_finca_id, p_dispositivo_id) → { seq_actual, hora_servidor_ms, entidades: [ { entidad, filas, huella } ] }
-- `filas` cuenta los registros de la entidad, incluidos los eliminados. `huella` es el SHA-256 hexadecimal (minúsculas) del texto que
-- resulta de concatenar, por cada registro ordenado por `registro_id` (COLLATE "C"), la línea  registro_id|marca_maxima(marcas)\n
-- codificada en UTF-8. El programa calcula lo mismo sobre sus filas y compara.
create or replace function public.resumen_finca(p_finca_id uuid, p_dispositivo_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cuenta uuid := interno.exigir_equipo(p_finca_id, p_dispositivo_id);
  v_resultado jsonb;
begin
  select jsonb_build_object(
           'seq_actual', coalesce((select max(c.seq) from public.cambio c where c.finca_id = p_finca_id), 0),
           'hora_servidor_ms', interno.ms_de(public.ahora_servidor()),
           'entidades', coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'entidad', t.entidad,
                        'filas', t.filas,
                        'huella', encode(sha256(convert_to(t.lineas, 'UTF8')), 'hex')
                      )
                      order by t.entidad collate "C"
                    )
               from (
                 select r.entidad,
                        count(*) as filas,
                        string_agg(r.registro_id || '|' || public.marca_maxima(r.marcas) || E'\n', '' order by r.registro_id collate "C") as lineas
                   from public.registro r
                  where r.finca_id = p_finca_id
                  group by r.entidad
               ) as t
           ), '[]'::jsonb)
         )
    into v_resultado;
  return v_resultado;
end $$;

revoke all on function public.iniciar_descarga(uuid, uuid) from public, anon, authenticated;
revoke all on function public.descargar_pagina(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.resumen_finca(uuid, uuid) from public, anon, authenticated;

grant execute on function public.iniciar_descarga(uuid, uuid) to authenticated;
grant execute on function public.descargar_pagina(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.resumen_finca(uuid, uuid) to authenticated;
