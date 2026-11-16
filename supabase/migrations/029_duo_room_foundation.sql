-- Paso 1 de Dúo: configuración privada de borradores y premios, sin habilitar inscripciones.
-- No altera tablas, funciones ni vistas de Solo, equipos FF o MLBB.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='028') then raise exception 'Se requiere 028'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

create table public.duo_rooms (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null default public.current_edition_id() references public.tournament_editions(id),
  name text not null check(btrim(name) ~ '^[^<>[:cntrl:]]{3,100}$'),
  mode text not null check(mode in ('top','kills')),
  -- En este paso solo hay borradores: nadie puede abrir una modalidad incompleta.
  status text not null default 'draft' constraint duo_foundation_draft_only check(status='draft'),
  scheduled_at timestamptz not null check(isfinite(scheduled_at)),
  closes_at timestamptz not null check(isfinite(closes_at)),
  capacity integer not null check(capacity between 2 and 50),
  entry_price numeric(10,2) not null default 0 check(entry_price between 0 and 10000),
  kill_reward numeric(10,2) not null default 0 check(kill_reward between 0 and 10000),
  booyah_reward numeric(10,2) not null default 0 check(booyah_reward between 0 and 1000000),
  rewarded_places integer not null default 0 check(rewarded_places between 0 and 50),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(id,edition_id),
  check(closes_at<=scheduled_at),
  check((mode='top' and rewarded_places between 1 and capacity and kill_reward=0 and booyah_reward=0)
    or (mode='kills' and rewarded_places=0))
);
comment on table public.duo_rooms is 'Borradores privados Dúo, una sala/una partida. Modalidad Top o kills. Paso 1: sin inscripciones ni publicación.';
comment on column public.duo_rooms.capacity is 'Cantidad de parejas; no cantidad de jugadores. Límite técnico configurable de 2 a 50 dúos, a ajustar a la sala de juego.';
comment on column public.duo_rooms.entry_price is 'Entrada total de la pareja para una sola partida.';
comment on column public.duo_rooms.kill_reward is 'Tarifa por kill del dúo: se aplicará a la suma de kills de ambos jugadores.';
comment on column public.duo_rooms.rewarded_places is 'Cantidad de puestos con premio fijo en Top; cero para modalidad kills.';

create table public.duo_room_prizes (
  room_id uuid not null,
  edition_id uuid not null,
  place integer not null check(place between 1 and 50),
  amount numeric(12,2) not null check(amount between 0 and 1000000),
  primary key(room_id,place),
  foreign key(room_id,edition_id) references public.duo_rooms(id,edition_id) on delete cascade
);
comment on table public.duo_room_prizes is 'Premio monetario fijo por puesto final del dúo, sin puntos ni acumulación entre partidas.';

-- RLS explícita para las tablas nuevas; no se modifica ninguna política anterior.
alter table public.duo_rooms enable row level security;
alter table public.duo_room_prizes enable row level security;
revoke all on public.duo_rooms,public.duo_room_prizes from public,anon,authenticated;
grant select on public.duo_rooms,public.duo_room_prizes to authenticated;
create policy duo_rooms_staff_read on public.duo_rooms for select to authenticated
  using(public.is_admin() or (public.has_role(array['revisor_arbitro']) and edition_id=public.current_edition_id()));
create policy duo_prizes_staff_read on public.duo_room_prizes for select to authenticated
  using(public.is_admin() or (public.has_role(array['revisor_arbitro']) and edition_id=public.current_edition_id()));

create trigger edition_barrier before insert or update or delete on public.duo_rooms
  for each statement execute function public.edition_write_guard();
create trigger edition_row before insert or update on public.duo_rooms
  for each row execute function public.edition_write_guard();
create trigger edition_barrier before insert or update or delete on public.duo_room_prizes
  for each statement execute function public.edition_write_guard();
create trigger edition_row before insert or update on public.duo_room_prizes
  for each row execute function public.edition_write_guard();
create trigger audit_duo_rooms after insert or update or delete on public.duo_rooms
  for each row execute function public.audit_trigger();
create trigger audit_duo_prizes after insert or update or delete on public.duo_room_prizes
  for each row execute function public.audit_trigger();

-- Las filas por puesto siempre pertenecen a la misma edición/sala y solo se configuran en borrador.
create function public.guard_duo_room_prize() returns trigger
language plpgsql security definer set search_path=public as $$
declare r duo_rooms%rowtype;
begin
  if tg_op='UPDATE' and (new.room_id is distinct from old.room_id or new.edition_id is distinct from old.edition_id) then
    raise exception 'No se puede mover un premio a otra sala o edición';
  end if;
  select * into r from duo_rooms where id=case when tg_op='DELETE' then old.room_id else new.room_id end for update;
  -- Durante ON DELETE CASCADE el padre ya fue eliminado.
  if not found then
    if tg_op='DELETE' then return old; end if;
    raise exception 'Sala Dúo no encontrada';
  end if;
  if r.edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  if r.status<>'draft' then raise exception 'Los premios solo se configuran en borrador'; end if;
  if tg_op<>'DELETE' and (r.mode<>'top' or new.place>r.rewarded_places) then raise exception 'El puesto no pertenece a los premios Top de esta sala'; end if;
  return coalesce(new,old);
end $$;
revoke all on function public.guard_duo_room_prize() from public,anon,authenticated;
create trigger guard_duo_room_prize before insert or update or delete on public.duo_room_prizes
  for each row execute function public.guard_duo_room_prize();

-- Control diferido: cada Top debe tener exactamente los puestos 1..N, sin huecos.
-- Permite sustituir la lista completa de premios de forma atómica en una transacción.
create function public.check_duo_room_prizes() returns trigger
language plpgsql security definer set search_path=public as $$
declare room_key uuid; r duo_rooms%rowtype; total integer;
begin
  if tg_table_name='duo_rooms' then room_key:=case when tg_op='DELETE' then old.id else new.id end;
  else room_key:=case when tg_op='DELETE' then old.room_id else new.room_id end; end if;
  select * into r from duo_rooms where id=room_key;
  if not found then return null; end if;
  select count(*) into total from duo_room_prizes where room_id=r.id;
  if (r.mode='top' and (total<>r.rewarded_places or exists(
      select 1 from generate_series(1,r.rewarded_places) n where not exists(select 1 from duo_room_prizes where room_id=r.id and place=n))))
    or (r.mode='kills' and total<>0) then raise exception 'Completa los premios Top consecutivos del puesto 1 al %',r.rewarded_places; end if;
  return null;
end $$;
revoke all on function public.check_duo_room_prizes() from public,anon,authenticated;
create constraint trigger duo_room_prizes_complete after insert or update on public.duo_rooms
  deferrable initially deferred for each row execute function public.check_duo_room_prizes();
create constraint trigger duo_room_prize_rows_complete after insert or update or delete on public.duo_room_prizes
  deferrable initially deferred for each row execute function public.check_duo_room_prizes();

-- CRUD exclusivo de borradores. No contiene acciones open/review/result/finish/pay.
create function public.manage_duo_room_draft(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r duo_rooms%rowtype; room_key uuid; clean_name text; room_mode text; room_capacity integer;
  scheduled timestamptz; closes timestamptz; entry_amount numeric; per_kill numeric; booyah numeric;
  top_prizes jsonb; reward_count integer; val jsonb; key text;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Envía los datos de la sala Dúo'; end if;
  if p_data->>'edition_id' is distinct from current_edition_id()::text then raise exception 'La edición cambió. Actualiza la página.'; end if;
  if p_action is null or p_action not in ('create','edit','delete') then raise exception 'En este paso Dúo solo permite crear, editar o eliminar borradores'; end if;
  if p_action<>'create' then
    select * into r from duo_rooms where id=(p_data->>'room_id')::uuid for update;
    if not found or r.edition_id is distinct from current_edition_id() then raise exception 'Sala Dúo no encontrada en esta edición'; end if;
    if r.status<>'draft' then raise exception 'Solo se pueden modificar borradores Dúo'; end if;
    room_key:=r.id;
  end if;
  if p_action='delete' then
    if p_data->>'confirmation' is distinct from r.name then raise exception 'Escribe el nombre exacto de la sala Dúo'; end if;
    delete from duo_rooms where id=r.id;
    return jsonb_build_object('id',r.id,'deleted',true);
  end if;
  clean_name:=btrim(p_data->>'name'); room_mode:=p_data->>'mode';
  if clean_name is null or clean_name !~ '^[^<>[:cntrl:]]{3,100}$' then raise exception 'El nombre debe tener entre 3 y 100 caracteres válidos'; end if;
  if room_mode is null or room_mode not in ('top','kills') then raise exception 'Elige Dúo por Top o Dúo por kills'; end if;
  if jsonb_typeof(p_data->'capacity') is distinct from 'number' or coalesce(p_data->>'capacity','') !~ '^[0-9]{1,2}$' then raise exception 'Indica un cupo de 2 a 50 parejas'; end if;
  room_capacity:=(p_data->>'capacity')::integer;
  if room_capacity not between 2 and 50 then raise exception 'Indica un cupo de 2 a 50 parejas'; end if;
  foreach key in array array['entry_price','kill_reward','booyah_reward'] loop
    val:=coalesce(p_data->key,'0'::jsonb);
    if jsonb_typeof(val) is distinct from 'number' or val::text !~ '^[0-9]+(\.[0-9]{1,2})?$'
      or val::text::numeric>(case when key='booyah_reward' then 1000000 else 10000 end) then
      raise exception 'Revisa el importe de %: usa un número no negativo con hasta dos decimales',key;
    end if;
  end loop;
  entry_amount:=coalesce((p_data->>'entry_price')::numeric,0);
  per_kill:=coalesce((p_data->>'kill_reward')::numeric,0);
  booyah:=coalesce((p_data->>'booyah_reward')::numeric,0);
  begin
    scheduled:=(p_data->>'scheduled_at')::timestamptz;
    closes:=(p_data->>'closes_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Completa fechas y horas válidas'; end;
  if scheduled is null or closes is null or not isfinite(scheduled) or not isfinite(closes) or closes>scheduled then raise exception 'Revisa las fechas: el cierre no puede ser posterior a la partida'; end if;
  top_prizes:=coalesce(p_data->'top_prizes','[]'::jsonb);
  if jsonb_typeof(top_prizes) is distinct from 'array' then raise exception 'Envía los premios Top como una lista de importes'; end if;
  reward_count:=jsonb_array_length(top_prizes);
  if room_mode='top' then
    if reward_count not between 1 and room_capacity then raise exception 'Configura entre 1 y % puestos premiados',room_capacity; end if;
    if per_kill<>0 or booyah<>0 then raise exception 'Dúo por Top usa premios fijos por puesto, sin premios por kills ni Booyah'; end if;
    for val in select value from jsonb_array_elements(top_prizes) loop
      if jsonb_typeof(val) is distinct from 'number' or val::text !~ '^[0-9]+(\.[0-9]{1,2})?$' or val::text::numeric>1000000 then
        raise exception 'Cada premio Top debe ser un número de 0 a 1000000 con hasta dos decimales';
      end if;
    end loop;
  elsif reward_count<>0 then raise exception 'Dúo por kills no utiliza premios fijos por puesto'; end if;

  -- Borrar primero los premios permite cambiar modalidad/cantidad mientras siga siendo borrador.
  if p_action='edit' then
    delete from duo_room_prizes where room_id=room_key;
    update duo_rooms set name=clean_name,mode=room_mode,scheduled_at=scheduled,closes_at=closes,capacity=room_capacity,
      entry_price=entry_amount,kill_reward=per_kill,booyah_reward=booyah,rewarded_places=reward_count where id=room_key;
  else
    insert into duo_rooms(name,mode,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,rewarded_places,created_by)
      values(clean_name,room_mode,scheduled,closes,room_capacity,entry_amount,per_kill,booyah,reward_count,auth.uid()) returning id into room_key;
  end if;
  if room_mode='top' then
    insert into duo_room_prizes(room_id,edition_id,place,amount)
      select room_key,current_edition_id(),ordinality::integer,value::text::numeric from jsonb_array_elements(top_prizes) with ordinality;
  end if;
  return jsonb_build_object('id',room_key,'mode',room_mode,'status','draft','capacity',room_capacity,'rewarded_places',reward_count);
end $$;
revoke all on function public.manage_duo_room_draft(text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_duo_room_draft(text,jsonb) to authenticated;

insert into public.schema_migrations(version,description) values('029','Base privada de borradores Dúo Top y kills, sin activar inscripciones ni alterar Solo');
notify pgrst,'reload schema';
commit;
