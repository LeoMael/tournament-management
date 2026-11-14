-- Solo: contacto y destino de premios independientes. No modifica vistas públicas.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='020') then raise exception 'Se requiere 020'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

alter table public.solo_registrations add column if not exists prize_yape_phone text;
-- Respeta cualquier destino que ya estuviera guardado.
update public.solo_registrations set prize_yape_phone=whatsapp
where prize_yape_phone is null or btrim(prize_yape_phone)='';
alter table public.solo_registrations alter column prize_yape_phone set not null;
alter table public.solo_registrations add constraint solo_prize_yape_phone_valid
  check(prize_yape_phone ~ '^[0-9]{8,15}$');
comment on column public.solo_registrations.prize_yape_phone is 'Yape para premios; independiente del WhatsApp de contacto y del titular del comprobante.';

-- Compatibilidad de inserciones internas antiguas. Nunca sincroniza actualizaciones.
create function public.fill_solo_prize_yape_phone() returns trigger language plpgsql set search_path=public as $$
begin
  if new.prize_yape_phone is null then new.prize_yape_phone:=new.whatsapp; end if;
  return new;
end $$;
revoke all on function public.fill_solo_prize_yape_phone() from public,anon,authenticated;
create trigger fill_solo_prize_yape_phone before insert on public.solo_registrations
for each row execute function public.fill_solo_prize_yape_phone();

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
  if payload ? 'prize_yape_phone' and (jsonb_typeof(payload->'prize_yape_phone') is distinct from 'string'
    or coalesce(payload->>'prize_yape_phone','') !~ '^[0-9]{8,15}$') then
    raise exception 'Revisa el número de Yape para premios (8 a 15 dígitos)';
  end if;
  if path is null or path !~ '^[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$' then raise exception 'Comprobante inválido'; end if;
  perform pg_advisory_xact_lock(hashtext('receipt:'||path));
  select metadata into meta from storage.objects where bucket_id='receipts' and name=path;
  if not found or coalesce(meta->>'mimetype','') <> all(array['image/png','image/jpeg','image/webp','application/pdf'])
    or coalesce((meta->>'size')::bigint,0) not between 1 and 5242880 then raise exception 'Comprobante inválido o mayor a 5 MB'; end if;
  if exists(select 1 from registrations where receipt_path=path) or exists(select 1 from individual_registrations where receipt_path=path)
    or exists(select 1 from solo_registrations where receipt_path=path) then raise exception 'Comprobante ya utilizado'; end if;
  if exists(select 1 from solo_registrations where room_id=r.id and lower(btrim(nickname))=lower(btrim(payload->>'nickname')) and status in ('pending','approved')) then raise exception 'Este jugador ya está inscrito en la sala'; end if;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,prize_yape_phone,nickname,institution,professional_school,receipt_path,amount_due)
  values(r.id,(payload->>'request_id')::uuid,fp,btrim(payload->>'full_name'),payload->>'whatsapp',case when payload ? 'prize_yape_phone' then payload->>'prize_yape_phone' else payload->>'whatsapp' end,btrim(payload->>'nickname'),coalesce(btrim(payload->>'institution'),''),coalesce(btrim(payload->>'professional_school'),''),path,r.entry_price) returning id into v_id;
  return jsonb_build_object('id',v_id,'amount_due',r.entry_price);
end $$;

-- Edición privada, exclusiva para administradores, sin alterar pagos ni resultados.
create function public.update_solo_registration_phones(p_edition_id uuid,p_room_id uuid,p_registration_id uuid,p_whatsapp text,p_prize_yape_phone text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype; a solo_registrations%rowtype;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select * into r from solo_rooms where id=p_room_id for update;
  if not found or r.edition_id is distinct from p_edition_id then raise exception 'Sala no encontrada en esta edición'; end if;
  select * into a from solo_registrations where id=p_registration_id and room_id=r.id and edition_id=p_edition_id for update;
  if not found then raise exception 'Participante no encontrado en esta sala'; end if;
  if coalesce(p_whatsapp,'') !~ '^[0-9]{8,15}$' then raise exception 'WhatsApp de contacto inválido (8 a 15 dígitos)'; end if;
  if coalesce(p_prize_yape_phone,'') !~ '^[0-9]{8,15}$' then raise exception 'Yape para premios inválido (8 a 15 dígitos)'; end if;
  update solo_registrations set whatsapp=p_whatsapp,prize_yape_phone=p_prize_yape_phone where id=a.id;
  return jsonb_build_object('id',a.id,'whatsapp',p_whatsapp,'prize_yape_phone',p_prize_yape_phone);
end $$;
revoke all on function public.update_solo_registration_phones(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.update_solo_registration_phones(uuid,uuid,uuid,text,text) to authenticated;
insert into public.schema_migrations(version,description) values('021','Separar WhatsApp de contacto y Yape para premios en Solo');
notify pgrst, 'reload schema';
commit;
