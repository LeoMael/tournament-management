-- Solo usa nickname. Conserva los IDs antiguos únicamente para consulta histórica.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='009') then raise exception 'Se requiere 009'; end if;
end $$;
alter table public.solo_registrations alter column game_player_id drop not null;
-- La nueva inscripción no solicita ID. La RPC verifica también apodos anteriores con ID.
create unique index solo_nickname_room on public.solo_registrations(room_id,lower(btrim(nickname)))
  where status in ('pending','approved') and game_player_id is null;

create or replace function public.submit_solo_registration(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
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
     or coalesce(payload->>'institution','') ~ '[<>[:cntrl:]]'
     or coalesce(payload->>'professional_school','') ~ '[<>[:cntrl:]]' then raise exception 'Revisa los datos del jugador'; end if;
  if path is null or path !~ '^[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$' then raise exception 'Comprobante inválido'; end if;
  perform pg_advisory_xact_lock(hashtext('receipt:'||path));
  select metadata into meta from storage.objects where bucket_id='receipts' and name=path;
  if not found or coalesce(meta->>'mimetype','') <> all(array['image/png','image/jpeg','image/webp','application/pdf'])
    or coalesce((meta->>'size')::bigint,0) not between 1 and 5242880 then raise exception 'Comprobante inválido o mayor a 5 MB'; end if;
  if exists(select 1 from registrations where receipt_path=path) or exists(select 1 from individual_registrations where receipt_path=path)
    or exists(select 1 from solo_registrations where receipt_path=path) then raise exception 'Comprobante ya utilizado'; end if;
  if exists(select 1 from solo_registrations where room_id=r.id and lower(btrim(nickname))=lower(btrim(payload->>'nickname')) and status in ('pending','approved')) then raise exception 'Este jugador ya está inscrito en la sala'; end if;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,institution,professional_school,receipt_path,amount_due)
  values(r.id,(payload->>'request_id')::uuid,fp,btrim(payload->>'full_name'),payload->>'whatsapp',btrim(payload->>'nickname'),coalesce(btrim(payload->>'institution'),''),coalesce(btrim(payload->>'professional_school'),''),path,r.entry_price) returning id into v_id;
  return jsonb_build_object('id',v_id,'amount_due',r.entry_price);
end $$;

insert into public.schema_migrations(version,description) values ('010','Solo por nickname; universidad y carrera opcionales');
commit;
