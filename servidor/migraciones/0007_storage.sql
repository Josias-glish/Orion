-- Migración 0007: almacenamiento de archivos (fotos, adjuntos y certificados; Etapa 10; contrato: servidor/PROTOCOLO.md, sección 8).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Bucket `archivos`, PRIVADO. La ruta de un objeto es `<finca_id>/<ruta del archivo en el programa>`. Un miembro de la finca puede
-- LEER y SUBIR bajo su carpeta. No hay políticas de `update` ni de `delete`: los archivos son inmutables (por eso tampoco se puede
-- sobrescribir con `upsert`, que necesita `update`). Sin política, Storage no deja hacer nada a nadie más (ni a `anon`).
-- En Supabase el esquema `storage` ya existe y `storage.objects` ya tiene RLS activa (no se toca aquí: el dueño es el servicio de
-- Storage). En las pruebas lo reemplaza un doble mínimo (servidor/pruebas/ayudas.ts).

insert into storage.buckets (id, name, public)
values ('archivos', 'archivos', false)
on conflict (id) do nothing;

-- ¿La cuenta de la sesión es miembro de la finca de esta carpeta? La política corre con los permisos de `authenticated`, que no
-- puede leer `membresia`: por eso la consulta vive en una función `security definer`, en un esquema que la API no expone (así lo
-- recomienda la guía de RLS de Supabase). El primer segmento de la ruta puede no ser un uuid: entonces es que no.
create or replace function interno.es_miembro_de_finca(p_carpeta text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cuenta uuid := auth.uid();
begin
  if v_cuenta is null or p_carpeta is null
     or p_carpeta !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return exists (
    select 1 from public.membresia m where m.cuenta_id = v_cuenta and m.finca_id = p_carpeta::uuid
  );
end $$;

revoke all on function interno.es_miembro_de_finca(text) from public, anon, authenticated;
-- Es la única función de `interno` que se concede, y solo para la política de abajo.
grant execute on function interno.es_miembro_de_finca(text) to authenticated;

create policy archivos_los_miembros_leen on storage.objects
  for select to authenticated
  using (bucket_id = 'archivos' and interno.es_miembro_de_finca((storage.foldername(name))[1]));

create policy archivos_los_miembros_suben on storage.objects
  for insert to authenticated
  with check (bucket_id = 'archivos' and interno.es_miembro_de_finca((storage.foldername(name))[1]));
