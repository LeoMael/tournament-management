-- Se ejecuta tras duo_foundation_before.sql para extender la misma fotografía previa.
do $$ declare room uuid; table_name text; snapshot jsonb; begin
  insert into duo_rooms(name,mode,scheduled_at,closes_at,capacity,entry_price,rewarded_places)
    values('Dúo previo a Solo Top','top',now()+interval '2 days',now()+interval '1 day',24,4,2) returning id into room;
  insert into duo_room_prizes(room_id,edition_id,place,amount)
    values(room,current_edition_id(),1,100),(room,current_edition_id(),2,50);
  insert into duo_foundation_baseline values('fixture','duo_room',to_jsonb(room));
  foreach table_name in array array['duo_rooms','duo_room_prizes'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'') from public.%I r',table_name) into snapshot;
    insert into duo_foundation_baseline values('rows',table_name,snapshot);
  end loop;
end $$;
insert into duo_foundation_baseline
  select 'columns',table_name,jsonb_agg(jsonb_build_object('column',column_name,'type',data_type,'nullable',is_nullable,'default',column_default) order by ordinal_position)
    from information_schema.columns where table_schema='public' and table_name in('duo_rooms','duo_room_prizes') group by table_name;
