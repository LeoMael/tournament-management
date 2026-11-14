begin;
do $$
declare e uuid:=current_edition_id(); room uuid; reg uuid; original jsonb; people_before jsonb; access_before jsonb;
  payload jsonb; path text:=gen_random_uuid()::text||'.png'; s text;
begin
  update tournament_settings set registration_open=true,solo_enabled=true,registration_deadline=now()+interval '20 days';
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status,is_announced)
  values('Ampliar sala vencida',now()-interval '1 hour',now()-interval '2 hours',3,5,1,10,'open',true) returning id into room;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
  values(room,gen_random_uuid(),'existing','Jugador aprobado','999999998','Existente',gen_random_uuid()::text||'.png',5,'approved') returning id into reg;
  perform save_solo_room_access(e,room,'123456','clave privada');
  select to_jsonb(r)-'scheduled_at'-'closes_at' into original from solo_rooms r where id=room;
  select to_jsonb(p) into people_before from solo_registrations p where id=reg;
  select to_jsonb(a) into access_before from solo_room_access a where room_id=room;
  insert into storage.objects(bucket_id,name,metadata) values('receipts',path,'{"mimetype":"image/png","size":100}');
  payload:=jsonb_build_object('edition_id',e,'room_id',room,'request_id',gen_random_uuid(),'full_name','Nuevo jugador','whatsapp','999999999','nickname','Nuevo','receipt_path',path);
  begin perform submit_solo_registration(payload); raise exception 'TEST: inscribe después del cierre';
  exception when raise_exception then if sqlerrm <> 'Esta sala no admite inscripciones' then raise; end if; end;
  perform update_solo_room_schedule(e,room,now()+interval '4 days',now()+interval '3 days');
  if original is distinct from (select to_jsonb(r)-'scheduled_at'-'closes_at' from solo_rooms r where id=room) then raise exception 'TEST: cambió condiciones ajenas al horario'; end if;
  if people_before is distinct from (select to_jsonb(p) from solo_registrations p where id=reg)
    or access_before is distinct from (select to_jsonb(a) from solo_room_access a where room_id=room) then raise exception 'TEST: alteró participantes, slots o acceso'; end if;
  if not exists(select 1 from public_solo_rooms where id=room and closes_at=now()+interval '3 days' and scheduled_at=now()+interval '4 days') then raise exception 'TEST: público no recibe horario'; end if;
  if not exists(select 1 from audit_log where table_name='solo_rooms' and row_key=room::text and op='UPDATE' and new_data->>'closes_at' is distinct from old_data->>'closes_at') then raise exception 'TEST: sin auditoría'; end if;
  perform submit_solo_registration(payload);
  if not exists(select 1 from solo_registrations where room_id=room and nickname='Nuevo' and amount_due=5 and status='pending') then raise exception 'TEST: ampliación no permite inscribir con tarifa original'; end if;
  begin perform update_solo_room_schedule(gen_random_uuid(),room,now()+interval '5 days',now()+interval '4 days'); raise exception 'TEST: edición antigua';
  exception when raise_exception then if sqlerrm <> 'La edición cambió. Actualiza la página.' then raise; end if; end;
  begin perform update_solo_room_schedule(e,gen_random_uuid(),now()+interval '5 days',now()+interval '4 days'); raise exception 'TEST: sala inexistente';
  exception when raise_exception then if sqlerrm <> 'Sala no encontrada en esta edición' then raise; end if; end;
  begin perform update_solo_room_schedule(e,room,null,now()+interval '4 days'); raise exception 'TEST: fecha nula';
  exception when raise_exception then if sqlerrm <> 'Completa una fecha y hora válidas para la partida y el cierre' then raise; end if; end;
  begin perform update_solo_room_schedule(e,room,'infinity',now()+interval '4 days'); raise exception 'TEST: fecha infinita';
  exception when raise_exception then if sqlerrm <> 'Completa una fecha y hora válidas para la partida y el cierre' then raise; end if; end;
  begin perform update_solo_room_schedule(e,room,now()+interval '5 days',now()-interval '1 minute'); raise exception 'TEST: cierre vencido';
  exception when raise_exception then if sqlerrm <> 'El nuevo cierre de inscripción debe estar en el futuro' then raise; end if; end;
  begin perform update_solo_room_schedule(e,room,now()+interval '1 day',now()+interval '2 days'); raise exception 'TEST: cierre posterior a partida';
  exception when raise_exception then if sqlerrm <> 'El cierre de inscripción no puede ser posterior a la partida' then raise; end if; end;
  begin perform update_solo_room_schedule(e,room,now()+interval '30 days',now()+interval '29 days'); raise exception 'TEST: supera plazo general';
  exception when raise_exception then if sqlerrm <> 'El cierre supera el plazo general del torneo. Amplíalo primero en Configuración.' then raise; end if; end;
  if not exists(select 1 from solo_rooms where id=room and closes_at=now()+interval '3 days' and scheduled_at=now()+interval '4 days') then raise exception 'TEST: error dejó cambios parciales'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  begin perform update_solo_room_schedule(e,room,now()+interval '5 days',now()+interval '4 days'); raise exception 'TEST: revisor edita horario'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
  begin perform update_solo_room_schedule(e,room,now()+interval '5 days',now()+interval '4 days'); raise exception 'TEST: editor edita horario'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  perform manage_solo('close',jsonb_build_object('edition_id',e,'room_id',room));
  perform update_solo_room_schedule(e,room,now()+interval '5 days',now()+interval '4 days');
  if (select status from solo_rooms where id=room)<>'closed' then raise exception 'TEST: reabrió sala cerrada'; end if;
  begin perform submit_solo_registration(payload||jsonb_build_object('request_id',gen_random_uuid())); raise exception 'TEST: acepta inscripción con estado cerrado';
  exception when raise_exception then if sqlerrm <> 'Esta sala no admite inscripciones' then raise; end if; end;
  foreach s in array array['draft','playing','finished','cancelled'] loop
    update solo_rooms set status=s where id=room;
    begin perform update_solo_room_schedule(e,room,now()+interval '6 days',now()+interval '5 days'); raise exception 'TEST: estado no permitido';
    exception when raise_exception then if sqlerrm <> 'Solo puedes cambiar el horario antes de iniciar la partida' then raise; end if; end;
  end loop;
end $$;
set local role authenticated;
do $$ begin
  begin update solo_rooms set scheduled_at=now(); raise exception 'TEST: cliente escribe directamente'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform update_solo_room_schedule(null,null,null,null); raise exception 'TEST: anon edita horario'; exception when insufficient_privilege then null; end;
end $$;
rollback;
