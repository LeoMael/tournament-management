-- =====================================================================
-- REINICIO: borra TODOS los datos y tablas del torneo para empezar de cero.
-- Solo para desarrollo. NO borra tus usuarios (Authentication) ni la tabla `admins`,
-- así que sigues siendo admin después de reiniciar. Luego ejecuta 01_schema.sql y 02_seed.sql.
-- Los archivos de Storage no se borran por SQL: límpialos desde Storage si quieres.
-- =====================================================================

-- Políticas de Storage (dependen de is_admin())
drop policy if exists receipts_insert_public on storage.objects;
drop policy if exists logos_insert_public on storage.objects;
drop policy if exists receipts_admin_read on storage.objects;
drop policy if exists receipts_admin_delete on storage.objects;
drop policy if exists logos_admin_all on storage.objects;
drop policy if exists assets_admin_all on storage.objects;

drop view if exists public.public_availability, public.public_match_results, public.public_matches,
  public.public_group_teams, public.public_groups, public.public_stages, public.public_teams cascade;

drop table if exists public.match_results, public.matches, public.group_teams, public.groups,
  public.stages, public.players, public.registrations, public.rules_sections,
  public.participation_steps, public.audit_log, public.prizes, public.games,
  public.tournament_settings cascade;

drop function if exists public.submit_registration(jsonb);
drop function if exists public.audit_trigger() cascade;
