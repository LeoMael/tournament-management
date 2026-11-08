begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='007') then raise exception 'Se requiere 007'; end if;
end $$;
create table public.solo_rooms (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null default public.current_edition_id() references public.tournament_editions(id),
  name text not null check(char_length(btrim(name)) between 3 and 100),
  scheduled_at timestamptz not null,
  closes_at timestamptz not null,
  capacity integer not null check(capacity between 2 and 100),
  entry_price numeric(10,2) not null check(entry_price between 0 and 10000),
  kill_reward numeric(10,2) not null check(kill_reward between 0 and 10000),
  booyah_reward numeric(10,2) not null check(booyah_reward between 0 and 1000000),
  status text not null default 'draft' check(status in ('draft','open','closed','playing','finished','cancelled')),
  cancellation_reason text not null default '' check(char_length(cancellation_reason)<=500),
  created_at timestamptz not null default now(),
  check(closes_at <= scheduled_at)
);
create table public.solo_registrations (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null default public.current_edition_id() references public.tournament_editions(id),
  room_id uuid not null references public.solo_rooms(id),
  request_id uuid not null unique,
  request_fingerprint text not null,
  full_name text not null check(char_length(full_name) between 3 and 80),
  whatsapp text not null check(whatsapp ~ '^[0-9]{8,15}$'),
  nickname text not null check(char_length(nickname) between 1 and 50),
  game_player_id text not null check(game_player_id ~ '^[0-9]{5,15}$'),
  institution text not null default '' check(char_length(institution)<=120),
  professional_school text not null default '' check(char_length(professional_school)<=120),
  receipt_path text not null unique,
  amount_due numeric(10,2) not null check(amount_due>=0),
  status text not null default 'pending' check(status in ('pending','approved','rejected','refund_pending','refunded')),
  reason text not null default '' check(char_length(reason)<=500),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index solo_player_room on public.solo_registrations(room_id,game_player_id) where status in ('pending','approved');
create table public.solo_results (
  registration_id uuid primary key references public.solo_registrations(id),
  edition_id uuid not null default public.current_edition_id() references public.tournament_editions(id),
  room_id uuid not null references public.solo_rooms(id),
  kills integer not null check(kills between 0 and 1000),
  booyah boolean not null default false
);
create unique index solo_one_booyah on public.solo_results(room_id) where booyah;
create table public.solo_payments (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null default public.current_edition_id() references public.tournament_editions(id),
  registration_id uuid not null references public.solo_registrations(id),
  kind text not null check(kind in ('reward','refund')),
  amount numeric(14,2) not null check(amount>=0),
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  reference text not null default '' check(char_length(reference)<=300),
  unique(registration_id,kind)
);
do $$ declare t text; begin
  foreach t in array array['solo_rooms','solo_registrations','solo_results','solo_payments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy staff_read on public.%I for select to authenticated using (public.has_role(array[''admin'',''revisor_arbitro'']))',t);
    execute format('create trigger edition_barrier before insert or update or delete on public.%I for each statement execute function public.edition_write_guard()',t);
    execute format('create trigger edition_row before insert or update on public.%I for each row execute function public.edition_write_guard()',t);
    execute format('create trigger audit_solo after insert or update or delete on public.%I for each row execute function public.audit_trigger()',t);
  end loop;
end $$;

create function public.submit_solo_registration(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype; s tournament_settings%rowtype; old_request solo_registrations%rowtype;
  v_id uuid; meta jsonb; fp text := md5((payload - 'request_id')::text); path text := payload->>'receipt_path';
begin
  perform pg_advisory_xact_lock_shared(724091);
  if payload->>'edition_id' is distinct from current_edition_id()::text then raise exception 'La edición cambió. Actualiza la página.'; end if;
  if coalesce(payload->>'website','') <> '' then raise exception 'Solicitud no válida'; end if;
  perform pg_advisory_xact_lock(hashtext('solo-request:'||(payload->>'request_id')));
  select * into old_request from solo_registrations where request_id=(payload->>'request_id')::uuid;
  if found then
    if old_request.request_fingerprint <> fp then raise exception 'Este intento ya fue enviado con otros datos'; end if;
    return jsonb_build_object('id',old_request.id,'amount_due',old_request.amount_due);
  end if;
  select * into s from tournament_settings where id=1;
  if not s.solo_enabled or not s.registration_open or now()>s.registration_deadline then raise exception 'Las inscripciones Solo están cerradas'; end if;
  select * into r from solo_rooms where id=(payload->>'room_id')::uuid for update;
  if not found or r.edition_id<>s.edition_id or r.status<>'open' or now()>r.closes_at then raise exception 'Esta sala no admite inscripciones'; end if;
  if (select count(*) from solo_registrations where room_id=r.id and status in ('pending','approved')) >= r.capacity then raise exception 'La sala está completa'; end if;
  if (select count(*) from solo_registrations where created_at>now()-interval '1 minute') >= 15 then raise exception 'Demasiadas solicitudes. Intenta en un minuto.'; end if;
  if (select count(*) from solo_registrations where whatsapp=btrim(payload->>'whatsapp') and status='pending') >= 3 then raise exception 'Este número tiene demasiadas solicitudes pendientes'; end if;
  if coalesce(btrim(payload->>'full_name'),'') !~ '^[^<>[:cntrl:]]{3,80}$'
     or coalesce(payload->>'whatsapp','') !~ '^[0-9]{8,15}$'
     or coalesce(btrim(payload->>'nickname'),'') !~ '^[^[:cntrl:]]{1,50}$'
     or coalesce(payload->>'game_player_id','') !~ '^[0-9]{5,15}$'
     or coalesce(payload->>'institution','') ~ '[<>[:cntrl:]]'
     or coalesce(payload->>'professional_school','') ~ '[<>[:cntrl:]]' then raise exception 'Revisa los datos del jugador'; end if;
  if path is null or path !~ '^[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$' then raise exception 'Comprobante inválido'; end if;
  perform pg_advisory_xact_lock(hashtext('receipt:'||path));
  select metadata into meta from storage.objects where bucket_id='receipts' and name=path;
  if not found or coalesce(meta->>'mimetype','') <> all(array['image/png','image/jpeg','image/webp','application/pdf'])
    or coalesce((meta->>'size')::bigint,0) not between 1 and 5242880 then raise exception 'Comprobante inválido o mayor a 5 MB'; end if;
  if exists(select 1 from registrations where receipt_path=path) or exists(select 1 from individual_registrations where receipt_path=path)
    or exists(select 1 from solo_registrations where receipt_path=path) then raise exception 'Comprobante ya utilizado'; end if;
  if exists(select 1 from solo_registrations where room_id=r.id and game_player_id=payload->>'game_player_id' and status in ('pending','approved')) then raise exception 'Este jugador ya está inscrito en la sala'; end if;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,game_player_id,institution,professional_school,receipt_path,amount_due)
  values(r.id,(payload->>'request_id')::uuid,fp,btrim(payload->>'full_name'),payload->>'whatsapp',btrim(payload->>'nickname'),payload->>'game_player_id',coalesce(btrim(payload->>'institution'),''),coalesce(btrim(payload->>'professional_school'),''),path,r.entry_price) returning id into v_id;
  return jsonb_build_object('id',v_id,'amount_due',r.entry_price);
end $$;

-- Todas las mutaciones de Solo pasan por esta RPC; no hay escritura directa de clientes.
create function public.manage_solo(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype; reg solo_registrations%rowtype; pay solo_payments%rowtype; v_id uuid; target text;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_data->>'edition_id' is distinct from current_edition_id()::text then raise exception 'La edición cambió. Actualiza la página.'; end if;
  if p_action in ('create','edit','open','pay') and not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  if p_action='create' then
    insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward)
      values(btrim(p_data->>'name'),(p_data->>'scheduled_at')::timestamptz,(p_data->>'closes_at')::timestamptz,(p_data->>'capacity')::integer,(p_data->>'entry_price')::numeric,(p_data->>'kill_reward')::numeric,(p_data->>'booyah_reward')::numeric) returning id into v_id;
    return jsonb_build_object('id',v_id);
  end if;
  select * into r from solo_rooms where id=(p_data->>'room_id')::uuid for update;
  if not found then raise exception 'Sala no encontrada'; end if;
  if p_action='edit' then
    if r.status<>'draft' then raise exception 'Las condiciones se fijaron al abrir las inscripciones'; end if;
    update solo_rooms set name=btrim(p_data->>'name'),scheduled_at=(p_data->>'scheduled_at')::timestamptz,closes_at=(p_data->>'closes_at')::timestamptz,capacity=(p_data->>'capacity')::integer,entry_price=(p_data->>'entry_price')::numeric,kill_reward=(p_data->>'kill_reward')::numeric,booyah_reward=(p_data->>'booyah_reward')::numeric where id=r.id;
  elsif p_action='open' then
    if r.status<>'draft' or r.closes_at<=now() then raise exception 'Revisa el estado y la fecha de cierre de la sala'; end if;
    if not exists(select 1 from tournament_settings where solo_enabled and registration_open and registration_deadline>=r.closes_at) then raise exception 'Habilita Solo y las inscripciones generales; el cierre debe estar dentro del plazo general'; end if;
    update solo_rooms set status='open' where id=r.id;
  elsif p_action='close' then
    if r.status<>'open' then raise exception 'La sala no está abierta'; end if;
    update solo_rooms set status='closed' where id=r.id;
  elsif p_action='review' then
    if r.status not in ('open','closed') then raise exception 'La revisión solo está disponible antes de jugar'; end if;
    select * into reg from solo_registrations where id=(p_data->>'registration_id')::uuid and room_id=r.id for update;
    if not found or reg.status<>'pending' then raise exception 'La solicitud ya fue revisada'; end if;
    target:=p_data->>'status';
    if target is null or target not in ('approved','rejected','refund_pending') then raise exception 'Estado inválido'; end if;
    if target in ('rejected','refund_pending') and char_length(btrim(coalesce(p_data->>'reason',''))) < 3 then raise exception 'Indica el motivo'; end if;
    update solo_registrations set status=target,reason=coalesce(p_data->>'reason',''),reviewed_by=auth.uid(),reviewed_at=now() where id=reg.id;
    if target='refund_pending' then
      insert into solo_payments(registration_id,kind,amount,paid_at,paid_by) values(reg.id,'refund',reg.amount_due,case when reg.amount_due=0 then now() end,case when reg.amount_due=0 then auth.uid() end);
      if reg.amount_due=0 then update solo_registrations set status='refunded' where id=reg.id; end if;
    end if;
  elsif p_action='start' then
    if r.status<>'closed' then raise exception 'Primero cierra las inscripciones de la sala'; end if;
    if exists(select 1 from solo_registrations where room_id=r.id and status='pending') then raise exception 'Revisa las solicitudes pendientes'; end if;
    if not exists(select 1 from solo_registrations where room_id=r.id and status='approved') then raise exception 'No hay jugadores aprobados'; end if;
    update solo_rooms set status='playing' where id=r.id;
  elsif p_action='result' then
    if r.status<>'playing' then raise exception 'Solo se pueden editar resultados durante la partida'; end if;
    select * into reg from solo_registrations where id=(p_data->>'registration_id')::uuid and room_id=r.id and status='approved';
    if not found then raise exception 'Jugador no aprobado en esta sala'; end if;
    if coalesce((p_data->>'booyah')::boolean,false) then update solo_results set booyah=false where room_id=r.id and booyah; end if;
    insert into solo_results(registration_id,room_id,kills,booyah) values(reg.id,r.id,(p_data->>'kills')::integer,coalesce((p_data->>'booyah')::boolean,false))
      on conflict(registration_id) do update set kills=excluded.kills,booyah=excluded.booyah;
  elsif p_action='finish' then
    if r.status<>'playing' then raise exception 'La sala no está en juego'; end if;
    if exists(select 1 from solo_registrations a left join solo_results b on b.registration_id=a.id where a.room_id=r.id and a.status='approved' and b.registration_id is null)
      or (select count(*) from solo_results where room_id=r.id and booyah)<>1 then raise exception 'Completa todos los resultados y selecciona un Booyah'; end if;
    insert into solo_payments(registration_id,kind,amount,paid_at,paid_by)
      select registration_id,'reward',kills*r.kill_reward+case when booyah then r.booyah_reward else 0 end,
        case when kills*r.kill_reward+case when booyah then r.booyah_reward else 0 end=0 then now() end,
        case when kills*r.kill_reward+case when booyah then r.booyah_reward else 0 end=0 then auth.uid() end
      from solo_results where room_id=r.id;
    update solo_rooms set status='finished' where id=r.id;
  elsif p_action='cancel' then
    if r.status not in ('draft','open','closed','playing') then raise exception 'Esta sala ya está finalizada o cancelada'; end if;
    if char_length(btrim(coalesce(p_data->>'reason',''))) < 3 then raise exception 'Indica el motivo de cancelación'; end if;
    insert into solo_payments(registration_id,kind,amount,paid_at,paid_by)
      select id,'refund',amount_due,case when amount_due=0 then now() end,case when amount_due=0 then auth.uid() end from solo_registrations where room_id=r.id and status='approved';
    update solo_registrations set status=case when status='pending' then 'rejected' when amount_due=0 then 'refunded' else 'refund_pending' end,reason=p_data->>'reason',reviewed_by=auth.uid(),reviewed_at=now() where room_id=r.id and status in ('pending','approved');
    delete from solo_results where room_id=r.id;
    update solo_rooms set status='cancelled',cancellation_reason=p_data->>'reason' where id=r.id;
  elsif p_action='pay' then
    select p.* into pay from solo_payments p join solo_registrations a on a.id=p.registration_id where p.id=(p_data->>'payment_id')::uuid and a.room_id=r.id for update of p;
    if not found then raise exception 'Pago no encontrado'; end if;
    if pay.paid_at is null then
      update solo_payments set paid_at=now(),paid_by=auth.uid(),reference=coalesce(p_data->>'reference','') where id=pay.id;
      if pay.kind='refund' then update solo_registrations set status='refunded' where id=pay.registration_id; end if;
    end if;
  else raise exception 'Acción inválida'; end if;
  return jsonb_build_object('id',r.id);
end $$;

-- Proyecciones explícitas: nunca contactos, IDs de juego, recibos ni estados de pago.
create view public.public_solo_rooms as
 select r.id,r.edition_id,r.name,r.scheduled_at,r.closes_at,r.capacity,r.entry_price,r.kill_reward,r.booyah_reward,r.status,
   (select count(*) from public.solo_registrations a where a.room_id=r.id and a.status in ('pending','approved')) as taken
 from public.solo_rooms r where r.status<>'draft' and r.edition_id=public.current_edition_id();
create view public.public_solo_results as
 select a.id,a.room_id,a.nickname,
   case when r.status='finished' then s.kills end as kills,
   case when r.status='finished' then s.booyah end as booyah,
   case when r.status='finished' then s.kills*r.kill_reward+case when s.booyah then r.booyah_reward else 0 end end as earnings
 from public.solo_registrations a join public.solo_rooms r on r.id=a.room_id left join public.solo_results s on s.registration_id=a.id
 where a.status='approved' and r.status not in ('draft','cancelled') and r.edition_id=public.current_edition_id();
revoke all on public.public_solo_rooms,public.public_solo_results from public;
grant select on public.public_solo_rooms,public.public_solo_results to anon,authenticated;
revoke all on function public.submit_solo_registration(jsonb),public.manage_solo(text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_solo_registration(jsonb) to anon,authenticated;
grant execute on function public.manage_solo(text,jsonb) to authenticated;

-- Evita reutilizar comprobantes Solo desde los flujos anteriores, con el mismo lock.
create function public.solo_receipt_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.receipt_path is not null then
    perform pg_advisory_xact_lock(hashtext('receipt:'||new.receipt_path));
    if exists(select 1 from solo_registrations where receipt_path=new.receipt_path) then raise exception 'Comprobante ya utilizado en Solo'; end if;
  end if;
  return new;
end $$;
revoke all on function public.solo_receipt_guard() from public;
create trigger solo_receipt_guard before insert or update of receipt_path on public.registrations for each row execute function public.solo_receipt_guard();
create trigger solo_receipt_guard before insert or update of receipt_path on public.individual_registrations for each row execute function public.solo_receipt_guard();
create function public.current_edition_finances() returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  return jsonb_build_object(
    'teams',jsonb_build_object('confirmed',coalesce((select sum(amount_due) from registrations where registration_origin='team' and status='approved'),0),'pending',coalesce((select sum(amount_due) from registrations where registration_origin='team' and status='pending'),0)),
    'individuals',jsonb_build_object('confirmed',coalesce((select sum(amount_due) from individual_registrations where status in ('approved','grouped','registered')),0),'pending',coalesce((select sum(amount_due) from individual_registrations where status='pending'),0)),
    'solo',jsonb_build_object('confirmed',coalesce((select sum(amount_due) from solo_registrations where status='approved'),0),'pending',coalesce((select sum(amount_due) from solo_registrations where status='pending'),0)),
    'solo_due',coalesce((select sum(amount) from solo_payments where paid_at is null),0));
end $$;
revoke all on function public.current_edition_finances() from public,anon;
grant execute on function public.current_edition_finances() to authenticated;

insert into public.schema_migrations(version,description) values ('008','Free Fire Solo: salas, kills, Booyah y liquidaciones');
commit;
