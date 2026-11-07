-- Aplicar manualmente una sola transacción a una base existente. Repetible.
begin;

alter table public.prizes add column if not exists id uuid default gen_random_uuid();
update public.prizes set id = gen_random_uuid() where id is null;
alter table public.prizes alter column id set default gen_random_uuid();
alter table public.prizes alter column id set not null;
alter table public.prizes add column if not exists game_key text references public.games(key);
alter table public.prizes add column if not exists is_announced boolean not null default false;

-- El PK anterior es place; conservar todas las filas como legado sin juego.
do $$
declare pk_name text; pk_columns text[];
begin
  select c.conname, array_agg(a.attname::text order by k.ordinality)
    into pk_name, pk_columns
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as k(attnum, ordinality)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.conrelid = 'public.prizes'::regclass and c.contype = 'p'
    group by c.conname;
  if pk_name is not null and pk_columns <> array['id']::text[] then
    execute format('alter table public.prizes drop constraint %I', pk_name);
    pk_name := null;
  end if;
  if pk_name is null then
    alter table public.prizes add primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.prizes'::regclass and conname = 'prizes_game_key_place_key') then
    alter table public.prizes add constraint prizes_game_key_place_key unique (game_key, place);
  end if;
end $$;

-- La política de administración existente conserva acceso completo.
drop policy if exists prizes_public_read on public.prizes;
create policy prizes_public_read on public.prizes for select to anon, authenticated
  using (game_key is not null and is_announced = true);

insert into public.prizes (game_key, place, label, amount, description, is_announced)
select g.key, p.place, p.label, 0, '', false
from public.games g
cross join (values (1, 'CAMPEÓN'), (2, 'SUBCAMPEÓN'), (3, 'TERCER LUGAR')) as p(place, label)
on conflict (game_key, place) do nothing;

commit;
