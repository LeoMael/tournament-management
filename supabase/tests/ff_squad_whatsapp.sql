begin;
do $$
declare e uuid:=current_edition_id(); a uuid; b uuid; outsider uuid; ml uuid; phase uuid; other_phase uuid; first_match uuid; second_match uuid; ml_match uuid;
  saved jsonb; snapshot jsonb; configs jsonb;
begin
  insert into registrations(game_key,team_name,captain_name,captain_whatsapp,institution,receipt_path,amount_due,status)
    values('ff','Equipo Acceso A','Capitán Uno','987654321','Otra',gen_random_uuid()::text||'.png',16,'approved') returning id into a;
  insert into registrations(game_key,team_name,captain_name,captain_whatsapp,institution,receipt_path,amount_due,status)
    values('ff','Equipo Acceso B','Capitán Dos','987654322','Otra',gen_random_uuid()::text||'.png',16,'approved') returning id into b;
  insert into registrations(game_key,team_name,captain_name,captain_whatsapp,institution,receipt_path,amount_due,status)
    values('ff','Equipo Fuera','Capitán Tres','987654323','Otra',gen_random_uuid()::text||'.png',16,'approved') returning id into outsider;
  insert into registrations(game_key,team_name,captain_name,captain_whatsapp,institution,receipt_path,amount_due,status)
    values('mlbb','Equipo MLBB','Capitán MLBB','987654324','Otra',gen_random_uuid()::text||'.png',25,'approved') returning id into ml;
  configs:=jsonb_build_object('rooms',2,'participants',jsonb_build_array(a,b),'room_of',jsonb_build_object(a::text,1,b::text,2,outsider::text,1),'slot_of',jsonb_build_object(a::text,1,b::text,1));
  insert into stages(game_key,name,type,config) values('ff','Fase WhatsApp','battle_royale',configs) returning id into phase;
  insert into matches(stage_id,round,position) values(phase,1,0) returning id into first_match;
  insert into matches(stage_id,round,position) values(phase,2,0) returning id into second_match;
  insert into stages(game_key,name,type) values('mlbb','Fase MLBB','groups') returning id into other_phase;
  insert into matches(stage_id,round,position) values(other_phase,1,0) returning id into ml_match;
  select to_jsonb(r)-'ff_confirmation_click_count' into snapshot from registrations r where id=a;
  if (select ff_confirmation_click_count from registrations where id=a)<>0 then raise exception 'TEST: confirma registros antiguos sin autorización'; end if;
  perform count_ff_squad_confirmation_click(e,a);
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  saved:=count_ff_squad_confirmation_click(e,a);
  if (saved->>'ff_confirmation_click_count')::int<>2 then raise exception 'TEST: contador confirmación no compartido'; end if;
  if snapshot is distinct from (select to_jsonb(r)-'ff_confirmation_click_count' from registrations r where id=a) then raise exception 'TEST: contador modifica inscripción'; end if;
  begin perform count_ff_squad_confirmation_click(e,ml); raise exception 'TEST: modifica MLBB';
  exception when raise_exception then if sqlerrm<>'Equipo FF no aprobado en esta edición' then raise; end if; end;
  saved:=save_ff_squad_room_access(e,first_match,1,' 123456 ',' clave-secreta-024 ');
  if saved->>'room_password'<>'clave-secreta-024' then raise exception 'TEST: acceso no guardado'; end if;
  perform save_ff_squad_room_access(e,first_match,2,'222222','otra-clave-024');
  perform save_ff_squad_room_access(e,second_match,1,'333333','tercera-clave-024');
  saved:=count_ff_squad_access_click(e,first_match,1,a);
  if saved<>jsonb_build_object('match_id',first_match,'room_no',1,'registration_id',a,'click_count',1) then raise exception 'TEST: respuesta contador incorrecta o filtra acceso'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  saved:=count_ff_squad_access_click(e,first_match,1,a);
  if (saved->>'click_count')::int<>2 then raise exception 'TEST: contador acceso no compartido'; end if;
  perform count_ff_squad_access_click(e,second_match,1,a);
  if (select click_count from ff_squad_access_clicks where match_id=second_match and registration_id=a)<>1 then raise exception 'TEST: contador no separado por partida'; end if;
  if (select ff_confirmation_click_count from registrations where id=a)<>2 then raise exception 'TEST: acceso altera contador de confirmación'; end if;
  begin perform count_ff_squad_access_click(e,first_match,1,b); raise exception 'TEST: permite equipo otra sala';
  exception when raise_exception then if sqlerrm<>'Equipo no aprobado o no asignado a esta sala y fase' then raise; end if; end;
  begin perform count_ff_squad_access_click(e,first_match,1,outsider); raise exception 'TEST: permite equipo fuera de participantes';
  exception when raise_exception then if sqlerrm<>'Equipo no aprobado o no asignado a esta sala y fase' then raise; end if; end;
  begin perform save_ff_squad_room_access(e,first_match,3,'123','clave'); raise exception 'TEST: permite sala ajena';
  exception when raise_exception then if sqlerrm<>'Sala no válida en esta partida' then raise; end if; end;
  begin perform save_ff_squad_room_access(e,ml_match,1,'123','clave'); raise exception 'TEST: acceso para MLBB';
  exception when raise_exception then if sqlerrm<>'Partida de escuadras FF no encontrada en esta edición' then raise; end if; end;
  begin perform save_ff_squad_room_access(gen_random_uuid(),first_match,1,'123','clave'); raise exception 'TEST: edición antigua';
  exception when raise_exception then if sqlerrm<>'La edición cambió. Actualiza la página.' then raise; end if; end;
  if exists(select 1 from audit_log where new_data::text like '%clave-secreta-024%') then raise exception 'TEST: contraseña en auditoría'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name in ('public_teams','public_matches','public_match_results') and column_name in ('ff_confirmation_click_count','game_room_id','room_password','captain_whatsapp')) then raise exception 'TEST: datos privados en vistas públicas'; end if;
  if exists(select 1 from match_results where match_id in(first_match,second_match)) then raise exception 'TEST: acceso generó resultados'; end if;
  if (select config from stages where id=phase)<>configs then raise exception 'TEST: acceso cambió distribución/puntos'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
  begin perform save_ff_squad_room_access(e,first_match,1,'123','clave'); raise exception 'TEST: editor escribe acceso'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  insert into match_results(match_id,registration_id,placement,kills,points) values(first_match,a,1,3,15);
  begin perform count_ff_squad_access_click(e,first_match,1,a); raise exception 'TEST: envía acceso a sala terminada';
  exception when raise_exception then if sqlerrm<>'Esta sala ya está terminada' then raise; end if; end;
  -- RLS: revisor consulta; editor no ve credenciales; cliente no las escribe directamente.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
end $$;
set local role authenticated;
do $$ begin
  if (select count(*) from ff_squad_room_access)<3 then raise exception 'TEST: revisor no lee acceso privado'; end if;
  begin update ff_squad_room_access set room_password='cambio'; raise exception 'TEST: escritura directa'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $$ begin
  if exists(select 1 from ff_squad_room_access) then raise exception 'TEST: editor ve credenciales'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform 1 from ff_squad_room_access; raise exception 'TEST: anon lee acceso'; exception when insufficient_privilege then null; end;
  begin perform save_ff_squad_room_access(null,null,null,null,null); raise exception 'TEST: anon escribe'; exception when insufficient_privilege then null; end;
  begin perform count_ff_squad_confirmation_click(null,null); raise exception 'TEST: anon confirma'; exception when insufficient_privilege then null; end;
end $$;
rollback;
