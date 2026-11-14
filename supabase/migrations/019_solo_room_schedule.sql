-- Cambia únicamente las fechas de una sala abierta o cerrada, antes de jugar.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='018') then raise exception 'Se requiere 018'; end if;
end $$;

create function public.update_solo_room_schedule(p_edition_id uuid,p_room_id uuid,p_scheduled_at timestamptz,p_closes_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype; deadline timestamptz;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select * into r from solo_rooms where id=p_room_id for update;
  if not found or r.edition_id is distinct from p_edition_id then raise exception 'Sala no encontrada en esta edición'; end if;
  if r.status not in ('open','closed') then raise exception 'Solo puedes cambiar el horario antes de iniciar la partida'; end if;
  if p_scheduled_at is null or p_closes_at is null or not isfinite(p_scheduled_at) or not isfinite(p_closes_at) then
    raise exception 'Completa una fecha y hora válidas para la partida y el cierre';
  end if;
  if p_closes_at<=now() then raise exception 'El nuevo cierre de inscripción debe estar en el futuro'; end if;
  if p_closes_at>p_scheduled_at then raise exception 'El cierre de inscripción no puede ser posterior a la partida'; end if;
  select registration_deadline into deadline from tournament_settings where id=1;
  if deadline is null or p_closes_at>deadline then
    raise exception 'El cierre supera el plazo general del torneo. Amplíalo primero en Configuración.';
  end if;
  update solo_rooms set scheduled_at=p_scheduled_at,closes_at=p_closes_at where id=r.id;
  return jsonb_build_object('id',r.id,'status',r.status,'scheduled_at',p_scheduled_at,'closes_at',p_closes_at);
end $$;
revoke all on function public.update_solo_room_schedule(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.update_solo_room_schedule(uuid,uuid,timestamptz,timestamptz) to authenticated;
insert into public.schema_migrations(version,description)
values('019','Editar horario y cierre de inscripción Solo antes de jugar, sin alterar condiciones económicas');
notify pgrst, 'reload schema';
commit;
