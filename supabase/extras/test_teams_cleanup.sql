-- Borra SOLO los equipos de prueba creados con test_teams.sql
-- (sus jugadores, grupos y partidas asociados se eliminan en cascada).
delete from public.registrations where receipt_path like 'test-%';
