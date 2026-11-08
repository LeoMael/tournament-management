begin;
do $$
declare e uuid:=current_edition_id(); room uuid; reg uuid; s text;
begin
  -- Las salas vacías en borrador y canceladas se borran y dejan auditoría.
  foreach s in array array['draft','cancelled','open','closed','playing','finished'] loop
    insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
    values('Sala de prueba',now()+interval '2 days',now()+interval '1 day',2,3,1,10,s) returning id into room;
    if s in ('draft','cancelled') then
      perform delete_empty_solo_room(e,room);
      if exists(select 1 from solo_rooms where id=room) then raise exception 'TEST: no eliminó sala vacía'; end if;
      if not exists(select 1 from audit_log where table_name='solo_rooms' and op='DELETE' and row_key=room::text) then
        raise exception 'TEST: falta auditoría de eliminación';
      end if;
    else
      begin
        perform delete_empty_solo_room(e,room);
        raise exception 'TEST: eliminó sala activa o finalizada';
      exception when raise_exception then
        if sqlerrm <> 'Solo puedes eliminar salas en borrador o canceladas' then raise; end if;
      end;
    end if;
  end loop;

  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Con historial',now()+interval '2 days',now()+interval '1 day',2,3,1,10,'cancelled') returning id into room;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
  values(room,gen_random_uuid(),'test','Jugador Prueba','999999999','Player',gen_random_uuid()::text||'.png',3,'rejected') returning id into reg;
  begin
    perform delete_empty_solo_room(e,room);
    raise exception 'TEST: eliminó sala con solicitud rechazada';
  exception when raise_exception then
    if sqlerrm <> 'Esta sala tiene inscripciones o resultados y debe conservarse en el historial' then raise; end if;
  end;
  update solo_registrations set status='refunded' where id=reg;
  insert into solo_payments(registration_id,kind,amount,paid_at) values(reg,'refund',3,now());
  begin
    perform delete_empty_solo_room(e,room);
    raise exception 'TEST: eliminó sala con devolución liquidada';
  exception when raise_exception then
    if sqlerrm <> 'Esta sala tiene inscripciones o resultados y debe conservarse en el historial' then raise; end if;
  end;
  if not exists(select 1 from solo_payments where registration_id=reg) then raise exception 'TEST: perdió pago'; end if;
  begin
    perform delete_empty_solo_room(gen_random_uuid(),room);
    raise exception 'TEST: permite edición antigua';
  exception when raise_exception then
    if sqlerrm <> 'La edición cambió. Actualiza la página.' then raise; end if;
  end;
  begin
    perform delete_empty_solo_room(e,gen_random_uuid());
    raise exception 'TEST: permite sala inexistente';
  exception when raise_exception then
    if sqlerrm <> 'Sala no encontrada. Actualiza la lista.' then raise; end if;
  end;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin
  begin perform delete_empty_solo_room(current_edition_id(),gen_random_uuid()); raise exception 'TEST: revisor elimina sala';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin
  begin perform delete_empty_solo_room(current_edition_id(),gen_random_uuid()); raise exception 'TEST: editor elimina sala';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform delete_empty_solo_room(null,gen_random_uuid()); raise exception 'TEST: anon elimina sala';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
