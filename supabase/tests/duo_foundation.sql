begin;
do $$
declare e uuid:=current_edition_id(); payload jsonb; result jsonb; room uuid; kills_room uuid; kills_payload jsonb; bad jsonb; before_data jsonb; action text;
begin
  payload:=jsonb_build_object('edition_id',e,'name','  Dúo Top prueba  ','mode','top','capacity',24,'entry_price',4,
    'scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','top_prizes',jsonb_build_array(100,60,40,20));
  result:=manage_duo_room_draft('create',payload); room:=(result->>'id')::uuid;
  if result->>'status'<>'draft' or (result->>'rewarded_places')::int<>4 then raise exception 'TEST: creación Top incorrecta'; end if;
  if not exists(select 1 from duo_rooms where id=room and name='Dúo Top prueba' and capacity=24 and entry_price=4 and kill_reward=0 and booyah_reward=0) then raise exception 'TEST: datos del borrador incorrectos'; end if;
  if (select array_agg(place order by place) from duo_room_prizes where room_id=room)<>array[1,2,3,4]
    or (select sum(amount) from duo_room_prizes where room_id=room)<>220 then raise exception 'TEST: premios Top mal asignados'; end if;
  set constraints all immediate;
  set constraints all deferred;
  result:=manage_duo_room_draft('edit',payload||jsonb_build_object('room_id',room,'name','Top hasta 2','top_prizes',jsonb_build_array(50.25,25.10)));
  if (result->>'id')::uuid<>room or (select count(*) from duo_room_prizes where room_id=room)<>2 then raise exception 'TEST: edición duplica sala o deja premios anteriores'; end if;
  result:=manage_duo_room_draft('edit',payload||jsonb_build_object('room_id',room,'top_prizes',jsonb_build_array(80,40,20,10,5,0)));
  if (result->>'rewarded_places')::int<>6 or (select amount from duo_room_prizes where room_id=room and place=6)<>0 then raise exception 'TEST: no permite más de cuatro puestos o un premio cero'; end if;
  set constraints all immediate;
  set constraints all deferred;
  select jsonb_build_object('room',to_jsonb(r),'prizes',(select jsonb_agg(to_jsonb(p) order by place) from duo_room_prizes p where room_id=room)) into before_data from duo_rooms r where id=room;
  foreach bad in array array[
    jsonb_build_object('name',' '),jsonb_build_object('mode','solo'),jsonb_build_object('capacity',1),jsonb_build_object('capacity',51),jsonb_build_object('capacity',2.5),jsonb_build_object('capacity','24'),
    jsonb_build_object('entry_price',-1),jsonb_build_object('entry_price',0.001),jsonb_build_object('entry_price','4'),jsonb_build_object('kill_reward',null),jsonb_build_object('booyah_reward',1000001),
    jsonb_build_object('kill_reward',1),jsonb_build_object('booyah_reward',1),jsonb_build_object('top_prizes',jsonb_build_array()),jsonb_build_object('top_prizes',jsonb_build_array(-1)),
    jsonb_build_object('top_prizes',jsonb_build_array(1.001)),jsonb_build_object('top_prizes',jsonb_build_array('100')),jsonb_build_object('top_prizes',jsonb_build_array(null)),
    jsonb_build_object('top_prizes',jsonb_build_array(1000001)),jsonb_build_object('top_prizes','bad'),jsonb_build_object('capacity',2,'top_prizes',jsonb_build_array(10,9,8)),
    jsonb_build_object('scheduled_at',null),jsonb_build_object('scheduled_at','bad-date'),jsonb_build_object('closes_at','infinity'),jsonb_build_object('closes_at',now()+interval '3 days')
  ] loop
    begin perform manage_duo_room_draft('edit',payload||bad||jsonb_build_object('room_id',room)); raise exception 'TEST: acepta configuración inválida: %',bad;
    exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
    if before_data is distinct from (select jsonb_build_object('room',to_jsonb(r),'prizes',(select jsonb_agg(to_jsonb(p) order by place) from duo_room_prizes p where room_id=room)) from duo_rooms r where id=room) then raise exception 'TEST: error deja cambios parciales'; end if;
  end loop;
  foreach action in array array['open','review','result','finish','pay'] loop
    begin perform manage_duo_room_draft(action,payload||jsonb_build_object('room_id',room)); raise exception 'TEST: habilita flujo Dúo incompleto';
    exception when raise_exception then if sqlerrm<>'En este paso Dúo solo permite crear, editar o eliminar borradores' then raise; end if; end;
  end loop;
  if not exists(select 1 from schema_migrations where version='031') then
    begin update duo_rooms set status='open' where id=room; raise exception 'TEST: abre Dúo en el paso 1'; exception when check_violation then null; end;
  end if;
  begin perform manage_duo_room_draft('edit',payload||jsonb_build_object('room_id',room,'edition_id',gen_random_uuid())); raise exception 'TEST: modifica otra edición';
  exception when raise_exception then if sqlerrm not like 'La edición cambió%' then raise; end if; end;
  -- Integridad diferida: ni siquiera un escritor privilegiado puede confirmar un Top incompleto.
  begin
    delete from duo_room_prizes where room_id=room and place=1;
    set constraints all immediate;
    raise exception 'TEST: permite un hueco de premios';
  exception when raise_exception then if sqlerrm not like 'Completa los premios Top consecutivos%' then raise; end if; end;
  begin
    update duo_rooms set rewarded_places=7 where id=room;
    set constraints all immediate;
    raise exception 'TEST: permite cantidad incongruente de puestos';
  exception when raise_exception then if sqlerrm not like 'Completa los premios Top consecutivos%' then raise; end if; end;
  -- Las modalidades pueden cambiarse solo mientras sigan siendo borradores.
  result:=manage_duo_room_draft('edit',payload||jsonb_build_object('room_id',room,'mode','kills','kill_reward',1.25,'booyah_reward',10,'top_prizes',jsonb_build_array()));
  if exists(select 1 from duo_room_prizes where room_id=room) or (select rewarded_places from duo_rooms where id=room)<>0 then raise exception 'TEST: mezcla Top con kills'; end if;
  set constraints all immediate;
  set constraints all deferred;
  result:=manage_duo_room_draft('edit',payload||jsonb_build_object('room_id',room));
  if (select count(*) from duo_room_prizes where room_id=room)<>4 then raise exception 'TEST: no vuelve a Top'; end if;
  kills_payload:=payload||jsonb_build_object('name','Dúo kills prueba','mode','kills','kill_reward',1,'booyah_reward',10,'top_prizes',jsonb_build_array());
  result:=manage_duo_room_draft('create',kills_payload); kills_room:=(result->>'id')::uuid;
  if not exists(select 1 from duo_rooms where id=kills_room and mode='kills' and rewarded_places=0 and kill_reward=1 and booyah_reward=10) then raise exception 'TEST: no configura Dúo kills'; end if;
  begin perform manage_duo_room_draft('create',kills_payload||jsonb_build_object('top_prizes',jsonb_build_array(10))); raise exception 'TEST: kills admite premios Top';
  exception when raise_exception then if sqlerrm<>'Dúo por kills no utiliza premios fijos por puesto' then raise; end if; end;
  begin insert into duo_room_prizes values(kills_room,e,1,100); raise exception 'TEST: tabla permite Top en kills';
  exception when raise_exception then if sqlerrm<>'El puesto no pertenece a los premios Top de esta sala' then raise; end if; end;
  begin perform manage_duo_room_draft('delete',jsonb_build_object('edition_id',e,'room_id',kills_room,'confirmation','Incorrecto')); raise exception 'TEST: elimina sin nombre';
  exception when raise_exception then if sqlerrm<>'Escribe el nombre exacto de la sala Dúo' then raise; end if; end;
  perform manage_duo_room_draft('delete',jsonb_build_object('edition_id',e,'room_id',kills_room,'confirmation','Dúo kills prueba'));
  if exists(select 1 from duo_rooms where id=kills_room) then raise exception 'TEST: no elimina borrador'; end if;
  if not exists(select 1 from audit_log where table_name='duo_rooms' and row_key=kills_room::text and op='DELETE')
    or not exists(select 1 from audit_log where table_name='duo_room_prizes' and op='INSERT' and new_data->>'room_id'=room::text) then raise exception 'TEST: configuración no auditada'; end if;
  result:=manage_duo_room_draft('create',payload||jsonb_build_object('name','Top descartable'));
  kills_room:=(result->>'id')::uuid;
  perform manage_duo_room_draft('delete',jsonb_build_object('edition_id',e,'room_id',kills_room,'confirmation','Top descartable'));
  if exists(select 1 from duo_room_prizes where room_id=kills_room) then raise exception 'TEST: borrado Top deja premios huérfanos'; end if;
  if not exists(select 1 from audit_log where table_name='duo_room_prizes' and op='DELETE' and old_data->>'room_id'=kills_room::text) then raise exception 'TEST: cascada sin auditoría'; end if;
  perform set_config('test.duo_room',room::text,true);
  perform set_config('test.duo_payload',payload::text,true);
  set constraints all immediate;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from duo_rooms)<>1 or (select count(*) from duo_room_prizes)<>4 then raise exception 'TEST: admin no ve borradores/premios'; end if;
  begin update duo_rooms set name='Directo'; raise exception 'TEST: cliente escribe tablas directamente'; exception when insufficient_privilege then null; end;
  begin delete from duo_room_prizes; raise exception 'TEST: cliente borra premios directamente'; exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ declare a text; begin
  if not exists(select 1 from duo_rooms) then raise exception 'TEST: árbitro no puede consultar'; end if;
  foreach a in array array['create','edit','delete'] loop
    begin perform manage_duo_room_draft(a,current_setting('test.duo_payload')::jsonb); raise exception 'TEST: árbitro modifica configuración'; exception when insufficient_privilege then null; end;
  end loop;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin
  if exists(select 1 from duo_rooms) or exists(select 1 from duo_room_prizes) then raise exception 'TEST: editor ve configuración Dúo'; end if;
  begin perform manage_duo_room_draft('create',current_setting('test.duo_payload')::jsonb); raise exception 'TEST: editor crea sala'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform 1 from duo_rooms; raise exception 'TEST: anon ve borradores'; exception when insufficient_privilege then null; end;
  begin perform 1 from duo_room_prizes; raise exception 'TEST: anon ve premios privados'; exception when insufficient_privilege then null; end;
  begin perform manage_duo_room_draft('create','{}'); raise exception 'TEST: anon crea sala'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ declare e uuid:=current_edition_id(); r uuid:=current_setting('test.duo_room')::uuid; baseline jsonb; public_data jsonb; begin
  select jsonb_build_object('room',to_jsonb(x),'prizes',(select jsonb_agg(to_jsonb(p) order by place) from duo_room_prizes p where room_id=r)) into baseline from duo_rooms x where id=r;
  -- La preparación Dúo no bloquea el cierre vigente de Solo/equipos ni pierde borradores.
  perform close_tournament_edition(e,(select name from tournament_editions where id=e),'Siguiente tras base Dúo',now()+interval '30 days');
  if baseline is distinct from (select jsonb_build_object('room',to_jsonb(x),'prizes',(select jsonb_agg(to_jsonb(p) order by place) from duo_room_prizes p where room_id=r)) from duo_rooms x where id=r) then raise exception 'TEST: cierre modifica o pierde borradores Dúo'; end if;
  select data into public_data from tournament_archive_public where edition_id=e;
  if public_data ? 'duo_rooms' or public_data::text like '%Dúo Top prueba%' then raise exception 'TEST: publica borradores Dúo'; end if;
  begin perform manage_duo_room_draft('edit',current_setting('test.duo_payload')::jsonb||jsonb_build_object('room_id',r)); raise exception 'TEST: modifica edición archivada';
  exception when raise_exception then if sqlerrm not like 'La edición cambió%' then raise; end if; end;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin if exists(select 1 from duo_rooms) then raise exception 'TEST: árbitro ve borradores de otra edición'; end if; end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ begin if not exists(select 1 from duo_rooms) then raise exception 'TEST: admin pierde consulta privada del borrador anterior'; end if; end $$;
rollback;
