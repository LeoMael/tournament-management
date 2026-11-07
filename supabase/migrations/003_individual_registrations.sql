-- Inscripción individual y grupos provisionales. Aplicar únicamente después de 001 y 002.
begin;
do $$ begin
  if not exists (select 1 from public.schema_migrations where version = '002') then
    raise exception 'Se requiere la migración 002';
  end if;
end $$;

create table public.individual_settings (
  game_key text primary key references public.games(key),
  is_open boolean not null default false,
  price numeric(8,2) not null default 4 check (price = 4),
  naming_hours integer not null default 24 check (naming_hours between 1 and 720)
);
insert into public.individual_settings(game_key) select key from public.games;
alter table public.individual_settings enable row level security;
create policy individual_settings_read on public.individual_settings for select to anon, authenticated using (true);
create policy individual_settings_admin on public.individual_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.individual_settings from anon, authenticated;
grant select on public.individual_settings to anon, authenticated;
grant insert, update, delete on public.individual_settings to authenticated;

create table public.individual_groups (
  id uuid primary key default gen_random_uuid(),
  game_key text not null references public.games(key),
  default_name text not null,
  team_name text,
  captain_id uuid,
  whatsapp_group_url text,
  naming_deadline timestamptz not null,
  status text not null default 'draft' check (status in ('draft','registered')),
  registration_id uuid unique references public.registrations(id) deferrable initially deferred,
  created_at timestamptz not null default now()
);
create table public.individual_registrations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  request_fingerprint text not null,
  game_key text not null references public.games(key),
  full_name text not null,
  whatsapp text not null,
  nickname text not null,
  game_player_id text not null,
  institution text,
  professional_school text,
  other_institution text,
  preferred_roles text[] not null default '{}',
  receipt_path text not null unique,
  amount_due numeric(8,2) not null check (amount_due = 4),
  status text not null default 'pending' check (status in ('pending','approved','rejected','grouped','registered','refund_pending','refunded')),
  group_id uuid references public.individual_groups(id),
  assigned_role text,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  reason text,
  refund_receipt_path text,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.individual_groups add constraint individual_groups_captain_fk foreign key (captain_id) references public.individual_registrations(id);
create index individual_registrations_lookup on public.individual_registrations(game_key,game_player_id,status);
create index individual_registrations_group on public.individual_registrations(group_id);
create table public.individual_draws (
  request_id uuid primary key,
  game_key text not null references public.games(key),
  result jsonb not null,
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['individual_registrations','individual_groups','individual_draws'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_role(array[''admin'',''revisor_arbitro'']))',t||'_staff_read',t);
  end loop;
end $$;
alter table public.registrations add column registration_origin text not null default 'team' check (registration_origin in ('team','individual'));
alter table public.registrations add column individual_group_id uuid unique references public.individual_groups(id);
alter table public.registrations alter column receipt_path drop not null;
alter table public.registrations add constraint registrations_receipt_origin_check check (registration_origin = 'individual' or receipt_path is not null);

-- Reglas compartidas con el flujo tradicional, incluidas reactivaciones.
create function public.individual_registration_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare v_game text; n int; cap int;
begin
  v_game := coalesce(new.game_key,old.game_key);
  perform pg_advisory_xact_lock(hashtext('reg:'||v_game));
  if tg_table_name = 'registrations' then
    if tg_op = 'DELETE' then
      if old.registration_origin = 'individual' then raise exception 'No se puede borrar un equipo individual finalizado'; end if;
      return old;
    end if;
    if exists(select 1 from individual_groups ig where ig.game_key=new.game_key and ig.status='draft' and ig.id is distinct from new.individual_group_id and lower(coalesce(ig.team_name,ig.default_name))=lower(new.team_name)) then raise exception 'El nombre está reservado por un grupo provisional'; end if;
    if tg_op = 'UPDATE' and new.game_key is distinct from old.game_key then raise exception 'No se puede cambiar el juego'; end if;
    if new.receipt_path is not null then
      perform pg_advisory_xact_lock(hashtext('receipt:'||new.receipt_path));
      if exists(select 1 from individual_registrations where receipt_path=new.receipt_path) then raise exception 'Comprobante ya utilizado'; end if;
    end if;
    if tg_op = 'UPDATE' and (new.registration_origin is distinct from old.registration_origin or new.individual_group_id is distinct from old.individual_group_id) then raise exception 'No se puede cambiar el origen'; end if;
    if tg_op = 'UPDATE' and old.registration_origin = 'individual' and (new.game_key is distinct from old.game_key or new.registration_origin is distinct from old.registration_origin) then raise exception 'No se puede cambiar el origen o juego'; end if;
    if tg_op='INSERT' and ((new.registration_origin='team' and new.individual_group_id is not null) or (new.registration_origin='individual' and not exists(select 1 from individual_groups where id=new.individual_group_id and game_key=new.game_key and status='draft' and registration_id=new.id))) then raise exception 'Origen de equipo inválido'; end if;
    if new.status in ('pending','approved') and (tg_op = 'INSERT' or old.status not in ('pending','approved')) then
      if tg_op = 'UPDATE' and (exists (select 1 from players p join players q on p.game_key=q.game_key and p.game_player_id=q.game_player_id and p.id<>q.id join registrations r on r.id=q.registration_id where p.registration_id=new.id and (r.status in ('pending','approved') or r.id=new.id))) then raise exception 'Jugador ya inscrito'; end if;
      if tg_op = 'UPDATE' and exists (select 1 from players p join individual_registrations i on i.game_key=p.game_key and i.game_player_id=p.game_player_id where p.registration_id=new.id and i.status in ('pending','approved','grouped','registered','refund_pending') and (new.individual_group_id is null or i.group_id is distinct from new.individual_group_id)) then raise exception 'Jugador ya inscrito individualmente'; end if;
      select max_teams into cap from games where key=new.game_key;
      select count(*) into n from registrations where game_key=new.game_key and status in ('pending','approved');
      n := n + (select count(*) from individual_groups where game_key=new.game_key and status='draft');
      if new.registration_origin='individual' and exists (select 1 from individual_groups where id=new.individual_group_id and game_key=new.game_key and status='draft' and registration_id=new.id) then n := n-1; end if;
      if n >= cap then raise exception 'No hay cupos disponibles'; end if;
    end if;
    return new;
  end if;
  if tg_op <> 'INSERT' and exists(select 1 from registrations where id=old.registration_id and registration_origin='individual' and exists(select 1 from individual_groups where registration_id=old.registration_id and status='registered')) then
    raise exception 'El roster del equipo sorteado es inmutable';
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and (new.game_key is distinct from old.game_key or new.registration_id is distinct from old.registration_id) then raise exception 'No se puede mover un jugador'; end if;
  if exists(select 1 from registrations where id=new.registration_id and registration_origin='individual' and exists(select 1 from individual_groups where registration_id=new.registration_id and status='registered')) then raise exception 'El roster del equipo sorteado es inmutable'; end if;
  if exists(select 1 from registrations where id=new.registration_id and game_key<>new.game_key) then raise exception 'Juego incompatible'; end if;
  if exists(select 1 from registrations r where r.id=new.registration_id and r.status in ('pending','approved')) then
    if exists(select 1 from players p join registrations r on r.id=p.registration_id where p.game_key=new.game_key and p.game_player_id=new.game_player_id and r.status in ('pending','approved') and p.id<>new.id) then raise exception 'Jugador ya inscrito'; end if;
    if exists(select 1 from individual_registrations i where i.game_key=new.game_key and i.game_player_id=new.game_player_id and i.status in ('pending','approved','grouped','registered','refund_pending') and not exists(select 1 from individual_groups g where g.id=i.group_id and g.status='draft' and g.id=(select individual_group_id from registrations where id=new.registration_id))) then raise exception 'Jugador ya inscrito'; end if;
  end if;
  return new;
end $$;
create trigger individual_registrations_guard before insert or update or delete on public.registrations for each row execute function public.individual_registration_guard();
create trigger individual_players_guard before insert or update or delete on public.players for each row execute function public.individual_registration_guard();
revoke all on function public.individual_registration_guard() from public, anon, authenticated;

create function public.submit_individual_registration(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  k text:=payload->>'game_key'; rid uuid; fingerprint text; prior individual_registrations%rowtype;
  cfg individual_settings%rowtype; game games%rowtype; settings tournament_settings%rowtype;
  nm text:=btrim(coalesce(payload->>'full_name','')); wa text:=regexp_replace(coalesce(payload->>'whatsapp',''),'\D','','g');
  nick text:=btrim(coalesce(payload->>'nickname','')); pid text:=regexp_replace(coalesce(payload->>'game_player_id',''),'\D','','g');
  inst text:=nullif(btrim(coalesce(payload->>'institution','')),''); school text:=nullif(btrim(coalesce(payload->>'professional_school','')),''); other text:=nullif(btrim(coalesce(payload->>'other_institution','')),'');
  receipt text:=payload->>'receipt_path'; roles text[]; meta jsonb; id uuid; taken int; drafts int;
begin
  begin rid:=(payload->>'request_id')::uuid; exception when others then raise exception 'Solicitud inválida' using errcode='P0001'; end;
  if rid is null then raise exception 'Solicitud inválida' using errcode='P0001'; end if;
  fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtext('individual-request:'||rid::text));
  select * into prior from individual_registrations where request_id=rid;
  if found then
    if prior.request_fingerprint<>fingerprint then raise exception 'Solicitud inválida' using errcode='P0001'; end if;
    return jsonb_build_object('id',prior.id,'status',prior.status,'amount_due',prior.amount_due);
  end if;
  if k not in ('mlbb','ff') or k is null then raise exception 'Juego inválido' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('reg:'||k));
  select * into cfg from individual_settings where game_key=k;
  select * into game from games where key=k;
  select * into settings from tournament_settings where id=1;
  if (k='mlbb' and game.starters is distinct from 5) or (k='ff' and game.starters is distinct from 4) then raise exception 'Inscripciones individuales no disponibles' using errcode='P0001'; end if;
  if not coalesce(cfg.is_open,false) or not coalesce(game.is_open,false) or not coalesce(settings.registration_open,false) or now()>settings.registration_deadline then raise exception 'Inscripciones cerradas' using errcode='P0001'; end if;
  if coalesce(payload->>'website','')<>'' or payload->>'terms_version' is distinct from 'individual-v1' or payload->'accepted_terms' is distinct from 'true'::jsonb then raise exception 'Solicitud inválida' using errcode='P0001'; end if;
  if (select count(*) from individual_registrations where created_at>now()-interval '1 minute')>=15 then raise exception 'Demasiadas solicitudes, intenta más tarde' using errcode='P0001'; end if;
  if length(nm) not between 3 and 80 or nm ~ '[\x01-\x1f\x7f<>]' or wa !~ '^[0-9]{8,15}$' or length(nick) not between 1 and 50 or pid !~ '^[0-9]{5,15}$' then raise exception 'Datos inválidos' using errcode='P0001'; end if;
  if inst is not null and inst not in ('UNAP','Otra') then raise exception 'Institución inválida' using errcode='P0001'; end if;
  if length(coalesce(school,''))>120 or length(coalesce(other,''))>120 or coalesce(school,'') ~ '[\x01-\x1f\x7f<>]' or coalesce(other,'') ~ '[\x01-\x1f\x7f<>]' then raise exception 'Datos inválidos' using errcode='P0001'; end if;
  if jsonb_typeof(payload->'preferred_roles') is distinct from 'array' then raise exception 'Roles inválidos' using errcode='P0001'; end if;
  select coalesce(array_agg(distinct value),array[]::text[]) into roles from jsonb_array_elements_text(payload->'preferred_roles') t(value);
  if (k='ff' and cardinality(roles)>0) or not roles <@ array['exp','jungle','mid','gold','roam']::text[] then raise exception 'Roles inválidos' using errcode='P0001'; end if;
  if receipt is null or receipt !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|pdf)$' then raise exception 'Comprobante inválido' using errcode='P0001'; end if;
  select metadata into meta from storage.objects where bucket_id='receipts' and name=receipt;
  if not found or coalesce(meta->>'mimetype','')<>all(array['image/png','image/jpeg','image/webp','application/pdf']) or coalesce((meta->>'size')::bigint,0) not between 1 and 5242880 then raise exception 'Comprobante inválido' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('receipt:'||receipt));
  if exists(select 1 from registrations where receipt_path=receipt) or exists(select 1 from individual_registrations where receipt_path=receipt) then raise exception 'Solicitud inválida' using errcode='P0001'; end if;
  if exists(select 1 from individual_registrations where game_key=k and game_player_id=pid and status in ('pending','approved','grouped','registered','refund_pending')) or exists(select 1 from players p join registrations r on r.id=p.registration_id where p.game_key=k and p.game_player_id=pid and r.status in ('pending','approved')) then raise exception 'No se pudo registrar esta solicitud' using errcode='P0001'; end if;
  select count(*) into taken from registrations where game_key=k and status in ('pending','approved');
  select count(*) into drafts from individual_groups where game_key=k and status='draft';
  if (select count(*) from individual_registrations where game_key=k and status in ('pending','approved')) >= greatest(0,game.max_teams-taken-drafts)*game.starters then raise exception 'No hay cupos individuales disponibles' using errcode='P0001'; end if;
  insert into individual_registrations(request_id,request_fingerprint,game_key,full_name,whatsapp,nickname,game_player_id,institution,professional_school,other_institution,preferred_roles,receipt_path,amount_due,terms_version,terms_accepted_at)
  values(rid,fingerprint,k,nm,wa,nick,pid,inst,school,other,roles,receipt,cfg.price,'individual-v1',now()) returning individual_registrations.id into id;
  return jsonb_build_object('id',id,'status','pending','amount_due',cfg.price);
end $$;
revoke all on function public.submit_individual_registration(jsonb) from public;
grant execute on function public.submit_individual_registration(jsonb) to anon,authenticated;

create function public.review_individual_registration(p_id uuid,p_status text,p_reason text default null,p_refund_receipt_path text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare r individual_registrations%rowtype; meta jsonb;
begin
  if not public.has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permiso'; end if;
  select * into r from individual_registrations where id=p_id;
  if not found then raise exception 'Inscripción inexistente'; end if;
  perform pg_advisory_xact_lock(hashtext('reg:'||r.game_key));
  select * into r from individual_registrations where id=p_id for update;
  if r.status=p_status and (p_status<>'refunded' or r.refund_receipt_path is not distinct from p_refund_receipt_path) then return jsonb_build_object('id',p_id,'status',p_status); end if;
  if not ((r.status='pending' and p_status in ('approved','rejected','refund_pending')) or (r.status='approved' and p_status in ('rejected','refund_pending')) or (r.status='rejected' and p_status='refund_pending') or (r.status='refund_pending' and p_status='refunded')) then raise exception 'Transición no permitida'; end if;
  if length(coalesce(p_reason,''))>300 then raise exception 'Motivo demasiado largo'; end if;
  if p_status='refunded' then
    select metadata into meta from storage.objects where bucket_id='receipts' and name=p_refund_receipt_path;
    if not found or coalesce(meta->>'mimetype','')<>all(array['image/png','image/jpeg','image/webp','application/pdf']) or coalesce((meta->>'size')::bigint,0) not between 1 and 5242880 then raise exception 'Comprobante de reembolso inválido'; end if;
  end if;
  update individual_registrations set status=p_status,reason=nullif(btrim(p_reason),''),refund_receipt_path=case when p_status='refunded' then p_refund_receipt_path end,refunded_at=case when p_status='refunded' then now() end where id=p_id;
  return jsonb_build_object('id',p_id,'status',p_status);
end $$;
revoke all on function public.review_individual_registration(uuid,text,text,text) from public,anon;
grant execute on function public.review_individual_registration(uuid,text,text,text) to authenticated;

create function public.generate_individual_groups(p_game_key text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare prior individual_draws%rowtype; g games%rowtype; cfg individual_settings%rowtype; ids uuid[]; role_names text[]; v_group_id uuid; n_groups int:=0; n_players int:=0; remaining int; taken int; available int; idx int; result jsonb; candidate record; states jsonb; mask int; v_bit int; next_mask int;
begin
  if not public.has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permiso'; end if;
  if p_game_key not in ('mlbb','ff') or p_request_id is null then raise exception 'Solicitud inválida'; end if;
  perform pg_advisory_xact_lock(hashtext('individual-draw:'||p_request_id::text));
  select * into prior from individual_draws where request_id=p_request_id;
  if found then
    if prior.game_key<>p_game_key then raise exception 'Solicitud inválida'; end if;
    return prior.result;
  end if;
  perform pg_advisory_xact_lock(hashtext('reg:'||p_game_key));
  select * into g from games where key=p_game_key;
  select * into cfg from individual_settings where game_key=p_game_key;
  if not found or (p_game_key='mlbb' and g.starters<>5) or (p_game_key='ff' and g.starters<>4) then raise exception 'Configuración de titulares incompatible'; end if;
  select count(*) into taken from registrations where game_key=p_game_key and status in ('pending','approved');
  select count(*) into available from individual_groups where game_key=p_game_key and status='draft';
  available:=greatest(0,g.max_teams-taken-available);
  while n_groups<available loop
    ids:=null; role_names:=null;
    if p_game_key='ff' then
      select array_agg(id) into ids from (select id from individual_registrations where game_key=p_game_key and status='approved' order by random() limit 4) q;
      if coalesce(cardinality(ids),0)<>4 then exit; end if;
    else
      -- Dynamic programming over the 32 role subsets; each player is used at most once.
      states:='{"0":[]}'::jsonb;
      role_names:=array['exp','jungle','mid','gold','roam'];
      for candidate in select id,preferred_roles from individual_registrations where game_key=p_game_key and status='approved' order by random() loop
        for mask in reverse 31..0 loop
          if states ? mask::text then
            for idx in 1..5 loop
              v_bit:=1 << (idx-1);
              next_mask:=mask | v_bit;
              if (mask & v_bit)=0 and not (states ? next_mask::text) and (cardinality(candidate.preferred_roles)=0 or role_names[idx]=any(candidate.preferred_roles)) then
                states:=jsonb_set(states,array[next_mask::text],(states->mask::text)||jsonb_build_array(jsonb_build_object('id',candidate.id,'role',idx)),true);
              end if;
            end loop;
          end if;
        end loop;
        exit when states ? '31';
      end loop;
      if not (states ? '31') then exit; end if;
      select array_agg((value->>'id')::uuid order by (value->>'role')::int) into ids from jsonb_array_elements(states->'31');
      role_names:=array['exp','jungle','mid','gold','roam'];
    end if;
    loop
      v_group_id:=gen_random_uuid();
      exit when not exists (select 1 from registrations where game_key=p_game_key and lower(team_name)=lower('Equipo '||upper(p_game_key)||' '||substr(replace(v_group_id::text,'-',''),1,12)))
        and not exists (select 1 from individual_groups where game_key=p_game_key and status='draft' and lower(coalesce(team_name,default_name))=lower('Equipo '||upper(p_game_key)||' '||substr(replace(v_group_id::text,'-',''),1,12)));
    end loop;
    insert into individual_groups(id,game_key,default_name,naming_deadline)
    values(v_group_id,p_game_key,'Equipo '||upper(p_game_key)||' '||substr(replace(v_group_id::text,'-',''),1,12),now()+make_interval(hours=>cfg.naming_hours));
    for idx in 1..cardinality(ids) loop
      update individual_registrations set status='grouped',group_id=v_group_id,assigned_role=role_names[idx] where id=ids[idx];
    end loop;
    n_groups:=n_groups+1; n_players:=n_players+cardinality(ids);
  end loop;
  select count(*) into remaining from individual_registrations where game_key=p_game_key and status='approved';
  result:=jsonb_build_object('groups_created',n_groups,'players_grouped',n_players,'players_waiting',remaining);
  insert into individual_draws(request_id,game_key,result) values(p_request_id,p_game_key,result);
  return result;
end $$;
revoke all on function public.generate_individual_groups(text,uuid) from public,anon;
grant execute on function public.generate_individual_groups(text,uuid) to authenticated;

create function public.update_individual_group(p_group_id uuid,p_team_name text,p_captain_id uuid,p_whatsapp_group_url text,p_naming_deadline timestamptz) returns jsonb language plpgsql security definer set search_path=public as $$
declare g individual_groups%rowtype; nm text:=nullif(btrim(p_team_name),''); url text:=nullif(btrim(p_whatsapp_group_url),'');
begin
  if not public.has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permiso'; end if;
  select * into g from individual_groups where id=p_group_id;
  if not found then raise exception 'Grupo inexistente'; end if;
  perform pg_advisory_xact_lock(hashtext('reg:'||g.game_key));
  select * into g from individual_groups where id=p_group_id for update;
  if g.status<>'draft' then raise exception 'Grupo finalizado'; end if;
  if nm is distinct from g.team_name and now()>g.naming_deadline then raise exception 'Plazo de nombre vencido'; end if;
  if nm is not null and (length(nm) not between 3 and 40 or nm ~ '[\x01-\x1f\x7f]') then raise exception 'Nombre inválido'; end if;
  if exists(select 1 from registrations where game_key=g.game_key and lower(team_name)=lower(coalesce(nm,g.default_name))) or exists(select 1 from individual_groups where game_key=g.game_key and status='draft' and id<>g.id and lower(coalesce(team_name,default_name))=lower(coalesce(nm,g.default_name))) then raise exception 'Ese nombre ya está en uso o reservado'; end if;
  if p_captain_id is not null and not exists(select 1 from individual_registrations where id=p_captain_id and group_id=g.id and status='grouped') then raise exception 'Capitán no pertenece al grupo'; end if;
  if url is not null and url !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{10,60}$' then raise exception 'Enlace inválido'; end if;
  if p_naming_deadline is distinct from g.naming_deadline then raise exception 'El plazo no se puede modificar'; end if;
  update individual_groups set team_name=nm,captain_id=p_captain_id,whatsapp_group_url=url where id=p_group_id;
  return jsonb_build_object('id',p_group_id);
end $$;
revoke all on function public.update_individual_group(uuid,text,uuid,text,timestamptz) from public,anon;
grant execute on function public.update_individual_group(uuid,text,uuid,text,timestamptz) to authenticated;

create function public.register_individual_group(p_group_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare g individual_groups%rowtype; captain individual_registrations%rowtype; game games%rowtype; p individual_registrations%rowtype; total numeric; num int; reg_id uuid; slot_no int:=0; nm text;
begin
  if not public.has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permiso'; end if;
  select * into g from individual_groups where id=p_group_id;
  if not found then raise exception 'Grupo inexistente'; end if;
  perform pg_advisory_xact_lock(hashtext('reg:'||g.game_key));
  select * into g from individual_groups where id=p_group_id for update;
  if g.status='registered' then return jsonb_build_object('registration_id',g.registration_id); end if;
  select * into game from games where key=g.game_key;
  select count(*),sum(amount_due) into num,total from individual_registrations where group_id=g.id and status='grouped';
  if num<>game.starters or (g.game_key='mlbb' and (select count(distinct assigned_role) from individual_registrations where group_id=g.id and status='grouped' and assigned_role in ('exp','jungle','mid','gold','roam'))<>5) then raise exception 'El grupo está incompleto'; end if;
  select * into captain from individual_registrations where id=g.captain_id and group_id=g.id and status='grouped';
  if not found then raise exception 'Selecciona un capitán del grupo'; end if;
  if g.whatsapp_group_url is null then raise exception 'Falta el enlace de WhatsApp'; end if;
  nm:=coalesce(g.team_name,g.default_name);
  reg_id:=gen_random_uuid();
  update individual_groups set registration_id=reg_id where id=g.id;
  insert into registrations(id,game_key,team_name,captain_name,captain_whatsapp,institution,professional_school,other_institution,receipt_path,amount_due,status,registration_origin,individual_group_id)
  values(reg_id,g.game_key,nm,captain.full_name,captain.whatsapp,coalesce(captain.institution,'Otra'),captain.professional_school,case when coalesce(captain.institution,'Otra')='Otra' then coalesce(captain.other_institution,'Independiente') end,null,total,'approved','individual',g.id)
  returning id into reg_id;
  for p in select * from individual_registrations where group_id=g.id and status='grouped' order by (id=g.captain_id) desc, assigned_role nulls last,id loop
    slot_no:=slot_no+1;
    insert into players(registration_id,game_key,slot,is_substitute,nickname,game_player_id) values(reg_id,g.game_key,slot_no,false,p.nickname,p.game_player_id);
  end loop;
  update individual_registrations set status='registered' where group_id=g.id and status='grouped';
  update individual_groups set status='registered',registration_id=reg_id where id=g.id;
  return jsonb_build_object('registration_id',reg_id);
end $$;
revoke all on function public.register_individual_group(uuid) from public,anon;
grant execute on function public.register_individual_group(uuid) to authenticated;

create or replace view public.public_availability as
  select g.key as game_key, g.max_teams,
    ((select count(*) from public.registrations r where r.game_key=g.key and r.status in ('pending','approved')) +
     (select count(*) from public.individual_groups ig where ig.game_key=g.key and ig.status='draft'))::int as taken
  from public.games g;
revoke all on public.public_availability from public;
grant select on public.public_availability to anon, authenticated;

create trigger audit_individual_registrations after insert or update or delete on public.individual_registrations for each row execute function public.audit_trigger();
create trigger audit_individual_groups after insert or update or delete on public.individual_groups for each row execute function public.audit_trigger();
create trigger audit_individual_settings after insert or update or delete on public.individual_settings for each row execute function public.audit_trigger();
insert into public.schema_migrations(version,description) values('003','Inscripciones individuales y grupos provisionales');
commit;
