-- Reparación de ambigüedad 42702. Ejecutar después de 003, no repetir 003.
begin;
do $$ begin
  if not exists (select 1 from public.schema_migrations sm where sm.version='003') then
    raise exception 'Se requiere la migración 003';
  end if;
end $$;

create or replace function public.submit_individual_registration(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_k text:=payload->>'game_key'; v_rid uuid; v_fingerprint text; v_prior individual_registrations%rowtype;
  v_cfg individual_settings%rowtype; v_game games%rowtype; v_settings tournament_settings%rowtype;
  v_nm text:=btrim(coalesce(payload->>'full_name','')); v_wa text:=regexp_replace(coalesce(payload->>'whatsapp',''),'\D','','g');
  v_nick text:=btrim(coalesce(payload->>'nickname','')); v_pid text:=regexp_replace(coalesce(payload->>'game_player_id',''),'\D','','g');
  v_inst text:=nullif(btrim(coalesce(payload->>'institution','')),''); v_school text:=nullif(btrim(coalesce(payload->>'professional_school','')),''); v_other text:=nullif(btrim(coalesce(payload->>'other_institution','')),'');
  v_receipt text:=payload->>'receipt_path'; v_roles text[]; v_meta jsonb; v_id uuid; v_taken int; v_drafts int;
begin
  begin v_rid:=(payload->>'request_id')::uuid; exception when others then raise exception 'Solicitud inválida' using errcode='P0001'; end;
  if v_rid is null then raise exception 'Solicitud inválida' using errcode='P0001'; end if;
  v_fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtext('individual-request:'||v_rid::text));
  select ir.* into v_prior from individual_registrations ir where ir.request_id=v_rid;
  if found then
    if v_prior.request_fingerprint<>v_fingerprint then raise exception 'Solicitud inválida' using errcode='P0001'; end if;
    return jsonb_build_object('id',v_prior.id,'status',v_prior.status,'amount_due',v_prior.amount_due);
  end if;
  if v_k not in ('mlbb','ff') or v_k is null then raise exception 'Juego inválido' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('reg:'||v_k));
  select ist.* into v_cfg from individual_settings ist where ist.game_key=v_k;
  select g.* into v_game from games g where g.key=v_k;
  select ts.* into v_settings from tournament_settings ts where ts.id=1;
  if (v_k='mlbb' and v_game.starters is distinct from 5) or (v_k='ff' and v_game.starters is distinct from 4) then raise exception 'Inscripciones individuales no disponibles' using errcode='P0001'; end if;
  if not coalesce(v_cfg.is_open,false) or not coalesce(v_game.is_open,false) or not coalesce(v_settings.registration_open,false) or now()>v_settings.registration_deadline then raise exception 'Inscripciones cerradas' using errcode='P0001'; end if;
  if coalesce(payload->>'website','')<>'' or payload->>'terms_version' is distinct from 'individual-v1' or payload->'accepted_terms' is distinct from 'true'::jsonb then raise exception 'Solicitud inválida' using errcode='P0001'; end if;
  if (select count(*) from individual_registrations ir where ir.created_at>now()-interval '1 minute')>=15 then raise exception 'Demasiadas solicitudes, intenta más tarde' using errcode='P0001'; end if;
  if length(v_nm) not between 3 and 80 or v_nm ~ '[\x01-\x1f\x7f<>]' or v_wa !~ '^[0-9]{8,15}$' or length(v_nick) not between 1 and 50 or v_pid !~ '^[0-9]{5,15}$' then raise exception 'Datos inválidos' using errcode='P0001'; end if;
  if v_inst is not null and v_inst not in ('UNAP','Otra') then raise exception 'Institución inválida' using errcode='P0001'; end if;
  if length(coalesce(v_school,''))>120 or length(coalesce(v_other,''))>120 or coalesce(v_school,'') ~ '[\x01-\x1f\x7f<>]' or coalesce(v_other,'') ~ '[\x01-\x1f\x7f<>]' then raise exception 'Datos inválidos' using errcode='P0001'; end if;
  if jsonb_typeof(payload->'preferred_roles') is distinct from 'array' then raise exception 'Roles inválidos' using errcode='P0001'; end if;
  select coalesce(array_agg(distinct t.value),array[]::text[]) into v_roles from jsonb_array_elements_text(payload->'preferred_roles') t(value);
  if (v_k='ff' and cardinality(v_roles)>0) or not v_roles <@ array['exp','jungle','mid','gold','roam']::text[] then raise exception 'Roles inválidos' using errcode='P0001'; end if;
  if v_receipt is null or v_receipt !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|pdf)$' then raise exception 'Comprobante inválido' using errcode='P0001'; end if;
  select so.metadata into v_meta from storage.objects so where so.bucket_id='receipts' and so.name=v_receipt;
  if not found or coalesce(v_meta->>'mimetype','')<>all(array['image/png','image/jpeg','image/webp','application/pdf']) or coalesce((v_meta->>'size')::bigint,0) not between 1 and 5242880 then raise exception 'Comprobante inválido' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('receipt:'||v_receipt));
  if exists(select 1 from registrations r where r.receipt_path=v_receipt) or exists(select 1 from individual_registrations ir where ir.receipt_path=v_receipt) then raise exception 'Solicitud inválida' using errcode='P0001'; end if;
  if exists(select 1 from individual_registrations ir where ir.game_key=v_k and ir.game_player_id=v_pid and ir.status in ('pending','approved','grouped','registered','refund_pending')) or exists(select 1 from players p join registrations r on r.id=p.registration_id where p.game_key=v_k and p.game_player_id=v_pid and r.status in ('pending','approved')) then raise exception 'No se pudo registrar esta solicitud' using errcode='P0001'; end if;
  select count(*) into v_taken from registrations r where r.game_key=v_k and r.status in ('pending','approved');
  select count(*) into v_drafts from individual_groups ig where ig.game_key=v_k and ig.status='draft';
  if (select count(*) from individual_registrations ir where ir.game_key=v_k and ir.status in ('pending','approved')) >= greatest(0,v_game.max_teams-v_taken-v_drafts)*v_game.starters then raise exception 'No hay cupos individuales disponibles' using errcode='P0001'; end if;
  insert into individual_registrations(request_id,request_fingerprint,game_key,full_name,whatsapp,nickname,game_player_id,institution,professional_school,other_institution,preferred_roles,receipt_path,amount_due,terms_version,terms_accepted_at)
  values(v_rid,v_fingerprint,v_k,v_nm,v_wa,v_nick,v_pid,v_inst,v_school,v_other,v_roles,v_receipt,v_cfg.price,'individual-v1',now()) returning individual_registrations.id into v_id;
  return jsonb_build_object('id',v_id,'status','pending','amount_due',v_cfg.price);
end $$;

revoke all on function public.submit_individual_registration(jsonb) from public, anon, authenticated;
grant execute on function public.submit_individual_registration(jsonb) to anon, authenticated;
insert into public.schema_migrations(version,description) values ('004','Corrección de ambigüedad en inscripción individual') on conflict (version) do nothing;
commit;
