-- Fixture y fotografías previas: la migración no debe alterar Solo ni contratos existentes.
create temp table duo_foundation_baseline(kind text,key text,data jsonb,primary key(kind,key));
insert into duo_foundation_baseline
  select 'function',p.oid::regprocedure::text,to_jsonb(pg_get_functiondef(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
insert into duo_foundation_baseline
  select 'view',viewname,to_jsonb(definition) from pg_views where schemaname='public';
insert into duo_foundation_baseline
  select 'columns',table_name,jsonb_agg(jsonb_build_object('column',column_name,'type',data_type,'nullable',is_nullable,'default',column_default) order by ordinal_position)
    from information_schema.columns where table_schema='public' and table_name like 'solo_%' group by table_name;
do $$ declare room uuid; person uuid; t text; snapshot jsonb; begin
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status,is_announced)
    values('Solo previo a Dúo',now()+interval '2 days',now()+interval '1 day',48,2,1,10,'finished',true) returning id into room;
  insert into solo_registrations(room_id,request_id,request_fingerprint,full_name,whatsapp,prize_yape_phone,nickname,receipt_path,amount_due,status,confirmation_click_count,access_click_count)
    values(room,gen_random_uuid(),'duo-foundation-existing','Jugador existente','987654321','912345678','Nick existente',gen_random_uuid()::text||'.png',2,'approved',2,3) returning id into person;
  insert into solo_results(registration_id,room_id,kills,booyah) values(person,room,4,true);
  insert into solo_payments(registration_id,kind,amount,paid_at,reference) values(person,'reward',14,now(),'Pago previo');
  insert into solo_room_access(room_id,game_room_id,room_password) values(room,'123456','Acceso previo');
  insert into duo_foundation_baseline values('fixture','room',to_jsonb(room));
  foreach t in array array['solo_rooms','solo_registrations','solo_results','solo_payments','solo_room_access'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'') from public.%I r',t) into snapshot;
    insert into duo_foundation_baseline values('rows',t,snapshot);
  end loop;
end $$;
