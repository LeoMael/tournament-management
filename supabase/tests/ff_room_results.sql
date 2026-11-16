begin;
create function pg_temp.ff_expect_failure(statement text,fragment text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(fragment in sqlerrm)>0 then return; end if;
    raise;
  end;
  raise exception 'TEST: se aceptó operación inválida: %',statement;
end $$;
do $$
declare edition uuid:=current_edition_id(); kind text; rid uuid; cfg jsonb; draft jsonb; ids uuid[]; person uuid; receipt text; i integer;
  results jsonb; payment ff_room_payments%rowtype; version timestamptz; old_results jsonb; archived uuid;
begin
  update tournament_settings set registration_open=true,registration_deadline=now()+interval '10 days';
  foreach kind in array array['solo_top','duo_top','duo_kills'] loop
    draft:=jsonb_build_object('edition_id',edition,'name','Resultados '||kind,'capacity',3,'entry_price',4,'scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','top_prizes',jsonb_build_array(100,50));
    if kind='solo_top' then rid:=(manage_solo_top_room_draft('create',draft)->>'id')::uuid;
    else
      draft:=draft||jsonb_build_object('mode',case when kind='duo_top' then 'top' else 'kills' end);
      if kind='duo_kills' then draft:=draft||jsonb_build_object('top_prizes',jsonb_build_array(),'kill_reward',0.5,'booyah_reward',5); end if;
      rid:=(manage_duo_room_draft('create',draft)->>'id')::uuid;
    end if;
    cfg:=jsonb_build_object('edition_id',edition,'room_kind',kind,'room_id',rid);
    perform manage_ff_room('open',cfg);
    ids:='{}';
    for i in 1..3 loop
      receipt:=gen_random_uuid()::text||'.png';
      insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
      person:=(submit_ff_room_registration(cfg||jsonb_build_object('request_id',gen_random_uuid(),'full_name','Persona inscrita','whatsapp','98765432'||i,'prize_yape_phone','91234567'||i,
        'nickname_1','Jugador '||i,'nickname_2',case when kind='solo_top' then null else 'Compañero '||i end,'receipt_path',receipt))->>'id')::uuid;
      ids:=array_append(ids,person);
      if i<3 then perform review_ff_room_registration(edition,kind,rid,person,'approved',''); end if;
    end loop;
    perform pg_temp.ff_expect_failure(format('select manage_ff_room(''start'',%L::jsonb)',cfg),'Cierra las inscripciones');
    perform manage_ff_room('close',cfg);
    perform pg_temp.ff_expect_failure(format('select manage_ff_room(''start'',%L::jsonb)',cfg),'Revisa todas');
    perform review_ff_room_registration(edition,kind,rid,ids[3],'approved','');
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
    perform manage_ff_room('start',cfg);
    results:='[]';
    for i in 1..3 loop
      results:=results||jsonb_build_array(jsonb_build_object('registration_id',ids[i],'placement',i,'kills_1',case when i=1 then 2 else 0 end,'kills_2',case when kind<>'solo_top' and i=1 then 3 else 0 end,'booyah',i=1));
    end loop;
    perform pg_temp.ff_expect_failure(format('select save_ff_room_results(%L,%L,%L,%L)',edition,kind,rid,results-2),'Incluye todos');
    perform save_ff_room_results(edition,kind,rid,results,null,true);
    select max(updated_at),jsonb_agg(to_jsonb(s) order by registration_id) into version,old_results from ff_room_results s where room_id=rid;
    perform pg_temp.ff_expect_failure(format('select save_ff_room_results(%L,%L,%L,%L,null,true)',edition,kind,rid,results),'Otro organizador');
    perform pg_temp.ff_expect_failure(format('select save_ff_room_results(%L,%L,%L,%L)',edition,kind,rid,jsonb_set(results,'{1,placement}','1')),'posiciones');
    perform pg_temp.ff_expect_failure(format('select save_ff_room_results(%L,%L,%L,%L)',edition,kind,rid,jsonb_set(results,'{1,kills_1}','-1')),'kills');
    if old_results is distinct from (select jsonb_agg(to_jsonb(s) order by registration_id) from ff_room_results s where room_id=rid) then raise exception 'TEST: error dejó cambios parciales'; end if;
    if exists(select 1 from public_ff_room_results where room_id=rid and (kills_1 is not null or earnings is not null)) then raise exception 'TEST: publica resultados provisionales'; end if;
    perform pg_temp.ff_expect_failure(format('select manage_ff_room(''finish'',%L::jsonb)',cfg),'Sin permisos');
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
    -- Intercambiar puestos debe ser atómico, sin chocar con el índice único.
    perform save_ff_room_results(edition,kind,rid,results,version,false);
    perform pg_temp.ff_expect_failure(format('select save_ff_room_results(%L,%L,%L,%L,%L,false)',edition,kind,rid,results,version),'Otro organizador');
    perform manage_ff_room('finish',cfg);
    if (select count(*) from ff_room_payments where room_id=rid)<>3 then raise exception 'TEST: no liquida todos'; end if;
    if (select amount from ff_room_payments where registration_id=ids[1])<>(case when kind='duo_kills' then 7.5 else 100 end) then raise exception 'TEST: cálculo incorrecto'; end if;
    if (select amount from ff_room_payments where registration_id=ids[2])<>(case when kind='duo_kills' then 0 else 50 end) then raise exception 'TEST: Top no aplica premio fijo'; end if;
    if (select amount from ff_room_payments where registration_id=ids[3])<>0 then raise exception 'TEST: paga fuera de premios'; end if;
    perform pg_temp.ff_expect_failure(format('select manage_ff_room(''finish'',%L::jsonb)',cfg),'no está en juego');
    perform pg_temp.ff_expect_failure(format('select save_ff_room_results(%L,%L,%L,%L)',edition,kind,rid,results),'Solo puedes guardar');
    if (edition_close_preview()->'blockers'->>'Liquidaciones nuevas Free Fire pendientes')::int=0 then raise exception 'TEST: cierre ignora pagos'; end if;
    for payment in select * from ff_room_payments where room_id=rid and amount>0 loop
      perform pg_temp.ff_expect_failure(format('select pay_ff_room_payment(%L,%L,%L,''987654321'',''ref'')',edition,payment.id,payment.amount),'Yape cambió');
      perform pg_temp.ff_expect_failure(format('select pay_ff_room_payment(%L,%L,999,''912345671'',''ref'')',edition,payment.id),'importe o el Yape');
      perform pay_ff_room_payment(edition,payment.id,payment.amount,(select prize_yape_phone from ff_room_registrations where id=payment.registration_id),'Prueba de transferencia');
      -- Reintento no cambia fecha, referencia ni destino de una operación ya registrada.
      if (pay_ff_room_payment(edition,payment.id,0,'000000000','otra')->>'reference')<>'Prueba de transferencia' then raise exception 'TEST: modifica pago duplicado'; end if;
    end loop;
    perform update_ff_room_phones(edition,ids[1],'999999999','988888888');
    if (select paid_phone from ff_room_payments where registration_id=ids[1])<>'912345671' then raise exception 'TEST: altera destino histórico'; end if;
    if not exists(select 1 from public_ff_room_results where room_id=rid and placement=1 and booyah and earnings>0) then raise exception 'TEST: no publica resultado final'; end if;
    perform pg_temp.ff_expect_failure(format('select delete_ff_room_registration(%L,%L,%L,%L,''Jugador 1'')',edition,kind,rid,ids[1]),'antes de jugar');
  end loop;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='public_ff_room_results' and column_name in('whatsapp','prize_yape_phone','full_name','receipt_path','paid_phone')) then raise exception 'TEST: expone datos privados'; end if;

  -- Cancelación: únicamente los aprobados generan devolución; los pendientes se rechazan.
  draft:=jsonb_build_object('edition_id',edition,'name','Sala devolución','capacity',2,'entry_price',4,'scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','top_prizes',jsonb_build_array(100));
  rid:=(manage_solo_top_room_draft('create',draft)->>'id')::uuid;
  cfg:=jsonb_build_object('edition_id',edition,'room_kind','solo_top','room_id',rid);
  perform manage_ff_room('open',cfg);
  for i in 1..2 loop
    receipt:=gen_random_uuid()::text||'.png';
    insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
    person:=(submit_ff_room_registration(cfg||jsonb_build_object('request_id',gen_random_uuid(),'full_name','Persona devolución','whatsapp','97777777'||i,'prize_yape_phone','96666666'||i,'nickname_1','Reembolso '||i,'receipt_path',receipt))->>'id')::uuid;
    if i=1 then perform review_ff_room_registration(edition,'solo_top',rid,person,'approved',''); end if;
  end loop;
  perform manage_ff_room('cancel',cfg||jsonb_build_object('confirmation','Sala devolución'));
  if (select count(*) from ff_room_payments where room_id=rid and concept='refund' and amount=4)<>1 then raise exception 'TEST: devolución incorrecta'; end if;
  select * into payment from ff_room_payments where room_id=rid;
  perform pay_ff_room_payment(edition,payment.id,4,'966666661','Devolución comprobada');
  if not exists(select 1 from ff_room_registrations where id=payment.registration_id and status='refunded') then raise exception 'TEST: no marca devolución'; end if;
  if (edition_close_preview()->'blockers'->>'Liquidaciones nuevas Free Fire pendientes')::int<>0 then raise exception 'TEST: pendientes ya pagados'; end if;
  archived:=(close_tournament_edition(edition,(select name from tournament_editions where id=edition),'Prueba posterior',now()+interval '30 days')->>'id')::uuid;
  if not exists(select 1 from tournament_archive_records where edition_id=edition and source='ff_room_payments' and data->>'reference'='Prueba de transferencia') then raise exception 'TEST: archivo pierde pagos'; end if;
  if not exists(select 1 from tournament_archive_records where edition_id=edition and source='ff_room_results') then raise exception 'TEST: archivo pierde resultados'; end if;
  perform pg_temp.ff_expect_failure(format('select update_ff_room_phones(%L,%L,''999999999'',''988888888'')',edition,ids[1]),'edición cambió');
end $$;
set local role anon;
do $$ begin
  perform * from public_ff_room_results;
  begin perform * from ff_room_payments; raise exception 'TEST: anon lee pagos'; exception when insufficient_privilege then null; end;
  begin perform save_ff_room_results(null,'solo_top',null,'[]'); raise exception 'TEST: anon guarda'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin
  if exists(select 1 from ff_room_results) or exists(select 1 from ff_room_payments) then raise exception 'TEST: editor lee privados'; end if;
  begin perform save_ff_room_results(null,'solo_top',null,'[]'); raise exception 'TEST: editor guarda'; exception when insufficient_privilege then null; end;
  begin perform pay_ff_room_payment(null,null,0,'123456789','ref'); raise exception 'TEST: editor paga'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
