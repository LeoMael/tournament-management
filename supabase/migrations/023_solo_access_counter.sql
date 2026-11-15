-- Contador privado independiente para clics en Enviar acceso.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='022') then raise exception 'Se requiere 022'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;
alter table public.solo_registrations add column access_click_count integer not null default 0
  check(access_click_count>=0);

create function public.count_solo_access_click(p_edition_id uuid,p_room_id uuid,p_registration_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype; a solo_registrations%rowtype;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select * into r from solo_rooms where id=p_room_id for update;
  if not found or r.edition_id is distinct from p_edition_id then raise exception 'Sala no encontrada en esta edición'; end if;
  if r.status not in ('open','closed','playing') then raise exception 'Esta sala no admite enviar acceso'; end if;
  if not exists(select 1 from solo_room_access where room_id=r.id) then raise exception 'Guarda el ID y la contraseña de la sala primero'; end if;
  update solo_registrations set access_click_count=access_click_count+1
    where id=p_registration_id and room_id=r.id and edition_id=p_edition_id and status='approved' and slot is not null
    returning * into a;
  if not found then raise exception 'Participante no aprobado o sin slot en esta sala'; end if;
  return jsonb_build_object('id',a.id,'access_click_count',a.access_click_count);
end $$;
revoke all on function public.count_solo_access_click(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.count_solo_access_click(uuid,uuid,uuid) to authenticated;
comment on column public.solo_registrations.access_click_count is 'Clics en Enviar acceso; no acredita envío ni entrega del mensaje. Independiente de confirmación.';
insert into public.schema_migrations(version,description) values('023','Contador compartido independiente de clics de acceso Solo');
notify pgrst, 'reload schema';
commit;
