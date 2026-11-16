-- Paso 2: gestión de salas nuevas, inscripción y slots. Requiere las bases 029 y 030.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='030') then raise exception 'Se requiere 030'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

alter table public.duo_rooms drop constraint duo_foundation_draft_only;
alter table public.duo_rooms add constraint duo_room_status check(status in('draft','open','closed','playing','finished','cancelled'));
alter table public.solo_top_rooms drop constraint solo_top_foundation_draft_only;
alter table public.solo_top_rooms add constraint solo_top_room_status check(status in('draft','open','closed','playing','finished','cancelled'));
alter table public.duo_rooms add column is_paused boolean not null default false,add column is_announced boolean not null default false;
alter table public.solo_top_rooms add column is_paused boolean not null default false,add column is_announced boolean not null default false;

create function public.ff_room_data(p_kind text,p_room_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare room_data jsonb;
begin
  if p_kind='solo_top' then
    select to_jsonb(r) into room_data from solo_top_rooms r where id=p_room_id for update;
  elsif p_kind in('duo_top','duo_kills') then
    select to_jsonb(r) into room_data from duo_rooms r
      where id=p_room_id and mode=case when p_kind='duo_top' then 'top' else 'kills' end for update;
  else raise exception 'Modalidad inválida'; end if;
  if room_data is null then raise exception 'Sala no encontrada en esta modalidad'; end if;
  return room_data;
end $$;
revoke all on function public.ff_room_data(text,uuid) from public,anon,authenticated;

create table public.ff_room_registrations (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null default public.current_edition_id() references public.tournament_editions(id),
  room_kind text not null check(room_kind in('solo_top','duo_top','duo_kills')),
  duo_room_id uuid,
  solo_top_room_id uuid,
  room_id uuid generated always as(coalesce(duo_room_id,solo_top_room_id)) stored,
  request_id uuid not null unique,
  request_fingerprint text not null,
  full_name text not null check(btrim(full_name) ~ '^[^<>[:cntrl:]]{3,80}$'),
  whatsapp text not null check(whatsapp ~ '^[0-9]{8,15}$'),
  prize_yape_phone text not null check(prize_yape_phone ~ '^[0-9]{8,15}$'),
  nickname_1 text not null check(btrim(nickname_1) ~ '^[^<>[:cntrl:]]{1,50}$'),
  nickname_2 text check(nickname_2 is null or btrim(nickname_2) ~ '^[^<>[:cntrl:]]{1,50}$'),
  receipt_path text not null unique,
  amount_due numeric(10,2) not null check(amount_due between 0 and 10000),
  status text not null default 'pending' check(status in('pending','approved','rejected','refund_pending','refunded')),
  slot smallint check(slot between 1 and 100),
  reason text not null default '' check(char_length(reason)<=500),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(duo_room_id,edition_id) references public.duo_rooms(id,edition_id),
  foreign key(solo_top_room_id,edition_id) references public.solo_top_rooms(id,edition_id),
  unique(room_kind,room_id,slot),
  check((room_kind='solo_top' and solo_top_room_id is not null and duo_room_id is null and nickname_2 is null)
    or (room_kind in('duo_top','duo_kills') and duo_room_id is not null and solo_top_room_id is null and nickname_2 is not null)),
  check(nickname_2 is null or lower(btrim(nickname_1))<>lower(btrim(nickname_2))),
  check(status<>'approved' or slot is not null)
);
create index ff_room_registrations_room on public.ff_room_registrations(edition_id,room_kind,room_id,created_at);
alter table public.ff_room_registrations enable row level security;
revoke all on public.ff_room_registrations from public,anon,authenticated;
grant select on public.ff_room_registrations to authenticated;
create policy ff_room_registrations_staff_read on public.ff_room_registrations for select to authenticated
  using(public.is_admin() or (public.has_role(array['revisor_arbitro']) and edition_id=public.current_edition_id()));
create trigger edition_barrier before insert or update or delete on public.ff_room_registrations
  for each statement execute function public.edition_write_guard();
create trigger edition_row before insert or update on public.ff_room_registrations
  for each row execute function public.edition_write_guard();
create trigger audit_ff_room_registrations after insert or update or delete on public.ff_room_registrations
  for each row execute function public.audit_trigger();

create function public.freeze_ff_room_conditions() returns trigger
language plpgsql set search_path=public as $$
declare field text;
begin
  if old.status<>'draft' then
    if new.status='draft' then raise exception 'La sala no puede volver a borrador'; end if;
    foreach field in array array['mode','capacity','entry_price','kill_reward','booyah_reward','rewarded_places'] loop
      if to_jsonb(new)->field is distinct from to_jsonb(old)->field then
        raise exception 'Las condiciones de la sala quedaron fijadas al abrir inscripciones';
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.freeze_ff_room_conditions() from public,anon,authenticated;
create trigger freeze_ff_room_conditions before update on public.duo_rooms for each row execute function public.freeze_ff_room_conditions();
create trigger freeze_ff_room_conditions before update on public.solo_top_rooms for each row execute function public.freeze_ff_room_conditions();

create function public.guard_ff_room_registration() returns trigger
language plpgsql security definer set search_path=public as $$
declare room_data jsonb; target_room uuid; room_capacity integer;
begin
  target_room:=coalesce(new.duo_room_id,new.solo_top_room_id);
  room_data:=ff_room_data(new.room_kind,target_room);
  if new.edition_id is distinct from (room_data->>'edition_id')::uuid then raise exception 'La inscripción pertenece a otra edición'; end if;
  room_capacity:=(room_data->>'capacity')::integer;
  if tg_op='UPDATE' then
    if new.room_kind is distinct from old.room_kind or new.duo_room_id is distinct from old.duo_room_id
      or new.solo_top_room_id is distinct from old.solo_top_room_id then raise exception 'No se puede mover la inscripción a otra sala'; end if;
    if old.slot is not null and new.slot is distinct from old.slot then raise exception 'El slot asignado no puede cambiar'; end if;
  else
    if room_data->>'status'<>'open' or (room_data->>'is_paused')::boolean or now()>=(room_data->>'closes_at')::timestamptz then
      raise exception 'Esta sala no admite inscripciones';
    end if;
    if (select count(*) from ff_room_registrations where room_kind=new.room_kind and room_id=target_room and status in('pending','approved'))>=room_capacity then
      raise exception 'La sala está completa';
    end if;
  end if;
  if new.status in('pending','approved') and exists(
    select 1 from ff_room_registrations r where r.room_kind=new.room_kind and r.room_id=target_room
      and r.id<>new.id and r.status in('pending','approved')
      and (lower(btrim(r.nickname_1)) in(lower(btrim(new.nickname_1)),lower(btrim(new.nickname_2)))
        or lower(btrim(r.nickname_2)) in(lower(btrim(new.nickname_1)),lower(btrim(new.nickname_2))))
  ) then raise exception 'Uno de los nicknames ya está inscrito en esta sala'; end if;
  if tg_op='INSERT' or old.slot is null then
    new.slot:=null;
    if new.status='approved' then
      select n into new.slot from generate_series(1,room_capacity) n where not exists(
        select 1 from ff_room_registrations r where r.room_kind=new.room_kind and r.room_id=target_room and r.slot=n
      ) order by n limit 1;
      if new.slot is null then raise exception 'No quedan slots disponibles en esta sala'; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_ff_room_registration() from public,anon,authenticated;
create trigger guard_ff_room_registration before insert or update on public.ff_room_registrations
  for each row execute function public.guard_ff_room_registration();

-- Comparte la exclusividad del comprobante con los módulos anteriores.
create function public.guard_ff_room_receipt() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.receipt_path is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('receipt:'||new.receipt_path));
  if exists(select 1 from ff_room_registrations where receipt_path=new.receipt_path
    and (tg_table_name<>'ff_room_registrations' or id is distinct from new.id)) then raise exception 'Comprobante ya utilizado'; end if;
  if tg_table_name='ff_room_registrations' then
    if exists(select 1 from registrations where receipt_path=new.receipt_path)
      or exists(select 1 from individual_registrations where receipt_path=new.receipt_path)
      or exists(select 1 from solo_registrations where receipt_path=new.receipt_path) then raise exception 'Comprobante ya utilizado'; end if;
    if archive_asset_used('receipts',new.receipt_path) then raise exception 'El comprobante pertenece a una edición archivada'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_ff_room_receipt() from public,anon,authenticated;
create trigger ff_room_receipt_guard before insert or update of receipt_path on public.registrations for each row execute function public.guard_ff_room_receipt();
create trigger ff_room_receipt_guard before insert or update of receipt_path on public.individual_registrations for each row execute function public.guard_ff_room_receipt();
create trigger ff_room_receipt_guard before insert or update of receipt_path on public.solo_registrations for each row execute function public.guard_ff_room_receipt();
create trigger ff_room_receipt_guard before insert or update of receipt_path on public.ff_room_registrations for each row execute function public.guard_ff_room_receipt();

create function public.submit_ff_room_registration(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare room_data jsonb; previous ff_room_registrations%rowtype; request uuid; target_room uuid;
  kind text:=payload->>'room_kind'; receipt text:=payload->>'receipt_path'; metadata jsonb;
  fingerprint text:=md5((payload-'request_id')::text); saved uuid;
begin
  perform pg_advisory_xact_lock_shared(724091);
  if payload->>'edition_id' is distinct from current_edition_id()::text then raise exception 'La edición cambió. Actualiza la página.'; end if;
  if coalesce(payload->>'website','')<>'' then raise exception 'Solicitud no válida'; end if;
  request:=(payload->>'request_id')::uuid;
  if request is null then raise exception 'Falta el identificador del intento'; end if;
  perform pg_advisory_xact_lock(hashtext('ff-room-request:'||request::text));
  select * into previous from ff_room_registrations where request_id=request;
  if found then
    if previous.request_fingerprint is distinct from fingerprint then raise exception 'Este intento ya fue enviado con otros datos'; end if;
    return jsonb_build_object('id',previous.id,'amount_due',previous.amount_due);
  end if;
  if not exists(select 1 from tournament_settings where id=1 and registration_open and registration_deadline>now()) then
    raise exception 'Las inscripciones generales están cerradas';
  end if;
  target_room:=(payload->>'room_id')::uuid;
  room_data:=ff_room_data(kind,target_room);
  if (room_data->>'edition_id')::uuid is distinct from current_edition_id() then raise exception 'La sala pertenece a otra edición'; end if;
  if room_data->>'status'<>'open' or (room_data->>'is_paused')::boolean or now()>=(room_data->>'closes_at')::timestamptz then raise exception 'Esta sala no admite inscripciones'; end if;
  if (select count(*) from ff_room_registrations where room_kind=kind and room_id=target_room and status in('pending','approved'))>=(room_data->>'capacity')::integer then
    raise exception 'La sala está completa';
  end if;
  if (select count(*) from ff_room_registrations where created_at>now()-interval '1 minute')>=15 then raise exception 'Demasiadas solicitudes. Intenta en un minuto.'; end if;
  if (select count(*) from ff_room_registrations where whatsapp=payload->>'whatsapp' and status='pending')>=3 then raise exception 'Este número tiene demasiadas solicitudes pendientes'; end if;
  if receipt is null or receipt !~ '^[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$' then raise exception 'Comprobante inválido'; end if;
  perform pg_advisory_xact_lock(hashtext('receipt:'||receipt));
  select s.metadata into metadata from storage.objects s where bucket_id='receipts' and name=receipt;
  if not found or coalesce(metadata->>'mimetype','')<>all(array['image/png','image/jpeg','image/webp','application/pdf'])
    or coalesce((metadata->>'size')::bigint,0) not between 1 and 5242880 then raise exception 'Comprobante inválido o mayor a 5 MB'; end if;
  insert into ff_room_registrations(room_kind,duo_room_id,solo_top_room_id,request_id,request_fingerprint,
    full_name,whatsapp,prize_yape_phone,nickname_1,nickname_2,receipt_path,amount_due)
  values(kind,case when kind<>'solo_top' then target_room end,case when kind='solo_top' then target_room end,request,fingerprint,
    btrim(payload->>'full_name'),payload->>'whatsapp',payload->>'prize_yape_phone',btrim(payload->>'nickname_1'),
    nullif(btrim(payload->>'nickname_2'),''),receipt,(room_data->>'entry_price')::numeric) returning id into saved;
  return jsonb_build_object('id',saved,'amount_due',(room_data->>'entry_price')::numeric);
end $$;
revoke all on function public.submit_ff_room_registration(jsonb) from public,anon,authenticated;
grant execute on function public.submit_ff_room_registration(jsonb) to anon,authenticated;

create function public.manage_ff_room(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare room_data jsonb; target_table text; kind text:=p_data->>'room_kind'; target_room uuid:=(p_data->>'room_id')::uuid;
  new_status text; paused boolean; announced boolean; room_name text; scheduled timestamptz; closes timestamptz;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  if p_action is distinct from 'close' and not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_data->>'edition_id' is distinct from current_edition_id()::text then raise exception 'La edición cambió. Actualiza la página.'; end if;
  room_data:=ff_room_data(kind,target_room);
  if (room_data->>'edition_id')::uuid is distinct from current_edition_id() then raise exception 'La sala pertenece a otra edición'; end if;
  target_table:=case when kind='solo_top' then 'solo_top_rooms' else 'duo_rooms' end;
  new_status:=room_data->>'status'; paused:=(room_data->>'is_paused')::boolean; announced:=(room_data->>'is_announced')::boolean;
  if p_action in('open','pause') then
    if p_action='open' and new_status<>'draft' then raise exception 'Solo puedes abrir un borrador'; end if;
    if p_action='pause' and new_status<>'open' then raise exception 'Solo puedes pausar una sala abierta'; end if;
    if p_action='pause' then
      if jsonb_typeof(p_data->'is_paused') is distinct from 'boolean' then raise exception 'Indica si deseas pausar la sala'; end if;
      paused:=(p_data->>'is_paused')::boolean;
    else paused:=false; end if;
    if not paused and not exists(select 1 from tournament_settings where id=1 and registration_open
      and registration_deadline>=(room_data->>'closes_at')::timestamptz and (room_data->>'closes_at')::timestamptz>now()) then
      raise exception 'Revisa el cierre y habilita las inscripciones generales';
    end if;
    new_status:='open';
  elsif p_action='close' then
    if new_status<>'open' then raise exception 'La sala no está abierta'; end if;
    new_status:='closed';
  elsif p_action='announce' then
    if new_status<>'draft' then raise exception 'Solo puedes anunciar un borrador'; end if;
    if jsonb_typeof(p_data->'is_announced') is distinct from 'boolean' then raise exception 'Indica si deseas anunciar la sala'; end if;
    announced:=(p_data->>'is_announced')::boolean;
  elsif p_action='details' then
    if new_status not in('open','closed') then raise exception 'Solo puedes editar estos datos antes de jugar'; end if;
    room_name:=btrim(p_data->>'name'); scheduled:=(p_data->>'scheduled_at')::timestamptz; closes:=(p_data->>'closes_at')::timestamptz;
    if room_name is null or room_name !~ '^[^<>[:cntrl:]]{3,100}$' or scheduled is null or closes is null or not isfinite(scheduled) or not isfinite(closes) then raise exception 'Revisa el nombre y las fechas'; end if;
    if scheduled is distinct from (room_data->>'scheduled_at')::timestamptz or closes is distinct from (room_data->>'closes_at')::timestamptz then
      if closes<=now() or closes>scheduled or not exists(select 1 from tournament_settings where id=1 and registration_deadline>=closes) then raise exception 'Revisa el cierre futuro, la partida y el plazo general'; end if;
    end if;
    execute format('update public.%I set name=$1,scheduled_at=$2,closes_at=$3 where id=$4',target_table) using room_name,scheduled,closes,target_room;
    return jsonb_build_object('id',target_room,'room_kind',kind);
  elsif p_action in('delete','cancel') then
    if new_status not in('draft','open','closed','cancelled') then raise exception 'La sala ya está en juego o finalizada'; end if;
    if exists(select 1 from ff_room_registrations where room_kind=kind and room_id=target_room) then raise exception 'Esta sala tiene inscripciones. Conserva su historial.'; end if;
    if p_data->>'confirmation' is distinct from room_data->>'name' then raise exception 'Escribe el nombre exacto de la sala'; end if;
    if p_action='delete' then
      if new_status='open' and not paused then raise exception 'Pausa las inscripciones antes de eliminar la sala'; end if;
      execute format('delete from public.%I where id=$1',target_table) using target_room;
      return jsonb_build_object('id',target_room,'deleted',true);
    end if;
    new_status:='cancelled';
  else raise exception 'Acción de sala no disponible en esta etapa'; end if;
  execute format('update public.%I set status=$1,is_paused=$2,is_announced=$3 where id=$4',target_table)
    using new_status,paused,announced,target_room;
  return jsonb_build_object('id',target_room,'room_kind',kind,'status',new_status,'is_paused',paused,'is_announced',announced);
end $$;
revoke all on function public.manage_ff_room(text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_ff_room(text,jsonb) to authenticated;

create function public.review_ff_room_registration(p_edition_id uuid,p_kind text,p_room_id uuid,p_registration_id uuid,p_status text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare room_data jsonb; person ff_room_registrations%rowtype;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  room_data:=ff_room_data(p_kind,p_room_id);
  if (room_data->>'edition_id')::uuid is distinct from p_edition_id or room_data->>'status' not in('open','closed') then raise exception 'Revisa las solicitudes antes de jugar'; end if;
  if p_status is null or p_status not in('approved','rejected') then raise exception 'Estado inválido'; end if;
  if char_length(coalesce(p_reason,''))>500 or (p_status='rejected' and char_length(btrim(coalesce(p_reason,'')))<3) then raise exception 'Indica un motivo de 3 a 500 caracteres'; end if;
  select * into person from ff_room_registrations where id=p_registration_id and room_id=p_room_id and room_kind=p_kind for update;
  if not found or person.status<>'pending' then raise exception 'La solicitud ya fue revisada o pertenece a otra sala'; end if;
  update ff_room_registrations set status=p_status,reason=btrim(coalesce(p_reason,'')),reviewed_at=now(),reviewed_by=auth.uid()
    where id=person.id returning * into person;
  return jsonb_build_object('id',person.id,'slot',person.slot,'status',person.status);
end $$;
revoke all on function public.review_ff_room_registration(uuid,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_ff_room_registration(uuid,text,uuid,uuid,text,text) to authenticated;

create function public.delete_ff_room_registration(p_edition_id uuid,p_kind text,p_room_id uuid,p_registration_id uuid,p_confirmation text)
returns void language plpgsql security definer set search_path=public as $$
declare room_data jsonb; person ff_room_registrations%rowtype;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  room_data:=ff_room_data(p_kind,p_room_id);
  if (room_data->>'edition_id')::uuid is distinct from p_edition_id or room_data->>'status' not in('open','closed') then raise exception 'Solo puedes quitar una inscripción antes de jugar'; end if;
  select * into person from ff_room_registrations where id=p_registration_id and room_kind=p_kind and room_id=p_room_id for update;
  if not found then raise exception 'Inscripción no encontrada'; end if;
  if person.status in('refund_pending','refunded') then raise exception 'Conserva el historial de devolución'; end if;
  if p_confirmation is distinct from concat_ws(' / ',person.nickname_1,person.nickname_2) then raise exception 'Escribe los nicknames exactos para confirmar'; end if;
  delete from ff_room_registrations where id=person.id;
end $$;
revoke all on function public.delete_ff_room_registration(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.delete_ff_room_registration(uuid,text,uuid,uuid,text) to authenticated;

-- Proyección pública explícita para conectar el formulario web en su siguiente etapa.
create view public.public_ff_rooms as
  select r.id,r.edition_id,'solo_top'::text as room_kind,'solo'::text as participation,'top'::text as mode,
    r.name,r.scheduled_at,r.closes_at,r.capacity,r.entry_price,0::numeric as kill_reward,0::numeric as booyah_reward,r.rewarded_places,
    case when r.status='open' and r.is_paused then 'draft' else r.status end as status,
    (r.is_announced or (r.status='open' and r.is_paused)) as is_announced,r.is_paused,
    (select count(*) from ff_room_registrations a where a.solo_top_room_id=r.id and a.status in('pending','approved')) as taken
  from solo_top_rooms r where r.edition_id=current_edition_id() and (r.status<>'draft' or r.is_announced)
  union all
  select r.id,r.edition_id,case when r.mode='top' then 'duo_top' else 'duo_kills' end,'duo',r.mode,
    r.name,r.scheduled_at,r.closes_at,r.capacity,r.entry_price,r.kill_reward,r.booyah_reward,r.rewarded_places,
    case when r.status='open' and r.is_paused then 'draft' else r.status end,
    (r.is_announced or (r.status='open' and r.is_paused)),r.is_paused,
    (select count(*) from ff_room_registrations a where a.duo_room_id=r.id and a.status in('pending','approved'))
  from duo_rooms r where r.edition_id=current_edition_id() and (r.status<>'draft' or r.is_announced);
create view public.public_ff_room_prizes as
  select p.room_id,'solo_top'::text as room_kind,p.place,p.amount from solo_top_room_prizes p
    join public_ff_rooms r on r.id=p.room_id and r.room_kind='solo_top'
  union all
  select p.room_id,'duo_top',p.place,p.amount from duo_room_prizes p
    join public_ff_rooms r on r.id=p.room_id and r.room_kind='duo_top';
revoke all on public.public_ff_rooms,public.public_ff_room_prizes from public,anon,authenticated;
grant select on public.public_ff_rooms,public.public_ff_room_prizes to anon,authenticated;

-- El archivo privado incluye las nuevas salas e inscripciones de la edición que se cierra.
-- Sus filas siguen ligadas a esa edición para conservar las referencias privadas.
do $$ declare definition text; patched text; anchor text;
begin
  definition:=pg_get_functiondef('public.edition_close_preview()'::regprocedure);
  patched:=replace(definition,'''Liquidaciones Solo pendientes'',',
    '''Salas nuevas Free Fire sin terminar'',(select count(*) from duo_rooms where edition_id=current_edition_id() and status in(''open'',''closed'',''playing''))+(select count(*) from solo_top_rooms where edition_id=current_edition_id() and status in(''open'',''closed'',''playing'')),''Inscripciones nuevas Free Fire sin revisar'',(select count(*) from ff_room_registrations where edition_id=current_edition_id() and status=''pending''),''Devoluciones nuevas Free Fire pendientes'',(select count(*) from ff_room_registrations where edition_id=current_edition_id() and status=''refund_pending''),''Liquidaciones Solo pendientes'',');
  if patched=definition then raise exception 'No se pudo integrar el diagnóstico de edición'; end if;
  execute patched;
  definition:=pg_get_functiondef('public.close_tournament_edition(uuid,text,text,timestamptz)'::regprocedure);
  anchor:='foreach t in array array[''public_teams''';
  patched:=replace(definition,anchor,
    'foreach t in array array[''duo_rooms'',''duo_room_prizes'',''solo_top_rooms'',''solo_top_room_prizes'',''ff_room_registrations''] loop
      execute format(''insert into tournament_archive_records(edition_id,source,data) select $1,%L,to_jsonb(x) from public.%I x where edition_id=$1'',t,t) using e.id;
    end loop;
    select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) into rows_json from public_ff_rooms x;
    public_data:=public_data||jsonb_build_object(''public_ff_rooms'',rows_json);
    select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) into rows_json from public_ff_room_prizes x;
    public_data:=public_data||jsonb_build_object(''public_ff_room_prizes'',rows_json);
    '||anchor);
  if patched=definition then raise exception 'No se pudo integrar el archivo privado de salas'; end if;
  execute patched;
end $$;
insert into public.schema_migrations(version,description) values('031','Gestión e inscripciones de Solo Top y Dúo con slots por aprobación');
notify pgrst,'reload schema';
commit;
