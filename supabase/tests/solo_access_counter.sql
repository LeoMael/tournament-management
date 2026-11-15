begin;
do $$
declare e uuid:=current_edition_id(); room uuid; a uuid; b uuid; original jsonb; response jsonb;
begin
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
  values('Contadores independientes',now()+interval '2 days',now()+interval '1 day',8,2,1,10,'open') returning id into room;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
  values(room,gen_random_uuid(),'a','Titular prueba','987654321','Aprobado',gen_random_uuid()::text||'.png',2,'approved') returning id into a;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
  values(room,gen_random_uuid(),'b','Titular prueba','987654322','Pendiente',gen_random_uuid()::text||'.png',2,'pending') returning id into b;
  if (select access_click_count from solo_registrations where id=a)<>0 then raise exception 'TEST: acceso no inicia en cero'; end if;
  perform count_solo_confirmation_click(e,room,a);
  select to_jsonb(p)-'access_click_count' into original from solo_registrations p where id=a;
  begin perform count_solo_access_click(e,room,a); raise exception 'TEST: cuenta sin acceso guardado';
  exception when raise_exception then if sqlerrm <> 'Guarda el ID y la contraseña de la sala primero' then raise; end if; end;
  perform save_solo_room_access(e,room,'123456','secreto');
  response:=count_solo_access_click(e,room,a);
  if response<>jsonb_build_object('id',a,'access_click_count',1) then raise exception 'TEST: cuenta incorrecta o expone credenciales'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  response:=count_solo_access_click(e,room,a);
  if (response->>'access_click_count')::int<>2 then raise exception 'TEST: acceso no compartido'; end if;
  if original is distinct from (select to_jsonb(p)-'access_click_count' from solo_registrations p where id=a) then raise exception 'TEST: acceso modifica confirmación o datos'; end if;
  perform count_solo_confirmation_click(e,room,a);
  if not exists(select 1 from solo_registrations where id=a and confirmation_click_count=2 and access_click_count=2) then raise exception 'TEST: contadores no independientes'; end if;
  begin perform count_solo_access_click(e,room,b); raise exception 'TEST: cuenta pendiente';
  exception when raise_exception then if sqlerrm <> 'Participante no aprobado o sin slot en esta sala' then raise; end if; end;
  begin perform count_solo_access_click(e,room,gen_random_uuid()); raise exception 'TEST: cuenta participante ajeno';
  exception when raise_exception then if sqlerrm <> 'Participante no aprobado o sin slot en esta sala' then raise; end if; end;
  begin perform count_solo_access_click(gen_random_uuid(),room,a); raise exception 'TEST: edición antigua';
  exception when raise_exception then if sqlerrm <> 'La edición cambió. Actualiza la página.' then raise; end if; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
  begin perform count_solo_access_click(e,room,a); raise exception 'TEST: editor cuenta'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  update solo_rooms set status='finished' where id=room;
  begin perform count_solo_access_click(e,room,a); raise exception 'TEST: cuenta sala finalizada';
  exception when raise_exception then if sqlerrm <> 'Esta sala no admite enviar acceso' then raise; end if; end;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name in ('public_solo_rooms','public_solo_results') and column_name='access_click_count') then raise exception 'TEST: contador público'; end if;
end $$;
set local role authenticated;
do $$ begin
  begin update solo_registrations set access_click_count=99; raise exception 'TEST: edición directa'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform count_solo_access_click(null,null,null); raise exception 'TEST: anon cuenta'; exception when insufficient_privilege then null; end;
end $$;
rollback;
