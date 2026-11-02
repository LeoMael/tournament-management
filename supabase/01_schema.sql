-- =====================================================================
-- RAGNAROK U-Series — ESQUEMA COMPLETO (ejecutar una sola vez, tras 00_reset.sql si ya había datos)
-- Orden de archivos: 00_reset.sql (opcional) -> 01_schema.sql -> 02_seed.sql -> 03_admin.sql
-- Seguridad: RLS activo en todas las tablas; lo privado solo para admins;
-- las inscripciones públicas entran únicamente por submit_registration().
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------
-- Roles del panel:
--   admin            -> todo (config, premios, auditoría, borrar inscripciones, gestionar equipo).
--   editor           -> solo contenido del sitio (reglamento, pasos, textos, PDF y música).
--   revisor_arbitro  -> inscripciones (aprobar/rechazar/editar) y grupos/llaves/resultados.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
-- Para bases ya creadas: agrega la columna (los admins existentes quedan como 'admin').
alter table public.admins add column if not exists role text not null default 'admin';
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add constraint admins_role_check
  check (role in ('admin', 'editor', 'revisor_arbitro'));
alter table public.admins enable row level security;

-- ¿Tiene alguno de estos roles el usuario actual?
create or replace function public.has_role(roles text[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and role = any (roles));
$$;
revoke all on function public.has_role(text[]) from public;
grant execute on function public.has_role(text[]) to anon, authenticated;

-- Administrador total (el rol 'admin').
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.has_role(array['admin']);
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Cada usuario ve su propia fila (así el panel conoce su rol); el admin ve a todo el equipo.
-- Nadie escribe en 'admins' desde la API: altas, cambios de rol y bajas pasan por la
-- Edge Function 'manage-team' (supabase/functions/manage-team), que valida que quien llama es admin.
drop policy if exists admins_select_self on public.admins;
create policy admins_select_self on public.admins
  for select to authenticated using (user_id = auth.uid());
drop policy if exists admins_select_admin on public.admins;
create policy admins_select_admin on public.admins
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Configuración
-- ---------------------------------------------------------------------
create table if not exists public.tournament_settings (
  id smallint primary key default 1 check (id = 1),
  registration_open boolean not null default true,
  registration_deadline timestamptz not null,
  yape_number text not null default '',
  yape_holder text not null default '',
  yape_qr_path text,
  contact_whatsapp text not null default '',
  whatsapp_group_url text check (whatsapp_group_url is null or whatsapp_group_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{10,60}$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  key text primary key check (key in ('mlbb', 'ff')),
  name text not null,
  price numeric(8,2) not null check (price >= 0 and price <= 10000),
  max_teams integer not null check (max_teams between 1 and 1000),
  starters smallint not null check (starters between 1 and 10),
  substitutes smallint not null check (substitutes between 0 and 5),
  is_open boolean not null default true,
  rules_pdf_path text,
  music_path text,
  subtitle text not null default '',
  badge text not null default '',
  scoring_table jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Transmisión en vivo por juego: si está al aire y los enlaces de las redes donde se transmite.
alter table public.games add column if not exists live boolean not null default false;
alter table public.games add column if not exists live_links jsonb not null default '[]'::jsonb;

-- Cada enlace: { "platform": "YouTube", "url": "https://…" }. Solo https, máximo 8 enlaces por juego.
create or replace function public.valid_live_links(links jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  item jsonb;
begin
  if jsonb_typeof(links) <> 'array' or jsonb_array_length(links) > 8 then
    return false;
  end if;
  for item in select * from jsonb_array_elements(links) loop
    if jsonb_typeof(item) <> 'object'
       or coalesce(item ->> 'url', '') !~ '^https://[^\s<>"]{3,300}$'
       or char_length(coalesce(item ->> 'platform', '')) not between 1 and 30 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;
alter table public.games drop constraint if exists games_live_links_check;
alter table public.games add constraint games_live_links_check check (public.valid_live_links(live_links));

create table if not exists public.prizes (
  place smallint primary key check (place between 1 and 10),
  label text not null check (char_length(label) between 1 and 40),
  amount numeric(10,2) not null check (amount >= 0 and amount <= 1000000),
  description text not null default '' check (char_length(description) <= 120),
  updated_at timestamptz not null default now()
);

alter table public.tournament_settings enable row level security;
alter table public.games enable row level security;
alter table public.prizes enable row level security;

-- Lectura pública (no contienen datos sensibles), escritura solo admin.
do $$
declare t text;
begin
  foreach t in array array['tournament_settings', 'games', 'prizes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_public_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_write', t);
  end loop;
end $$;

-- El editor puede actualizar 'games', pero el trigger solo le deja tocar los textos,
-- el PDF, la música y la tabla de puntos (nunca precio, cupos, formato ni apertura).
drop policy if exists games_editor_update on public.games;
create policy games_editor_update on public.games
  for update to authenticated
  using (public.has_role(array['editor']))
  with check (public.has_role(array['editor']));

-- El revisor/árbitro solo puede poner o quitar el "en vivo" y sus enlaces.
drop policy if exists games_live_update on public.games;
create policy games_live_update on public.games
  for update to authenticated
  using (public.has_role(array['revisor_arbitro']))
  with check (public.has_role(array['revisor_arbitro']));

create or replace function public.games_editor_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Revisor/árbitro: solo 'live' y 'live_links' (y la marca de actualización).
  if public.has_role(array['revisor_arbitro'])
     and (to_jsonb(new) - 'live' - 'live_links' - 'updated_at') is distinct from (to_jsonb(old) - 'live' - 'live_links' - 'updated_at') then
    raise exception 'Solo un administrador puede cambiar esos datos del juego.' using errcode = 'P0001';
  end if;
  -- Editor: no toca el "en vivo".
  if public.has_role(array['editor']) and (new.live is distinct from old.live or new.live_links is distinct from old.live_links) then
    raise exception 'Solo un administrador o el revisor/árbitro pueden cambiar el en vivo.' using errcode = 'P0001';
  end if;
  if not public.is_admin() and (
       new.key is distinct from old.key
    or new.name is distinct from old.name
    or new.price is distinct from old.price
    or new.max_teams is distinct from old.max_teams
    or new.starters is distinct from old.starters
    or new.substitutes is distinct from old.substitutes
    or new.is_open is distinct from old.is_open
  ) then
    raise exception 'Solo un administrador puede cambiar precio, cupos o formato.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists games_editor_guard on public.games;
create trigger games_editor_guard before update on public.games
  for each row execute function public.games_editor_guard();

-- ---------------------------------------------------------------------
-- Inscripciones
-- ---------------------------------------------------------------------
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  game_key text not null references public.games(key),
  team_name text not null check (char_length(team_name) between 3 and 40),
  captain_name text not null check (char_length(captain_name) between 3 and 80),
  captain_whatsapp text not null check (captain_whatsapp ~ '^[0-9]{8,15}$'),
  institution text not null check (institution in ('UNAP', 'Otra')),
  professional_school text,
  other_institution text,
  logo_path text,
  receipt_path text not null unique,
  amount_due numeric(8,2) not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  withdrawn_at timestamptz,
  withdrawal_reason text check (withdrawal_reason is null or char_length(withdrawal_reason) <= 300),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 300),
  observation text check (observation is null or char_length(observation) <= 500),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
-- Para bases ya creadas: agrega el estado 'withdrawn' (equipo retirado) y sus columnas.
-- Un equipo retirado libera su cupo y sus jugadores (el cupo y los duplicados solo cuentan pending/approved).
alter table public.registrations add column if not exists withdrawn_at timestamptz;
alter table public.registrations add column if not exists withdrawal_reason text;
alter table public.registrations drop constraint if exists registrations_withdrawal_reason_check;
alter table public.registrations add constraint registrations_withdrawal_reason_check
  check (withdrawal_reason is null or char_length(withdrawal_reason) <= 300);
alter table public.registrations drop constraint if exists registrations_status_check;
alter table public.registrations add constraint registrations_status_check
  check (status in ('pending', 'approved', 'rejected', 'withdrawn'));
create unique index if not exists registrations_team_unique
  on public.registrations (game_key, lower(team_name));
create index if not exists registrations_status_idx on public.registrations (game_key, status);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  game_key text not null,
  slot smallint not null,
  is_substitute boolean not null default false,
  nickname text not null check (char_length(nickname) between 1 and 30),
  game_player_id text not null check (game_player_id ~ '^[0-9]{5,15}$'),
  server_id text check (server_id is null or server_id ~ '^[0-9]{1,6}$'),
  unique (registration_id, slot)
);
create index if not exists players_lookup_idx on public.players (game_key, game_player_id);

alter table public.registrations enable row level security;
alter table public.players enable row level security;

drop policy if exists registrations_admin_all on public.registrations;
create policy registrations_admin_all on public.registrations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists players_admin_all on public.players;
create policy players_admin_all on public.players
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- El revisor/árbitro puede ver y editar inscripciones y jugadores (borrar sigue siendo solo del admin).
drop policy if exists registrations_reviewer_read on public.registrations;
create policy registrations_reviewer_read on public.registrations
  for select to authenticated using (public.has_role(array['revisor_arbitro']));
drop policy if exists registrations_reviewer_update on public.registrations;
create policy registrations_reviewer_update on public.registrations
  for update to authenticated
  using (public.has_role(array['revisor_arbitro'])) with check (public.has_role(array['revisor_arbitro']));
drop policy if exists players_reviewer_read on public.players;
create policy players_reviewer_read on public.players
  for select to authenticated using (public.has_role(array['revisor_arbitro']));
-- anon NO tiene ninguna policy: solo puede insertar mediante submit_registration().

-- ---------------------------------------------------------------------
-- Formato del torneo (grupos / llaves / battle royale)
-- ---------------------------------------------------------------------
create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  game_key text not null references public.games(key),
  name text not null check (char_length(name) between 1 and 60),
  type text not null check (type in ('groups', 'single_elim', 'battle_royale')),
  position smallint not null default 0,
  config jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages(id) on delete cascade,
  name text not null
);

create table if not exists public.group_teams (
  group_id uuid not null references public.groups(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  primary key (group_id, registration_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  round smallint not null,
  position smallint not null default 0,
  team_a uuid references public.registrations(id) on delete set null,
  team_b uuid references public.registrations(id) on delete set null,
  score_a smallint,
  score_b smallint,
  best_of smallint not null default 1 check (best_of in (1, 3, 5)),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed')),
  scheduled_at timestamptz,
  winner_id uuid references public.registrations(id) on delete set null
);
create index if not exists matches_stage_idx on public.matches (stage_id, round, position);

create table if not exists public.match_results (
  match_id uuid not null references public.matches(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  placement smallint not null check (placement between 1 and 30),
  kills smallint not null default 0 check (kills >= 0),
  points numeric(6,1) not null default 0,
  primary key (match_id, registration_id)
);

alter table public.stages enable row level security;
alter table public.groups enable row level security;
alter table public.group_teams enable row level security;
alter table public.matches enable row level security;
alter table public.match_results enable row level security;

-- Grupos, llaves y resultados: admin y revisor/árbitro.
do $$
declare t text;
begin
  foreach t in array array['stages', 'groups', 'group_teams', 'matches', 'match_results'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_role(array[''admin'', ''revisor_arbitro''])) with check (public.has_role(array[''admin'', ''revisor_arbitro'']))', t || '_staff_all', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Vistas públicas (solo datos seguros). Corren como owner, filtran por dentro.
-- ---------------------------------------------------------------------
-- Equipos aprobados. institution = UNAP u otra institución; professional_school = carrera (puede venir vacía).
drop view if exists public.public_teams;
create view public.public_teams as
  select r.id, r.game_key, r.team_name, r.logo_path,
         case when r.institution = 'UNAP' then 'UNAP' else coalesce(r.other_institution, 'Otra') end as institution,
         r.professional_school
  from public.registrations r
  where r.status = 'approved';

-- Integrantes de los equipos aprobados: solo apodo, puesto en el roster y si es suplente.
-- NO expone IDs de juego, server ni datos del capitán.
create or replace view public.public_team_players as
  select p.registration_id, p.slot, p.is_substitute, p.nickname
  from public.players p
  join public.registrations r on r.id = p.registration_id
  where r.status = 'approved';

create or replace view public.public_stages as
  select id, game_key, name, type, position, config
  from public.stages where published;

create or replace view public.public_groups as
  select g.id, g.stage_id, g.name
  from public.groups g join public.stages s on s.id = g.stage_id where s.published;

create or replace view public.public_group_teams as
  select gt.group_id, gt.registration_id, r.team_name
  from public.group_teams gt
  join public.groups g on g.id = gt.group_id
  join public.stages s on s.id = g.stage_id and s.published
  join public.registrations r on r.id = gt.registration_id;

-- Limpieza de una versión anterior (salas por partida): se quitan la vista, la tabla y la columna si existen.
-- La vista se vuelve a crear abajo; las salas ahora viven en la configuración de cada fase.
drop view if exists public.public_lobby_rooms;
drop view if exists public.public_matches;
drop table if exists public.lobby_rooms;
alter table public.matches drop column if exists rooms;

create or replace view public.public_matches as
  select m.id, m.stage_id, m.group_id, m.round, m.position, m.team_a, m.team_b,
         ra.team_name as team_a_name, rb.team_name as team_b_name,
         m.score_a, m.score_b, m.best_of, m.status, m.scheduled_at, m.winner_id
  from public.matches m
  join public.stages s on s.id = m.stage_id and s.published
  left join public.registrations ra on ra.id = m.team_a
  left join public.registrations rb on rb.id = m.team_b;

create or replace view public.public_match_results as
  select mr.match_id, mr.registration_id, r.team_name, mr.placement, mr.kills, mr.points, m.stage_id
  from public.match_results mr
  join public.matches m on m.id = mr.match_id
  join public.stages s on s.id = m.stage_id and s.published
  join public.registrations r on r.id = mr.registration_id;

-- Cupos por juego: solo conteos, sin datos personales.
create or replace view public.public_availability as
  select g.key as game_key,
         g.max_teams,
         (select count(*) from public.registrations r
           where r.game_key = g.key and r.status in ('pending', 'approved'))::int as taken
  from public.games g;
revoke all on public.public_availability from public;
grant select on public.public_availability to anon, authenticated;

revoke all on public.public_teams, public.public_team_players, public.public_stages, public.public_groups,
  public.public_group_teams, public.public_matches, public.public_match_results from public;
grant select on public.public_teams, public.public_team_players, public.public_stages, public.public_groups,
  public.public_group_teams, public.public_matches, public.public_match_results to anon, authenticated;

-- ---------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_email text,
  table_name text not null,
  op text not null,
  row_key text,
  old_data jsonb,
  new_data jsonb
);
alter table public.audit_log enable row level security;
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (actor, actor_email, table_name, op, row_key, old_data, new_data)
  values (
    auth.uid(),
    (select email from public.admins where user_id = auth.uid()),
    tg_table_name, tg_op,
    coalesce(rec ->> 'id', rec ->> 'key', rec ->> 'place'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_settings on public.tournament_settings;
create trigger audit_settings after update on public.tournament_settings
  for each row execute function public.audit_trigger();
drop trigger if exists audit_games on public.games;
create trigger audit_games after update on public.games
  for each row execute function public.audit_trigger();
drop trigger if exists audit_prizes on public.prizes;
create trigger audit_prizes after insert or update or delete on public.prizes
  for each row execute function public.audit_trigger();
drop trigger if exists audit_registrations on public.registrations;
create trigger audit_registrations after update or delete on public.registrations
  for each row execute function public.audit_trigger();
drop trigger if exists audit_stages on public.stages;
create trigger audit_stages after insert or update or delete on public.stages
  for each row execute function public.audit_trigger();
drop trigger if exists audit_matches on public.matches;
create trigger audit_matches after update on public.matches
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- Contenido editable del sitio (reglamento y pasos)
-- ---------------------------------------------------------------------
create table if not exists public.rules_sections (
  id uuid primary key default gen_random_uuid(),
  game_key text not null references public.games(key) on delete cascade,
  position smallint not null default 0,
  title text not null check (char_length(title) between 1 and 120),
  highlight text not null default '' check (char_length(highlight) <= 240),
  points jsonb not null default '[]'::jsonb check (jsonb_typeof(points) = 'array'),
  updated_at timestamptz not null default now()
);
create index if not exists rules_sections_idx on public.rules_sections (game_key, position);

create table if not exists public.participation_steps (
  id uuid primary key default gen_random_uuid(),
  position smallint not null default 0,
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 400),
  detail text not null default '' check (char_length(detail) <= 80)
);

alter table public.rules_sections enable row level security;
alter table public.participation_steps enable row level security;

do $$
declare t text;
begin
  foreach t in array array['rules_sections', 'participation_steps'] loop
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_public_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_role(array[''admin'', ''editor''])) with check (public.has_role(array[''admin'', ''editor'']))', t || '_admin_write', t);
  end loop;
end $$;
revoke insert, update, delete on public.rules_sections, public.participation_steps from anon;

drop trigger if exists audit_rules on public.rules_sections;
create trigger audit_rules after insert or update or delete on public.rules_sections
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('receipts',      'receipts',      false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
  ('team-logos',    'team-logos',    true,  5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('public-assets', 'public-assets', true,  20971520, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/aac'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Subida pública SOLO con nombre uuid.ext (sin sobrescribir ni listar).
drop policy if exists receipts_insert_public on storage.objects;
create policy receipts_insert_public on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'receipts'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|pdf)$'
  );
drop policy if exists logos_insert_public on storage.objects;
create policy logos_insert_public on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'team-logos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$'
  );

-- Admin: leer/borrar comprobantes, gestionar logos y assets públicos.
drop policy if exists receipts_admin_read on storage.objects;
create policy receipts_admin_read on storage.objects
  for select to authenticated using (bucket_id = 'receipts' and public.has_role(array['admin', 'revisor_arbitro']));
drop policy if exists receipts_admin_delete on storage.objects;
create policy receipts_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'receipts' and public.is_admin());
drop policy if exists logos_admin_all on storage.objects;
create policy logos_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'team-logos' and public.is_admin())
  with check (bucket_id = 'team-logos' and public.is_admin());
drop policy if exists assets_admin_all on storage.objects;
create policy assets_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'public-assets' and public.has_role(array['admin', 'editor']))
  with check (bucket_id = 'public-assets' and public.has_role(array['admin', 'editor']));

-- ---------------------------------------------------------------------
-- RPC pública de inscripción (validación y precio SIEMPRE en el servidor)
-- ---------------------------------------------------------------------
create or replace function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_settings public.tournament_settings%rowtype;
  v_key text := payload ->> 'game_key';
  v_team text := btrim(coalesce(payload ->> 'team_name', ''));
  v_captain text := btrim(coalesce(payload ->> 'captain_name', ''));
  v_wa text := regexp_replace(coalesce(payload ->> 'captain_whatsapp', ''), '\D', '', 'g');
  v_inst text := payload ->> 'institution';
  v_school text := nullif(btrim(coalesce(payload ->> 'professional_school', '')), '');
  v_other text := nullif(btrim(coalesce(payload ->> 'other_institution', '')), '');
  v_receipt text := payload ->> 'receipt_path';
  v_logo text := nullif(payload ->> 'logo_path', '');
  v_players jsonb := payload -> 'players';
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|pdf)$';
  v_total int;
  v_count int;
  v_id uuid;
  v_i int;
  v_p jsonb;
  v_nick text;
  v_pid text;
  v_srv text;
  v_filled int := 0;
  v_meta jsonb;
  v_allowed constant text[] := array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
begin
  -- Anti-bots: campo trampa que una persona nunca llena.
  if coalesce(payload ->> 'website', '') <> '' then
    raise exception 'No se pudo procesar la solicitud.' using errcode = 'P0001';
  end if;
  -- Freno global ante ráfagas de envíos.
  if (select count(*) from registrations where created_at > now() - interval '1 minute') >= 15 then
    raise exception 'Hay demasiadas solicitudes en este momento. Intenta de nuevo en un minuto.' using errcode = 'P0001';
  end if;

  select * into v_settings from tournament_settings where id = 1;
  if not found or not v_settings.registration_open or now() > v_settings.registration_deadline then
    raise exception 'Las inscripciones están cerradas.' using errcode = 'P0001';
  end if;

  select * into v_game from games where key = v_key;
  if not found or not v_game.is_open then
    raise exception 'Las inscripciones de esta disciplina están cerradas.' using errcode = 'P0001';
  end if;

  if v_team ~ '[\x00-\x1f\x7f<>]' or v_captain ~ '[\x00-\x1f\x7f<>]'
     or coalesce(v_school, '') ~ '[\x00-\x1f\x7f<>]' or coalesce(v_other, '') ~ '[\x00-\x1f\x7f<>]' then
    raise exception 'Los textos contienen caracteres no permitidos.' using errcode = 'P0001';
  end if;
  if char_length(v_team) < 3 or char_length(v_team) > 40 then
    raise exception 'El nombre del equipo debe tener entre 3 y 40 caracteres.' using errcode = 'P0001';
  end if;
  if char_length(v_captain) < 3 or char_length(v_captain) > 80 then
    raise exception 'Nombre del capitán inválido.' using errcode = 'P0001';
  end if;
  if v_wa !~ '^[0-9]{8,15}$' then
    raise exception 'WhatsApp del capitán inválido.' using errcode = 'P0001';
  end if;
  if v_inst not in ('UNAP', 'Otra') then
    raise exception 'Institución inválida.' using errcode = 'P0001';
  end if;
  if v_school is null or char_length(v_school) > 120 then
    raise exception 'Selecciona tu carrera o escuela profesional.' using errcode = 'P0001';
  end if;
  if v_inst = 'Otra' and (v_other is null or char_length(v_other) > 120) then
    raise exception 'Ingresa el nombre de tu institución.' using errcode = 'P0001';
  end if;
  if v_receipt is null or v_receipt !~ v_uuid_re then
    raise exception 'No se encontró el comprobante de pago subido.' using errcode = 'P0001';
  end if;
  select metadata into v_meta from storage.objects where bucket_id = 'receipts' and name = v_receipt;
  if not found then
    raise exception 'No se encontró el comprobante de pago subido.' using errcode = 'P0001';
  end if;
  if coalesce(v_meta ->> 'mimetype', '') <> all (v_allowed)
     or coalesce((v_meta ->> 'size')::bigint, 0) not between 1 and 5242880 then
    raise exception 'El comprobante debe ser una imagen o PDF de hasta 5 MB.' using errcode = 'P0001';
  end if;
  if v_logo is not null then
    select metadata into v_meta from storage.objects where bucket_id = 'team-logos' and name = v_logo;
    if v_logo !~ v_uuid_re or not found
       or coalesce(v_meta ->> 'mimetype', '') <> all (array['image/png', 'image/jpeg', 'image/webp'])
       or coalesce((v_meta ->> 'size')::bigint, 0) not between 1 and 5242880 then
      raise exception 'Logo inválido.' using errcode = 'P0001';
    end if;
  end if;
  if jsonb_typeof(v_players) <> 'array' then
    raise exception 'Roster inválido.' using errcode = 'P0001';
  end if;
  v_total := v_game.starters + v_game.substitutes;
  if jsonb_array_length(v_players) > v_total then
    raise exception 'Demasiados jugadores en el roster.' using errcode = 'P0001';
  end if;

  -- Serializa las inscripciones por juego para respetar el cupo.
  perform pg_advisory_xact_lock(hashtext('reg:' || v_key));

  select count(*) into v_count from registrations
    where game_key = v_key and status in ('pending', 'approved');
  if v_count >= v_game.max_teams then
    raise exception 'Se alcanzó el cupo máximo de equipos para esta disciplina.' using errcode = 'P0001';
  end if;

  if (select count(*) from registrations where captain_whatsapp = v_wa and status = 'pending') >= 3 then
    raise exception 'Este número ya tiene demasiadas inscripciones pendientes.' using errcode = 'P0001';
  end if;

  -- Validar roster
  for v_i in 0 .. v_total - 1 loop
    v_p := v_players -> v_i;
    v_nick := btrim(coalesce(v_p ->> 'nickname', ''));
    v_pid := regexp_replace(coalesce(v_p ->> 'game_player_id', ''), '\D', '', 'g');
    v_srv := nullif(regexp_replace(coalesce(v_p ->> 'server_id', ''), '\D', '', 'g'), '');
    if v_nick = '' and v_pid = '' then
      if v_i < v_game.starters then
        raise exception 'Completa los datos de todos los titulares.' using errcode = 'P0001';
      end if;
      continue;
    end if;
    if char_length(v_nick) not between 1 and 30 or v_pid !~ '^[0-9]{5,15}$' then
      raise exception 'Datos de jugador inválidos (slot %).', v_i + 1 using errcode = 'P0001';
    end if;
    if exists (
      select 1 from players p join registrations r on r.id = p.registration_id
      where p.game_key = v_key and p.game_player_id = v_pid and r.status in ('pending', 'approved')
    ) then
      raise exception 'El jugador con ID % ya está inscrito en otro equipo.', v_pid using errcode = 'P0001';
    end if;
    v_filled := v_filled + 1;
  end loop;

  begin
    insert into registrations (game_key, team_name, captain_name, captain_whatsapp, institution,
                               professional_school, other_institution, logo_path, receipt_path, amount_due)
    values (v_key, v_team, v_captain, v_wa, v_inst,
            v_school,
            case when v_inst = 'Otra' then v_other end,
            v_logo, v_receipt, v_game.price)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya existe un equipo con ese nombre o ese comprobante ya fue usado.' using errcode = 'P0001';
  end;

  for v_i in 0 .. v_total - 1 loop
    v_p := v_players -> v_i;
    v_nick := btrim(coalesce(v_p ->> 'nickname', ''));
    if v_nick = '' then continue; end if;
    insert into players (registration_id, game_key, slot, is_substitute, nickname, game_player_id, server_id)
    values (v_id, v_key, v_i + 1, v_i >= v_game.starters, v_nick,
            regexp_replace(v_p ->> 'game_player_id', '\D', '', 'g'),
            case when v_key = 'mlbb' then nullif(regexp_replace(coalesce(v_p ->> 'server_id', ''), '\D', '', 'g'), '') end);
  end loop;

  return jsonb_build_object('id', v_id, 'amount_due', v_game.price);
end;
$$;
revoke all on function public.submit_registration(jsonb) from public;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;

-- Defensa en profundidad: sin permisos directos para anon sobre tablas privadas.
revoke all on public.admins, public.registrations, public.players, public.audit_log,
  public.stages, public.groups, public.group_teams, public.matches, public.match_results from anon;
revoke insert, update, delete on public.tournament_settings, public.games, public.prizes from anon;
