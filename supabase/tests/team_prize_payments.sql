begin;
do $$
declare e uuid:=current_edition_id(); game text; ids uuid[]; t uuid; phase uuid; m uuid; ctx jsonb; batch uuid; p team_prize_payments%rowtype;
  registrations_before jsonb; matches_before jsonb; stage_before jsonb; previous jsonb; paid_time timestamptz; i integer; response jsonb;
begin
  foreach game in array array['ff','mlbb'] loop
    ids:='{}';
    for i in 1..4 loop
      insert into registrations(game_key,team_name,captain_name,captain_whatsapp,prize_yape_phone,institution,receipt_path,amount_due,status)
        values(game,'Premio '||game||i,'Nombre registrado '||i,'987654321','912345678','Otra',gen_random_uuid()::text||'.png',16,'approved') returning id into t;
      ids:=array_append(ids,t);
    end loop;
    insert into stages(game_key,name,type,position,config) values(game,'Final '||game,case when game='ff' then 'battle_royale' else 'single_elim' end,1,
      jsonb_build_object('participants',to_jsonb(ids),'podium',to_jsonb(ids[1:3]),'champion',ids[1])) returning id into phase;
    if game='ff' then
      insert into matches(stage_id,round,position,status) values(phase,1,0,'scheduled') returning id into m;
    else
      insert into matches(stage_id,round,position,status,team_a,team_b,winner_id) values(phase,1,0,'completed',ids[1],ids[3],ids[1]),(phase,1,1,'completed',ids[2],ids[4],ids[2]);
      insert into matches(stage_id,round,position,status,team_a,team_b,winner_id) values(phase,2,0,'scheduled',ids[1],ids[2],ids[1]) returning id into m;
    end if;
    update prizes set amount=case place when 1 then 100.10 when 2 then 50.20 else 0 end,reward_text=case place when 3 then 'Teclado' else 'Dinero y medallas' end where game_key=game;
    ctx:=team_prize_context(e,game);
    if ctx->>'blocker' is null then raise exception 'TEST: propone pago con partidas pendientes'; end if;
    begin perform confirm_team_prizes(e,game,phase,ids[1:3],'["Medallas","","Teclado"]',ctx->'prizes'); raise exception 'TEST: confirma partidas pendientes';
    exception when raise_exception then if sqlerrm not like 'Termina todas las partidas%' then raise; end if; end;
    update matches set status='completed' where id=m;
    ctx:=team_prize_context(e,game);
    if ctx->>'blocker' is not null then raise exception 'TEST: final válida bloqueada: %',ctx->>'blocker'; end if;
    if game='mlbb' and (ctx->'podium'<>to_jsonb(ids[1:2]) or jsonb_array_length(ctx->'third_candidates')<>2) then raise exception 'TEST: deriva mal final o semifinalistas'; end if;
    select jsonb_agg(to_jsonb(r) order by id) into registrations_before from registrations r;
    select jsonb_agg(to_jsonb(r) order by id) into matches_before from matches r;
    select jsonb_agg(to_jsonb(r) order by id) into stage_before from stages r;
    begin perform confirm_team_prizes(e,game,phase,array[ids[1],ids[1],ids[3]],'["","",""]',ctx->'prizes'); raise exception 'TEST: acepta duplicados';
    exception when raise_exception then if sqlerrm<>'Selecciona tres equipos distintos' then raise; end if; end;
    begin perform confirm_team_prizes(e,game,phase,ids[1:3],'["","",""]','[]'); raise exception 'TEST: acepta importe obsoleto';
    exception when raise_exception then if sqlerrm not like 'Los premios configurados cambiaron%' then raise; end if; end;
    begin perform confirm_team_prizes(gen_random_uuid(),game,phase,ids[1:3],'["","",""]',ctx->'prizes'); raise exception 'TEST: acepta otra edición';
    exception when raise_exception then if sqlerrm not like 'La edición cambió%' then raise; end if; end;
    if game='mlbb' then
      begin perform confirm_team_prizes(e,game,phase,array[ids[2],ids[1],ids[3]],'["","",""]',ctx->'prizes'); raise exception 'TEST: cambia campeón de final';
      exception when raise_exception then if sqlerrm not like 'Verifica campeón%' then raise; end if; end;
    else
      begin perform confirm_team_prizes(e,game,phase,array[ids[2],ids[1],ids[3]],'["","",""]',ctx->'prizes'); raise exception 'TEST: cambia podio FF';
      exception when raise_exception then if sqlerrm not like 'El podio oficial cambió%' then raise; end if; end;
    end if;
    batch:=confirm_team_prizes(e,game,phase,ids[1:3],'["Medallas","","Teclado"]',ctx->'prizes');
    perform cancel_team_prizes(e,batch,'REHACER PREMIOS');
    if exists(select 1 from team_prize_payments where settlement_id=batch) then raise exception 'TEST: lote sin pagos no se rehace'; end if;
    batch:=confirm_team_prizes(e,game,phase,ids[1:3],'["Medallas","","Teclado"]',ctx->'prizes');
    if (select count(*) from team_prize_payments where settlement_id=batch)<>3 then raise exception 'TEST: no crea tres puestos'; end if;
    begin perform confirm_team_prizes(e,game,phase,ids[1:3],'["","",""]',ctx->'prizes'); raise exception 'TEST: duplica liquidación';
    exception when raise_exception then if sqlerrm not like 'Los premios de este juego ya están confirmados%' then raise; end if; end;
    select * into p from team_prize_payments where settlement_id=batch and place=1;
    if p.amount<>100.10 or p.team_name<>'Premio '||game||1 or p.prize_yape_phone<>'912345678' then raise exception 'TEST: snapshot premio incorrecto'; end if;
    begin perform record_team_prize_payment(e,p.id,'pay','ref',999,p.prize_yape_phone); raise exception 'TEST: importe equivocado';
    exception when raise_exception then if sqlerrm not like 'El importe o destino cambió%' then raise; end if; end;
    begin perform record_team_prize_payment(e,p.id,'pay','ref',p.amount,'999999999'); raise exception 'TEST: destino equivocado';
    exception when raise_exception then if sqlerrm not like 'El importe o destino cambió%' then raise; end if; end;
    response:=record_team_prize_payment(e,p.id,'pay','REF-001',p.amount,p.prize_yape_phone);
    paid_time:=(response->>'paid_at')::timestamptz;
    response:=record_team_prize_payment(e,p.id,'pay','REF-OTRA',p.amount,p.prize_yape_phone);
    if response->>'reference'<>'REF-001' or (response->>'paid_at')::timestamptz<>paid_time then raise exception 'TEST: repago altera pago original'; end if;
    begin perform record_team_prize_payment(e,p.id,'refresh_yape','',p.amount,p.prize_yape_phone); raise exception 'TEST: cambia destino pagado';
    exception when raise_exception then if sqlerrm<>'El destino de un pago registrado no se puede cambiar' then raise; end if; end;
    begin perform cancel_team_prizes(e,batch,'REHACER PREMIOS'); raise exception 'TEST: borra pago registrado';
    exception when raise_exception then if sqlerrm not like 'No se puede rehacer una liquidación%' then raise; end if; end;
    update prizes set amount=999 where game_key=game and place=1;
    if (select amount from team_prize_payments where id=p.id)<>100.10 then raise exception 'TEST: configuración cambia premio congelado'; end if;
    perform record_team_prize_payment(e,p.id,'deliver','',p.amount,p.prize_yape_phone);
    if registrations_before is distinct from (select jsonb_agg(to_jsonb(r) order by id) from registrations r)
      or matches_before is distinct from (select jsonb_agg(to_jsonb(r) order by id) from matches r)
      or stage_before is distinct from (select jsonb_agg(to_jsonb(r) order by id) from stages r) then raise exception 'TEST: pagos modifican equipos o resultados'; end if;
    select * into p from team_prize_payments where settlement_id=batch and place=2;
    update registrations set prize_yape_phone='933333333',captain_whatsapp='944444444' where id=p.registration_id;
    if (select prize_yape_phone from team_prize_payments where id=p.id)<>'912345678' then raise exception 'TEST: cambia destino sin revisión'; end if;
    begin perform record_team_prize_payment(e,p.id,'refresh_yape','955555555',p.amount,p.prize_yape_phone); raise exception 'TEST: destino corregido obsoleto';
    exception when raise_exception then if sqlerrm not like 'El Yape corregido cambió%' then raise; end if; end;
    response:=record_team_prize_payment(e,p.id,'refresh_yape','933333333',p.amount,p.prize_yape_phone);
    if response->>'prize_yape_phone'<>'933333333' or (select captain_whatsapp from registrations where id=p.registration_id)<>'944444444' then raise exception 'TEST: corrección confunde contacto y Yape'; end if;
    perform record_team_prize_payment(e,p.id,'pay','REF-002',p.amount,'933333333');
    select * into p from team_prize_payments where settlement_id=batch and place=3;
    begin perform record_team_prize_payment(e,p.id,'pay','',p.amount,p.prize_yape_phone); raise exception 'TEST: registra pago de cero';
    exception when raise_exception then if sqlerrm<>'Este puesto no tiene premio monetario' then raise; end if; end;
    previous:=edition_close_preview();
    if (previous->'blockers'->>'Entregas de equipos pendientes')::int<>1 then raise exception 'TEST: cierre ignora entrega pendiente'; end if;
    perform record_team_prize_payment(e,p.id,'deliver','',p.amount,p.prize_yape_phone);
    perform set_config('test.team_prize_payment',p.id::text,true);
    perform set_config('test.team_prize_batch',batch::text,true);
    perform set_config('test.team_prize_stage',phase::text,true);
    perform set_config('test.team_prize_context',ctx::text,true);
  end loop;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name in('public_teams','public_team_players','public_stages','public_matches','public_match_results') and column_name like '%phone%') then raise exception 'TEST: teléfono público'; end if;
  if (edition_close_preview()->'blockers'->>'Premios de equipos pendientes')::int<>0 then raise exception 'TEST: pendientes mal calculados'; end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin
  if (select count(*) from team_prize_payments)<>6 then raise exception 'TEST: árbitro no ve pagos'; end if;
  perform team_prize_context(current_edition_id(),'ff');
  begin perform record_team_prize_payment(current_edition_id(),current_setting('test.team_prize_payment')::uuid,'pay','',0,'912345678'); raise exception 'TEST: árbitro paga'; exception when insufficient_privilege then null; end;
  begin perform cancel_team_prizes(current_edition_id(),current_setting('test.team_prize_batch')::uuid,'REHACER PREMIOS'); raise exception 'TEST: árbitro cancela'; exception when insufficient_privilege then null; end;
  begin perform confirm_team_prizes(current_edition_id(),'mlbb',current_setting('test.team_prize_stage')::uuid,'{}','[]','[]'); raise exception 'TEST: árbitro confirma'; exception when insufficient_privilege then null; end;
  begin update team_prize_payments set amount=999; raise exception 'TEST: escritura directa'; exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin
  if exists(select 1 from team_prize_payments) then raise exception 'TEST: editor ve teléfonos'; end if;
  begin perform team_prize_context(current_edition_id(),'ff'); raise exception 'TEST: editor ve contexto'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform 1 from team_prize_payments; raise exception 'TEST: anon ve premios privados'; exception when insufficient_privilege then null; end;
  begin perform team_prize_context(current_edition_id(),'ff'); raise exception 'TEST: anon ve contexto'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ declare e uuid:=current_edition_id(); archived jsonb; begin
  perform close_tournament_edition(e,(select name from tournament_editions where id=e),'Torneo después de premios',now()+interval '30 days');
  if exists(select 1 from team_prize_payments) or exists(select 1 from team_prize_settlements) then raise exception 'TEST: premios no se archivan'; end if;
  if (select count(*) from tournament_archive_records where edition_id=e and source='team_prize_payments')<>6 then raise exception 'TEST: pierde historial privado'; end if;
  select data into archived from tournament_archive_public where edition_id=e;
  if archived::text like '%912345678%' or archived::text like '%933333333%' or archived ? 'team_prize_payments' then raise exception 'TEST: archivo público filtra pagos o teléfonos'; end if;
  if not exists(select 1 from audit_log where table_name='team_prize_payments' and op='UPDATE' and new_data->>'reference'='REF-001') then raise exception 'TEST: pago no auditado'; end if;
  begin perform record_team_prize_payment(e,current_setting('test.team_prize_payment')::uuid,'pay','',0,'912345678'); raise exception 'TEST: permite edición archivada';
  exception when raise_exception then if sqlerrm not like 'La edición cambió%' then raise; end if; end;
end $$;
rollback;
