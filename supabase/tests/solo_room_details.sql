begin;
do $$
declare e uuid:=current_edition_id(); room uuid; reg uuid; before_room jsonb; people jsonb; results jsonb; payments jsonb; access jsonb;
  saved jsonb; scheduled timestamptz; closes timestamptz; bad_name text; state text;
begin
  update tournament_settings set registration_open=true,solo_enabled=true,registration_deadline=now()+interval '20 days';
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status,is_paused,is_announced)
    values('Nombre anterior',now()-interval '1 hour',now()-interval '2 hours',48,2,1,10,'open',false,true) returning id,scheduled_at,closes_at into room,scheduled,closes;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
    values(room,gen_random_uuid(),'rename-test','Jugador Uno','987654321','Jugador',gen_random_uuid()::text||'.png',2,'approved') returning id into reg;
  perform save_solo_room_access(e,room,'123456','clave privada');
  update solo_rooms set is_paused=true where id=room;
  update solo_registrations set confirmation_click_count=2,access_click_count=3 where id=reg;
  -- Filas relacionadas conservadas byte a byte, incluso si existen datos históricos.
  insert into solo_results(registration_id,room_id,kills,booyah) values(reg,room,3,true);
  insert into solo_payments(registration_id,kind,amount,reference) values(reg,'reward',13,'Referencia existente');
  select to_jsonb(r)-'name'-'scheduled_at'-'closes_at' into before_room from solo_rooms r where id=room;
  select to_jsonb(r) into people from solo_registrations r where id=reg;
  select to_jsonb(r) into results from solo_results r where registration_id=reg;
  select to_jsonb(r) into payments from solo_payments r where registration_id=reg;
  select to_jsonb(r) into access from solo_room_access r where room_id=room;
  saved:=update_solo_room_details(e,room,'  Sala renovada ñ  ',scheduled,closes);
  if saved->>'name'<>'Sala renovada ñ' or (saved->>'id')::uuid<>room or saved->>'status'<>'open' then raise exception 'TEST: nombre o identidad incorrectos'; end if;
  if not exists(select 1 from solo_rooms where id=room and name='Sala renovada ñ' and scheduled_at=scheduled and closes_at=closes and is_paused) then raise exception 'TEST: renombrar altera horario o pausa'; end if;
  if not exists(select 1 from public_solo_rooms where id=room and name='Sala renovada ñ' and status='draft' and is_paused) then raise exception 'TEST: nombre público no actualizado'; end if;
  if not exists(select 1 from audit_log where table_name='solo_rooms' and row_key=room::text and new_data->>'name'='Sala renovada ñ' and old_data->>'name'='Nombre anterior') then raise exception 'TEST: nombre no auditado'; end if;
  foreach bad_name in array array[null,'','   ','ab',repeat('x',101)] loop
    begin perform update_solo_room_details(e,room,bad_name,scheduled,closes); raise exception 'TEST: nombre inválido aceptado';
    exception when raise_exception then if sqlerrm<>'El nombre debe tener entre 3 y 100 caracteres' then raise; end if; end;
  end loop;
  begin perform update_solo_room_details(e,room,'No guardar',now()+interval '2 days',now()-interval '1 minute'); raise exception 'TEST: horario nuevo vencido';
  exception when raise_exception then if sqlerrm<>'El nuevo cierre de inscripción debe estar en el futuro' then raise; end if; end;
  begin perform update_solo_room_details(e,room,'No guardar',now()+interval '1 day',now()+interval '2 days'); raise exception 'TEST: cierre posterior';
  exception when raise_exception then if sqlerrm<>'El cierre de inscripción no puede ser posterior a la partida' then raise; end if; end;
  begin perform update_solo_room_details(e,room,'No guardar',now()+interval '30 days',now()+interval '29 days'); raise exception 'TEST: plazo general';
  exception when raise_exception then if sqlerrm not like 'El cierre supera el plazo general%' then raise; end if; end;
  begin perform update_solo_room_details(e,room,'No guardar',null,closes); raise exception 'TEST: fecha nula';
  exception when raise_exception then if sqlerrm not like 'Completa una fecha y hora válidas%' then raise; end if; end;
  begin perform update_solo_room_details(e,room,'No guardar','infinity',closes); raise exception 'TEST: fecha infinita';
  exception when raise_exception then if sqlerrm not like 'Completa una fecha y hora válidas%' then raise; end if; end;
  begin perform update_solo_room_details(gen_random_uuid(),room,'No guardar',scheduled,closes); raise exception 'TEST: edición incorrecta';
  exception when raise_exception then if sqlerrm not like 'La edición cambió%' then raise; end if; end;
  begin perform update_solo_room_details(e,gen_random_uuid(),'No guardar',scheduled,closes); raise exception 'TEST: sala inexistente';
  exception when raise_exception then if sqlerrm<>'Sala no encontrada en esta edición' then raise; end if; end;
  if (select name from solo_rooms where id=room)<>'Sala renovada ñ' then raise exception 'TEST: error cambia nombre parcialmente'; end if;
  saved:=update_solo_room_details(e,room,'Nombre y horario',now()+interval '4 days',now()+interval '3 days');
  if not exists(select 1 from solo_rooms where id=room and name='Nombre y horario' and scheduled_at=now()+interval '4 days' and closes_at=now()+interval '3 days' and is_paused) then raise exception 'TEST: no actualiza nombre y fechas'; end if;
  if before_room is distinct from (select to_jsonb(r)-'name'-'scheduled_at'-'closes_at' from solo_rooms r where id=room)
    or people is distinct from (select to_jsonb(r) from solo_registrations r where id=reg)
    or results is distinct from (select to_jsonb(r) from solo_results r where registration_id=reg)
    or payments is distinct from (select to_jsonb(r) from solo_payments r where registration_id=reg)
    or access is distinct from (select to_jsonb(r) from solo_room_access r where room_id=room) then raise exception 'TEST: cambia datos relacionados, importes, slots o acceso'; end if;
  -- La función 019 sigue disponible para clientes anteriores y no cambia el nombre.
  perform update_solo_room_schedule(e,room,now()+interval '5 days',now()+interval '4 days');
  if (select name from solo_rooms where id=room)<>'Nombre y horario' then raise exception 'TEST: API anterior altera nombre'; end if;
  update solo_rooms set status='closed' where id=room;
  perform update_solo_room_details(e,room,'Cerrada renombrada',now()+interval '5 days',now()+interval '4 days');
  if (select status from solo_rooms where id=room)<>'closed' then raise exception 'TEST: reabre sala cerrada'; end if;
  foreach state in array array['draft','playing','finished','cancelled'] loop
    update solo_rooms set status=state where id=room;
    begin perform update_solo_room_details(e,room,'No guardar',now()+interval '5 days',now()+interval '4 days'); raise exception 'TEST: estado no permitido';
    exception when raise_exception then if sqlerrm<>'Solo puedes editar estos datos antes de iniciar la partida' then raise; end if; end;
  end loop;
  perform set_config('test.rename_room',room::text,true);
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin
  begin perform update_solo_room_details(current_edition_id(),current_setting('test.rename_room')::uuid,'Revisor',now(),now()); raise exception 'TEST: revisor renombra'; exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin
  begin perform update_solo_room_details(current_edition_id(),current_setting('test.rename_room')::uuid,'Editor',now(),now()); raise exception 'TEST: editor renombra'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform update_solo_room_details(null,null,'Visitante',now(),now()); raise exception 'TEST: anon renombra'; exception when insufficient_privilege then null; end;
end $$;
rollback;
