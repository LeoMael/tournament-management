-- Cuenta aperturas de confirmación, no envíos confirmados por WhatsApp.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='021') then raise exception 'Se requiere 021'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

alter table public.solo_registrations add column confirmation_click_count integer not null default 0
  check(confirmation_click_count>=0);
-- El usuario confirma que ya contactó a todos los aprobados de la edición actual.
update public.solo_registrations set confirmation_click_count=1
where edition_id=public.current_edition_id() and status='approved';

create function public.count_solo_confirmation_click(p_edition_id uuid,p_room_id uuid,p_registration_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype; a solo_registrations%rowtype;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select * into r from solo_rooms where id=p_room_id for update;
  if not found or r.edition_id is distinct from p_edition_id then raise exception 'Sala no encontrada en esta edición'; end if;
  if r.status not in ('open','closed','playing') then raise exception 'Esta sala no admite confirmaciones'; end if;
  update solo_registrations set confirmation_click_count=confirmation_click_count+1
    where id=p_registration_id and room_id=r.id and edition_id=p_edition_id and status='approved' and slot is not null
    returning * into a;
  if not found then raise exception 'Participante no aprobado o sin slot en esta sala'; end if;
  return jsonb_build_object('id',a.id,'confirmation_click_count',a.confirmation_click_count);
end $$;
revoke all on function public.count_solo_confirmation_click(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.count_solo_confirmation_click(uuid,uuid,uuid) to authenticated;
comment on column public.solo_registrations.confirmation_click_count is 'Clics en Confirmar inscripción; no acredita envío ni entrega del mensaje.';
insert into public.schema_migrations(version,description) values('022','Contador compartido de clics de confirmación Solo');
notify pgrst, 'reload schema';
commit;
