-- Base de configuración de Solo por Top, una partida con premios fijos por puesto.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='029') then
    raise exception 'Se requiere 029';
  end if;
  perform pg_advisory_xact_lock(724091);
end $$;

create table public.solo_top_rooms (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null default public.current_edition_id() references public.tournament_editions(id),
  name text not null check(btrim(name) ~ '^[^<>[:cntrl:]]{3,100}$'),
  status text not null default 'draft' constraint solo_top_foundation_draft_only check(status='draft'),
  scheduled_at timestamptz not null check(isfinite(scheduled_at)),
  closes_at timestamptz not null check(isfinite(closes_at)),
  capacity integer not null check(capacity between 2 and 100),
  entry_price numeric(10,2) not null default 0 check(entry_price between 0 and 10000),
  rewarded_places integer not null check(rewarded_places between 1 and capacity),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(id,edition_id),
  check(closes_at<=scheduled_at)
);
comment on table public.solo_top_rooms is 'Borradores privados de Solo por Top. Una partida, premio por posición final individual.';
comment on column public.solo_top_rooms.capacity is 'Cupos de jugadores. Ajustar el cupo configurado a la sala de juego.';
comment on column public.solo_top_rooms.entry_price is 'Entrada individual para una sola partida.';

create table public.solo_top_room_prizes (
  room_id uuid not null,
  edition_id uuid not null,
  place integer not null check(place between 1 and 100),
  amount numeric(12,2) not null check(amount between 0 and 1000000),
  primary key(room_id,place),
  foreign key(room_id,edition_id) references public.solo_top_rooms(id,edition_id) on delete cascade
);
comment on table public.solo_top_room_prizes is 'Premio monetario fijo por puesto final individual. La lista determina cuántos puestos se premian.';

alter table public.solo_top_rooms enable row level security;
alter table public.solo_top_room_prizes enable row level security;
revoke all on public.solo_top_rooms,public.solo_top_room_prizes from public,anon,authenticated;
grant select on public.solo_top_rooms,public.solo_top_room_prizes to authenticated;
create policy solo_top_rooms_staff_read on public.solo_top_rooms for select to authenticated
  using(public.is_admin() or (public.has_role(array['revisor_arbitro']) and edition_id=public.current_edition_id()));
create policy solo_top_prizes_staff_read on public.solo_top_room_prizes for select to authenticated
  using(public.is_admin() or (public.has_role(array['revisor_arbitro']) and edition_id=public.current_edition_id()));

create trigger edition_barrier before insert or update or delete on public.solo_top_rooms
  for each statement execute function public.edition_write_guard();
create trigger edition_row before insert or update on public.solo_top_rooms
  for each row execute function public.edition_write_guard();
create trigger edition_barrier before insert or update or delete on public.solo_top_room_prizes
  for each statement execute function public.edition_write_guard();
create trigger edition_row before insert or update on public.solo_top_room_prizes
  for each row execute function public.edition_write_guard();
create trigger audit_solo_top_rooms after insert or update or delete on public.solo_top_rooms
  for each row execute function public.audit_trigger();
create trigger audit_solo_top_prizes after insert or update or delete on public.solo_top_room_prizes
  for each row execute function public.audit_trigger();

create function public.guard_solo_top_room_prize() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  target_room_id uuid;
  room public.solo_top_rooms%rowtype;
begin
  if tg_op='UPDATE' and (new.room_id is distinct from old.room_id or new.edition_id is distinct from old.edition_id) then
    raise exception 'No se puede mover un premio a otra sala o edición';
  end if;
  target_room_id:=case when tg_op='DELETE' then old.room_id else new.room_id end;
  select * into room from solo_top_rooms where id=target_room_id for update;
  if not found then
    if tg_op='DELETE' then return old; end if;
    raise exception 'Sala Solo Top no encontrada';
  end if;
  if room.edition_id is distinct from current_edition_id() then
    raise exception 'La edición cambió. Actualiza la página.';
  end if;
  if room.status<>'draft' then raise exception 'Los premios solo se configuran en borrador'; end if;
  if tg_op<>'DELETE' and new.place>room.rewarded_places then
    raise exception 'El puesto no está incluido en los premios de esta sala';
  end if;
  return coalesce(new,old);
end $$;
revoke all on function public.guard_solo_top_room_prize() from public,anon,authenticated;
create trigger guard_solo_top_room_prize before insert or update or delete on public.solo_top_room_prizes
  for each row execute function public.guard_solo_top_room_prize();

create function public.check_solo_top_room_prizes() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  target_room_id uuid;
  room public.solo_top_rooms%rowtype;
  prize_count integer;
begin
  if tg_table_name='solo_top_rooms' then
    target_room_id:=case when tg_op='DELETE' then old.id else new.id end;
  else
    target_room_id:=case when tg_op='DELETE' then old.room_id else new.room_id end;
  end if;
  select * into room from solo_top_rooms where id=target_room_id;
  if not found then return null; end if;
  select count(*) into prize_count from solo_top_room_prizes where room_id=room.id;
  if prize_count<>room.rewarded_places or exists(
    select 1 from generate_series(1,room.rewarded_places) as places(place_number)
    where not exists(select 1 from solo_top_room_prizes where room_id=room.id and place=places.place_number)
  ) then
    raise exception 'Completa los premios consecutivos del puesto 1 al %',room.rewarded_places;
  end if;
  return null;
end $$;
revoke all on function public.check_solo_top_room_prizes() from public,anon,authenticated;
create constraint trigger solo_top_room_prizes_complete after insert or update on public.solo_top_rooms
  deferrable initially deferred for each row execute function public.check_solo_top_room_prizes();
create constraint trigger solo_top_prize_rows_complete after insert or update or delete on public.solo_top_room_prizes
  deferrable initially deferred for each row execute function public.check_solo_top_room_prizes();

create function public.manage_solo_top_room_draft(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  room public.solo_top_rooms%rowtype;
  target_room_id uuid;
  room_name text;
  room_capacity integer;
  scheduled timestamptz;
  closes timestamptz;
  entry_amount numeric;
  top_prizes jsonb;
  prize_count integer;
  prize_value jsonb;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Envía los datos de la sala Solo Top'; end if;
  if p_data->>'edition_id' is distinct from current_edition_id()::text then
    raise exception 'La edición cambió. Actualiza la página.';
  end if;
  if p_action is null or p_action not in ('create','edit','delete') then
    raise exception 'En este paso Solo Top solo permite crear, editar o eliminar borradores';
  end if;
  if p_action<>'create' then
    select * into room from solo_top_rooms where id=(p_data->>'room_id')::uuid for update;
    if not found or room.edition_id is distinct from current_edition_id() then
      raise exception 'Sala Solo Top no encontrada en esta edición';
    end if;
    if room.status<>'draft' then raise exception 'Solo se pueden modificar borradores Solo Top'; end if;
    target_room_id:=room.id;
  end if;
  if p_action='delete' then
    if p_data->>'confirmation' is distinct from room.name then raise exception 'Escribe el nombre exacto de la sala Solo Top'; end if;
    delete from solo_top_rooms where id=room.id;
    return jsonb_build_object('id',room.id,'deleted',true);
  end if;

  room_name:=btrim(p_data->>'name');
  if room_name is null or room_name !~ '^[^<>[:cntrl:]]{3,100}$' then
    raise exception 'El nombre debe tener entre 3 y 100 caracteres válidos';
  end if;
  if jsonb_typeof(p_data->'capacity') is distinct from 'number'
    or coalesce(p_data->>'capacity','') !~ '^[0-9]{1,3}$' then
    raise exception 'Indica un cupo de 2 a 100 jugadores';
  end if;
  room_capacity:=(p_data->>'capacity')::integer;
  if room_capacity not between 2 and 100 then raise exception 'Indica un cupo de 2 a 100 jugadores'; end if;
  prize_value:=coalesce(p_data->'entry_price','0'::jsonb);
  if jsonb_typeof(prize_value) is distinct from 'number'
    or prize_value::text !~ '^[0-9]+(\.[0-9]{1,2})?$' or prize_value::text::numeric>10000 then
    raise exception 'Revisa la entrada: usa un número de 0 a 10000 con hasta dos decimales';
  end if;
  entry_amount:=prize_value::text::numeric;
  if p_data ?| array['kill_reward','booyah_reward'] then
    raise exception 'Solo Top se configura con una lista de premios por puesto';
  end if;
  begin
    scheduled:=(p_data->>'scheduled_at')::timestamptz;
    closes:=(p_data->>'closes_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Completa fechas y horas válidas';
  end;
  if scheduled is null or closes is null or not isfinite(scheduled) or not isfinite(closes) or closes>scheduled then
    raise exception 'Revisa las fechas: el cierre no puede ser posterior a la partida';
  end if;
  top_prizes:=p_data->'top_prizes';
  if jsonb_typeof(top_prizes) is distinct from 'array' then raise exception 'Envía los premios Top como una lista de importes'; end if;
  prize_count:=jsonb_array_length(top_prizes);
  if prize_count not between 1 and room_capacity then raise exception 'Configura entre 1 y % puestos premiados',room_capacity; end if;
  for prize_value in select value from jsonb_array_elements(top_prizes) loop
    if jsonb_typeof(prize_value) is distinct from 'number'
      or prize_value::text !~ '^[0-9]+(\.[0-9]{1,2})?$' or prize_value::text::numeric>1000000 then
      raise exception 'Cada premio debe ser un número de 0 a 1000000 con hasta dos decimales';
    end if;
  end loop;

  if p_action='edit' then
    delete from solo_top_room_prizes where room_id=target_room_id;
    update solo_top_rooms set name=room_name,scheduled_at=scheduled,closes_at=closes,
      capacity=room_capacity,entry_price=entry_amount,rewarded_places=prize_count where id=target_room_id;
  else
    insert into solo_top_rooms(name,scheduled_at,closes_at,capacity,entry_price,rewarded_places,created_by)
      values(room_name,scheduled,closes,room_capacity,entry_amount,prize_count,auth.uid()) returning id into target_room_id;
  end if;
  insert into solo_top_room_prizes(room_id,edition_id,place,amount)
    select target_room_id,current_edition_id(),ordinality::integer,value::text::numeric
    from jsonb_array_elements(top_prizes) with ordinality;
  return jsonb_build_object('id',target_room_id,'participation','solo','mode','top','status','draft',
    'capacity',room_capacity,'rewarded_places',prize_count);
end $$;
revoke all on function public.manage_solo_top_room_draft(text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_solo_top_room_draft(text,jsonb) to authenticated;

insert into public.schema_migrations(version,description) values('030','Base privada de Solo por Top con premios configurables por puesto');
notify pgrst,'reload schema';
commit;
