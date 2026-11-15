alter table registrations add column prize_yape_phone text;
insert into registrations(game_key,team_name,captain_name,captain_whatsapp,institution,receipt_path,amount_due,status,prize_yape_phone)
select case when n=2 then 'mlbb' else 'ff' end,'Previo Yape '||n,'Nombre anterior','987654321','Otra',gen_random_uuid()::text||'.png',16,'approved',
  case n when 1 then null when 2 then '' else '912345678' end from generate_series(1,3) n;
create temp table team_phone_snapshot as select id,to_jsonb(r)-'prize_yape_phone' as original from registrations r where team_name like 'Previo Yape %';
