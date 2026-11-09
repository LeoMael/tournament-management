-- Visibilidad de borradores independiente de la apertura de inscripciones.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='016') then raise exception 'Se requiere 016'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

alter table public.solo_rooms add column is_announced boolean not null default false;

create function public.set_solo_room_announcement(p_edition_id uuid,p_room_id uuid,p_is_announced boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select * into r from solo_rooms where id=p_room_id for update;
  if not found or r.edition_id is distinct from p_edition_id then raise exception 'Sala no encontrada en esta edición'; end if;
  if r.status<>'draft' then raise exception 'El anuncio solo se puede cambiar en salas en borrador'; end if;
  if p_is_announced is null then raise exception 'Indica si deseas anunciar u ocultar la sala'; end if;
  update solo_rooms set is_announced=p_is_announced where id=r.id;
  return jsonb_build_object('id',r.id,'status',r.status,'is_announced',p_is_announced);
end $$;
revoke all on function public.set_solo_room_announcement(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_solo_room_announcement(uuid,uuid,boolean) to authenticated;

-- Proyección explícita: no se une ni expone la tabla privada solo_room_access.
-- Conserva las columnas previas y añade is_announced al final.
create or replace view public.public_solo_rooms as
 select r.id,r.edition_id,r.name,r.scheduled_at,r.closes_at,r.capacity,r.entry_price,r.kill_reward,r.booyah_reward,r.status,
   (select count(*) from public.solo_registrations a where a.room_id=r.id and a.status in ('pending','approved')) as taken,
   r.is_announced
 from public.solo_rooms r
 where (r.status<>'draft' or r.is_announced) and r.edition_id=public.current_edition_id();

insert into public.schema_migrations(version,description)
values('017','Anunciar borradores de salas Solo sin abrir sus inscripciones');
notify pgrst, 'reload schema';
commit;
