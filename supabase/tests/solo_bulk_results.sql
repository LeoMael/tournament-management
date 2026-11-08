begin;
do $$
declare e uuid:=current_edition_id(); room uuid; other_room uuid; a uuid; b uuid; outsider uuid; rows jsonb; saved jsonb; bad jsonb;
begin
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Carga masiva',now()+interval '2 days',now()+interval '1 day',48,2,1,10,'playing') returning id into room;
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Otra sala',now()+interval '2 days',now()+interval '1 day',48,2,1,10,'playing') returning id into other_room;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
  values(room,gen_random_uuid(),'a','Jugador Uno','999999999','Uno',gen_random_uuid()::text||'.png',2,'approved') returning id into a;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
  values(room,gen_random_uuid(),'b','Jugador Dos','999999998','Dos',gen_random_uuid()::text||'.png',2,'approved') returning id into b;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
  values(other_room,gen_random_uuid(),'c','Jugador Tres','999999997','Tres',gen_random_uuid()::text||'.png',2,'approved') returning id into outsider;
  rows:=jsonb_build_array(jsonb_build_object('registration_id',a,'kills',4,'booyah',true),jsonb_build_object('registration_id',b,'kills',0,'booyah',false));
  saved:=save_solo_results(e,room,rows);
  if jsonb_array_length(saved)<>2 or (select kills from solo_results where registration_id=a)<>4 then raise exception 'TEST: no guardó tabla completa'; end if;
  -- Cambiar ganador funciona aunque el anterior aparezca después en el lote.
  rows:=jsonb_build_array(jsonb_build_object('registration_id',b,'kills',7,'booyah',true),jsonb_build_object('registration_id',a,'kills',4,'booyah',false));
  perform save_solo_results(e,room,rows);
  if not (select booyah from solo_results where registration_id=b) or (select booyah from solo_results where registration_id=a) then raise exception 'TEST: no cambió Booyah'; end if;
  saved:=(select jsonb_agg(to_jsonb(s) order by registration_id) from solo_results s where room_id=room);
  foreach bad in array array[
    jsonb_set(rows,'{1,kills}','-1'), jsonb_set(rows,'{1,kills}','1.5'), jsonb_set(rows,'{1,kills}','1001'),
    jsonb_set(rows,'{1,kills}','null'), jsonb_set(rows,'{1,booyah}','true'),
    jsonb_build_array(rows->0), jsonb_build_array(rows->0,rows->0),
    jsonb_set(rows,'{1,registration_id}',to_jsonb(outsider))
  ] loop
    begin
      perform save_solo_results(e,room,bad);
      raise exception 'TEST: aceptó lote inválido';
    exception when raise_exception then
      if sqlerrm='TEST: aceptó lote inválido' then raise; end if;
    end;
    if saved is distinct from (select jsonb_agg(to_jsonb(s) order by registration_id) from solo_results s where room_id=room) then raise exception 'TEST: guardado parcial'; end if;
  end loop;
  begin
    perform save_solo_results(gen_random_uuid(),room,rows); raise exception 'TEST: edición antigua';
  exception when raise_exception then if sqlerrm <> 'La edición cambió. Actualiza la página.' then raise; end if; end;
  -- Revisor puede guardar; editor y anónimo no.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  perform save_solo_results(e,room,rows);
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
  begin perform save_solo_results(e,room,rows); raise exception 'TEST: editor guarda resultados';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  perform manage_solo('finish',jsonb_build_object('edition_id',e,'room_id',room));
  if (select amount from solo_payments where registration_id=b)<>17 then raise exception 'TEST: ganancia incorrecta'; end if;
  begin perform save_solo_results(e,room,rows); raise exception 'TEST: altera sala finalizada';
  exception when raise_exception then if sqlerrm <> 'Solo se pueden editar resultados durante la partida' then raise; end if; end;
end $$;
set local role anon;
do $$ begin
  begin perform save_solo_results(null,null,'[]'); raise exception 'TEST: anon guarda resultados';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
