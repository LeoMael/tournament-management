-- Bolsa total independiente de los premios por puesto. No asigna montos anteriores.
begin;
do $$
begin
  if not exists (select 1 from public.schema_migrations sm where sm.version = '001')
     or not exists (select 1 from public.schema_migrations sm where sm.version = '002') then
    raise exception 'Se requieren las migraciones 001 y 002';
  end if;
end $$;

create table if not exists public.game_prize_pools (
  game_key text primary key references public.games(key),
  amount numeric(10,2) not null default 0 check (amount between 0 and 1000000),
  is_announced boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.game_prize_pools enable row level security;
revoke all on public.game_prize_pools from public, anon, authenticated;
grant select on public.game_prize_pools to anon, authenticated;
grant insert, update, delete on public.game_prize_pools to authenticated;
drop policy if exists game_prize_pools_public_read on public.game_prize_pools;
create policy game_prize_pools_public_read on public.game_prize_pools
  for select to anon, authenticated using (is_announced = true);
drop policy if exists game_prize_pools_admin_all on public.game_prize_pools;
create policy game_prize_pools_admin_all on public.game_prize_pools
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop trigger if exists audit_game_prize_pools on public.game_prize_pools;
create trigger audit_game_prize_pools after insert or update or delete on public.game_prize_pools
  for each row execute function public.audit_trigger();

alter table public.prizes add column if not exists reward_text text not null default '';
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.prizes'::regclass and conname = 'prizes_reward_text_length') then
    alter table public.prizes add constraint prizes_reward_text_length check (char_length(reward_text) <= 240);
  end if;
  if not exists (select 1 from public.schema_migrations sm where sm.version = '006') then
    update public.prizes set reward_text = 'S/ ' || to_char(amount, 'FM999999990.00')
      where amount > 0 and reward_text = '';
  end if;
end $$;
insert into public.game_prize_pools (game_key, amount, is_announced)
select g.key, 0, false from public.games g where g.key in ('mlbb', 'ff')
on conflict (game_key) do nothing;
insert into public.schema_migrations (version, description) values ('006', 'Bolsa total y premios por puesto') on conflict (version) do nothing;
commit;
