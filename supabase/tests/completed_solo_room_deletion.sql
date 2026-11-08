begin;
create function public.test_solo_delete_failure() returns trigger language plpgsql as $$ begin
  if current_setting('test.solo_delete_fail',true)='on' then raise exception 'Fallo de prueba'; end if;
  return old;
end $$;
create trigger test_solo_delete_failure before delete on solo_registrations for each row execute function public.test_solo_delete_failure();
do $$
declare e uuid:=current_edition_id(); room uuid; reg uuid; s text; protected_room uuid;
begin
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Conservar sala',now()+interval '2 days',now()+interval '1 day',2,2,1,10,'finished') returning id into protected_room;
  foreach s in array array['finished','cancelled'] loop
    insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
    values('Sala de prueba',now()+interval '2 days',now()+interval '1 day',2,2,1,10,s) returning id into room;
    insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
    values(room,gen_random_uuid(),'delete-test','Jugador Prueba','999999999','Jugador',gen_random_uuid()::text||'.png',2,'approved') returning id into reg;
    insert into solo_results(registration_id,room_id,kills,booyah) values(reg,room,2,true);
    insert into solo_payments(registration_id,kind,amount) values(reg,'reward',12);
    begin perform delete_solo_room(e,room,'Nombre incorrecto'); raise exception 'TEST: nombre incorrecto aceptado';
    exception when raise_exception then if sqlerrm <> 'Escribe el nombre exacto de la sala para eliminarla' then raise; end if; end;
    begin perform delete_solo_room(gen_random_uuid(),room,'Sala de prueba'); raise exception 'TEST: edición incorrecta aceptada';
    exception when raise_exception then if sqlerrm <> 'La edición cambió. Actualiza la página.' then raise; end if; end;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
    begin perform delete_solo_room(e,room,'Sala de prueba'); raise exception 'TEST: revisor elimina datos'; exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
    begin perform delete_solo_room(e,room,'Sala de prueba'); raise exception 'TEST: editor elimina datos'; exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
    perform set_config('test.solo_delete_fail','on',true);
    begin perform delete_solo_room(e,room,'Sala de prueba'); raise exception 'TEST: ignoró fallo';
    exception when raise_exception then if sqlerrm <> 'Fallo de prueba' then raise; end if; end;
    perform set_config('test.solo_delete_fail','off',true);
    if not exists(select 1 from solo_results where registration_id=reg) or not exists(select 1 from solo_payments where registration_id=reg and paid_at is null) then raise exception 'TEST: eliminación parcial'; end if;
    perform delete_solo_room(e,room,'Sala de prueba');
    if exists(select 1 from solo_rooms where id=room) or exists(select 1 from solo_registrations where id=reg)
      or exists(select 1 from solo_results where room_id=room) or exists(select 1 from solo_payments where registration_id=reg) then raise exception 'TEST: quedan datos operativos'; end if;
    if not exists(select 1 from audit_log where table_name='solo_rooms' and op='DELETE' and row_key=room::text)
      or not exists(select 1 from audit_log where table_name='solo_payments' and op='DELETE' and old_data->>'registration_id'=reg::text)
      or not exists(select 1 from audit_log where table_name='solo_registrations' and op='DELETE' and row_key=reg::text)
      or not exists(select 1 from audit_log where table_name='solo_results' and op='DELETE' and old_data->>'registration_id'=reg::text) then raise exception 'TEST: falta trazabilidad'; end if;
    if not exists(select 1 from solo_rooms where id=protected_room) then raise exception 'TEST: eliminó otra sala'; end if;
  end loop;
  foreach s in array array['draft','open','closed','playing'] loop
    insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
    values('Sala activa',now()+interval '2 days',now()+interval '1 day',2,2,1,10,s) returning id into room;
    if s='draft' then perform delete_solo_room(e,room,'Sala activa');
    else
      begin perform delete_solo_room(e,room,'Sala activa'); raise exception 'TEST: elimina sala en operación';
      exception when raise_exception then if sqlerrm <> 'Primero finaliza o cancela la sala antes de eliminarla' then raise; end if; end;
    end if;
  end loop;
end $$;
set local role anon;
do $$ begin
  begin perform delete_solo_room(null,null,''); raise exception 'TEST: anon elimina salas'; exception when insufficient_privilege then null; end;
end $$;
rollback;
