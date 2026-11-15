-- Acceso privado y contadores de WhatsApp para FF escuadras. No modifica resultados.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='023') then raise exception 'Se requiere 023'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;
alter table public.registrations add column ff_confirmation_click_count integer not null default 0 check(ff_confirmation_click_count>=0);

create table public.ff_squad_room_access (
  match_id uuid not null references public.matches(id) on delete cascade,
  room_no integer not null check(room_no between 1 and 100),
  game_room_id text not null check(char_length(btrim(game_room_id)) between 1 and 100),
  room_password text not null check(char_length(btrim(room_password)) between 1 and 100),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  primary key(match_id,room_no)
);
create table public.ff_squad_access_clicks (
  match_id uuid not null references public.matches(id) on delete cascade,
  room_no integer not null check(room_no between 1 and 100),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  click_count integer not null default 0 check(click_count>=0),
  primary key(match_id,room_no,registration_id)
);
alter table public.ff_squad_room_access enable row level security;
alter table public.ff_squad_access_clicks enable row level security;
revoke all on public.ff_squad_room_access,public.ff_squad_access_clicks from public,anon,authenticated;
grant select on public.ff_squad_room_access,public.ff_squad_access_clicks to authenticated;
create function public.ff_squad_can_read_match(p_match_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.has_role(array['admin','revisor_arbitro']) and exists(select 1 from public.matches m join public.stages s on s.id=m.stage_id
    where m.id=p_match_id and m.edition_id=public.current_edition_id() and s.edition_id=m.edition_id and s.game_key='ff' and s.type='battle_royale')
$$;
revoke all on function public.ff_squad_can_read_match(uuid) from public,anon,authenticated;
grant execute on function public.ff_squad_can_read_match(uuid) to authenticated;
create policy staff_read on public.ff_squad_room_access for select to authenticated using (public.ff_squad_can_read_match(match_id));
create policy staff_read on public.ff_squad_access_clicks for select to authenticated using (public.ff_squad_can_read_match(match_id));

-- Solo admite equipos aprobados de la fase y su distribución guardada.
create function public.ff_squad_room_teams(p_stage public.stages,p_room integer)
returns setof public.registrations language sql stable set search_path=public as $$
  select r.* from public.registrations r where r.edition_id=(p_stage).edition_id and r.game_key='ff' and r.status='approved'
    and ((p_stage).config->'participants' is null or (p_stage).config->'participants'='null'::jsonb or ((p_stage).config->'participants') ? r.id::text)
    and case when coalesce(((p_stage).config->>'rooms')::integer,1)<=1 then p_room=1
      else coalesce((p_stage).config->'room_of'->>r.id::text,'')=p_room::text end
$$;
revoke all on function public.ff_squad_room_teams(public.stages,integer) from public,anon,authenticated;

create function public.ff_squad_open_context(p_edition_id uuid,p_match_id uuid,p_room integer)
returns public.stages language plpgsql security definer set search_path=public as $$
declare s stages%rowtype;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select st.* into s from stages st join matches m on m.stage_id=st.id
    where m.id=p_match_id and st.edition_id=p_edition_id and m.edition_id=p_edition_id and st.game_key='ff' and st.type='battle_royale' for update of st,m;
  if not found then raise exception 'Partida de escuadras FF no encontrada en esta edición'; end if;
  if p_room is null or p_room<1 or p_room>coalesce((s.config->>'rooms')::integer,1) or p_room>100 then raise exception 'Sala no válida en esta partida'; end if;
  if (select status from matches where id=p_match_id)='completed'
    or coalesce(s.config->'finished'->p_match_id::text,'[]'::jsonb) @> jsonb_build_array(p_room)
    or (exists(select 1 from ff_squad_room_teams(s,p_room)) and not exists(
      select 1 from ff_squad_room_teams(s,p_room) r where not exists(select 1 from match_results mr where mr.match_id=p_match_id and mr.registration_id=r.id)
    )) then raise exception 'Esta sala ya está terminada'; end if;
  return s;
end $$;
revoke all on function public.ff_squad_open_context(uuid,uuid,integer) from public,anon,authenticated;

create function public.save_ff_squad_room_access(p_edition_id uuid,p_match_id uuid,p_room integer,p_game_room_id text,p_room_password text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform ff_squad_open_context(p_edition_id,p_match_id,p_room);
  if p_game_room_id is null or p_room_password is null or char_length(btrim(p_game_room_id)) not between 1 and 100
    or char_length(btrim(p_room_password)) not between 1 and 100 then raise exception 'Completa ID y contraseña (máximo 100 caracteres cada uno)'; end if;
  insert into ff_squad_room_access(match_id,room_no,game_room_id,room_password,updated_by)
    values(p_match_id,p_room,btrim(p_game_room_id),btrim(p_room_password),auth.uid())
  on conflict(match_id,room_no) do update set game_room_id=excluded.game_room_id,room_password=excluded.room_password,updated_at=now(),updated_by=auth.uid();
  return jsonb_build_object('match_id',p_match_id,'room_no',p_room,'game_room_id',btrim(p_game_room_id),'room_password',btrim(p_room_password));
end $$;
revoke all on function public.save_ff_squad_room_access(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.save_ff_squad_room_access(uuid,uuid,integer,text,text) to authenticated;

create function public.count_ff_squad_access_click(p_edition_id uuid,p_match_id uuid,p_room integer,p_registration_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s stages%rowtype; clicks integer;
begin
  s:=ff_squad_open_context(p_edition_id,p_match_id,p_room);
  if not exists(select 1 from ff_squad_room_teams(s,p_room) where id=p_registration_id) then raise exception 'Equipo no aprobado o no asignado a esta sala y fase'; end if;
  if not exists(select 1 from ff_squad_room_access where match_id=p_match_id and room_no=p_room) then raise exception 'Guarda el acceso de esta partida y sala primero'; end if;
  insert into ff_squad_access_clicks(match_id,room_no,registration_id,click_count) values(p_match_id,p_room,p_registration_id,1)
    on conflict(match_id,room_no,registration_id) do update set click_count=ff_squad_access_clicks.click_count+1 returning click_count into clicks;
  return jsonb_build_object('match_id',p_match_id,'room_no',p_room,'registration_id',p_registration_id,'click_count',clicks);
end $$;
revoke all on function public.count_ff_squad_access_click(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.count_ff_squad_access_click(uuid,uuid,integer,uuid) to authenticated;

create function public.count_ff_squad_confirmation_click(p_edition_id uuid,p_registration_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r registrations%rowtype;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  update registrations set ff_confirmation_click_count=ff_confirmation_click_count+1
    where id=p_registration_id and edition_id=p_edition_id and game_key='ff' and status='approved' returning * into r;
  if not found then raise exception 'Equipo FF no aprobado en esta edición'; end if;
  return jsonb_build_object('id',r.id,'ff_confirmation_click_count',r.ff_confirmation_click_count);
end $$;
revoke all on function public.count_ff_squad_confirmation_click(uuid,uuid) from public,anon,authenticated;
grant execute on function public.count_ff_squad_confirmation_click(uuid,uuid) to authenticated;
-- Las credenciales no se auditan ni se agregan a vistas/históricos públicos.
insert into public.schema_migrations(version,description) values('024','Acceso privado y contadores WhatsApp de FF escuadras');
notify pgrst, 'reload schema';
commit;
