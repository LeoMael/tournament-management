begin;
create function pg_temp.fail_new_edition() returns trigger language plpgsql as $$
begin
  if new.name='Forzar rollback' then raise exception 'Fallo de prueba al crear la siguiente edición'; end if;
  return new;
end $$;
create trigger test_close_rollback before insert on tournament_editions for each row execute function pg_temp.fail_new_edition();
do $$
declare e uuid:=current_edition_id(); grp uuid:=gen_random_uuid(); team uuid:=gen_random_uuid(); person uuid:=gen_random_uuid(); receipt text:=gen_random_uuid()::text||'.png'; stage uuid; match uuid; config jsonb;
begin
  insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
  insert into individual_groups(id,game_key,default_name,naming_deadline,registration_id) values(grp,'ff','Grupo Prueba',now()+interval '1 day',team);
  insert into individual_registrations(id,request_id,request_fingerprint,game_key,full_name,whatsapp,nickname,game_player_id,receipt_path,amount_due,status,group_id,terms_version,terms_accepted_at)
    values(person,gen_random_uuid(),'test','ff','Persona Prueba','999999999','Apodo','123456789',receipt,4,'registered',grp,'individual-v1',now());
  insert into registrations(id,game_key,team_name,captain_name,captain_whatsapp,institution,receipt_path,amount_due,status,registration_origin,individual_group_id)
    values(team,'ff','Equipo Prueba','Persona Prueba','999999999','Otra',null,4,'approved','individual',grp);
  insert into players(registration_id,game_key,slot,nickname,game_player_id) values(team,'ff',1,'Apodo','123456789');
  update individual_groups set status='registered',captain_id=person where id=grp;
  if (current_edition_finances()->'teams'->>'confirmed')::numeric<>0 or (current_edition_finances()->'individuals'->>'confirmed')::numeric<>4 then raise exception 'TEST: doble conteo individual'; end if;
  insert into stages(game_key,name,type,published,config) values('ff','Final','battle_royale',true,jsonb_build_object('champion',team,'participants',jsonb_build_array(team))) returning id into stage;
  insert into matches(stage_id,round,position,status) values(stage,1,0,'completed') returning id into match;
  insert into match_results(match_id,registration_id,placement,kills,points) values(match,team,1,3,15);
  begin
    perform close_tournament_edition(e,(select name from tournament_editions where id=e),'Forzar rollback',now()+interval '30 days');
    raise exception 'TEST: no forzó el fallo';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  if current_edition_id()<>e or not exists(select 1 from registrations where id=team) or not exists(select 1 from players where registration_id=team) or exists(select 1 from tournament_archive_records where edition_id=e) then raise exception 'TEST: rollback incompleto'; end if;
  perform close_tournament_edition(e,(select name from tournament_editions where id=e),'Siguiente edición',now()+interval '30 days');
  if exists(select 1 from registrations) or exists(select 1 from individual_groups) or exists(select 1 from individual_registrations) or exists(select 1 from matches) or exists(select 1 from players) then raise exception 'TEST: referencias circulares no limpiadas'; end if;
  if not exists(select 1 from tournament_archive_records where edition_id=e and source='individual_groups' and data->>'captain_id'=person::text and data->>'registration_id'=team::text) then raise exception 'TEST: relaciones archivadas incompletas'; end if;
  select data into config from tournament_archive_public where edition_id=e;
  if config->'public_matches'->0->>'id'<>match::text or config->'public_match_results'->0->>'kills'<>'3' then raise exception 'TEST: resultados archivados incompletos'; end if;
  if not exists(select 1 from admins) or not exists(select 1 from audit_log) or not exists(select 1 from rules_sections) then raise exception 'TEST: borró configuración o auditoría'; end if;
  begin perform submit_registration(jsonb_build_object('edition_id',e)); raise exception 'TEST: equipo de edición anterior';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  begin perform submit_individual_registration(jsonb_build_object('edition_id',e)); raise exception 'TEST: individual de edición anterior';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
end $$;
rollback;
