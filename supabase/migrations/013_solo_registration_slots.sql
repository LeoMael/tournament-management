-- Slots persistentes por sala, asignados al aprobar una inscripción.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='012') then raise exception 'Se requiere 012'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

alter table public.solo_registrations add column slot smallint check(slot between 1 and 100);
alter table public.solo_registrations add constraint solo_registration_room_slot_unique unique(room_id,slot);

-- La fecha de revisión es la mejor evidencia disponible para aprobaciones anteriores.
do $$ begin
  if exists(select 1 from public.solo_registrations a join public.solo_rooms r on r.id=a.room_id
    where a.status='approved' group by r.id,r.capacity having count(*)>r.capacity) then
    raise exception 'Hay una sala con más aprobados que su capacidad. Revisa sus inscripciones antes de asignar slots.';
  end if;
end $$;
with ordered as (
  select id,row_number() over(partition by room_id order by reviewed_at asc nulls last,created_at,id)::smallint as slot
  from public.solo_registrations where status='approved'
)
update public.solo_registrations a set slot=o.slot from ordered o where a.id=o.id;

create function public.assign_solo_registration_slot() returns trigger
language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype;
begin
  if tg_op='UPDATE' and old.slot is not null then
    if new.slot is distinct from old.slot or new.room_id is distinct from old.room_id then
      raise exception 'El slot asignado no puede cambiar de número ni de sala';
    end if;
    return new;
  end if;
  -- Pendientes, rechazados y devoluciones sin aprobación no reciben slot.
  new.slot:=null;
  if new.status<>'approved' then return new; end if;
  -- manage_solo ya bloquea esta fila; también serializa aprobaciones desde otros procesos.
  select * into r from solo_rooms where id=new.room_id for update;
  if not found or r.edition_id is distinct from new.edition_id then raise exception 'Sala no encontrada en esta edición'; end if;
  select n into new.slot from generate_series(1,r.capacity) n
    where not exists(select 1 from solo_registrations a where a.room_id=r.id and a.slot=n)
    order by n limit 1;
  if new.slot is null then raise exception 'No quedan slots disponibles en esta sala'; end if;
  return new;
end $$;
revoke all on function public.assign_solo_registration_slot() from public,anon,authenticated;
create trigger assign_solo_registration_slot before insert or update on public.solo_registrations
  for each row execute function public.assign_solo_registration_slot();

insert into public.schema_migrations(version,description)
values('013','Slots Solo persistentes por sala según el orden de aprobación');
commit;
