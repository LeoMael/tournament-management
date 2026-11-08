begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='008') then raise exception 'Se requiere 008'; end if;
end $$;
create table public.tournament_archive_records (
  id bigint generated always as identity primary key,
  edition_id uuid not null references public.tournament_editions(id),
  source text not null,
  data jsonb not null
);
create index tournament_archive_source on public.tournament_archive_records(edition_id,source,id);
create table public.tournament_archive_assets (
  edition_id uuid not null references public.tournament_editions(id),
  bucket text not null,
  path text not null,
  primary key(edition_id,bucket,path)
);
create table public.tournament_archive_public (
  edition_id uuid primary key references public.tournament_editions(id),
  data jsonb not null
);
do $$ declare t text; begin
  foreach t in array array['tournament_archive_records','tournament_archive_assets','tournament_archive_public'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy archive_admin_read on public.%I for select to authenticated using (public.is_admin())',t);
  end loop;
end $$;

create function public.archive_asset_used(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from tournament_archive_assets where bucket=p_bucket and path=p_path)
$$;
revoke all on function public.archive_asset_used(text,text) from public;
grant execute on function public.archive_asset_used(text,text) to authenticated;
create function public.archive_asset_mutable(p_bucket text,p_path text) returns boolean language plpgsql volatile security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock_shared(724091);
  return not archive_asset_used(p_bucket,p_path);
end $$;
revoke all on function public.archive_asset_mutable(text,text) from public;
grant execute on function public.archive_asset_mutable(text,text) to authenticated;
-- Restrictiva: se combina con TODAS las políticas permisivas ya existentes.
create policy archive_assets_no_delete on storage.objects as restrictive for delete to authenticated
  using (public.archive_asset_mutable(bucket_id,name));
create policy archive_assets_no_overwrite on storage.objects as restrictive for update to authenticated
  using (public.archive_asset_mutable(bucket_id,name)) with check(public.archive_asset_mutable(bucket_id,name));

create policy archive_receipts_admin_only on storage.objects as restrictive for select to authenticated
  using(bucket_id<>'receipts' or not public.archive_asset_used(bucket_id,name) or public.is_admin());

-- Se protege el comprobante archivado incluso si se vuelve a enviar su ruta por RPC.
create function public.archive_receipt_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from tournament_archive_assets where bucket='receipts' and path=new.receipt_path) then raise exception 'El comprobante pertenece a una edición archivada'; end if;
  return new;
end $$;
revoke all on function public.archive_receipt_guard() from public;
do $$ declare t text; begin
  foreach t in array array['registrations','individual_registrations','solo_registrations'] loop
    execute format('create trigger archive_receipt_guard before insert or update of receipt_path on public.%I for each row execute function public.archive_receipt_guard()',t);
  end loop;
end $$;

-- El estado closing solo puede establecerse dentro de close_tournament_edition.
-- Evita deshabilitar triggers o introducir una bandera de bypass controlable por el cliente.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.individual_registration_guard()'::regprocedure);
  definition:=regexp_replace(definition,'\mbegin\M',E'begin\n  if public.is_admin() and exists(select 1 from public.tournament_editions where status=''closing'') then return coalesce(new,old); end if;','i');
  execute definition;
end $$;

create function public.edition_close_preview() returns jsonb language plpgsql security definer set search_path=public as $$
declare blockers jsonb; counts jsonb;
begin
  if not is_admin() then raise exception 'Sin permisos' using errcode='42501'; end if;
  select jsonb_build_object(
    'Inscripciones de equipos sin revisar',(select count(*) from registrations where status='pending'),
    'Inscripciones individuales sin resolver',(select count(*) from individual_registrations where status not in ('registered','rejected','refunded')),
    'Grupos individuales provisionales',(select count(*) from individual_groups where status='draft'),
    'Partidos pendientes',(select count(*) from matches where status<>'completed'),
    'Salas Solo sin terminar',(select count(*) from solo_rooms where status not in ('finished','cancelled')),
    'Inscripciones Solo sin revisar',(select count(*) from solo_registrations where status='pending'),
    'Liquidaciones Solo pendientes',(select count(*) from solo_payments where paid_at is null),
    'Devoluciones Solo pendientes',(select count(*) from solo_registrations where status='refund_pending')
  ) into blockers;
  select jsonb_build_object('equipos',(select count(*) from registrations),'jugadores',(select count(*) from players),
    'individuales',(select count(*) from individual_registrations),'fases',(select count(*) from stages),'partidos',(select count(*) from matches),
    'salas_solo',(select count(*) from solo_rooms),'inscripciones_solo',(select count(*) from solo_registrations)) into counts;
  return jsonb_build_object('edition_id',current_edition_id(),'counts',counts,'blockers',blockers);
end $$;

create function public.close_tournament_edition(p_edition_id uuid,p_confirmation text,p_next_name text,p_next_deadline timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e tournament_editions%rowtype; next_id uuid; preview jsonb; t text; public_data jsonb:='{}'; rows_json jsonb;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(724091);
  select * into e from tournament_editions where id=p_edition_id for update;
  if not found then raise exception 'Edición no encontrada'; end if;
  if e.status='archived' then return jsonb_build_object('archived_id',e.id,'already_archived',true,'active_id',current_edition_id()); end if;
  if p_confirmation is distinct from e.name then raise exception 'Escribe el nombre exacto de la edición'; end if;
  if coalesce(char_length(btrim(p_next_name)),0) not between 3 and 120 or p_next_deadline is null or p_next_deadline<=now() then raise exception 'Define el nombre y un cierre futuro para la siguiente edición'; end if;
  preview:=edition_close_preview();
  if exists(select 1 from jsonb_each_text(preview->'blockers') where value::integer>0) then raise exception 'Resuelve los pendientes antes de cerrar la edición' using detail=(preview->'blockers')::text; end if;
  update tournament_editions set status='closing' where id=e.id;

  foreach t in array array['tournament_settings','games','prizes','game_prize_pools','individual_settings','rules_sections','participation_steps','registrations','players','stages','groups','group_teams','matches','match_results','schedule_events','individual_registrations','individual_groups','individual_draws','solo_rooms','solo_registrations','solo_results','solo_payments'] loop
    execute format('insert into tournament_archive_records(edition_id,source,data) select $1,%L,to_jsonb(x) from public.%I x',t,t) using e.id;
  end loop;
  -- Proyección congelada, construida exclusivamente desde vistas públicas y campos explícitos.
  foreach t in array array['public_teams','public_team_players','public_stages','public_groups','public_group_teams','public_matches','public_match_results','public_solo_rooms','public_solo_results'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.%I x',t) into rows_json;
    public_data:=public_data||jsonb_build_object(t,rows_json);
  end loop;
  select coalesce(jsonb_agg(to_jsonb(p)),'[]') into rows_json from prizes p where game_key is not null and is_announced;
  public_data:=public_data||jsonb_build_object('prizes',rows_json);
  select coalesce(jsonb_agg(to_jsonb(p)),'[]') into rows_json from game_prize_pools p where is_announced;
  public_data:=public_data||jsonb_build_object('prize_pools',rows_json);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'starts_at',starts_at)),'[]') into rows_json from schedule_events;
  public_data:=public_data||jsonb_build_object('events',rows_json);
  insert into tournament_archive_public values(e.id,public_data);

  insert into tournament_archive_assets(edition_id,bucket,path)
    select distinct e.id,case when a.key='logo_path' then 'team-logos' when a.key in ('receipt_path','refund_receipt_path') then 'receipts' else 'public-assets' end,a.value
    from tournament_archive_records r cross join lateral jsonb_each_text(r.data) a
    where r.edition_id=e.id and a.key in ('logo_path','receipt_path','refund_receipt_path','rules_pdf_path','music_path','yape_qr_path') and nullif(a.value,'') is not null
    on conflict do nothing;
  if e.cover_path is not null then insert into tournament_archive_assets values(e.id,'public-assets',e.cover_path) on conflict do nothing; end if;

  delete from solo_payments; delete from solo_results; delete from solo_registrations; delete from solo_rooms;
  delete from match_results; delete from matches; delete from group_teams; delete from groups; delete from stages; delete from schedule_events;
  -- Romper las referencias circulares antes de eliminar grupos y equipos finalizados.
  update individual_groups set captain_id=null,registration_id=null;
  update individual_registrations set group_id=null;
  update registrations set individual_group_id=null;
  delete from players; delete from registrations; delete from individual_registrations; delete from individual_groups; delete from individual_draws;
  update tournament_editions set status='archived',closed_at=now(),is_published=false where id=e.id;
  insert into tournament_editions(name) values(btrim(p_next_name)) returning id into next_id;
  update tournament_settings set edition_id=next_id,registration_open=false,solo_enabled=false,registration_deadline=p_next_deadline,updated_at=now() where id=1;
  update games set is_open=false,live=false,updated_at=now();
  update individual_settings set is_open=false;
  update prizes set amount=0,reward_text='',is_announced=false,updated_at=now();
  update game_prize_pools set amount=0,is_announced=false,updated_at=now();
  insert into audit_log(actor,actor_email,table_name,op,row_key,old_data,new_data)
    values(auth.uid(),(select email from admins where user_id=auth.uid()),'tournament_editions','UPDATE',e.id::text,to_jsonb(e),jsonb_build_object('archived',true,'next_id',next_id,'counts',preview->'counts'));
  return jsonb_build_object('archived_id',e.id,'active_id',next_id);
end $$;

create function public.update_edition_metadata(p_id uuid,p_name text,p_description text,p_cover_path text,p_published boolean)
returns void language plpgsql security definer set search_path=public as $$
declare e tournament_editions%rowtype;
begin
  if not is_admin() then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  select * into e from tournament_editions where id=p_id for update;
  if not found then raise exception 'Edición no encontrada'; end if;
  if e.status<>'archived' and p_published then raise exception 'Solo se publican ediciones archivadas'; end if;
  if nullif(p_cover_path,'') is not null and not exists(select 1 from storage.objects where bucket_id='public-assets' and name=p_cover_path) then raise exception 'Portada no encontrada'; end if;
  update tournament_editions set name=btrim(p_name),description=coalesce(p_description,''),cover_path=nullif(p_cover_path,''),is_published=p_published where id=p_id;
  if e.status='archived' and nullif(p_cover_path,'') is not null then insert into tournament_archive_assets values(p_id,'public-assets',p_cover_path) on conflict do nothing; end if;
end $$;
create trigger audit_editions after update on public.tournament_editions for each row execute function public.audit_trigger();

create view public.public_tournament_editions as
  select id,name,slug,description,cover_path,started_at,closed_at from public.tournament_editions where status='archived' and is_published;
-- Función para detalle: vuelve a comprobar visibilidad en cada solicitud.
create function public.public_tournament_detail(p_slug text) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('edition',to_jsonb(e),'data',a.data) from public_tournament_editions e join tournament_archive_public a on a.edition_id=e.id where e.slug=p_slug
$$;
revoke all on public.public_tournament_editions from public;
grant select on public.public_tournament_editions to anon,authenticated;
revoke all on function public.edition_close_preview(),public.close_tournament_edition(uuid,text,text,timestamptz),public.update_edition_metadata(uuid,text,text,text,boolean),public.public_tournament_detail(text) from public,anon,authenticated;
grant execute on function public.edition_close_preview(),public.close_tournament_edition(uuid,text,text,timestamptz),public.update_edition_metadata(uuid,text,text,text,boolean) to authenticated;
grant execute on function public.public_tournament_detail(text) to anon,authenticated;
insert into public.schema_migrations(version,description) values ('009','Archivo inmutable y cierre transaccional de ediciones');
commit;
