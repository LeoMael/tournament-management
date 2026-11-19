create temp table team_visibility_old_games as select key,to_jsonb(g) as data from games g;
create temp table team_visibility_old_functions as
  select oid,pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace and prokind='f';
create temp table team_visibility_old_views as
  select oid,pg_get_viewdef(oid) as definition from pg_class where relnamespace='public'::regnamespace and relkind='v';
