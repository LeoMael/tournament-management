-- Eliminación administrativa de salas nuevas terminadas, igual que en Solo por kills.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='033') then raise exception 'Se requiere 033'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

-- Mantiene las acciones y validaciones anteriores sin reescribirlas.
alter function public.manage_ff_room(text,jsonb) rename to manage_ff_room_before_completed_deletion;
revoke all on function public.manage_ff_room_before_completed_deletion(text,jsonb) from public,anon,authenticated;
create function public.manage_ff_room(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; kind text:=p_data->>'room_kind'; room_uuid uuid; target_table text;
begin
  if p_action is distinct from 'delete' then return manage_ff_room_before_completed_deletion(p_action,p_data); end if;
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_data->>'edition_id' is distinct from current_edition_id()::text then raise exception 'La edición cambió. Actualiza la página.'; end if;
  room_uuid:=(p_data->>'room_id')::uuid;
  r:=ff_room_data(kind,room_uuid); -- Bloquea la misma sala que resultados, pagos y mensajes.
  if (r->>'edition_id')::uuid is distinct from current_edition_id() then raise exception 'La sala pertenece a otra edición'; end if;
  if r->>'status' not in('finished','cancelled') then
    -- Antes de terminar solo siguen siendo eliminables las salas vacías ya permitidas.
    return manage_ff_room_before_completed_deletion(p_action,p_data);
  end if;
  if p_data->>'confirmation' is distinct from r->>'name' then raise exception 'Escribe el nombre exacto de la sala'; end if;

  -- Eliminación atómica y auditada, incluidos pagos registrados y pendientes.
  -- No realiza transferencias/devoluciones ni elimina archivos de Storage.
  delete from ff_room_payments where edition_id=current_edition_id() and room_kind=kind and room_id=room_uuid;
  delete from ff_room_results where edition_id=current_edition_id() and room_kind=kind and room_id=room_uuid;
  delete from ff_room_registrations where edition_id=current_edition_id() and room_kind=kind and room_id=room_uuid;
  target_table:=case when kind='solo_top' then 'solo_top_rooms' else 'duo_rooms' end;
  -- Premios y acceso privado se eliminan por sus FK ON DELETE CASCADE.
  -- Las credenciales no se incluyen en el audit_log, como establece la 033.
  execute format('delete from public.%I where id=$1',target_table) using room_uuid;
  return jsonb_build_object('id',room_uuid,'room_kind',kind,'deleted',true);
end $$;
revoke all on function public.manage_ff_room(text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_ff_room(text,jsonb) to authenticated;
insert into public.schema_migrations(version,description)
values('034','Eliminar salas Solo Top y Dúo finalizadas o canceladas, con confirmación y auditoría');
notify pgrst,'reload schema';
commit;
