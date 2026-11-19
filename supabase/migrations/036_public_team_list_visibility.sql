-- Control de publicación de la sección Equipos, independiente de las inscripciones.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='035') then raise exception 'Se requiere 035'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

alter table public.games add column public_teams_visible boolean not null default true;
grant select(key,name,public_teams_visible) on public.games to anon,authenticated;
comment on column public.games.public_teams_visible is 'Visibilidad de la lista de equipos confirmados en la web, por juego. El frontend debe mostrar el anuncio cuando sea false. Independiente de is_open y de la aprobación.';

-- games permite a editores modificar textos y a revisores actualizar En vivo.
-- El nuevo campo debe quedar protegido también ante escrituras directas.
create function public.guard_public_team_list_visibility() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.public_teams_visible is distinct from old.public_teams_visible and not is_admin() then
    raise exception 'Solo un administrador puede publicar u ocultar la lista de equipos' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_public_team_list_visibility() from public,anon,authenticated;
create trigger guard_public_team_list_visibility before update of public_teams_visible on public.games
  for each row execute function public.guard_public_team_list_visibility();

create function public.set_public_team_list_visibility(p_edition_id uuid,p_game_key text,p_visible boolean,p_expected_visible boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare g games%rowtype;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  if p_game_key is null or p_game_key not in('mlbb','ff') then raise exception 'Juego inválido'; end if;
  if p_visible is null or p_expected_visible is null then raise exception 'Indica la visibilidad actual y la nueva'; end if;
  select * into g from games where key=p_game_key for update;
  if not found then raise exception 'Juego no encontrado'; end if;
  -- Un reintento del mismo cambio no genera actualizaciones/auditorías duplicadas.
  if g.public_teams_visible=p_visible then
    return jsonb_build_object('game_key',g.key,'edition_id',p_edition_id,'public_teams_visible',g.public_teams_visible);
  end if;
  if g.public_teams_visible is distinct from p_expected_visible then
    raise exception 'Otro administrador cambió la publicación. Actualiza antes de guardar.';
  end if;
  update games set public_teams_visible=p_visible,updated_at=clock_timestamp() where key=p_game_key;
  -- Conserva audit_games y edition_barrier existentes. No cambia is_open ni registros.
  return jsonb_build_object('game_key',p_game_key,'edition_id',p_edition_id,'public_teams_visible',p_visible);
end $$;
revoke all on function public.set_public_team_list_visibility(uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.set_public_team_list_visibility(uuid,text,boolean,boolean) to authenticated;

insert into public.schema_migrations(version,description)
values('036','Publicación de la lista de equipos confirmados por juego, controlada desde Equipos inscritos');
notify pgrst,'reload schema';
commit;
