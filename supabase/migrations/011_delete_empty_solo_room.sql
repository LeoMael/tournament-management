-- Elimina únicamente borradores o salas canceladas sin inscripciones ni resultados.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='010') then raise exception 'Se requiere 010'; end if;
end $$;

create function public.delete_empty_solo_room(p_edition_id uuid, p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then
    raise exception 'La edición cambió. Actualiza la página.';
  end if;
  -- Comparte el bloqueo de sala con las inscripciones y la gestión de Solo.
  select * into r from solo_rooms where id=p_room_id for update;
  if not found then raise exception 'Sala no encontrada. Actualiza la lista.'; end if;
  if r.edition_id is distinct from p_edition_id then raise exception 'La sala pertenece a otra edición'; end if;
  if r.status not in ('draft','cancelled') then
    raise exception 'Solo puedes eliminar salas en borrador o canceladas';
  end if;
  if exists(select 1 from solo_registrations where room_id=r.id)
     or exists(select 1 from solo_results where room_id=r.id) then
    raise exception 'Esta sala tiene inscripciones o resultados y debe conservarse en el historial';
  end if;
  -- Los pagos siempre referencian una inscripción: conservar todas las inscripciones
  -- también protege las liquidaciones. El trigger audit_solo registra la eliminación.
  delete from solo_rooms where id=r.id;
  return jsonb_build_object('id',r.id);
end $$;

revoke all on function public.delete_empty_solo_room(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_empty_solo_room(uuid,uuid) to authenticated;
insert into public.schema_migrations(version,description)
values ('011','Eliminar salas Solo vacías en borrador o canceladas, solo admin');
commit;
