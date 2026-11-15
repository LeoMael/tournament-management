-- FF y MLBB: separa contacto y Yape receptor sin cambiar roster ni comprobantes.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='024') then raise exception 'Se requiere 024'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;
alter table public.registrations add column if not exists prize_yape_phone text;
update public.registrations set prize_yape_phone=captain_whatsapp
  where prize_yape_phone is null or btrim(prize_yape_phone)='';
alter table public.registrations alter column prize_yape_phone set not null;
alter table public.registrations add constraint team_prize_yape_phone_valid check(prize_yape_phone ~ '^[0-9]{8,15}$');
comment on column public.registrations.prize_yape_phone is 'Yape receptor de premios. Independiente de captain_whatsapp y del titular del comprobante.';

-- Mantiene compatibles las inserciones internas existentes. No sincroniza cambios posteriores.
create function public.fill_team_prize_yape_phone() returns trigger language plpgsql set search_path=public as $$
begin
  if new.prize_yape_phone is null then new.prize_yape_phone:=new.captain_whatsapp; end if;
  return new;
end $$;
revoke all on function public.fill_team_prize_yape_phone() from public,anon,authenticated;
create trigger fill_team_prize_yape_phone before insert on public.registrations
for each row execute function public.fill_team_prize_yape_phone();

-- Conserva el contrato y delega en la validación existente de equipos/roster/pago/cupos.
create or replace function public.submit_registration(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  perform pg_advisory_xact_lock_shared(724091);
  if payload->>'edition_id' is distinct from current_edition_id()::text then raise exception 'La edición cambió. Actualiza la página.'; end if;
  if payload ? 'prize_yape_phone' and (jsonb_typeof(payload->'prize_yape_phone') is distinct from 'string'
    or coalesce(payload->>'prize_yape_phone','') !~ '^[0-9]{8,15}$') then
    raise exception 'Revisa el número de Yape para premios (8 a 15 dígitos)';
  end if;
  result:=submit_registration_before_editions(payload);
  if payload ? 'prize_yape_phone' then
    update registrations set prize_yape_phone=payload->>'prize_yape_phone'
      where id=(result->>'id')::uuid and edition_id=current_edition_id();
  end if;
  return result;
end $$;
revoke all on function public.submit_registration(jsonb) from public,anon,authenticated;
grant execute on function public.submit_registration(jsonb) to anon,authenticated;
-- Sin cambios en políticas de edición, vistas públicas ni en el registro individual/Solo.
insert into public.schema_migrations(version,description) values('025','Separar WhatsApp y Yape para premios en equipos FF y MLBB');
notify pgrst, 'reload schema';
commit;
