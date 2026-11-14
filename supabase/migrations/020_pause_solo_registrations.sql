-- Pausa reversible sin devolver la sala a borrador ni alterar sus condiciones.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='019') then raise exception 'Se requiere 019'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

alter table public.solo_rooms add column is_paused boolean not null default false;

create function public.set_solo_room_paused(p_edition_id uuid,p_room_id uuid,p_is_paused boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select * into r from solo_rooms where id=p_room_id for update;
  if not found or r.edition_id is distinct from p_edition_id then raise exception 'Sala no encontrada en esta edición'; end if;
  if r.status<>'open' then raise exception 'Solo puedes pausar o volver a abrir una sala que no se haya cerrado para jugar'; end if;
  if p_is_paused is null then raise exception 'Indica si deseas pausar o abrir las inscripciones'; end if;
  if not p_is_paused then
    if r.closes_at<=now() then raise exception 'Amplía el cierre desde Editar horario antes de abrir inscripciones'; end if;
    if not exists(select 1 from tournament_settings where id=1 and solo_enabled and registration_open and registration_deadline>=r.closes_at) then
      raise exception 'Habilita Solo y las inscripciones generales; el cierre debe estar dentro del plazo general';
    end if;
  end if;
  update solo_rooms set is_paused=p_is_paused where id=r.id;
  return jsonb_build_object('id',r.id,'status',r.status,'is_paused',p_is_paused);
end $$;
revoke all on function public.set_solo_room_paused(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_solo_room_paused(uuid,uuid,boolean) to authenticated;

-- Las inscripciones nuevas pasan por este control incluso desde clientes antiguos.
-- Se mantienen las validaciones e idempotencia de submit_solo_registration.
create function public.solo_registration_pause_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare paused boolean;
begin
  select is_paused into paused from solo_rooms where id=new.room_id for update;
  if paused then raise exception 'Las inscripciones de esta sala están pausadas'; end if;
  return new;
end $$;
revoke all on function public.solo_registration_pause_guard() from public,anon,authenticated;
create trigger solo_registration_pause_guard before insert on public.solo_registrations
  for each row execute function public.solo_registration_pause_guard();

-- Compatibilidad con el frontend que ya reconoce borradores anunciados.
-- Una sala pausada se presenta públicamente como un anuncio sin inscripción.
-- En la tabla privada conserva status=open, con tarifas ya fijadas.
create or replace view public.public_solo_rooms as
 select r.id,r.edition_id,r.name,r.scheduled_at,r.closes_at,r.capacity,r.entry_price,r.kill_reward,r.booyah_reward,
   case when r.status='open' and r.is_paused then 'draft' else r.status end as status,
   (select count(*) from public.solo_registrations a where a.room_id=r.id and a.status in ('pending','approved')) as taken,
   (r.is_announced or (r.status='open' and r.is_paused)) as is_announced,
   r.is_paused
 from public.solo_rooms r
 where (r.status<>'draft' or r.is_announced) and r.edition_id=public.current_edition_id();

insert into public.schema_migrations(version,description)
values('020','Pausar y volver a abrir inscripciones Solo sin perder la sala ni sus inscritos');
notify pgrst, 'reload schema';
commit;
