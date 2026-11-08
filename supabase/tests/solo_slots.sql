begin;
do $$
declare e uuid:=current_edition_id(); room uuid; other_room uuid; first_reg uuid; second_reg uuid; third_reg uuid; other_reg uuid;
begin
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Slots por aprobación',now()+interval '2 days',now()+interval '1 day',2,2,1,10,'open') returning id into room;
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Otra sala con slots',now()+interval '2 days',now()+interval '1 day',2,2,1,10,'open') returning id into other_room;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,created_at)
  values(room,gen_random_uuid(),'first','Primero inscrito','999999999','Primero',gen_random_uuid()::text||'.png',2,now()-interval '1 hour') returning id into first_reg;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due)
  values(room,gen_random_uuid(),'second','Segundo inscrito','999999998','Segundo',gen_random_uuid()::text||'.png',2) returning id into second_reg;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due)
  values(room,gen_random_uuid(),'third','Tercer inscrito','999999997','Tercero',gen_random_uuid()::text||'.png',2) returning id into third_reg;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due)
  values(other_room,gen_random_uuid(),'other','Otra sala','999999996','Otro',gen_random_uuid()::text||'.png',2) returning id into other_reg;
  if exists(select 1 from solo_registrations where room_id in (room,other_room) and slot is not null) then raise exception 'TEST: pendiente recibió slot'; end if;
  -- El segundo inscrito se aprueba primero y recibe el primer slot.
  perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',second_reg,'status','approved'));
  if (select slot from solo_registrations where id=second_reg) is distinct from 1 then raise exception 'TEST: no respeta orden de aprobación'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',first_reg,'status','approved'));
  if (select slot from solo_registrations where id=first_reg) is distinct from 2 then raise exception 'TEST: revisor no asigna siguiente slot'; end if;
  perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',other_room,'registration_id',other_reg,'status','approved'));
  if (select slot from solo_registrations where id=other_reg) is distinct from 1 then raise exception 'TEST: slots no son independientes por sala'; end if;
  begin
    perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',third_reg,'status','approved'));
    raise exception 'TEST: excedió capacidad de slots';
  exception when raise_exception then if sqlerrm <> 'No quedan slots disponibles en esta sala' then raise; end if; end;
  if (select status from solo_registrations where id=third_reg)<>'pending' then raise exception 'TEST: aprobación fallida dejó cambios'; end if;
  perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',third_reg,'status','rejected','reason','Sin cupo disponible'));
  if (select slot from solo_registrations where id=third_reg) is not null then raise exception 'TEST: rechazo recibió slot'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  begin update solo_registrations set slot=2 where id=second_reg; raise exception 'TEST: permite renumerar';
  exception when raise_exception then if sqlerrm <> 'El slot asignado no puede cambiar de número ni de sala' then raise; end if; end;
  perform manage_solo('cancel',jsonb_build_object('edition_id',e,'room_id',room,'reason','Cancelación de prueba'));
  if (select slot from solo_registrations where id=second_reg) is distinct from 1
     or (select slot from solo_registrations where id=first_reg) is distinct from 2 then raise exception 'TEST: cancelación perdió slots'; end if;
end $$;
set local role authenticated;
do $$ begin
  begin update solo_registrations set slot=1; raise exception 'TEST: cliente asigna slots directamente';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
