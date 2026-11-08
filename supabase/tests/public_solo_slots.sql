begin;
insert into solo_rooms(id,name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
values('00000000-0000-0000-0000-000000001400','Slots públicos',now()+interval '2 days',now()+interval '1 day',2,2,1,10,'playing');
insert into solo_registrations(id,room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
values('00000000-0000-0000-0000-000000001401','00000000-0000-0000-0000-000000001400',gen_random_uuid(),'public-slot','Jugador privado','999999999','Nickname visible','public-slot-test.png',2,'approved');
insert into solo_results(registration_id,room_id,kills,booyah)
values('00000000-0000-0000-0000-000000001401','00000000-0000-0000-0000-000000001400',3,true);
set local role anon;
do $$ declare row_data jsonb; begin
  select to_jsonb(p) into row_data from public_solo_results p where id='00000000-0000-0000-0000-000000001401';
  if (row_data->>'slot')::integer is distinct from 1 or row_data->>'nickname' is distinct from 'Nickname visible' then raise exception 'TEST: público no recibe slot'; end if;
  if row_data->>'kills' is not null or row_data->>'booyah' is not null or row_data->>'earnings' is not null then raise exception 'TEST: publica resultados antes de finalizar'; end if;
  if row_data ?| array['full_name','whatsapp','receipt_path','game_player_id','amount_due'] then raise exception 'TEST: filtra datos privados'; end if;
end $$;
reset role;
update solo_rooms set status='finished' where id='00000000-0000-0000-0000-000000001400';
set local role anon;
do $$ begin
  if not exists(select 1 from public_solo_results where id='00000000-0000-0000-0000-000000001401' and slot=1 and kills=3 and booyah and earnings=13) then raise exception 'TEST: resultado final sin slot'; end if;
end $$;
reset role;
update solo_rooms set status='cancelled' where id='00000000-0000-0000-0000-000000001400';
set local role anon;
do $$ begin
  if exists(select 1 from public_solo_results where id='00000000-0000-0000-0000-000000001401') then raise exception 'TEST: sala cancelada visible'; end if;
end $$;
rollback;
