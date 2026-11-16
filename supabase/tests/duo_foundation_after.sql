do $$ declare b record; actual jsonb; room uuid; duo_fixture uuid; begin
  for b in select * from duo_foundation_baseline loop
    if b.kind='function' then actual:=to_jsonb(pg_get_functiondef(b.key::regprocedure));
    elsif b.kind='view' then select to_jsonb(definition) into actual from pg_views where schemaname='public' and viewname=b.key;
    elsif b.kind='columns' then
      select jsonb_agg(jsonb_build_object('column',column_name,'type',data_type,'nullable',is_nullable,'default',column_default) order by ordinal_position)
        into actual from information_schema.columns where table_schema='public' and table_name=b.key;
    elsif b.kind='rows' then execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'') from public.%I r',b.key) into actual;
    else continue;
    end if;
    if actual is distinct from b.data then raise exception 'TEST: Dúo modificó contrato o datos existentes: % %',b.kind,b.key; end if;
  end loop;
  if not exists(select 1 from duo_foundation_baseline where kind='fixture' and key='duo_room')
    and (exists(select 1 from duo_rooms) or exists(select 1 from duo_room_prizes)) then
    raise exception 'TEST: migración inventó salas o premios Dúo';
  end if;
  select (data#>>'{}')::uuid into room from duo_foundation_baseline where kind='fixture' and key='room';
  delete from solo_payments where registration_id in(select id from solo_registrations where room_id=room);
  delete from solo_results where room_id=room;
  delete from solo_registrations where room_id=room;
  delete from solo_rooms where id=room;
  select (data#>>'{}')::uuid into duo_fixture from duo_foundation_baseline where kind='fixture' and key='duo_room';
  if duo_fixture is not null then delete from duo_rooms where id=duo_fixture; end if;
end $$;
drop table duo_foundation_baseline;
