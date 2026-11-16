begin;
do $$
declare
  edition uuid:=current_edition_id();
  payload jsonb;
  saved jsonb;
  target_room uuid;
  discarded_room uuid;
  snapshot jsonb;
  bad jsonb;
  action text;
begin
  payload:=jsonb_build_object(
    'edition_id',edition,'name','  Solo Top prueba  ','capacity',48,'entry_price',2,
    'scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day',
    'top_prizes',jsonb_build_array(100,60,40,20)
  );
  saved:=manage_solo_top_room_draft('create',payload);
  target_room:=(saved->>'id')::uuid;
  if saved->>'participation'<>'solo' or saved->>'mode'<>'top' or saved->>'status'<>'draft'
    or (saved->>'rewarded_places')::int<>4 then raise exception 'TEST: modalidad o puestos incorrectos'; end if;
  if not exists(select 1 from solo_top_rooms where id=target_room and name='Solo Top prueba' and capacity=48 and entry_price=2)
    or (select array_agg(p.amount order by p.place) from solo_top_room_prizes p where p.room_id=target_room)<>array[100,60,40,20]::numeric[] then
    raise exception 'TEST: borrador o premios individuales incorrectos';
  end if;
  set constraints all immediate;
  set constraints all deferred;
  saved:=manage_solo_top_room_draft('edit',payload||jsonb_build_object('room_id',target_room,'top_prizes',jsonb_build_array(50.25)));
  if (saved->>'id')::uuid<>target_room or (saved->>'rewarded_places')::int<>1 then raise exception 'TEST: edición no conserva sala'; end if;
  saved:=manage_solo_top_room_draft('edit',payload||jsonb_build_object('room_id',target_room,'top_prizes',jsonb_build_array(50,40,30,20,10,0)));
  if (select count(*) from solo_top_room_prizes p where p.room_id=target_room)<>6 then raise exception 'TEST: no permite configurar más de cuatro puestos'; end if;
  set constraints all immediate;
  set constraints all deferred;
  select jsonb_build_object('room',to_jsonb(r),'prizes',(select jsonb_agg(to_jsonb(p) order by place) from solo_top_room_prizes p where p.room_id=target_room))
    into snapshot from solo_top_rooms r where id=target_room;
  foreach bad in array array[
    jsonb_build_object('name',' '),jsonb_build_object('capacity',1),jsonb_build_object('capacity',101),
    jsonb_build_object('capacity',2.5),jsonb_build_object('capacity','48'),
    jsonb_build_object('entry_price',-1),jsonb_build_object('entry_price',10001),
    jsonb_build_object('entry_price',0.001),jsonb_build_object('entry_price','2'),
    jsonb_build_object('top_prizes',jsonb_build_array()),jsonb_build_object('top_prizes','wrong'),
    jsonb_build_object('top_prizes',jsonb_build_array(-1)),jsonb_build_object('top_prizes',jsonb_build_array(1000001)),
    jsonb_build_object('top_prizes',jsonb_build_array('10')),jsonb_build_object('top_prizes',jsonb_build_array(null)),
    jsonb_build_object('top_prizes',jsonb_build_array(1.001)),
    jsonb_build_object('capacity',2,'top_prizes',jsonb_build_array(10,9,8)),
    jsonb_build_object('kill_reward',1),jsonb_build_object('booyah_reward',10),
    jsonb_build_object('scheduled_at',null),jsonb_build_object('closes_at','infinity'),
    jsonb_build_object('scheduled_at','bad-date'),jsonb_build_object('closes_at',now()+interval '3 days')
  ] loop
    begin
      perform manage_solo_top_room_draft('edit',payload||bad||jsonb_build_object('room_id',target_room));
      raise exception 'TEST: acepta configuración inválida: %',bad;
    exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
    if snapshot is distinct from (select jsonb_build_object('room',to_jsonb(r),'prizes',(select jsonb_agg(to_jsonb(p) order by place) from solo_top_room_prizes p where p.room_id=target_room)) from solo_top_rooms r where id=target_room) then
      raise exception 'TEST: error deja cambios parciales';
    end if;
  end loop;
  begin
    delete from solo_top_room_prizes p where p.room_id=target_room and place=1;
    set constraints all immediate;
    raise exception 'TEST: permite un hueco de premios';
  exception when raise_exception then if sqlerrm not like 'Completa los premios consecutivos%' then raise; end if; end;
  foreach action in array array['open','review','result','finish','pay'] loop
    begin perform manage_solo_top_room_draft(action,payload); raise exception 'TEST: habilita una acción futura';
    exception when raise_exception then if sqlerrm not like 'En este paso Solo Top solo permite%' then raise; end if; end;
  end loop;
  if not exists(select 1 from schema_migrations where version='031') then
    begin update solo_top_rooms set status='open' where id=target_room; raise exception 'TEST: abre flujo parcial';
    exception when check_violation then null; end;
  end if;
  begin perform manage_solo_top_room_draft('edit',payload||jsonb_build_object('edition_id',gen_random_uuid(),'room_id',target_room)); raise exception 'TEST: edición equivocada';
  exception when raise_exception then if sqlerrm not like 'La edición cambió%' then raise; end if; end;
  saved:=manage_solo_top_room_draft('create',payload||jsonb_build_object('name','Solo Top descartable'));
  discarded_room:=(saved->>'id')::uuid;
  begin perform manage_solo_top_room_draft('delete',jsonb_build_object('edition_id',edition,'room_id',discarded_room,'confirmation','Otro nombre')); raise exception 'TEST: elimina sin confirmar nombre';
  exception when raise_exception then if sqlerrm<>'Escribe el nombre exacto de la sala Solo Top' then raise; end if; end;
  perform manage_solo_top_room_draft('delete',jsonb_build_object('edition_id',edition,'room_id',discarded_room,'confirmation','Solo Top descartable'));
  if exists(select 1 from solo_top_rooms where id=discarded_room) or exists(select 1 from solo_top_room_prizes p where p.room_id=discarded_room) then raise exception 'TEST: deja premios huérfanos'; end if;
  if not exists(select 1 from audit_log where table_name='solo_top_room_prizes' and op='DELETE' and old_data->>'room_id'=discarded_room::text) then raise exception 'TEST: borrado no auditado'; end if;
  perform set_config('test.solo_top_room',target_room::text,true);
  perform set_config('test.solo_top_payload',payload::text,true);
  set constraints all immediate;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from solo_top_rooms)<>1 then raise exception 'TEST: admin no consulta'; end if;
  begin update solo_top_rooms set name='Directo'; raise exception 'TEST: escritura directa'; exception when insufficient_privilege then null; end;
  begin delete from solo_top_room_prizes; raise exception 'TEST: borra premios directamente'; exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ declare action text; begin
  if not exists(select 1 from solo_top_rooms) or not exists(select 1 from solo_top_room_prizes) then raise exception 'TEST: árbitro no consulta'; end if;
  foreach action in array array['create','edit','delete'] loop
    begin perform manage_solo_top_room_draft(action,current_setting('test.solo_top_payload')::jsonb); raise exception 'TEST: árbitro configura'; exception when insufficient_privilege then null; end;
  end loop;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin
  if exists(select 1 from solo_top_rooms) or exists(select 1 from solo_top_room_prizes) then raise exception 'TEST: editor consulta'; end if;
  begin perform manage_solo_top_room_draft('create','{}'); raise exception 'TEST: editor configura'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform 1 from solo_top_rooms; raise exception 'TEST: anon consulta'; exception when insufficient_privilege then null; end;
  begin perform 1 from solo_top_room_prizes; raise exception 'TEST: anon consulta premios'; exception when insufficient_privilege then null; end;
  begin perform manage_solo_top_room_draft('create','{}'); raise exception 'TEST: anon configura'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ declare edition uuid:=current_edition_id(); snapshot jsonb; target_room uuid:=current_setting('test.solo_top_room')::uuid; archive jsonb; begin
  select jsonb_build_object('room',to_jsonb(r),'prizes',(select jsonb_agg(to_jsonb(p) order by place) from solo_top_room_prizes p where p.room_id=target_room)) into snapshot from solo_top_rooms r where id=target_room;
  perform close_tournament_edition(edition,(select name from tournament_editions where id=edition),'Tras base Solo Top',now()+interval '30 days');
  if snapshot is distinct from (select jsonb_build_object('room',to_jsonb(r),'prizes',(select jsonb_agg(to_jsonb(p) order by place) from solo_top_room_prizes p where p.room_id=target_room)) from solo_top_rooms r where id=target_room) then raise exception 'TEST: cierre pierde borrador'; end if;
  select data into archive from tournament_archive_public where edition_id=edition;
  if archive ? 'solo_top_rooms' or archive::text like '%Solo Top prueba%' then raise exception 'TEST: publica borradores'; end if;
  begin perform manage_solo_top_room_draft('edit',current_setting('test.solo_top_payload')::jsonb||jsonb_build_object('room_id',target_room)); raise exception 'TEST: edita borrador archivado';
  exception when raise_exception then if sqlerrm not like 'La edición cambió%' then raise; end if; end;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin if exists(select 1 from solo_top_rooms) then raise exception 'TEST: árbitro consulta otra edición'; end if; end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ begin if not exists(select 1 from solo_top_rooms) then raise exception 'TEST: admin pierde historial privado'; end if; end $$;
rollback;
