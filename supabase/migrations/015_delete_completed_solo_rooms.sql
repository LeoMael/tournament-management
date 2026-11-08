begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='014') then raise exception 'Se requiere 014'; end if;
end $$;

create function public.delete_solo_room(p_edition_id uuid,p_room_id uuid,p_confirmation text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select * into r from solo_rooms where id=p_room_id for update;
  if not found then raise exception 'Sala no encontrada. Actualiza la lista.'; end if;
  if r.edition_id is distinct from p_edition_id then raise exception 'La sala pertenece a otra edición'; end if;
  if p_confirmation is distinct from r.name then raise exception 'Escribe el nombre exacto de la sala para eliminarla'; end if;
  if r.status not in ('draft','finished','cancelled') then
    raise exception 'Primero finaliza o cancela la sala antes de eliminarla';
  end if;
  if r.status='draft' and (exists(select 1 from solo_registrations where room_id=r.id)
    or exists(select 1 from solo_results where room_id=r.id)) then
    raise exception 'Un borrador con participantes debe cancelarse antes de eliminarlo';
  end if;
  -- Todas las filas eliminadas quedan en audit_log mediante los triggers existentes.
  -- No se realizan transferencias ni devoluciones: elimina también pagos pendientes.
  delete from solo_payments where registration_id in (select id from solo_registrations where room_id=r.id);
  delete from solo_results where room_id=r.id;
  delete from solo_registrations where room_id=r.id;
  delete from solo_rooms where id=r.id;
  return jsonb_build_object('id',r.id);
end $$;

revoke all on function public.delete_solo_room(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.delete_solo_room(uuid,uuid,text) to authenticated;
insert into public.schema_migrations(version,description)
values('015','Eliminar salas Solo finalizadas o canceladas con confirmación de nombre y auditoría');
commit;
