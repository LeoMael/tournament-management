-- Simula instalaciones sin destino y una con Yape previamente guardado.
alter table solo_registrations add column prize_yape_phone text;
insert into solo_rooms(id,name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward)
values('00000000-0000-0000-0000-000000002100','Migración teléfonos',now()+interval '2 days',now()+interval '1 day',8,2,1,10);
insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,prize_yape_phone)
select '00000000-0000-0000-0000-000000002100',gen_random_uuid(),'legacy','Titular previo','987654321','Previo '||n,gen_random_uuid()::text||'.png',2,
  case n when 1 then null when 2 then '' else '912345678' end from generate_series(1,3) n;
create temp table prior_solo_phones as select id,to_jsonb(a)-'prize_yape_phone' as original from solo_registrations a
where room_id='00000000-0000-0000-0000-000000002100';
