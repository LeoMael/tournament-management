-- Solo: nuevas solicitudes sin datos académicos; conserva los anteriores.
begin;
do $$
declare e uuid:=current_edition_id(); room uuid; ids uuid[]:='{}'; snapshot jsonb;
  payload jsonb; retry_payload jsonb; response jsonb; path text; i integer;
begin
  update tournament_settings set registration_open=true,solo_enabled=true,registration_deadline=now()+interval '20 days';
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Educación opcional Solo',now()+interval '2 days',now()+interval '1 day',8,2,1,10,'open') returning id into room;
  for i in 1..6 loop
    path:=gen_random_uuid()::text||'.png';
    insert into storage.objects(bucket_id,name,metadata) values('receipts',path,'{"mimetype":"image/png","size":100}');
    payload:=jsonb_build_object('edition_id',e,'room_id',room,'request_id',gen_random_uuid(),
      'full_name','Jugador Prueba '||i,'whatsapp',(900000000+i)::text,'nickname','Jugador '||i,'receipt_path',path);
    if i<=3 then
      payload:=payload||jsonb_build_object('institution','Universidad '||i,'professional_school','Carrera '||i);
    elsif i=5 then
      payload:=payload||jsonb_build_object('institution','','professional_school','');
    elsif i=6 then
      payload:=payload||jsonb_build_object('institution',null,'professional_school',null);
    end if;
    response:=submit_solo_registration(payload);
    if i<=3 then
      ids:=array_append(ids,(response->>'id')::uuid);
      perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',response->>'id','status','approved'));
      if i=3 then select jsonb_agg(to_jsonb(p) order by id) into snapshot from solo_registrations p where id=any(ids); end if;
    else
      if not exists(select 1 from solo_registrations where id=(response->>'id')::uuid
        and institution='' and professional_school='' and amount_due=2 and status='pending') then
        raise exception 'TEST: campos vacíos, nulos u omitidos no aceptados';
      end if;
      if i=4 then retry_payload:=payload; end if;
    end if;
  end loop;
  if snapshot is distinct from (select jsonb_agg(to_jsonb(p) order by id) from solo_registrations p where id=any(ids)) then
    raise exception 'TEST: nuevas solicitudes alteraron participantes anteriores';
  end if;
  for i in 1..3 loop
    if not exists(select 1 from solo_registrations where id=ids[i] and institution='Universidad '||i and professional_school='Carrera '||i and slot=i) then
      raise exception 'TEST: datos anteriores o slots no conservados';
    end if;
  end loop;
  perform submit_solo_registration(retry_payload);
  if (select count(*) from solo_registrations where room_id=room)<>6 then raise exception 'TEST: reintento sin datos académicos duplicó inscripción'; end if;
end $$;
rollback;
