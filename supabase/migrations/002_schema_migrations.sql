-- Adopta el historial solo después de verificar la migración 001.
begin;

do $$
declare pk_columns text[]; has_fk boolean; has_unique boolean; policy_expr text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'prizes' and column_name = 'id' and is_nullable = 'NO')
    or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'prizes' and column_name = 'game_key')
    or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'prizes' and column_name = 'is_announced' and data_type = 'boolean' and is_nullable = 'NO') then
    raise exception 'Falta estructura de premios por juego: aplicar migración 001 primero';
  end if;
  select array_agg(a.attname::text order by k.ordinality) into pk_columns
    from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum, ordinality)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.conrelid = 'public.prizes'::regclass and c.contype = 'p';
  select exists (select 1 from pg_constraint c
    where c.conrelid = 'public.prizes'::regclass and c.contype = 'f' and c.confrelid = 'public.games'::regclass
    and c.conkey = array[(select attnum from pg_attribute where attrelid = c.conrelid and attname = 'game_key')]::smallint[]
    and c.confkey = array[(select attnum from pg_attribute where attrelid = c.confrelid and attname = 'key')]::smallint[]) into has_fk;
  select exists (select 1 from pg_constraint c
    where c.conrelid = 'public.prizes'::regclass and c.contype = 'u'
    and c.conkey = array[(select attnum from pg_attribute where attrelid = c.conrelid and attname = 'game_key'), (select attnum from pg_attribute where attrelid = c.conrelid and attname = 'place')]::smallint[]) into has_unique;
  select pg_get_expr(polqual, polrelid) into policy_expr from pg_policy
    where polrelid = 'public.prizes'::regclass and polname = 'prizes_public_read' and polcmd = 'r';
  if pk_columns is distinct from array['id']::text[] or not has_fk or not has_unique
     or not coalesce((select relrowsecurity from pg_class where oid = 'public.prizes'::regclass), false)
     or policy_expr is null
     or policy_expr not in ('((game_key IS NOT NULL) AND (is_announced = true))', '((game_key IS NOT NULL) AND is_announced)') then
    raise exception 'No se verificó la estructura o política de la migración 001; revisar y aplicar 001';
  end if;
end $$;

create table if not exists public.schema_migrations (
  version text primary key,
  description text not null,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from public, anon, authenticated;
grant select on public.schema_migrations to authenticated;
drop policy if exists schema_migrations_admin_read on public.schema_migrations;
create policy schema_migrations_admin_read on public.schema_migrations
  for select to authenticated using (public.is_admin());

-- La fecha de 001 indica esta verificación, no necesariamente su ejecución original.
insert into public.schema_migrations (version, description) values
  ('001', 'Premios por juego'), ('002', 'Historial de migraciones')
on conflict (version) do nothing;
commit;
