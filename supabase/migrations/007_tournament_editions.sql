-- Ediciones: adopta la información existente sin borrar datos. Requiere 001..006.
begin;
do $$ begin
  if (select count(*) from public.schema_migrations where version in ('001','002','003','004','005','006')) <> 6 then
    raise exception 'Aplica primero las migraciones 001 a 006';
  end if;
end $$;
create table public.tournament_editions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 120),
  slug text not null unique default gen_random_uuid()::text,
  description text not null default '' check (char_length(description) <= 3000),
  cover_path text,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'active' check (status in ('active','closing','archived')),
  is_published boolean not null default false,
  snapshot_version integer not null default 1,
  created_at timestamptz not null default now()
);
create unique index tournament_one_active on public.tournament_editions ((true)) where status in ('active','closing');
insert into public.tournament_editions(name) values ('RAGNAROK U-Series 2026');
alter table public.tournament_editions enable row level security;
revoke all on public.tournament_editions from public, anon, authenticated;
grant select on public.tournament_editions to authenticated;
create policy editions_admin_read on public.tournament_editions for select to authenticated using (public.is_admin());

create function public.current_edition_id() returns uuid language sql stable security definer set search_path=public as $$
  select id from tournament_editions where status in ('active','closing')
$$;
revoke all on function public.current_edition_id() from public;
grant execute on function public.current_edition_id() to anon, authenticated;
alter table public.tournament_settings add column edition_id uuid references public.tournament_editions(id);
update public.tournament_settings set edition_id=public.current_edition_id();
alter table public.tournament_settings alter column edition_id set not null;
alter table public.tournament_settings add column solo_enabled boolean not null default false;

-- La misma barrera protege RPC y escrituras directas de los módulos existentes.
create function public.edition_write_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock_shared(724091);
  if tg_level = 'ROW' then
    if tg_op <> 'DELETE' then
      if new.edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
      if tg_op='UPDATE' and new.edition_id is distinct from old.edition_id then
        if tg_table_name <> 'tournament_settings' or not is_admin() or
           not exists(select 1 from tournament_editions where id=old.edition_id and status='archived') then
          raise exception 'No se puede cambiar la edición del registro';
        end if;
      end if;
      return new;
    end if;
    return old;
  end if;
  return null;
end $$;
revoke all on function public.edition_write_guard() from public;
do $$ declare t text; begin
  foreach t in array array['registrations','players','stages','groups','group_teams','matches','match_results','schedule_events','individual_registrations','individual_groups','individual_draws'] loop
    execute format('alter table public.%I add column edition_id uuid not null default public.current_edition_id() references public.tournament_editions(id)',t);
    execute format('create trigger edition_barrier before insert or update or delete on public.%I for each statement execute function public.edition_write_guard()',t);
    execute format('create trigger edition_row before insert or update on public.%I for each row execute function public.edition_write_guard()',t);
  end loop;
  foreach t in array array['tournament_settings','games','prizes','game_prize_pools','individual_settings','rules_sections','participation_steps'] loop
    execute format('create trigger edition_barrier before insert or update or delete on public.%I for each statement execute function public.edition_write_guard()',t);
  end loop;
end $$;
create trigger edition_row before update on public.tournament_settings for each row execute function public.edition_write_guard();

-- Mantener firmas públicas; las implementaciones anteriores dejan de ser invocables por clientes.
alter function public.submit_registration(jsonb) rename to submit_registration_before_editions;
revoke all on function public.submit_registration_before_editions(jsonb) from public, anon, authenticated;
create function public.submit_registration(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock_shared(724091);
  if (payload->>'edition_id') is distinct from current_edition_id()::text then raise exception 'La edición cambió. Actualiza la página.'; end if;
  return submit_registration_before_editions(payload);
end $$;
alter function public.submit_individual_registration(jsonb) rename to submit_individual_registration_before_editions;
revoke all on function public.submit_individual_registration_before_editions(jsonb) from public, anon, authenticated;
create function public.submit_individual_registration(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock_shared(724091);
  if (payload->>'edition_id') is distinct from current_edition_id()::text then raise exception 'La edición cambió. Actualiza la página.'; end if;
  return submit_individual_registration_before_editions(payload - 'edition_id');
end $$;
revoke all on function public.submit_registration(jsonb), public.submit_individual_registration(jsonb) from public;
grant execute on function public.submit_registration(jsonb), public.submit_individual_registration(jsonb) to anon, authenticated;

-- Las RPC existentes deben adquirir la barrera ANTES de sus bloqueos por juego/fila.
do $$ declare r record; definition text; begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.prolang=(select oid from pg_language where lanname='plpgsql')
      and p.proname not in ('submit_registration','submit_individual_registration','edition_write_guard')
      and (p.prosrc like '%pg_advisory_xact_lock(%' or p.prosrc like '%for update%') loop
    definition := pg_get_functiondef(r.oid);
    definition := regexp_replace(definition, '\mbegin\M', E'begin\n  perform pg_advisory_xact_lock_shared(724091);', 'i');
    execute definition;
  end loop;
end $$;
insert into public.schema_migrations(version,description) values ('007','Ediciones y protección de envíos anteriores');
commit;
