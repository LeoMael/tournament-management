-- Eliminación individual previa a la partida, sin resultados ni pagos asociados.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='017') then raise exception 'Se requiere 017'; end if;
end $$;

create function public.delete_solo_registration(p_edition_id uuid,p_room_id uuid,p_registration_id uuid,p_confirmation text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype; person solo_registrations%rowtype;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  -- Mismo orden de bloqueos que revisión, inicio, resultados y pagos de manage_solo.
  select * into r from solo_rooms where id=p_room_id for update;
  if not found or r.edition_id is distinct from p_edition_id then raise exception 'Sala no encontrada en esta edición'; end if;
  if r.status not in ('open','closed') then raise exception 'Solo se pueden eliminar participantes antes de iniciar la partida'; end if;
  select * into person from solo_registrations where id=p_registration_id and room_id=r.id for update;
  if not found or person.edition_id is distinct from p_edition_id then raise exception 'Participante no encontrado en esta sala. Actualiza la lista.'; end if;
  if p_confirmation is distinct from person.nickname then raise exception 'Escribe el nickname exacto del participante para eliminarlo'; end if;
  if person.status not in ('pending','approved','rejected') then raise exception 'La inscripción tiene una devolución en curso o registrada y debe conservarse'; end if;
  if exists(select 1 from solo_results where registration_id=person.id)
    or exists(select 1 from solo_payments where registration_id=person.id) then
    raise exception 'El participante tiene resultados o pagos asociados y no puede eliminarse';
  end if;
  -- audit_solo conserva la fila anterior. El comprobante de Storage no se elimina.
  delete from solo_registrations where id=person.id;
  return jsonb_build_object('id',person.id,'room_id',r.id);
end $$;

revoke all on function public.delete_solo_registration(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.delete_solo_registration(uuid,uuid,uuid,text) to authenticated;
insert into public.schema_migrations(version,description)
values('018','Eliminar participantes Solo antes de jugar, sin resultados ni pagos y con confirmación');
notify pgrst, 'reload schema';
commit;
