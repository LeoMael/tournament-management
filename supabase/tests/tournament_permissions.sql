begin;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin
  begin perform edition_close_preview(); raise exception 'TEST: revisor accede al cierre';
  exception when insufficient_privilege then null; end;
  begin perform manage_solo('create',jsonb_build_object('edition_id',current_edition_id())); raise exception 'TEST: revisor crea tarifas';
  exception when insufficient_privilege then null; end;
  begin perform manage_solo('pay',jsonb_build_object('edition_id',current_edition_id())); raise exception 'TEST: revisor registra pagos';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from tournament_editions) then raise exception 'TEST: revisor lee edición privada'; end if;
  if exists(select 1 from tournament_archive_records) then raise exception 'TEST: revisor lee archivos privados'; end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin
  begin perform manage_solo('close',jsonb_build_object('edition_id',current_edition_id())); raise exception 'TEST: editor gestiona Solo';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from solo_registrations) then raise exception 'TEST: editor lee Solo'; end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ begin
  begin update tournament_editions set status='closing'; raise exception 'TEST: admin altera ciclo directamente';
  exception when insufficient_privilege then null; end;
  begin update tournament_archive_records set data='{}'; raise exception 'TEST: admin altera archivo';
  exception when insufficient_privilege then null; end;
  perform edition_close_preview();
end $$;
set local role anon;
set local request.jwt.claim.sub='';
do $$ begin
  begin perform manage_solo('create','{}'); raise exception 'TEST: anon ejecuta gestión';
  exception when insufficient_privilege then null; end;
  begin perform submit_registration_before_editions('{}'); raise exception 'TEST: anon evita wrapper';
  exception when insufficient_privilege then null; end;
  begin perform (select count(*) from solo_registrations); raise exception 'TEST: anon lee contactos';
  exception when insufficient_privilege then null; end;
  perform (select count(*) from public_solo_rooms);
  perform (select count(*) from public_solo_results);
  perform (select count(*) from public_tournament_editions);
end $$;
rollback;
