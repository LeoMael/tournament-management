begin;
-- Supabase concede permisos base a authenticated; la suite aislada los simula
-- para comprobar que RLS y triggers bloquean el campo, no solo el GRANT de tabla.
grant select,update on public.games to authenticated;
do $$
declare edition uuid:=current_edition_id(); game text; receipt text; roster jsonb; i integer; reg uuid; snapshot jsonb; players_snapshot jsonb;
  game_snapshot jsonb; audit_before integer; result jsonb; before_retry jsonb;
begin
  update tournament_settings set registration_open=true,registration_deadline=now()+interval '10 days';
  update games set is_open=true,max_teams=100;
  foreach game in array array['mlbb','ff'] loop
    receipt:=gen_random_uuid()::text||'.png';
    insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
    roster:='[]';
    for i in 1..(select starters from games where key=game) loop
      roster:=roster||jsonb_build_array(jsonb_build_object('nickname','Jugador '||game||i,'game_player_id',(880000000+i)::text,'server_id','2001'));
    end loop;
    reg:=(submit_registration(jsonb_build_object('edition_id',edition,'game_key',game,'team_name','Visibilidad '||game,'captain_name','Titular de prueba',
      'captain_whatsapp','930475802','prize_yape_phone','988888888','institution','Otra','other_institution','Instituto Prueba','professional_school','Carrera',
      'receipt_path',receipt,'players',roster,'website',''))->>'id')::uuid;
    update registrations set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=reg;
  end loop;
  select jsonb_agg(to_jsonb(r) order by id) into snapshot from registrations r;
  select jsonb_agg(to_jsonb(p) order by id) into players_snapshot from players p;
  select jsonb_agg(to_jsonb(g)-'public_teams_visible'-'updated_at' order by key) into game_snapshot from games g;
  select count(*) into audit_before from audit_log where table_name='games';
  result:=set_public_team_list_visibility(edition,'ff',false,true);
  if result<>jsonb_build_object('game_key','ff','edition_id',edition,'public_teams_visible',false) then raise exception 'TEST: contrato incorrecto'; end if;
  if (select public_teams_visible from games where key='ff') is distinct from false or (select public_teams_visible from games where key='mlbb') is distinct from true then raise exception 'TEST: no distingue juegos'; end if;
  if (select count(*) from audit_log where table_name='games')<>audit_before+1 then raise exception 'TEST: no audita exactamente el cambio'; end if;
  select to_jsonb(g) into before_retry from games g where key='ff';
  perform set_public_team_list_visibility(edition,'ff',false,true);
  if before_retry is distinct from (select to_jsonb(g) from games g where key='ff') or (select count(*) from audit_log where table_name='games')<>audit_before+1 then raise exception 'TEST: reintento altera fecha o duplica auditoría'; end if;
  begin perform set_public_team_list_visibility(edition,'ff',true,true); raise exception 'TEST: ignora estado esperado obsoleto';
  exception when raise_exception then if sqlerrm<>'Otro administrador cambió la publicación. Actualiza antes de guardar.' then raise; end if; end;
  begin perform set_public_team_list_visibility(gen_random_uuid(),'ff',true,false); raise exception 'TEST: acepta otra edición';
  exception when raise_exception then if sqlerrm<>'La edición cambió. Actualiza la página.' then raise; end if; end;
  begin perform set_public_team_list_visibility(edition,'solo',false,true); raise exception 'TEST: afecta Solo';
  exception when raise_exception then if sqlerrm<>'Juego inválido' then raise; end if; end;
  begin perform set_public_team_list_visibility(edition,'ff',null,false); raise exception 'TEST: acepta boolean nulo';
  exception when raise_exception then if sqlerrm<>'Indica la visibilidad actual y la nueva' then raise; end if; end;
  if snapshot is distinct from (select jsonb_agg(to_jsonb(r) order by id) from registrations r)
    or players_snapshot is distinct from (select jsonb_agg(to_jsonb(p) order by id) from players p) then raise exception 'TEST: altera equipos, comprobantes, teléfonos o roster'; end if;
  if game_snapshot is distinct from (select jsonb_agg(to_jsonb(g)-'public_teams_visible'-'updated_at' order by key) from games g) then raise exception 'TEST: altera apertura, cupos, precios o reglas'; end if;
  if not (select registration_open from tournament_settings where id=1) then raise exception 'TEST: cierra inscripciones'; end if;
  if (select count(*) from public_teams where team_name like 'Visibilidad %')<>2 then raise exception 'TEST: cambia vistas usadas por otros módulos'; end if;
  perform set_public_team_list_visibility(edition,'mlbb',false,true);
  perform set_public_team_list_visibility(edition,'mlbb',true,false);
  if (select public_teams_visible from games where key='ff') then raise exception 'TEST: publicar MLBB publica FF'; end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ declare blocked boolean:=false; begin
  begin perform set_public_team_list_visibility(current_edition_id(),'ff',true,false); raise exception 'TEST: editor usa RPC'; exception when insufficient_privilege then null; end;
  begin update games set public_teams_visible=true where key='ff'; exception when insufficient_privilege then blocked:=true; end;
  if not blocked or (select public_teams_visible from games where key='ff') then raise exception 'TEST: editor evita protección con UPDATE'; end if;
  update games set subtitle='Texto editable conservado' where key='ff';
  if (select subtitle from games where key='ff')<>'Texto editable conservado' then raise exception 'TEST: rompe permisos de contenido'; end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ declare blocked boolean:=false; begin
  begin perform set_public_team_list_visibility(current_edition_id(),'ff',true,false); raise exception 'TEST: revisor usa RPC'; exception when insufficient_privilege then null; end;
  begin update games set public_teams_visible=true where key='ff'; exception when raise_exception or insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'TEST: revisor cambia publicación directamente'; end if;
  update games set live=true where key='ff';
  if not (select live from games where key='ff') then raise exception 'TEST: rompe control de En vivo'; end if;
end $$;
set local role anon;
set local request.jwt.claim.sub='';
do $$ begin
  if (select public_teams_visible from games where key='ff') is distinct from false then raise exception 'TEST: frontend no lee estado'; end if;
  if (select public_teams_visible from games where key='mlbb') is distinct from true then raise exception 'TEST: frontend no distingue juegos'; end if;
  begin perform set_public_team_list_visibility(current_edition_id(),'ff',true,false); raise exception 'TEST: anon cambia publicación'; exception when insufficient_privilege then null; end;
  begin update games set public_teams_visible=true where key='ff'; raise exception 'TEST: anon escribe flag'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ begin
  perform set_public_team_list_visibility(current_edition_id(),'ff',true,false);
  if not (select public_teams_visible from games where key='ff') then raise exception 'TEST: admin no puede volver a publicar'; end if;
end $$;
reset role;
rollback;
