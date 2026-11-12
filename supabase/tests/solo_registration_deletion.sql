begin;
do $$
declare e uuid:=current_edition_id(); room uuid; other_room uuid; first_reg uuid; second_reg uuid; third_reg uuid; path text:=gen_random_uuid()::text||'.png'; s text; old_count bigint;
begin
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Sala para limpiar pruebas',now()+interval '2 days',now()+interval '1 day',4,0,1,10,'open') returning id into room;
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Otra sala protegida',now()+interval '2 days',now()+interval '1 day',4,0,1,10,'open') returning id into other_room;
  perform save_solo_room_access(e,room,'123456','clave privada');
  insert into storage.objects(bucket_id,name,metadata) values('receipts',path,'{"mimetype":"image/png","size":100}');
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due)
  values(room,gen_random_uuid(),'first','Jugador Prueba','999999999','Primero',path,0) returning id into first_reg;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due)
  values(room,gen_random_uuid(),'second','Jugador Real','999999998','Segundo',gen_random_uuid()::text||'.png',0) returning id into second_reg;
  perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',first_reg,'status','approved'));
  perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',second_reg,'status','approved'));
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  begin perform delete_solo_registration(e,room,first_reg,'Primero'); raise exception 'TEST: revisor elimina'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
  begin perform delete_solo_registration(e,room,first_reg,'Primero'); raise exception 'TEST: editor elimina'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  begin perform delete_solo_registration(e,other_room,first_reg,'Primero'); raise exception 'TEST: elimina desde otra sala';
  exception when raise_exception then if sqlerrm <> 'Participante no encontrado en esta sala. Actualiza la lista.' then raise; end if; end;
  begin perform delete_solo_registration(gen_random_uuid(),room,first_reg,'Primero'); raise exception 'TEST: edición antigua elimina';
  exception when raise_exception then if sqlerrm <> 'La edición cambió. Actualiza la página.' then raise; end if; end;
  begin perform delete_solo_registration(e,room,first_reg,'Incorrecto'); raise exception 'TEST: omite confirmación';
  exception when raise_exception then if sqlerrm <> 'Escribe el nickname exacto del participante para eliminarlo' then raise; end if; end;
  foreach s in array array['draft','playing','finished','cancelled'] loop
    update solo_rooms set status=s where id=room;
    begin perform delete_solo_registration(e,room,first_reg,'Primero'); raise exception 'TEST: elimina fuera de revisión';
    exception when raise_exception then if sqlerrm <> 'Solo se pueden eliminar participantes antes de iniciar la partida' then raise; end if; end;
  end loop;
  update solo_rooms set status='closed' where id=room;
  perform delete_solo_registration(e,room,first_reg,'Primero');
  if exists(select 1 from solo_registrations where id=first_reg) or exists(select 1 from public_solo_results where id=first_reg) then raise exception 'TEST: participante sigue visible'; end if;
  if not exists(select 1 from solo_registrations where id=second_reg and slot=2 and status='approved') then raise exception 'TEST: alteró slot del otro jugador'; end if;
  if not exists(select 1 from public_solo_rooms where id=room and taken=1 and capacity=4) then raise exception 'TEST: cupo o sala incorrectos'; end if;
  if not exists(select 1 from solo_rooms where id=other_room) or not exists(select 1 from solo_room_access where room_id=room and game_room_id='123456' and room_password='clave privada') then raise exception 'TEST: alteró otras salas o acceso'; end if;
  if not exists(select 1 from storage.objects where bucket_id='receipts' and name=path) then raise exception 'TEST: borró comprobante'; end if;
  if not exists(select 1 from audit_log where table_name='solo_registrations' and op='DELETE' and row_key=first_reg::text and old_data->>'nickname'='Primero') then raise exception 'TEST: falta auditoría'; end if;
  -- Un nuevo aprobado puede ocupar el hueco; los jugadores existentes no cambian.
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due)
  values(room,gen_random_uuid(),'third','Otro Jugador','999999997','Tercero',gen_random_uuid()::text||'.png',0) returning id into third_reg;
  perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',third_reg,'status','approved'));
  if (select slot from solo_registrations where id=third_reg) is distinct from 1 then raise exception 'TEST: slot eliminado no queda disponible'; end if;
  insert into solo_results(registration_id,room_id,kills,booyah) values(third_reg,room,0,false);
  begin perform delete_solo_registration(e,room,third_reg,'Tercero'); raise exception 'TEST: elimina con resultados';
  exception when raise_exception then if sqlerrm <> 'El participante tiene resultados o pagos asociados y no puede eliminarse' then raise; end if; end;
  delete from solo_results where registration_id=third_reg;
  insert into solo_payments(registration_id,kind,amount) values(third_reg,'refund',2);
  begin perform delete_solo_registration(e,room,third_reg,'Tercero'); raise exception 'TEST: elimina con pago pendiente';
  exception when raise_exception then if sqlerrm <> 'El participante tiene resultados o pagos asociados y no puede eliminarse' then raise; end if; end;
  update solo_payments set paid_at=now() where registration_id=third_reg;
  begin perform delete_solo_registration(e,room,third_reg,'Tercero'); raise exception 'TEST: elimina con pago liquidado';
  exception when raise_exception then if sqlerrm <> 'El participante tiene resultados o pagos asociados y no puede eliminarse' then raise; end if; end;
  delete from solo_payments where registration_id=third_reg;
  update solo_registrations set status='refund_pending' where id=third_reg;
  begin perform delete_solo_registration(e,room,third_reg,'Tercero'); raise exception 'TEST: elimina devolución';
  exception when raise_exception then if sqlerrm <> 'La inscripción tiene una devolución en curso o registrada y debe conservarse' then raise; end if; end;
  update solo_rooms set status='open' where id=room;
  foreach s in array array['pending','rejected'] loop
    insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
    values(room,gen_random_uuid(),s,'Inscripción Prueba','999999996',s,gen_random_uuid()::text||'.png',0,s) returning id into first_reg;
    perform delete_solo_registration(e,room,first_reg,s);
    if exists(select 1 from solo_registrations where id=first_reg) then raise exception 'TEST: no permite limpiar estado'; end if;
  end loop;
  select count(*) into old_count from solo_registrations;
  begin perform delete_solo_registration(e,room,gen_random_uuid(),'No existe'); raise exception 'TEST: acepta inexistente';
  exception when raise_exception then if sqlerrm <> 'Participante no encontrado en esta sala. Actualiza la lista.' then raise; end if; end;
  if old_count<>(select count(*) from solo_registrations) then raise exception 'TEST: fallo alteró otra inscripción'; end if;
end $$;
set local role authenticated;
do $$ begin
  begin delete from solo_registrations; raise exception 'TEST: cliente borra directamente'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform delete_solo_registration(null,null,null,null); raise exception 'TEST: anon elimina'; exception when insufficient_privilege then null; end;
end $$;
rollback;
