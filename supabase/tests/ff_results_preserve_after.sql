do $$ begin
  if exists(select 1 from ff_legacy_functions f where f.definition is distinct from pg_get_functiondef(f.oid)) then raise exception 'TEST: 032 modificó funciones de Solo/inscripción existentes'; end if;
  if exists(select 1 from ff_legacy_views v where v.definition is distinct from pg_get_viewdef(v.oid)) then raise exception 'TEST: 032 modificó vistas de Solo'; end if;
  if exists(select 1 from ff_legacy_schema s where s.definition is distinct from (select jsonb_agg(to_jsonb(c) order by ordinal_position) from information_schema.columns c where c.table_schema='public' and c.table_name=s.table_name)) then raise exception 'TEST: 032 modificó esquema de Solo'; end if;
end $$;
drop table ff_legacy_functions,ff_legacy_views,ff_legacy_schema;
