do $$ begin
  if exists(select 1 from games where public_teams_visible is distinct from true) then raise exception 'TEST: 036 oculta juegos existentes'; end if;
  if exists(select 1 from team_visibility_old_games old join games g using(key) where old.data is distinct from to_jsonb(g)-'public_teams_visible') then raise exception 'TEST: 036 cambia configuración existente'; end if;
  if exists(select 1 from team_visibility_old_functions f where definition is distinct from pg_get_functiondef(f.oid)) then raise exception 'TEST: 036 modifica funciones existentes'; end if;
  if exists(select 1 from team_visibility_old_views v where definition is distinct from pg_get_viewdef(v.oid)) then raise exception 'TEST: 036 modifica vistas existentes'; end if;
end $$;
drop table team_visibility_old_games,team_visibility_old_functions,team_visibility_old_views;
