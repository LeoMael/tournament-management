begin;
do $$
declare e uuid:=current_edition_id(); game text; i integer; j integer; roster jsonb; payload jsonb; result jsonb; reg uuid;
  receipt text; bad jsonb; count_before integer; snapshot jsonb; players_before jsonb; last_payload jsonb;
begin
  update tournament_settings set registration_open=true,registration_deadline=now()+interval '20 days';
  update games set is_open=true,max_teams=100;
  foreach game in array array['ff','mlbb'] loop
    for i in 1..3 loop
      receipt:=gen_random_uuid()::text||'.png';
      insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
      roster:='[]'::jsonb;
      for j in 1..(select starters from games where key=game) loop
        roster:=roster||jsonb_build_array(jsonb_build_object('nickname','Jugador '||game||i||j,'game_player_id',(880000000+i*100+j)::text,'server_id','2001'));
      end loop;
      payload:=jsonb_build_object('edition_id',e,'game_key',game,'team_name','Yape prueba '||game||i,'captain_name','Titular Comprobante',
        'captain_whatsapp',(930000000+i)::text,'institution','Otra','other_institution','Instituto Prueba','professional_school','Carrera Prueba',
        'receipt_path',receipt,'players',roster,'website','');
      if i=2 then payload:=payload||jsonb_build_object('prize_yape_phone',(930000000+i)::text); end if;
      if i=3 then payload:=payload||jsonb_build_object('prize_yape_phone','912345678'); end if;
      result:=submit_registration(payload); reg:=(result->>'id')::uuid;
      if (select prize_yape_phone from registrations where id=reg) is distinct from (case when i=3 then '912345678' else (930000000+i)::text end) then raise exception 'TEST: Yape no guardado o respaldo incorrecto'; end if;
      if not exists(select 1 from registrations where id=reg and captain_name='Titular Comprobante' and captain_whatsapp=(930000000+i)::text
        and receipt_path=receipt and professional_school='Carrera Prueba' and other_institution='Instituto Prueba' and amount_due=(select price from games where key=game)) then raise exception 'TEST: inscripción alterada'; end if;
      if (select count(*) from players where registration_id=reg)<>(select starters from games where key=game) then raise exception 'TEST: roster incompleto'; end if;
      if result<>jsonb_build_object('id',reg,'amount_due',(select price from games where key=game)) then raise exception 'TEST: contrato de respuesta cambió'; end if;
      last_payload:=payload;
    end loop;
  end loop;
  select count(*) into count_before from registrations;
  foreach bad in array array['""'::jsonb,'null'::jsonb,'"abc"'::jsonb,'"123"'::jsonb,'912345678'::jsonb] loop
    begin perform submit_registration(last_payload||jsonb_build_object('prize_yape_phone',bad)); raise exception 'TEST: Yape inválido aceptado';
    exception when raise_exception then if sqlerrm not like 'Revisa el número de Yape%' then raise; end if; end;
  end loop;
  if (select count(*) from registrations)<>count_before then raise exception 'TEST: error deja equipo parcial'; end if;
  begin perform submit_registration(last_payload||jsonb_build_object('edition_id',gen_random_uuid())); raise exception 'TEST: edición antigua';
  exception when raise_exception then if sqlerrm<>'La edición cambió. Actualiza la página.' then raise; end if; end;
  select to_jsonb(r)-'captain_whatsapp'-'prize_yape_phone' into snapshot from registrations r where id=reg;
  select jsonb_agg(to_jsonb(p) order by id) into players_before from players p where registration_id=reg;
  update registrations set captain_whatsapp='999999999' where id=reg;
  if (select prize_yape_phone from registrations where id=reg)<>'912345678' then raise exception 'TEST: cambiar contacto altera Yape'; end if;
  update registrations set prize_yape_phone='911111111' where id=reg;
  if (select captain_whatsapp from registrations where id=reg)<>'999999999' then raise exception 'TEST: cambiar Yape altera contacto'; end if;
  if snapshot is distinct from (select to_jsonb(r)-'captain_whatsapp'-'prize_yape_phone' from registrations r where id=reg)
    or players_before is distinct from (select jsonb_agg(to_jsonb(p) order by id) from players p where registration_id=reg) then raise exception 'TEST: edición alteró campos/roster'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name in ('public_teams','public_team_players','public_matches','public_match_results') and column_name in ('prize_yape_phone','captain_whatsapp','captain_name')) then raise exception 'TEST: dato privado público'; end if;
  receipt:=gen_random_uuid()::text||'.png';
  insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
  roster:='[]'::jsonb;
  for j in 1..(select starters from games where key='mlbb') loop
    roster:=roster||jsonb_build_array(jsonb_build_object('nickname','Jugador anónimo '||j,'game_player_id',(990000000+j)::text,'server_id','2001'));
  end loop;
  perform set_config('test.team_phone_payload',(last_payload||jsonb_build_object('team_name','Yape anon MLBB','captain_whatsapp','988888888','prize_yape_phone','977777777','receipt_path',receipt,'players',roster))::text,true);
end $$;
set local role anon;
do $$ declare response jsonb; begin
  response:=submit_registration(current_setting('test.team_phone_payload')::jsonb);
  if response->>'id' is null then raise exception 'TEST: registro anónimo falló'; end if;
  perform set_config('test.team_phone_id',response->>'id',true);
  begin perform submit_registration_before_editions('{}'); raise exception 'TEST: salta validación pública'; exception when insufficient_privilege then null; end;
  begin perform 1 from registrations; raise exception 'TEST: anon lee teléfonos'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from registrations where id=current_setting('test.team_phone_id')::uuid and captain_whatsapp='988888888' and prize_yape_phone='977777777') then raise exception 'TEST: RPC pública no separó teléfonos'; end if;
end $$;
rollback;
