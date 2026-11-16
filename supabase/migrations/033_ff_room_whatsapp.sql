-- Acceso privado y contadores de las modalidades nuevas; Solo por kills no cambia.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='032') then raise exception 'Se requiere 032'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;
alter table public.ff_room_registrations
  add column confirmation_click_count integer not null default 0 check(confirmation_click_count>=0),
  add column access_click_count integer not null default 0 check(access_click_count>=0);
create table public.ff_room_access (
  edition_id uuid not null,
  room_kind text not null check(room_kind in('solo_top','duo_top','duo_kills')),
  duo_room_id uuid,
  solo_top_room_id uuid,
  room_id uuid generated always as(coalesce(duo_room_id,solo_top_room_id)) stored,
  game_room_id text not null check(char_length(btrim(game_room_id)) between 1 and 100),
  room_password text not null check(char_length(btrim(room_password)) between 1 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key(room_kind,room_id),
  foreign key(duo_room_id,edition_id) references public.duo_rooms(id,edition_id) on delete cascade,
  foreign key(solo_top_room_id,edition_id) references public.solo_top_rooms(id,edition_id) on delete cascade,
  check((room_kind='solo_top' and solo_top_room_id is not null and duo_room_id is null)
    or(room_kind in('duo_top','duo_kills') and duo_room_id is not null and solo_top_room_id is null))
);
alter table public.ff_room_access enable row level security;
revoke all on public.ff_room_access from public,anon,authenticated;
grant select on public.ff_room_access to authenticated;
create policy staff_read on public.ff_room_access for select to authenticated
  using(public.has_role(array['admin','revisor_arbitro']) and edition_id=public.current_edition_id());
create trigger edition_barrier before insert or update or delete on public.ff_room_access for each statement execute function public.edition_write_guard();
create trigger edition_row before insert or update on public.ff_room_access for each row execute function public.edition_write_guard();
-- Sin trigger de auditoría: las credenciales no deben copiarse al audit_log ni al archivo público/privado.
create function public.save_ff_room_access(p_edition_id uuid,p_kind text,p_room_id uuid,p_game_room_id text,p_room_password text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; saved ff_room_access%rowtype;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió'; end if;
  r:=ff_room_data(p_kind,p_room_id);
  if (r->>'edition_id')::uuid is distinct from p_edition_id or r->>'status' not in('open','closed','playing') then raise exception 'Esta sala no admite cambios de acceso'; end if;
  if p_game_room_id is null or p_room_password is null or char_length(btrim(p_game_room_id)) not between 1 and 100 or char_length(btrim(p_room_password)) not between 1 and 100 then raise exception 'Completa ID y contraseña (máximo 100 caracteres)'; end if;
  insert into ff_room_access(edition_id,room_kind,duo_room_id,solo_top_room_id,game_room_id,room_password,updated_by)
    values(p_edition_id,p_kind,case when p_kind<>'solo_top' then p_room_id end,case when p_kind='solo_top' then p_room_id end,btrim(p_game_room_id),btrim(p_room_password),auth.uid())
    on conflict(room_kind,room_id) do update set game_room_id=excluded.game_room_id,room_password=excluded.room_password,updated_at=clock_timestamp(),updated_by=auth.uid()
    returning * into saved;
  return jsonb_build_object('room_id',saved.room_id,'room_kind',saved.room_kind,'edition_id',saved.edition_id,'game_room_id',saved.game_room_id,'room_password',saved.room_password);
end $$;
revoke all on function public.save_ff_room_access(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_ff_room_access(uuid,text,uuid,text,text) to authenticated;

create function public.prepare_ff_room_whatsapp(p_edition_id uuid,p_kind text,p_room_id uuid,p_registration_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; a ff_room_registrations%rowtype; credentials ff_room_access%rowtype;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió'; end if;
  r:=ff_room_data(p_kind,p_room_id);
  if (r->>'edition_id')::uuid is distinct from p_edition_id or r->>'status' not in('open','closed','playing') then raise exception 'Esta sala no admite mensajes de inscripción/acceso'; end if;
  if p_action is null or p_action not in('confirmation','access') then raise exception 'Tipo de mensaje inválido'; end if;
  select * into a from ff_room_registrations where id=p_registration_id and edition_id=p_edition_id and room_kind=p_kind and room_id=p_room_id and status='approved' and slot is not null for update;
  if not found then raise exception 'Participante no aprobado en esta sala'; end if;
  if p_action='access' then
    select * into credentials from ff_room_access where room_kind=p_kind and room_id=p_room_id and edition_id=p_edition_id;
    if not found then raise exception 'Guarda el ID y la contraseña primero'; end if;
    update ff_room_registrations set access_click_count=access_click_count+1 where id=a.id returning * into a;
  else
    update ff_room_registrations set confirmation_click_count=confirmation_click_count+1 where id=a.id returning * into a;
  end if;
  return jsonb_build_object('action',p_action,'room_id',p_room_id,'room_kind',p_kind,'edition_id',p_edition_id,
    'name',r->>'name','scheduled_at',r->>'scheduled_at','status',r->>'status',
    'registration_id',a.id,'nickname_1',a.nickname_1,'nickname_2',a.nickname_2,'whatsapp',a.whatsapp,'slot',a.slot,
    'confirmation_click_count',a.confirmation_click_count,'access_click_count',a.access_click_count,
    'game_room_id',case when p_action='access' then credentials.game_room_id end,
    'room_password',case when p_action='access' then credentials.room_password end);
end $$;
revoke all on function public.prepare_ff_room_whatsapp(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_ff_room_whatsapp(uuid,text,uuid,uuid,text) to authenticated;
comment on column public.ff_room_registrations.confirmation_click_count is 'Clics en Confirmar inscripción, no acredita envío ni entrega de WhatsApp.';
comment on column public.ff_room_registrations.access_click_count is 'Clics en Enviar acceso, independiente de confirmación; no acredita envío ni entrega.';

-- Las credenciales se descartan al archivar. Nunca se incluyen en snapshots.
do $$ declare definition text; patched text; begin
  definition:=pg_get_functiondef('public.close_tournament_edition(uuid,text,text,timestamptz)'::regprocedure);
  patched:=replace(definition,'foreach t in array array[''duo_rooms''','delete from public.ff_room_access where edition_id=e.id; foreach t in array array[''duo_rooms''');
  if patched=definition then raise exception 'No se pudo integrar la limpieza de credenciales'; end if;
  execute patched;
end $$;
insert into public.schema_migrations(version,description) values('033','Acceso privado y contadores de confirmación y acceso para Solo Top y Dúo');
notify pgrst,'reload schema';
commit;
