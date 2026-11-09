begin;
do $$
declare e uuid:=current_edition_id(); room uuid; direct_room uuid; payload jsonb; visible jsonb; before_room jsonb; before_count bigint; path text; result jsonb;
begin
  update tournament_settings set registration_open=true,solo_enabled=true,registration_deadline=now()+interval '20 days';
  result:=manage_solo('create',jsonb_build_object('edition_id',e,'name','Anuncio de prueba','scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','capacity',2,'entry_price',3,'kill_reward',1,'booyah_reward',10));
  room:=(result->>'id')::uuid;
  if (select is_announced from solo_rooms where id=room) is distinct from false then raise exception 'TEST: borrador nace anunciado'; end if;
  if exists(select 1 from public_solo_rooms where id=room) then raise exception 'TEST: borrador oculto visible'; end if;
  select to_jsonb(r)-'is_announced' into before_room from solo_rooms r where id=room;
  select count(*) into before_count from solo_registrations;
  perform set_solo_room_announcement(e,room,true);
  if before_room is distinct from (select to_jsonb(r)-'is_announced' from solo_rooms r where id=room) then raise exception 'TEST: anunciar alteró otros datos'; end if;
  if (select count(*) from solo_registrations)<>before_count then raise exception 'TEST: anunciar creó inscripciones'; end if;
  select to_jsonb(p) into visible from public_solo_rooms p where id=room;
  if visible is null or visible->>'status'<>'draft' or not (visible->>'is_announced')::boolean or (visible->>'taken')::int<>0 then raise exception 'TEST: contrato anuncio inválido'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(visible) k) is distinct from
     array['booyah_reward','capacity','closes_at','edition_id','entry_price','id','is_announced','kill_reward','name','scheduled_at','status','taken']::text[] then raise exception 'TEST: campos públicos no esperados'; end if;
  if not exists(select 1 from audit_log where table_name='solo_rooms' and op='UPDATE' and row_key=room::text and new_data->>'is_announced'='true') then raise exception 'TEST: anuncio sin auditoría'; end if;
  path:=gen_random_uuid()::text||'.png';
  insert into storage.objects(bucket_id,name,metadata) values('receipts',path,'{"mimetype":"image/png","size":100}');
  payload:=jsonb_build_object('edition_id',e,'room_id',room,'request_id',gen_random_uuid(),'full_name','Jugador Prueba','whatsapp','999999999','nickname','Player','receipt_path',path);
  begin perform submit_solo_registration(payload); raise exception 'TEST: inscribió en borrador anunciado';
  exception when raise_exception then if sqlerrm <> 'Esta sala no admite inscripciones' then raise; end if; end;
  perform set_solo_room_announcement(e,room,false);
  if exists(select 1 from public_solo_rooms where id=room) then raise exception 'TEST: ocultar no retira anuncio'; end if;
  begin perform set_solo_room_announcement(gen_random_uuid(),room,true); raise exception 'TEST: edición antigua anuncia';
  exception when raise_exception then if sqlerrm <> 'La edición cambió. Actualiza la página.' then raise; end if; end;
  begin perform set_solo_room_announcement(e,room,null); raise exception 'TEST: anuncio nulo';
  exception when raise_exception then if sqlerrm <> 'Indica si deseas anunciar u ocultar la sala' then raise; end if; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  begin perform set_solo_room_announcement(e,room,true); raise exception 'TEST: revisor anuncia'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
  begin perform set_solo_room_announcement(e,room,true); raise exception 'TEST: editor anuncia'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  perform set_solo_room_announcement(e,room,true);
  perform manage_solo('open',jsonb_build_object('edition_id',e,'room_id',room));
  perform submit_solo_registration(payload);
  if not exists(select 1 from public_solo_rooms where id=room and status='open' and is_announced and taken=1) then raise exception 'TEST: apertura tras anunciar falla'; end if;
  begin perform set_solo_room_announcement(e,room,false); raise exception 'TEST: permite ocultar sala abierta';
  exception when raise_exception then if sqlerrm <> 'El anuncio solo se puede cambiar en salas en borrador' then raise; end if; end;
  result:=manage_solo('create',jsonb_build_object('edition_id',e,'name','Apertura directa','scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','capacity',2,'entry_price',3,'kill_reward',1,'booyah_reward',10));
  direct_room:=(result->>'id')::uuid;
  perform manage_solo('open',jsonb_build_object('edition_id',e,'room_id',direct_room));
  if not exists(select 1 from public_solo_rooms where id=direct_room and status='open' and not is_announced) then raise exception 'TEST: exige anunciar antes de abrir'; end if;
  -- Las condiciones globales de inscripción se siguen validando aun con anuncio.
  update tournament_settings set registration_open=false;
  begin perform submit_solo_registration(payload||jsonb_build_object('request_id',gen_random_uuid())); raise exception 'TEST: omite cierre global';
  exception when raise_exception then if sqlerrm <> 'Las inscripciones Solo están cerradas' then raise; end if; end;
end $$;
set local role anon;
do $$ begin
  begin perform set_solo_room_announcement(null,null,true); raise exception 'TEST: anon anuncia'; exception when insufficient_privilege then null; end;
  perform (select count(*) from public_solo_rooms);
  begin perform (select count(*) from solo_room_access); raise exception 'TEST: anon ve credenciales'; exception when insufficient_privilege then null; end;
end $$;
rollback;
