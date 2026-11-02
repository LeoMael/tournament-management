-- =====================================================================
-- Registrar al PRIMER administrador (los demás se crean desde el panel -> Equipo).
-- 1) Crea el usuario en Authentication -> Users -> Add user (Auto confirm).
-- 2) Cambia el correo y ejecuta.
-- Debe responder "INSERT 0 1". Si responde "INSERT 0 0", el correo no coincide.
--
-- Roles:
--   admin            -> todo
--   editor           -> contenido del sitio (reglamento, pasos, textos, PDF, música)
--   revisor_arbitro  -> inscripciones + grupos, llaves y resultados
--
-- Para cambiar el rol de alguien ya registrado:
--   update public.admins set role = 'editor' where email = 'correo@dominio.com';
-- =====================================================================
insert into public.admins (user_id, email, role)
select id, email, 'admin' from auth.users where email = 'TU_CORREO@dominio.com'
on conflict (user_id) do update set role = excluded.role;
