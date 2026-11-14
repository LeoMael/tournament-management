begin;
do $$
declare e uuid:=current_edition_id(); room uuid; a uuid; b uuid; payload jsonb; path text;
  original jsonb; bad jsonb; i integer; results_before jsonb; payments_before jsonb;
begin
  update tournament_settings set registration_open=true,solo_enabled=true,registration_deadline=now()+interval '20 days';
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Dos teléfonos Solo',now()+interval '2 days',now()+interval '1 day',8,2,1,10,'open') returning id into room;
  for i in 1..2 loop
    path:=gen_random_uuid()::text||'.png';
    insert into storage.objects(bucket_id,name,metadata) values('receipts',path,'{"mimetype":"image/png","size":100}');
    payload:=jsonb_build_object('edition_id',e,'room_id',room,'request_id',gen_random_uuid(),
      'full_name','Titular Comprobante','whatsapp','987654321','nickname','Jugador '||i,'receipt_path',path);
    if i=2 then payload:=payload||jsonb_build_object('prize_yape_phone','912345678'); end if;
    a:=(submit_solo_registration(payload)->>'id')::uuid;
    if (select prize_yape_phone from solo_registrations where id=a) is distinct from
      (case when i=1 then '987654321' else '912345678' end) then raise exception 'TEST: destino incorrecto'; end if;
    if (submit_solo_registration(payload)->>'id')::uuid<>a then raise exception 'TEST: reintento no idempotente'; end if;
    if i=1 then b:=a; end if;
  end loop;
  foreach bad in array array['""'::jsonb,'null'::jsonb,'"abc"'::jsonb,'"123"'::jsonb,'912345678'::jsonb] loop
    begin
      perform submit_solo_registration(payload||jsonb_build_object('request_id',gen_random_uuid(),'prize_yape_phone',bad));
      raise exception 'TEST: Yape inválido aceptado';
    exception when raise_exception then if sqlerrm not like 'Revisa el número de Yape%' then raise; end if; end;
  end loop;
  perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',a,'status','approved'));
  perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',b,'status','approved'));
  perform manage_solo('close',jsonb_build_object('edition_id',e,'room_id',room));
  perform manage_solo('start',jsonb_build_object('edition_id',e,'room_id',room));
  perform save_solo_results(e,room,jsonb_build_array(
    jsonb_build_object('registration_id',a,'kills',2,'booyah',true),
    jsonb_build_object('registration_id',b,'kills',1,'booyah',false)));
  perform manage_solo('finish',jsonb_build_object('edition_id',e,'room_id',room));
  perform manage_solo('pay',jsonb_build_object('edition_id',e,'room_id',room,'payment_id',(select id from solo_payments where registration_id=b),'reference','Transferencia anterior'));
  select jsonb_agg(to_jsonb(x) order by registration_id) into results_before from solo_results x where room_id=room;
  select jsonb_agg(to_jsonb(x) order by id) into payments_before from solo_payments x where registration_id in(a,b);
  select to_jsonb(p)-'whatsapp'-'prize_yape_phone' into original from solo_registrations p where id=a;
  perform update_solo_registration_phones(e,room,a,'999999999','912345678');
  if not exists(select 1 from solo_registrations where id=a and whatsapp='999999999' and prize_yape_phone='912345678') then raise exception 'TEST: contacto sobrescribe Yape'; end if;
  perform update_solo_registration_phones(e,room,a,'999999999','911111111');
  if not exists(select 1 from solo_registrations where id=a and whatsapp='999999999' and prize_yape_phone='911111111')
    or original is distinct from (select to_jsonb(p)-'whatsapp'-'prize_yape_phone' from solo_registrations p where id=a) then raise exception 'TEST: edición alteró inscripción o slot'; end if;
  if results_before is distinct from (select jsonb_agg(to_jsonb(x) order by registration_id) from solo_results x where room_id=room)
    or payments_before is distinct from (select jsonb_agg(to_jsonb(x) order by id) from solo_payments x where registration_id in(a,b)) then raise exception 'TEST: edición alteró resultados o pagos'; end if;
  if (submit_solo_registration(payload)->>'id')::uuid<>a or (select prize_yape_phone from solo_registrations where id=a)<>'911111111' then raise exception 'TEST: reintento sobrescribió corrección'; end if;
  if not exists(select 1 from audit_log where table_name='solo_registrations' and row_key=a::text and op='UPDATE' and new_data->>'prize_yape_phone'='911111111') then raise exception 'TEST: falta auditoría'; end if;
  begin perform update_solo_registration_phones(gen_random_uuid(),room,a,'999999999','911111111'); raise exception 'TEST: edición ajena';
  exception when raise_exception then if sqlerrm <> 'La edición cambió. Actualiza la página.' then raise; end if; end;
  begin perform update_solo_registration_phones(e,room,gen_random_uuid(),'999999999','911111111'); raise exception 'TEST: jugador ajeno';
  exception when raise_exception then if sqlerrm <> 'Participante no encontrado en esta sala' then raise; end if; end;
  begin perform update_solo_registration_phones(e,room,a,'999999999',''); raise exception 'TEST: borra Yape';
  exception when raise_exception then if sqlerrm not like 'Yape para premios inválido%' then raise; end if; end;
  for i in 2..3 loop
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000'||i,true);
    begin perform update_solo_registration_phones(e,room,b,'999999999','911111111'); raise exception 'TEST: personal sin permiso edita';
    exception when insufficient_privilege then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name in ('public_solo_rooms','public_solo_results') and column_name in ('whatsapp','prize_yape_phone','full_name','receipt_path')) then raise exception 'TEST: datos privados públicos'; end if;
end $$;
set local role authenticated;
do $$ begin
  begin update solo_registrations set prize_yape_phone='911111111'; raise exception 'TEST: escritura directa permitida'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform update_solo_registration_phones(null,null,null,null,null); raise exception 'TEST: anon edita'; exception when insufficient_privilege then null; end;
  begin perform 1 from solo_registrations; raise exception 'TEST: anon lee datos privados'; exception when insufficient_privilege then null; end;
end $$;
rollback;
