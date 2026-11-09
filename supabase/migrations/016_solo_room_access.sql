-- Acceso privado para WhatsApp. No modifica las vistas públicas ni manage_solo.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='015') then
    raise exception 'Se requiere la migración 015';
  end if;
  perform pg_advisory_xact_lock(724091);
end $$;

create table public.solo_room_access (
  room_id uuid primary key references public.solo_rooms(id) on delete cascade,
  game_room_id text not null check(char_length(btrim(game_room_id)) between 1 and 100),
  room_password text not null check(char_length(btrim(room_password)) between 1 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.solo_room_access enable row level security;
revoke all on public.solo_room_access from public,anon,authenticated;
grant select on public.solo_room_access to authenticated;
create policy staff_read on public.solo_room_access for select to authenticated
using (
  public.has_role(array['admin','revisor_arbitro'])
  and exists(select 1 from public.solo_rooms r where r.id=room_id and r.edition_id=public.current_edition_id())
);

create function public.save_solo_room_access(p_edition_id uuid,p_room_id uuid,p_game_room_id text,p_room_password text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype; saved solo_room_access%rowtype;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select * into r from solo_rooms where id=p_room_id for update;
  if not found or r.edition_id is distinct from p_edition_id then raise exception 'Sala no encontrada en esta edición'; end if;
  if r.status not in ('open','closed','playing') then raise exception 'Esta sala no admite cambios de acceso en su estado actual'; end if;
  if p_game_room_id is null or p_room_password is null
    or char_length(btrim(p_game_room_id)) not between 1 and 100
    or char_length(btrim(p_room_password)) not between 1 and 100 then
    raise exception 'Completa el ID y la contraseña (máximo 100 caracteres cada uno)';
  end if;
  insert into solo_room_access(room_id,game_room_id,room_password,updated_at,updated_by)
    values(r.id,btrim(p_game_room_id),btrim(p_room_password),now(),auth.uid())
  on conflict(room_id) do update set game_room_id=excluded.game_room_id,
    room_password=excluded.room_password,updated_at=excluded.updated_at,updated_by=excluded.updated_by
  returning * into saved;
  return jsonb_build_object('room_id',saved.room_id,'game_room_id',saved.game_room_id,'room_password',saved.room_password);
end $$;
revoke all on function public.save_solo_room_access(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_solo_room_access(uuid,uuid,text,text) to authenticated;
-- No se incluyen estas credenciales en el histórico público ni en el audit_log.
insert into public.schema_migrations(version,description) values('016','Acceso privado de salas Solo para compartir por WhatsApp');
notify pgrst, 'reload schema';
commit;
