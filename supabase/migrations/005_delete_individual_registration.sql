-- Elimina solo solicitudes rechazadas o reembolsadas, sin borrar comprobantes.
begin;

do $$
begin
  if not exists (select 1 from public.schema_migrations sm where sm.version = '004') then
    raise exception 'Se requiere la migración 004';
  end if;
end $$;

create or replace function public.delete_individual_registration(p_id uuid, p_confirmation text, p_expected_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game text;
  v_status text;
  v_group_id uuid;
  v_deleted_id uuid;
begin
  if not public.is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode = '42501'; end if;
  if p_confirmation is distinct from 'ELIMINAR' then raise exception 'Confirmación inválida'; end if;
  if p_expected_status is null or p_expected_status not in ('rejected', 'refunded') then raise exception 'Estado esperado no permitido'; end if;
  if p_id is null then raise exception 'Solicitud inválida'; end if;

  select ir.game_key into v_game from public.individual_registrations ir where ir.id = p_id;
  if not found then return jsonb_build_object('id', p_id, 'deleted', true, 'already_deleted', true); end if;
  perform pg_advisory_xact_lock(hashtext('reg:' || v_game));
  select ir.status, ir.group_id into v_status, v_group_id
    from public.individual_registrations ir where ir.id = p_id for update;
  if not found then return jsonb_build_object('id', p_id, 'deleted', true, 'already_deleted', true); end if;
  if v_status is distinct from p_expected_status then raise exception 'El estado de la solicitud cambió; actualiza e inténtalo de nuevo'; end if;
  if v_group_id is not null or exists (select 1 from public.individual_groups ig where ig.captain_id = p_id) then
    raise exception 'La solicitud está asociada a un grupo y no puede eliminarse';
  end if;
  delete from public.individual_registrations ir where ir.id = p_id returning ir.id into v_deleted_id;
  if v_deleted_id is null then raise exception 'No se pudo eliminar la solicitud'; end if;
  return jsonb_build_object('id', v_deleted_id, 'deleted', true, 'already_deleted', false);
end;
$$;
revoke all on function public.delete_individual_registration(uuid, text, text) from public, anon;
grant execute on function public.delete_individual_registration(uuid, text, text) to authenticated;

insert into public.schema_migrations(version, description) values ('005', 'Eliminación controlada de solicitudes individuales') on conflict (version) do nothing;
commit;
