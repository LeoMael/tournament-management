begin;
do $$
declare edition uuid:=current_edition_id(); kind text; cfg jsonb; draft jsonb; rid uuid; person uuid; receipt text; saved jsonb; creds text:='SECRET-FF-ACCESS-DO-NOT-ARCHIVE';
begin
  update tournament_settings set registration_open=true,registration_deadline=now()+interval '10 days';
  foreach kind in array array['solo_top','duo_top','duo_kills'] loop
    draft:=jsonb_build_object('edition_id',edition,'name','Mensajes '||kind,'capacity',2,'entry_price',0,'scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','top_prizes',jsonb_build_array(100));
    if kind='solo_top' then rid:=(manage_solo_top_room_draft('create',draft)->>'id')::uuid;
    else
      draft:=draft||jsonb_build_object('mode',case when kind='duo_top' then 'top' else 'kills' end);
      if kind='duo_kills' then draft:=draft||jsonb_build_object('top_prizes',jsonb_build_array(),'kill_reward',1,'booyah_reward',5); end if;
      rid:=(manage_duo_room_draft('create',draft)->>'id')::uuid;
    end if;
    cfg:=jsonb_build_object('edition_id',edition,'room_kind',kind,'room_id',rid);
    begin
      perform save_ff_room_access(edition,kind,rid,'123',creds); raise exception 'TEST: guarda acceso en borrador';
    exception when raise_exception then if sqlerrm<>'Esta sala no admite cambios de acceso' then raise; end if; end;
    perform manage_ff_room('open',cfg);
    receipt:=gen_random_uuid()::text||'.png';
    insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
    person:=(submit_ff_room_registration(cfg||jsonb_build_object('request_id',gen_random_uuid(),'full_name','Titular privado','whatsapp','930475802','prize_yape_phone','988888888','nickname_1','Jugador 1','nickname_2',case when kind<>'solo_top' then 'Jugador 2' end,'receipt_path',receipt))->>'id')::uuid;
    begin
      perform prepare_ff_room_whatsapp(edition,kind,rid,person,'confirmation'); raise exception 'TEST: mensaje a pendiente';
    exception when raise_exception then if sqlerrm<>'Participante no aprobado en esta sala' then raise; end if; end;
    perform review_ff_room_registration(edition,kind,rid,person,'approved','');
    saved:=prepare_ff_room_whatsapp(edition,kind,rid,person,'confirmation');
    if saved->>'whatsapp'<>'930475802' or saved->>'slot'<>'1' or saved->>'confirmation_click_count'<>'1' or saved->>'access_click_count'<>'0' or saved->>'room_password' is not null then raise exception 'TEST: confirmación incorrecta'; end if;
    if saved ? 'prize_yape_phone' or saved ? 'receipt_path' or saved ? 'full_name' then raise exception 'TEST: mensaje expone datos innecesarios'; end if;
    begin
      perform prepare_ff_room_whatsapp(edition,kind,rid,person,'access'); raise exception 'TEST: acceso sin credenciales';
    exception when raise_exception then if sqlerrm<>'Guarda el ID y la contraseña primero' then raise; end if; end;
    if (select access_click_count from ff_room_registrations where id=person)<>0 then raise exception 'TEST: error incrementa contador'; end if;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
    perform save_ff_room_access(edition,kind,rid,'123',creds);
    saved:=prepare_ff_room_whatsapp(edition,kind,rid,person,'access');
    if saved->>'room_password'<>creds or saved->>'confirmation_click_count'<>'1' or saved->>'access_click_count'<>'1' then raise exception 'TEST: mezcla contadores'; end if;
    perform save_ff_room_access(edition,kind,rid,'456',creds||'-NEW');
    saved:=prepare_ff_room_whatsapp(edition,kind,rid,person,'access');
    if saved->>'game_room_id'<>'456' or saved->>'room_password'<>creds||'-NEW' or saved->>'access_click_count'<>'2' then raise exception 'TEST: envía credenciales antiguas'; end if;
    saved:=prepare_ff_room_whatsapp(edition,kind,rid,person,'confirmation');
    if saved->>'confirmation_click_count'<>'2' or saved->>'access_click_count'<>'2' or saved->>'room_password' is not null then raise exception 'TEST: confirmación contiene contraseña'; end if;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
    begin perform prepare_ff_room_whatsapp(edition,kind,rid,person,'confirmation'); raise exception 'TEST: editor prepara mensaje'; exception when insufficient_privilege then null; end;
    begin perform save_ff_room_access(edition,kind,rid,'123',creds); raise exception 'TEST: editor guarda acceso'; exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
    if exists(select 1 from audit_log a where to_jsonb(a)::text like '%'||creds||'%') then raise exception 'TEST: contraseña en auditoría'; end if;
    if exists(select 1 from public_ff_rooms r where to_jsonb(r)::text like '%'||creds||'%') then raise exception 'TEST: contraseña pública'; end if;
    perform manage_ff_room('cancel',cfg||jsonb_build_object('confirmation','Mensajes '||kind));
    begin perform prepare_ff_room_whatsapp(edition,kind,rid,person,'access'); raise exception 'TEST: mensaje de sala cancelada'; exception when raise_exception then if sqlerrm<>'Esta sala no admite mensajes de inscripción/acceso' then raise; end if; end;
    perform set_config('test.ff_access_room',rid::text,true);
    perform set_config('test.ff_access_person',person::text,true);
  end loop;
  perform set_config('test.ff_access_edition',edition::text,true);
end $$;
set local role anon;
do $$ begin
  begin perform * from ff_room_access; raise exception 'TEST: anon lee credenciales'; exception when insufficient_privilege then null; end;
  begin perform prepare_ff_room_whatsapp(null,'solo_top',null,null,'access'); raise exception 'TEST: anon prepara'; exception when insufficient_privilege then null; end;
  perform * from public_ff_rooms;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin
  if exists(select 1 from ff_room_access) then raise exception 'TEST: editor lee credenciales'; end if;
  begin update ff_room_access set room_password='otro'; raise exception 'TEST: cliente escribe acceso'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ declare edition uuid:=current_edition_id(); begin
  perform close_tournament_edition(edition,(select name from tournament_editions where id=edition),'Edición posterior mensajes',now()+interval '30 days');
  if exists(select 1 from ff_room_access where edition_id=edition) then raise exception 'TEST: conserva credenciales archivadas'; end if;
  if exists(select 1 from tournament_archive_records a where a.edition_id=edition and (source='ff_room_access' or data::text like '%SECRET-FF-ACCESS%')) then raise exception 'TEST: archiva contraseña'; end if;
  if exists(select 1 from tournament_archive_public a where to_jsonb(a)::text like '%SECRET-FF-ACCESS%') then raise exception 'TEST: archivo público contiene contraseña'; end if;
  if not exists(select 1 from tournament_archive_records where edition_id=edition and source='ff_room_registrations' and (data->>'access_click_count')::int=2 and (data->>'confirmation_click_count')::int=2) then raise exception 'TEST: archivo pierde contadores'; end if;
  begin perform prepare_ff_room_whatsapp(edition,'duo_kills',current_setting('test.ff_access_room')::uuid,current_setting('test.ff_access_person')::uuid,'access'); raise exception 'TEST: mensaje de otra edición'; exception when raise_exception then if sqlerrm<>'La edición cambió' then raise; end if; end;
end $$;
rollback;
