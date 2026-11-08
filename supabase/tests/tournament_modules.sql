-- Ejecutar en una base de pruebas inicializada con 001..009 y un usuario admin autenticado.
-- Todo se revierte; no ejecutar en producción.
begin;
do $$
declare e uuid:=current_edition_id(); room uuid; reg uuid; req uuid:=gen_random_uuid(); path text:=gen_random_uuid()::text||'.png'; payload jsonb; result jsonb; payment uuid; archived_slug text; affected int; duplicate_path text;
begin
  update tournament_settings set registration_open=true,solo_enabled=true,registration_deadline=now()+interval '20 days' where id=1;
  result:=manage_solo('create',jsonb_build_object('edition_id',e,'name','Sala de prueba','scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','capacity',2,'entry_price',5.5,'kill_reward',1.25,'booyah_reward',10));
  room:=(result->>'id')::uuid;
  perform manage_solo('open',jsonb_build_object('edition_id',e,'room_id',room));
  begin
    perform manage_solo('edit',jsonb_build_object('edition_id',e,'room_id',room));
    raise exception 'TEST: editó condiciones abiertas';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  insert into storage.objects(bucket_id,name,metadata) values('receipts',path,'{"mimetype":"image/png","size":100}');
  payload:=jsonb_build_object('edition_id',e,'room_id',room,'request_id',req,'full_name','Jugador Prueba','whatsapp','999999999','nickname','Player','receipt_path',path);
  result:=submit_solo_registration(payload); reg:=(result->>'id')::uuid;
  if (select game_player_id from solo_registrations where id=reg) is not null then raise exception 'TEST: ID solicitado en Solo'; end if;
  if (result->>'amount_due')::numeric<>5.5 then raise exception 'TEST: precio incorrecto'; end if;
  if (submit_solo_registration(payload)->>'id')::uuid<>reg then raise exception 'TEST: idempotencia'; end if;
  begin
    perform submit_solo_registration(payload||jsonb_build_object('request_id',gen_random_uuid()));
    raise exception 'TEST: jugador duplicado';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  duplicate_path:=gen_random_uuid()::text||'.png';
  insert into storage.objects(bucket_id,name,metadata) values('receipts',duplicate_path,'{"mimetype":"image/png","size":100}');
  begin
    perform submit_solo_registration(payload||jsonb_build_object('request_id',gen_random_uuid(),'receipt_path',duplicate_path,'nickname','  PLAYER  '));
    raise exception 'TEST: aceptó nickname repetido con otro comprobante';
  exception when raise_exception then
    if sqlerrm <> 'Este jugador ya está inscrito en la sala' then raise; end if;
  end;
  begin
    perform close_tournament_edition(e,(select name from tournament_editions where id=e),'Nueva edición',now()+interval '30 days');
    raise exception 'TEST: cerró con pendientes';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',reg,'status','approved'));
  perform manage_solo('close',jsonb_build_object('edition_id',e,'room_id',room));
  perform manage_solo('start',jsonb_build_object('edition_id',e,'room_id',room));
  begin
    perform manage_solo('finish',jsonb_build_object('edition_id',e,'room_id',room));
    raise exception 'TEST: finalizó sin resultados';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  perform manage_solo('result',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',reg,'kills',4,'booyah',true));
  if exists(select 1 from public_solo_results where kills is not null) then raise exception 'TEST: publicó resultados provisorios'; end if;
  perform manage_solo('finish',jsonb_build_object('edition_id',e,'room_id',room));
  if (select earnings from public_solo_results where id=reg)<>15 then raise exception 'TEST: kills + Booyah'; end if;
  select id into payment from solo_payments where registration_id=reg;
  begin
    perform close_tournament_edition(e,(select name from tournament_editions where id=e),'Nueva edición',now()+interval '30 days');
    raise exception 'TEST: cerró con ganancia pendiente';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  perform manage_solo('pay',jsonb_build_object('edition_id',e,'room_id',room,'payment_id',payment,'reference','Yape prueba'));
  perform manage_solo('pay',jsonb_build_object('edition_id',e,'room_id',room,'payment_id',payment));
  if (select reference from solo_payments where id=payment)<>'Yape prueba' then raise exception 'TEST: duplicó el pago'; end if;
  perform close_tournament_edition(e,(select name from tournament_editions where id=e),'Nueva edición',now()+interval '30 days');
  if current_edition_id()=e or exists(select 1 from solo_registrations) then raise exception 'TEST: no limpió'; end if;
  if not exists(select 1 from tournament_archive_records where edition_id=e and source='solo_registrations' and data->>'id'=reg::text) then raise exception 'TEST: no archivó'; end if;
  if not archive_asset_used('receipts',path) then raise exception 'TEST: no conservó el archivo'; end if;
  execute 'set local role authenticated';
  delete from storage.objects where bucket_id='receipts' and name=path;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'TEST: eliminó comprobante archivado'; end if;
  update storage.objects set metadata='{}' where bucket_id='receipts' and name=path;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'TEST: sobrescribió comprobante archivado'; end if;
  execute 'set local request.jwt.claim.sub=''00000000-0000-0000-0000-000000000002''';
  if exists(select 1 from storage.objects where bucket_id='receipts' and name=path) then raise exception 'TEST: revisor lee comprobante histórico'; end if;
  execute 'set local request.jwt.claim.sub=''00000000-0000-0000-0000-000000000001''';
  execute 'reset role';
  if exists(select 1 from tournament_settings where registration_open or solo_enabled) or exists(select 1 from games where live or is_open) then raise exception 'TEST: siguiente edición abierta'; end if;
  if (close_tournament_edition(e,'cualquier','cualquier',now())->>'already_archived')::boolean is not true then raise exception 'TEST: cierre no idempotente'; end if;
  select slug into archived_slug from tournament_editions where id=e;
  if public_tournament_detail(archived_slug) is not null then raise exception 'TEST: archivo oculto expuesto'; end if;
  perform update_edition_metadata(e,'Edición archivada','Prueba',null,true);
  result:=public_tournament_detail(archived_slug);
  if result is null or (result->'data'->'public_solo_results'->0->>'earnings')::numeric<>15 then raise exception 'TEST: publicación o ganancias archivadas'; end if;
  if result::text ~ 'whatsapp|full_name|receipt_path|game_player_id|paid_at|request_fingerprint' then raise exception 'TEST: filtró datos privados'; end if;
  perform update_edition_metadata(e,'Edición archivada','Prueba',null,false);
  if public_tournament_detail(archived_slug) is not null then raise exception 'TEST: detalle siguió visible'; end if;
  begin
    perform submit_solo_registration(payload);
    raise exception 'TEST: aceptó edición antigua';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
end $$;
rollback;
