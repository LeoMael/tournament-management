create temp table ff_legacy_functions as
  select oid,pg_get_functiondef(oid) as definition from pg_proc
  where pronamespace='public'::regnamespace and (proname like '%solo%' or proname in('submit_registration','submit_individual_registration'));
create temp table ff_legacy_views as
  select oid,pg_get_viewdef(oid) as definition from pg_class where relnamespace='public'::regnamespace and relkind='v' and relname like 'public_solo%';
create temp table ff_legacy_schema as
  select table_name,jsonb_agg(to_jsonb(c) order by ordinal_position) as definition from information_schema.columns c
  where table_schema='public' and table_name in('solo_rooms','solo_registrations','solo_results','solo_payments','solo_room_access') group by table_name;
