begin;
do $$
declare e uuid:=current_edition_id(); room uuid; protected_room uuid; person uuid; result jsonb; state text; before_room jsonb; before_person jsonb;
begin
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status,is_paused)
    values('Pausada vacía',now()+interval '2 days',now()+interval '1 day',48,2,1,10,'open',true) returning id into room;
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
    values('Otra sala protegida',now()+interval '2 days',now()+interval '1 day',48,2,1,10,'open') returning id into protected_room;
  perform save_solo_room_access(e,room,'123456','clave privada de prueba');
  perform set_config('test.paused_delete_room',room::text,true);
  select to_jsonb(r) into before_room from solo_rooms r where id=protected_room;
  begin perform delete_solo_room(e,room,'Nombre incorrecto'); raise exception 'TEST: elimina sin nombre exacto';
  exception when raise_exception then if sqlerrm<>'Escribe el nombre exacto de la sala para eliminarla' then raise; end if; end;
  begin perform delete_solo_room(gen_random_uuid(),room,'Pausada vacía'); raise exception 'TEST: elimina desde otra edición';
  exception when raise_exception then if sqlerrm not like 'La edición cambió%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  begin perform delete_solo_room(e,room,'Pausada vacía'); raise exception 'TEST: revisor elimina'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
  begin perform delete_solo_room(e,room,'Pausada vacía'); raise exception 'TEST: editor elimina'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  result:=delete_solo_room(e,room,'Pausada vacía');
  if result<>jsonb_build_object('id',room) or exists(select 1 from solo_rooms where id=room) or exists(select 1 from solo_room_access where room_id=room) then raise exception 'TEST: no elimina sala vacía y su acceso'; end if;
  if before_room is distinct from (select to_jsonb(r) from solo_rooms r where id=protected_room) then raise exception 'TEST: cambia otra sala'; end if;
  if not exists(select 1 from audit_log where table_name='solo_rooms' and op='DELETE' and row_key=room::text) then raise exception 'TEST: eliminación sin auditoría'; end if;
  foreach state in array array['pending','approved','rejected','refund_pending','refunded'] loop
    insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status,is_paused)
      values('Pausada con historial',now()+interval '2 days',now()+interval '1 day',48,2,1,10,'open',false) returning id into room;
    insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
      values(room,gen_random_uuid(),'paused-delete-'||state,'Jugador','987654321','Nickname',gen_random_uuid()::text||'.png',2,state) returning id into person;
    if state='approved' then
      insert into solo_results(registration_id,room_id,kills,booyah) values(person,room,2,true);
      insert into solo_payments(registration_id,kind,amount) values(person,'reward',12);
    end if;
    update solo_rooms set is_paused=true where id=room;
    select to_jsonb(r) into before_person from solo_registrations r where id=person;
    if exists(select 1 from schema_migrations where version='035') then
      perform delete_solo_room(e,room,'Pausada con historial');
      if exists(select 1 from solo_registrations where id=person) or exists(select 1 from solo_results where registration_id=person) or exists(select 1 from solo_payments where registration_id=person) then raise exception 'TEST: 035 deja historial activo tras eliminar'; end if;
    else
      begin perform delete_solo_room(e,room,'Pausada con historial'); raise exception 'TEST: elimina historial de sala pausada';
      exception when raise_exception then if sqlerrm<>'La sala pausada tiene inscripciones o resultados. Cancélala antes de eliminarla.' then raise; end if; end;
      if before_person is distinct from (select to_jsonb(r) from solo_registrations r where id=person) or not exists(select 1 from solo_rooms where id=room) then raise exception 'TEST: error deja eliminación parcial'; end if;
      if state='approved' and (not exists(select 1 from solo_results where registration_id=person) or not exists(select 1 from solo_payments where registration_id=person)) then raise exception 'TEST: pierde resultados/pagos'; end if;
    end if;
  end loop;
  foreach state in array array['open','closed','playing'] loop
    insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
      values('Sala activa vacía',now()+interval '2 days',now()+interval '1 day',48,2,1,10,state) returning id into room;
    if state in('open','closed') and exists(select 1 from schema_migrations where version='035') then
      perform delete_solo_room(e,room,'Sala activa vacía');
      if exists(select 1 from solo_rooms where id=room) then raise exception 'TEST: 035 no elimina sala vacía'; end if;
    else
      begin perform delete_solo_room(e,room,'Sala activa vacía'); raise exception 'TEST: elimina sala activa no pausada';
      exception when raise_exception then if sqlerrm<>'Primero finaliza o cancela la sala antes de eliminarla' then raise; end if; end;
    end if;
  end loop;
end $$;
set local role anon;
do $$ begin
  begin perform delete_solo_room(current_edition_id(),current_setting('test.paused_delete_room')::uuid,'Pausada vacía'); raise exception 'TEST: anon elimina'; exception when insufficient_privilege then null; end;
end $$;
rollback;
