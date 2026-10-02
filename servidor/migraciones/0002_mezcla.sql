-- Migración 0002: marcas (R17) y mezcla por campo (R16) (Etapa 10; contrato: servidor/PROTOCOLO.md, secciones 1 y 2).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- La misma mezcla existe en TypeScript (src/dominio/sincronizacion/fusion.ts y hlc.ts) y las dos corren contra los mismos
-- vectores (servidor/vectores-fusion.json). Las marcas se comparan SIEMPRE como texto con COLLATE "C" (byte a byte): con la
-- configuración regional de la base el orden alfabético sería otro.
-- Ninguna de estas funciones se puede ejecutar por la API: solo las llaman las funciones públicas (que son `security definer`).

-- ¿Es una marca válida? Formato AAAA-MM-DDTHH:MM:SS.mmmZ-cccc-dddddddd (contador y equipo en hexadecimal minúscula) y fecha real.
create or replace function interno.marca_valida(p_marca text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_hora timestamptz;
begin
  if p_marca is null
     or p_marca !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z-[0-9a-f]{4}-[0-9a-f]{8}$' then
    return false;
  end if;
  begin
    v_hora := substr(p_marca, 1, 24)::timestamptz;
  exception when others then
    return false;
  end;
  -- Ida y vuelta: rechaza «24:00:00» (que Postgres pasa al día siguiente) y cualquier otra normalización.
  return to_char(v_hora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = substr(p_marca, 1, 24);
end $$;

-- Milisegundos desde 1970 de una hora (truncados).
create or replace function interno.ms_de(p_hora timestamptz) returns bigint
language sql immutable set search_path = '' as $$
  select floor(extract(epoch from p_hora) * 1000)::bigint
$$;

create or replace function interno.hora_de_ms(p_ms bigint) returns timestamptz
language sql immutable set search_path = '' as $$
  select timestamptz 'epoch' + p_ms * interval '1 millisecond'
$$;

-- Hora de una marca, en milisegundos.
create or replace function interno.ms_de_marca(p_marca text) returns bigint
language sql immutable set search_path = '' as $$
  select interno.ms_de(substr(p_marca, 1, 24)::timestamptz)
$$;

-- Contador de una marca (los 4 hexadecimales).
create or replace function interno.contador_de_marca(p_marca text) returns integer
language sql immutable set search_path = '' as $$
  select (('x' || substr(p_marca, 26, 4))::bit(16))::integer
$$;

-- Texto de una marca a partir de sus partes.
create or replace function interno.formatear_marca(p_ms bigint, p_contador integer, p_equipo text) returns text
language sql immutable set search_path = '' as $$
  select to_char(interno.hora_de_ms(p_ms) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    || '-' || lpad(to_hex(p_contador), 4, '0') || '-' || p_equipo
$$;

-- ISO con milisegundos y «Z» de una hora (el formato de `creado_en` y de `eliminado_en` del programa).
create or replace function interno.iso_de(p_hora timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p_hora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- Marca más de 10 minutos adelantada respecto de la hora del servidor: se acorta a esa hora (conserva contador y equipo).
-- Es `acortarMarcaFutura` de hlc.ts (SUPOSICION S-84).
create or replace function interno.acortar_marca(p_marca text, p_ahora_ms bigint) returns text
language sql immutable set search_path = '' as $$
  select case
    when interno.ms_de_marca(p_marca) > p_ahora_ms + 600000
      then interno.formatear_marca(p_ahora_ms, interno.contador_de_marca(p_marca), substr(p_marca, 31, 8))
    else p_marca
  end
$$;

-- La marca siguiente a la última de la finca, generada por el servidor (equipo 00000000). Es `nuevaMarca` de hlc.ts:
-- hora del servidor, o la última marca con el contador subido si la hora no la supera. Nunca retrocede.
create or replace function interno.marca_siguiente(p_ultima text, p_ahora_ms bigint) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_fisico bigint := p_ahora_ms;
  v_contador integer := 0;
  v_ultima_ms bigint;
begin
  if p_ultima is not null and p_ultima <> '' and interno.marca_valida(p_ultima) then
    v_ultima_ms := interno.ms_de_marca(p_ultima);
    if v_ultima_ms >= p_ahora_ms then
      v_fisico := v_ultima_ms;
      v_contador := interno.contador_de_marca(p_ultima) + 1;
      if v_contador > 65535 then
        v_fisico := v_fisico + 1;
        v_contador := 0;
      end if;
    end if;
  end if;
  return interno.formatear_marca(v_fisico, v_contador, '00000000');
end $$;

-- R16: mezcla por campo. `p_campos` y `p_marcas` son null si el registro no existe. Devuelve
--   {"campos": {...}, "marcas": {"base": "...", "campos": {...}}}
-- o null si no hay nada que mezclar. Cada campo de la operación se aplica si el registro nunca lo tuvo o si la marca de la
-- operación es mayor o igual que la guardada para ese campo (la de `campos` o, si no tiene, la `base`). Después las marcas pasan a
-- forma canónica: `base` es la menor y `campos` solo lista los que difieren. Un `crear` es un `modificar` de todos los campos.
create or replace function public.fusionar_registro(p_campos jsonb, p_marcas jsonb, p_op_campos jsonb, p_op_marca text)
returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_campos jsonb := coalesce(p_campos, '{}'::jsonb);
  v_por_campo jsonb;
  v_clave text;
  v_valor jsonb;
  v_base text;
begin
  if p_op_campos is null or jsonb_typeof(p_op_campos) <> 'object' or p_op_campos = '{}'::jsonb then
    return null;
  end if;

  -- Marca explícita de cada campo que el registro ya tiene.
  select coalesce(jsonb_object_agg(k, to_jsonb(coalesce(p_marcas -> 'campos' ->> k, p_marcas ->> 'base', ''))), '{}'::jsonb)
    into v_por_campo
    from jsonb_object_keys(v_campos) as k;

  for v_clave, v_valor in select e.key, e.value from jsonb_each(p_op_campos) as e loop
    -- (v_campos -> clave) es null solo si el campo no existe; un campo con valor null tiene el jsonb «null».
    if (v_campos -> v_clave) is null
       or (p_op_marca collate "C") >= ((v_por_campo ->> v_clave) collate "C") then
      v_campos := v_campos || jsonb_build_object(v_clave, v_valor);
      v_por_campo := v_por_campo || jsonb_build_object(v_clave, p_op_marca);
    end if;
  end loop;

  select m.value into v_base from jsonb_each_text(v_por_campo) as m order by m.value collate "C" limit 1;

  return jsonb_build_object(
    'campos', v_campos,
    'marcas', jsonb_build_object(
      'base', v_base,
      'campos', coalesce((select jsonb_object_agg(m.key, m.value) from jsonb_each_text(v_por_campo) as m where m.value <> v_base), '{}'::jsonb)
    )
  );
end $$;

-- R16 (S-85): el registro está eliminado si `eliminado_en` tiene valor y su marca NO es anterior a la mayor marca de los demás
-- campos, sin contar `creado_en`, `modificado_en` ni `eliminado_en` (si no hay otros campos, está eliminado).
create or replace function public.registro_eliminado(p_campos jsonb, p_marcas jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_del_borrado text;
  v_ultima_edicion text;
begin
  if p_campos is null or (p_campos ->> 'eliminado_en') is null then
    return false;
  end if;
  v_del_borrado := coalesce(p_marcas -> 'campos' ->> 'eliminado_en', p_marcas ->> 'base', '');
  select coalesce(max(x.marca collate "C"), '')
    into v_ultima_edicion
    from (
      select coalesce(p_marcas -> 'campos' ->> k, p_marcas ->> 'base', '') as marca
        from jsonb_object_keys(p_campos) as k
       where k not in ('creado_en', 'modificado_en', 'eliminado_en')
    ) as x;
  return (v_ultima_edicion collate "C") <= (v_del_borrado collate "C");
end $$;

-- La mayor marca de un registro (la `base` o cualquiera de `campos`). Es `marcaMaxima` de fusion.ts; la huella de
-- `resumen_finca` se calcula con ella.
create or replace function public.marca_maxima(p_marcas jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_marcas is null then null
    else coalesce((
      select max(m.valor collate "C")
        from (
          select p_marcas ->> 'base' as valor
          union all
          select c.value from jsonb_each_text(coalesce(p_marcas -> 'campos', '{}'::jsonb)) as c
        ) as m
    ), '')
  end
$$;

-- Permisos: nada para la API (Supabase concede EXECUTE por defecto a `anon` y `authenticated`).
revoke all on function interno.marca_valida(text) from public, anon, authenticated;
revoke all on function interno.ms_de(timestamptz) from public, anon, authenticated;
revoke all on function interno.hora_de_ms(bigint) from public, anon, authenticated;
revoke all on function interno.ms_de_marca(text) from public, anon, authenticated;
revoke all on function interno.contador_de_marca(text) from public, anon, authenticated;
revoke all on function interno.formatear_marca(bigint, integer, text) from public, anon, authenticated;
revoke all on function interno.iso_de(timestamptz) from public, anon, authenticated;
revoke all on function interno.acortar_marca(text, bigint) from public, anon, authenticated;
revoke all on function interno.marca_siguiente(text, bigint) from public, anon, authenticated;
revoke all on function public.fusionar_registro(jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.registro_eliminado(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.marca_maxima(jsonb) from public, anon, authenticated;
