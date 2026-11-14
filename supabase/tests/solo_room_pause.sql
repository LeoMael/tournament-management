begin;
do $$
declare e uuid:=current_edition_id(); room uuid; reg uuid; old_room jsonb; old_person jsonb; old_access jsonb;
  payload jsonb; path text:=gen_random_uuid()::text||'.png'; s text; response jsonb;
begin
  update tournament_settings set registration_open=true,solo_enabled=true,registration_deadline=now()+interval '20 days';
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Pausa reversible',now()+interval '2 days',now()+interval '1 day',3,2,1,10,'open') returning id into room;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
  values(room,gen_random_uuid(),'existing','Jugador aprobado','999999998','Existente',gen_random_uuid()::text||'.png',2,'approved') returning id into reg;
  perform save_solo_room_access(e,room,'123456','clave privada');
  select to_jsonb(r)-'is_paused' into old_room from solo_rooms r where id=room;
  select to_jsonb(p) into old_person from solo_registrations p where id=reg;
  select to_jsonb(a) into old_access from solo_room_access a where room_id=room;
  response:=set_solo_room_paused(e,room,true);
  if response->>'status'<>'open' or not (response->>'is_paused')::boolean then raise exception 'TEST: pausa cambia estado operativo'; end if;
  if old_room is distinct from (select to_jsonb(r)-'is_paused' from solo_rooms r where id=room)
    or old_person is distinct from (select to_jsonb(p) from solo_registrations p where id=reg)
    or old_access is distinct from (select to_jsonb(a) from solo_room_access a where room_id=room) then raise exception 'TEST: pausa altera sala, inscritos, slots o acceso'; end if;
  if not exists(select 1 from public_solo_rooms where id=room and status='draft' and is_announced and is_paused and taken=1) then raise exception 'TEST: pausa no aparece como anuncio público'; end if;
  if not exists(select 1 from public_solo_results where id=reg and slot=1 and kills is null and earnings is null) then raise exception 'TEST: pausa pierde participantes públicos'; end if;
  if not exists(select 1 from audit_log where table_name='solo_rooms' and row_key=room::text and op='UPDATE' and new_data->>'is_paused'='true') then raise exception 'TEST: pausa sin auditoría'; end if;
  insert into storage.objects(bucket_id,name,metadata) values('receipts',path,'{"mimetype":"image/png","size":100}');
  payload:=jsonb_build_object('edition_id',e,'room_id',room,'request_id',gen_random_uuid(),'full_name','Nuevo jugador','whatsapp','999999999','nickname','Nuevo','receipt_path',path);
  begin perform submit_solo_registration(payload); raise exception 'TEST: inscripción nueva durante pausa';
  exception when raise_exception then if sqlerrm <> 'Las inscripciones de esta sala están pausadas' then raise; end if; end;
  if (select count(*) from solo_registrations where room_id=room)<>1 then raise exception 'TEST: pausa reservó cupo'; end if;
  begin perform manage_solo('edit',jsonb_build_object('edition_id',e,'room_id',room)); raise exception 'TEST: pausa desbloquea tarifas';
  exception when raise_exception then if sqlerrm <> 'Las condiciones se fijaron al abrir las inscripciones' then raise; end if; end;
  begin perform manage_solo('start',jsonb_build_object('edition_id',e,'room_id',room)); raise exception 'TEST: pausa permite iniciar partida';
  exception when raise_exception then if sqlerrm <> 'Primero cierra las inscripciones de la sala' then raise; end if; end;
  perform update_solo_room_schedule(e,room,now()+interval '4 days',now()+interval '3 days');
  if (select is_paused from solo_rooms where id=room) is distinct from true then raise exception 'TEST: horario reabre sin autorización'; end if;
  update tournament_settings set registration_open=false;
  begin perform set_solo_room_paused(e,room,false); raise exception 'TEST: ignora cierre general';
  exception when raise_exception then if sqlerrm <> 'Habilita Solo y las inscripciones generales; el cierre debe estar dentro del plazo general' then raise; end if; end;
  update tournament_settings set registration_open=true,solo_enabled=false;
  begin perform set_solo_room_paused(e,room,false); raise exception 'TEST: ignora Solo deshabilitado';
  exception when raise_exception then if sqlerrm <> 'Habilita Solo y las inscripciones generales; el cierre debe estar dentro del plazo general' then raise; end if; end;
  update tournament_settings set solo_enabled=true,registration_deadline=now()+interval '2 days';
  begin perform set_solo_room_paused(e,room,false); raise exception 'TEST: ignora plazo general';
  exception when raise_exception then if sqlerrm <> 'Habilita Solo y las inscripciones generales; el cierre debe estar dentro del plazo general' then raise; end if; end;
  update tournament_settings set registration_deadline=now()+interval '20 days';
  update solo_rooms set closes_at=now()-interval '1 minute' where id=room;
  begin perform set_solo_room_paused(e,room,false); raise exception 'TEST: abre plazo vencido';
  exception when raise_exception then if sqlerrm <> 'Amplía el cierre desde Editar horario antes de abrir inscripciones' then raise; end if; end;
  perform update_solo_room_schedule(e,room,now()+interval '4 days',now()+interval '3 days');
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  begin perform set_solo_room_paused(e,room,false); raise exception 'TEST: revisor abre'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
  begin perform set_solo_room_paused(e,room,false); raise exception 'TEST: editor abre'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  begin perform set_solo_room_paused(gen_random_uuid(),room,false); raise exception 'TEST: edición antigua';
  exception when raise_exception then if sqlerrm <> 'La edición cambió. Actualiza la página.' then raise; end if; end;
  begin perform set_solo_room_paused(e,room,null); raise exception 'TEST: pausa nula';
  exception when raise_exception then if sqlerrm <> 'Indica si deseas pausar o abrir las inscripciones' then raise; end if; end;
  perform set_solo_room_paused(e,room,false);
  if not exists(select 1 from public_solo_rooms where id=room and status='open' and not is_paused and not is_announced and taken=1) then raise exception 'TEST: apertura no restaura proyección pública'; end if;
  perform submit_solo_registration(payload);
  if (select count(*) from solo_registrations where room_id=room)<>2 then raise exception 'TEST: no admite inscripción tras abrir'; end if;
  -- Cerrar para jugar conserva el comportamiento previo y no se confunde con pausar.
  perform manage_solo('close',jsonb_build_object('edition_id',e,'room_id',room));
  foreach s in array array['closed','draft','playing','finished','cancelled'] loop
    update solo_rooms set status=s where id=room;
    begin perform set_solo_room_paused(e,room,false); raise exception 'TEST: abre estado no permitido';
    exception when raise_exception then if sqlerrm <> 'Solo puedes pausar o volver a abrir una sala que no se haya cerrado para jugar' then raise; end if; end;
  end loop;
end $$;
set local role anon;
do $$ begin
  begin perform set_solo_room_paused(null,null,true); raise exception 'TEST: anon pausa'; exception when insufficient_privilege then null; end;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='public_solo_rooms' and column_name in ('game_room_id','room_password','whatsapp','receipt_path')) then raise exception 'TEST: filtra datos privados'; end if;
end $$;
rollback;
