begin;
do $$
declare edition uuid:=current_edition_id(); kind text; room_payload jsonb; room_data jsonb; room_key uuid;
  registration_payload jsonb; saved jsonb; person_a uuid; person_b uuid; person_c uuid; person_d uuid;
  receipt text; first_receipt text; old_receipt text; old_solo_room uuid; row_data jsonb; before_data jsonb; prices jsonb; config jsonb;
begin
  update tournament_settings set registration_open=true,solo_enabled=true,registration_deadline=now()+interval '20 days';
  foreach kind in array array['solo_top','duo_top','duo_kills'] loop
    room_payload:=jsonb_build_object('edition_id',edition,'name','Revisión '||kind,'capacity',3,'entry_price',4,
      'scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','top_prizes',jsonb_build_array(100,50));
    if kind='solo_top' then room_data:=manage_solo_top_room_draft('create',room_payload);
    else
      room_payload:=room_payload||jsonb_build_object('mode',case when kind='duo_top' then 'top' else 'kills' end);
      if kind='duo_kills' then room_payload:=room_payload||jsonb_build_object('top_prizes',jsonb_build_array(),'kill_reward',1,'booyah_reward',10); end if;
      room_data:=manage_duo_room_draft('create',room_payload);
    end if;
    room_key:=(room_data->>'id')::uuid;
    config:=jsonb_build_object('edition_id',edition,'room_kind',kind,'room_id',room_key);
    if exists(select 1 from public_ff_rooms where id=room_key and room_kind=kind) then raise exception 'TEST: publica borrador oculto'; end if;
    perform manage_ff_room('announce',config||jsonb_build_object('is_announced',true));
    if not exists(select 1 from public_ff_rooms where id=room_key and status='draft' and is_announced) then raise exception 'TEST: no anuncia'; end if;
    receipt:=gen_random_uuid()::text||'.png';
    insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
    registration_payload:=jsonb_build_object('edition_id',edition,'room_kind',kind,'room_id',room_key,'request_id',gen_random_uuid(),
      'full_name','Titular de inscripción','whatsapp','987654321','prize_yape_phone','912345678','nickname_1','Jugador A '||kind,'receipt_path',receipt,'amount_due',999);
    if kind<>'solo_top' then registration_payload:=registration_payload||jsonb_build_object('nickname_2','Compañero A '||kind); end if;
    begin perform submit_ff_room_registration(registration_payload); raise exception 'TEST: inscribe borrador anunciado';
    exception when raise_exception then if sqlerrm<>'Esta sala no admite inscripciones' then raise; end if; end;
    perform manage_ff_room('open',config);
    if not exists(select 1 from public_ff_rooms where id=room_key and status='open') then raise exception 'TEST: no abre'; end if;
    saved:=submit_ff_room_registration(registration_payload); person_a:=(saved->>'id')::uuid; first_receipt:=receipt;
    if (saved->>'amount_due')::numeric<>4 or (select slot from ff_room_registrations where id=person_a) is not null then raise exception 'TEST: tarifa o slot pendiente incorrectos'; end if;
    if not exists(select 1 from ff_room_registrations where id=person_a and whatsapp='987654321' and prize_yape_phone='912345678') then raise exception 'TEST: mezcla teléfonos'; end if;
    if submit_ff_room_registration(registration_payload)<>saved then raise exception 'TEST: reintento duplica inscripción'; end if;
    begin perform submit_ff_room_registration(registration_payload||jsonb_build_object('nickname_1','Otro nickname')); raise exception 'TEST: permite reutilizar intento con otro contenido';
    exception when raise_exception then if sqlerrm<>'Este intento ya fue enviado con otros datos' then raise; end if; end;
    before_data:=ff_room_data(kind,room_key);
    begin
      if kind='solo_top' then update solo_top_rooms set entry_price=99 where id=room_key;
      else update duo_rooms set entry_price=99 where id=room_key; end if;
      raise exception 'TEST: modifica tarifa abierta';
    exception when raise_exception then if sqlerrm<>'Las condiciones de la sala quedaron fijadas al abrir inscripciones' then raise; end if; end;
    if before_data is distinct from ff_room_data(kind,room_key) then raise exception 'TEST: error altera condiciones'; end if;
    receipt:=gen_random_uuid()::text||'.png';
    insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
    saved:=submit_ff_room_registration(registration_payload||jsonb_build_object('request_id',gen_random_uuid(),'nickname_1','Jugador B '||kind,
      'nickname_2',case when kind='solo_top' then null else 'Compañero B '||kind end,'receipt_path',receipt));
    person_b:=(saved->>'id')::uuid;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
    saved:=review_ff_room_registration(edition,kind,room_key,person_b,'approved','');
    if (saved->>'slot')::int<>1 then raise exception 'TEST: primera aprobación no recibe slot 1'; end if;
    saved:=review_ff_room_registration(edition,kind,room_key,person_a,'approved','');
    if (saved->>'slot')::int<>2 then raise exception 'TEST: segunda aprobación no recibe slot 2'; end if;
    begin perform review_ff_room_registration(edition,kind,room_key,person_a,'approved',''); raise exception 'TEST: revisa dos veces';
    exception when raise_exception then if sqlerrm not like 'La solicitud ya fue revisada%' then raise; end if; end;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
    before_data:=(select to_jsonb(r) from ff_room_registrations r where id=person_a);
    perform delete_ff_room_registration(edition,kind,room_key,person_b,concat_ws(' / ','Jugador B '||kind,case when kind='solo_top' then null else 'Compañero B '||kind end));
    if before_data is distinct from (select to_jsonb(r) from ff_room_registrations r where id=person_a) then raise exception 'TEST: borrar renumera otro participante'; end if;
    receipt:=gen_random_uuid()::text||'.png';
    insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
    if kind<>'solo_top' then
      begin perform submit_ff_room_registration(registration_payload||jsonb_build_object('request_id',gen_random_uuid(),'nickname_1','Nuevo','nickname_2','Jugador A '||kind,'receipt_path',receipt)); raise exception 'TEST: duplica jugador como segundo integrante';
      exception when raise_exception then if sqlerrm<>'Uno de los nicknames ya está inscrito en esta sala' then raise; end if; end;
      begin perform submit_ff_room_registration(registration_payload||jsonb_build_object('request_id',gen_random_uuid(),'nickname_1','Igual','nickname_2','igual','receipt_path',receipt)); raise exception 'TEST: dúo con el mismo jugador';
      exception when check_violation then null; end;
    end if;
    saved:=submit_ff_room_registration(registration_payload||jsonb_build_object('request_id',gen_random_uuid(),'nickname_1','Jugador C '||kind,
      'nickname_2',case when kind='solo_top' then null else 'Compañero C '||kind end,'receipt_path',receipt));
    person_c:=(saved->>'id')::uuid;
    saved:=review_ff_room_registration(edition,kind,room_key,person_c,'approved','');
    if (saved->>'slot')::int<>1 then raise exception 'TEST: no reutiliza slot libre'; end if;
    receipt:=gen_random_uuid()::text||'.png';
    insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
    saved:=submit_ff_room_registration(registration_payload||jsonb_build_object('request_id',gen_random_uuid(),'nickname_1','Jugador D '||kind,
      'nickname_2',case when kind='solo_top' then null else 'Compañero D '||kind end,'receipt_path',receipt));
    person_d:=(saved->>'id')::uuid;
    if not exists(select 1 from public_ff_rooms where id=room_key and taken=3) then raise exception 'TEST: cupos no cuentan inscripciones completas'; end if;
    begin perform submit_ff_room_registration(registration_payload||jsonb_build_object('request_id',gen_random_uuid(),'nickname_1','Extra')); raise exception 'TEST: supera cupo';
    exception when raise_exception then if sqlerrm<>'La sala está completa' then raise; end if; end;
    perform review_ff_room_registration(edition,kind,room_key,person_d,'rejected','Solicitud de prueba');
    perform manage_ff_room('pause',config||jsonb_build_object('is_paused',true));
    if not exists(select 1 from public_ff_rooms where id=room_key and status='draft' and is_paused) then raise exception 'TEST: pausa no visible'; end if;
    if (submit_ff_room_registration(registration_payload)->>'id')::uuid<>person_a then raise exception 'TEST: reintento existente falla tras pausa'; end if;
    begin perform submit_ff_room_registration(registration_payload||jsonb_build_object('request_id',gen_random_uuid())); raise exception 'TEST: inscribe pausada';
    exception when raise_exception then if sqlerrm<>'Esta sala no admite inscripciones' then raise; end if; end;
    if not exists(select 1 from schema_migrations where version='035') then
      begin perform manage_ff_room('delete',config||jsonb_build_object('confirmation','Revisión '||kind)); raise exception 'TEST: elimina con inscritos';
      exception when raise_exception then if sqlerrm<>'Esta sala tiene inscripciones. Conserva su historial.' then raise; end if; end;
    end if;
    perform manage_ff_room('details',config||jsonb_build_object('name','Nombre nuevo '||kind,'scheduled_at',now()+interval '4 days','closes_at',now()+interval '3 days'));
    if not exists(select 1 from public_ff_rooms where id=room_key and name='Nombre nuevo '||kind and is_paused) then raise exception 'TEST: editar reabre o pierde nombre'; end if;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
    perform manage_ff_room('close',config);
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
    begin perform submit_ff_room_registration(registration_payload||jsonb_build_object('request_id',gen_random_uuid())); raise exception 'TEST: inscribe cerrada';
    exception when raise_exception then if sqlerrm<>'Esta sala no admite inscripciones' then raise; end if; end;
    if not exists(select 1 from schema_migrations where version='032') then
      begin perform manage_ff_room('start',config); raise exception 'TEST: expone resultados del paso 3';
      exception when raise_exception then if sqlerrm<>'Acción de sala no disponible en esta etapa' then raise; end if; end;
    end if;
    if (edition_close_preview()->'blockers'->>'Salas nuevas Free Fire sin terminar')::int<1 then raise exception 'TEST: cierre ignora sala activa'; end if;
    -- Simula la finalización que se implementará en el paso 3 para verificar el archivo.
    if kind='solo_top' then update solo_top_rooms set status='finished' where id=room_key;
    else update duo_rooms set status='finished' where id=room_key; end if;
    perform set_config('test.ff_room_kind',kind,true);
    perform set_config('test.ff_room_id',room_key::text,true);
    perform set_config('test.ff_person_id',person_a::text,true);
    perform set_config('test.ff_payload',registration_payload::text,true);
    perform set_config('test.ff_receipt',first_receipt,true);
  end loop;
  -- Un comprobante de las nuevas modalidades no puede reutilizarse desde Solo por kills.
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
    values('Solo compatibilidad',now()+interval '2 days',now()+interval '1 day',48,2,1,10,'open') returning id into old_solo_room;
  begin perform submit_solo_registration(jsonb_build_object('edition_id',edition,'room_id',old_solo_room,'request_id',gen_random_uuid(),
    'full_name','Jugador previo','nickname','Nick previo','whatsapp','988888888','receipt_path',current_setting('test.ff_receipt'))); raise exception 'TEST: Solo reutiliza comprobante nuevo';
  exception when raise_exception then if sqlerrm<>'Comprobante ya utilizado' then raise; end if; end;
  update solo_rooms set status='cancelled' where id=old_solo_room;
  -- Solicitud anónima real para una nueva sala Solo Top.
  room_payload:=jsonb_build_object('edition_id',edition,'name','Alta anónima','capacity',48,'entry_price',0,'scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','top_prizes',jsonb_build_array(10));
  room_data:=manage_solo_top_room_draft('create',room_payload||jsonb_build_object('name','Vacía para gestionar'));
  room_key:=(room_data->>'id')::uuid;
  config:=jsonb_build_object('edition_id',edition,'room_kind','solo_top','room_id',room_key,'confirmation','Vacía para gestionar');
  perform manage_ff_room('open',config);
  if not exists(select 1 from schema_migrations where version='035') then
    begin perform manage_ff_room('delete',config); raise exception 'TEST: elimina abierta sin pausar';
    exception when raise_exception then if sqlerrm<>'Pausa las inscripciones antes de eliminar la sala' then raise; end if; end;
  end if;
  perform manage_ff_room('pause',config||jsonb_build_object('is_paused',true));
  begin perform manage_ff_room('delete',config||jsonb_build_object('confirmation','Equivocado')); raise exception 'TEST: elimina sin nombre';
  exception when raise_exception then if sqlerrm<>'Escribe el nombre exacto de la sala' then raise; end if; end;
  perform manage_ff_room('delete',config);
  if exists(select 1 from solo_top_rooms where id=room_key) or exists(select 1 from solo_top_room_prizes where room_id=room_key) then raise exception 'TEST: borrado deja configuración'; end if;
  room_data:=manage_solo_top_room_draft('create',room_payload||jsonb_build_object('name','Vacía para gestionar'));
  room_key:=(room_data->>'id')::uuid;
  config:=config||jsonb_build_object('room_id',room_key);
  perform manage_ff_room('cancel',config);
  if not exists(select 1 from solo_top_rooms where id=room_key and status='cancelled') then raise exception 'TEST: cancelación incorrecta'; end if;
  perform manage_ff_room('delete',config);
  room_data:=manage_solo_top_room_draft('create',room_payload); room_key:=(room_data->>'id')::uuid;
  perform manage_ff_room('open',jsonb_build_object('edition_id',edition,'room_kind','solo_top','room_id',room_key));
  receipt:=gen_random_uuid()::text||'.png';
  insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
  perform set_config('test.ff_anon_payload',jsonb_build_object('edition_id',edition,'room_kind','solo_top','room_id',room_key,'request_id',gen_random_uuid(),
    'full_name','Pagador anónimo','whatsapp','944444444','prize_yape_phone','933333333','nickname_1','Jugador público','receipt_path',receipt)::text,true);
  perform set_config('test.ff_anon_room',room_key::text,true);
end $$;
set local role anon;
do $$ declare result jsonb; begin
  result:=submit_ff_room_registration(current_setting('test.ff_anon_payload')::jsonb);
  if (result->>'amount_due')::numeric<>0 then raise exception 'TEST: solicitud anónima falla'; end if;
  begin perform 1 from ff_room_registrations; raise exception 'TEST: anon lee teléfonos'; exception when insufficient_privilege then null; end;
  begin perform ff_room_data('solo_top',current_setting('test.ff_anon_room')::uuid); raise exception 'TEST: anon llama helper privado'; exception when insufficient_privilege then null; end;
  begin perform manage_ff_room('open','{}'); raise exception 'TEST: anon gestiona sala'; exception when insufficient_privilege then null; end;
  if not exists(select 1 from public_ff_rooms where id=current_setting('test.ff_anon_room')::uuid) then raise exception 'TEST: anon no consulta proyección pública'; end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin
  if not exists(select 1 from ff_room_registrations) then raise exception 'TEST: árbitro no consulta'; end if;
  begin perform manage_ff_room('open',jsonb_build_object('edition_id',current_edition_id(),'room_kind',current_setting('test.ff_room_kind'),'room_id',current_setting('test.ff_room_id'))); raise exception 'TEST: árbitro abre'; exception when insufficient_privilege then null; end;
  begin perform delete_ff_room_registration(current_edition_id(),current_setting('test.ff_room_kind'),current_setting('test.ff_room_id')::uuid,current_setting('test.ff_person_id')::uuid,'wrong'); raise exception 'TEST: árbitro elimina'; exception when insufficient_privilege then null; end;
  begin update ff_room_registrations set slot=99; raise exception 'TEST: cliente cambia slot'; exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin if exists(select 1 from ff_room_registrations) then raise exception 'TEST: editor lee teléfonos'; end if; end $$;
reset role;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ declare edition uuid:=current_edition_id(); archive jsonb; begin
  perform review_ff_room_registration(edition,'solo_top',current_setting('test.ff_anon_room')::uuid,
    (select id from ff_room_registrations where request_id=(current_setting('test.ff_anon_payload')::jsonb->>'request_id')::uuid),'approved','');
  update solo_top_rooms set status='finished' where id=current_setting('test.ff_anon_room')::uuid;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name in('public_ff_rooms','public_ff_room_prizes') and column_name in('whatsapp','prize_yape_phone','receipt_path','full_name','room_password')) then raise exception 'TEST: proyección pública expone datos privados'; end if;
  perform close_tournament_edition(edition,(select name from tournament_editions where id=edition),'Siguiente con nuevas salas',now()+interval '30 days');
  if not exists(select 1 from tournament_archive_records where edition_id=edition and source='ff_room_registrations' and data->>'prize_yape_phone'='912345678') then raise exception 'TEST: pierde archivo privado'; end if;
  if not exists(select 1 from tournament_archive_assets where edition_id=edition and bucket='receipts' and path=current_setting('test.ff_receipt')) then raise exception 'TEST: comprobante archivado queda desprotegido'; end if;
  select data into archive from tournament_archive_public where edition_id=edition;
  if archive::text like '%912345678%' or archive ? 'ff_room_registrations' then raise exception 'TEST: archivo público filtra teléfono'; end if;
  if not archive ? 'public_ff_rooms' then raise exception 'TEST: no conserva proyección pública'; end if;
  begin perform submit_ff_room_registration(current_setting('test.ff_payload')::jsonb); raise exception 'TEST: acepta edición anterior';
  exception when raise_exception then if sqlerrm not like 'La edición cambió%' then raise; end if; end;
end $$;
rollback;
