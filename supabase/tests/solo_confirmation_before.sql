insert into solo_rooms(id,name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
values('00000000-0000-0000-0000-000000002200','Contador previo',now()+interval '2 days',now()+interval '1 day',8,2,1,10,'open');
insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status)
select '00000000-0000-0000-0000-000000002200',gen_random_uuid(),'legacy','Titular anterior','987654321',s,gen_random_uuid()::text||'.png',2,s
from unnest(array['approved','pending']) s;
create temp table prior_confirmation_rows as select id,to_jsonb(p) as original from solo_registrations p
where room_id='00000000-0000-0000-0000-000000002200';
