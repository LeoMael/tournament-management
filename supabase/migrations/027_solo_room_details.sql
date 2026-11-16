-- Nombre y horario de salas Solo abiertas/cerradas, sin cambiar identidad ni condiciones.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='026') then raise exception 'Se requiere 026'; end if;
end $$;

create function public.update_solo_room_details(p_edition_id uuid,p_room_id uuid,p_name text,p_scheduled_at timestamptz,p_closes_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype; clean_name text:=btrim(p_name);
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select * into r from solo_rooms where id=p_room_id for update;
  if not found or r.edition_id is distinct from p_edition_id then raise exception 'Sala no encontrada en esta edición'; end if;
  if r.status not in ('open','closed') then raise exception 'Solo puedes editar estos datos antes de iniciar la partida'; end if;
  if clean_name is null or char_length(clean_name) not between 3 and 100 then raise exception 'El nombre debe tener entre 3 y 100 caracteres'; end if;
  if p_scheduled_at is null or p_closes_at is null or not isfinite(p_scheduled_at) or not isfinite(p_closes_at) then
    raise exception 'Completa una fecha y hora válidas para la partida y el cierre';
  end if;
  -- Renombrar no obliga a reprogramar una sala cuyo horario ya pasó.
  -- Si cambian las fechas, se delega en la misma validación de la migración 019.
  if p_scheduled_at is distinct from r.scheduled_at or p_closes_at is distinct from r.closes_at then
    perform update_solo_room_schedule(p_edition_id,p_room_id,p_scheduled_at,p_closes_at);
  end if;
  update solo_rooms set name=clean_name where id=r.id returning * into r;
  return jsonb_build_object('id',r.id,'name',r.name,'status',r.status,'scheduled_at',r.scheduled_at,'closes_at',r.closes_at);
end $$;
revoke all on function public.update_solo_room_details(uuid,uuid,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.update_solo_room_details(uuid,uuid,text,timestamptz,timestamptz) to authenticated;
insert into public.schema_migrations(version,description) values('027','Editar nombre y horario de salas Solo antes de jugar, conservando participantes y condiciones');
notify pgrst,'reload schema';
commit;
