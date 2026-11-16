-- Permite eliminar salas abiertas/cerradas con confirmación, en las cuatro modalidades.
-- Aplicar esta migración no elimina ninguna sala.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='034') then raise exception 'Se requiere 034'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

create or replace function public.delete_solo_room(p_edition_id uuid,p_room_id uuid,p_confirmation text)
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
  if r.status not in('draft','open','closed','finished','cancelled') then raise exception 'Primero finaliza o cancela la sala antes de eliminarla'; end if;
  if r.status='draft' and (exists(select 1 from solo_registrations where room_id=r.id)
    or exists(select 1 from solo_results where room_id=r.id)) then raise exception 'Un borrador con participantes debe cancelarse antes de eliminarlo'; end if;
  -- Igual que la eliminación de finalizadas: auditoría completa, sin transferencias.
  delete from solo_payments where registration_id in(select id from solo_registrations where room_id=r.id);
  delete from solo_results where room_id=r.id;
  delete from solo_registrations where room_id=r.id;
  delete from solo_rooms where id=r.id;
  return jsonb_build_object('id',r.id);
end $$;
revoke all on function public.delete_solo_room(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.delete_solo_room(uuid,uuid,text) to authenticated;

alter function public.manage_ff_room(text,jsonb) rename to manage_ff_room_before_open_deletion;
revoke all on function public.manage_ff_room_before_open_deletion(text,jsonb) from public,anon,authenticated;
create function public.manage_ff_room(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; kind text:=p_data->>'room_kind'; room_uuid uuid; target_table text;
begin
  if p_action is distinct from 'delete' then return manage_ff_room_before_open_deletion(p_action,p_data); end if;
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_data->>'edition_id' is distinct from current_edition_id()::text then raise exception 'La edición cambió. Actualiza la página.'; end if;
  room_uuid:=(p_data->>'room_id')::uuid;
  r:=ff_room_data(kind,room_uuid);
  if (r->>'edition_id')::uuid is distinct from current_edition_id() then raise exception 'La sala pertenece a otra edición'; end if;
  -- Conserva borradores, finalizadas, canceladas y el bloqueo de partidas en juego.
  if r->>'status' not in('open','closed') then return manage_ff_room_before_open_deletion(p_action,p_data); end if;
  if p_data->>'confirmation' is distinct from r->>'name' then raise exception 'Escribe el nombre exacto de la sala'; end if;
  delete from ff_room_payments where edition_id=current_edition_id() and room_kind=kind and room_id=room_uuid;
  delete from ff_room_results where edition_id=current_edition_id() and room_kind=kind and room_id=room_uuid;
  delete from ff_room_registrations where edition_id=current_edition_id() and room_kind=kind and room_id=room_uuid;
  target_table:=case when kind='solo_top' then 'solo_top_rooms' else 'duo_rooms' end;
  execute format('delete from public.%I where id=$1',target_table) using room_uuid;
  return jsonb_build_object('id',room_uuid,'room_kind',kind,'deleted',true);
end $$;
revoke all on function public.manage_ff_room(text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_ff_room(text,jsonb) to authenticated;
insert into public.schema_migrations(version,description)
values('035','Eliminar salas abiertas y cerradas de las cuatro modalidades FF con confirmación y auditoría');
notify pgrst,'reload schema';
commit;
