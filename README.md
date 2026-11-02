# RAGNAROK Admin Panel

Panel de administración (React + Vite + Supabase) para el torneo RAGNAROK U-Series.

## Puesta en marcha
1. Sigue `../supabase/README.md` (migraciones, primer admin, desactivar signups).
2. `cp .env.example .env` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (solo la anon key).
3. `npm install && npm run dev` → http://localhost:5174

## Módulos
- **Dashboard**: recaudación, cupos y estado de inscripciones.
- **Inscripciones**: revisar roster y comprobante (imagen/PDF), aprobar/rechazar, editar, exportar CSV.
- **Formato / Llaves**: grupos (round-robin), eliminación directa y Battle Royale; carga de resultados y publicación.
- **Configuración**: precios, cupos, premios, fecha de cierre y datos/QR de Yape.
- **Contenido del sitio**: PDF del reglamento por juego, secciones del reglamento, tabla de puntos y pasos de participación.
- **Equipo** (solo admin): crear usuarios, cambiar roles y contraseñas, quitar accesos. Usa la Edge Function `manage-team` (ver `../supabase/README.md`).
- **Auditoría**: historial de cambios.

## Roles
`admin` (todo), `editor` (solo Contenido) y `revisor_arbitro` (Inscripciones + Grupos y llaves). Definidos en `src/lib/permissions.js` y aplicados en la base por RLS.

## Seguridad
- Solo anon key + sesión del usuario; el acceso real lo controla RLS (`is_admin()`).
- Quien inicia sesión y no está en `admins` es expulsado al instante.
- Cierre de sesión tras 30 min de inactividad; bloqueo de 1 min tras 5 intentos fallidos de login.
- CSP estricta en el build (`vite.config.js`) y cabeceras en `public/_headers`.
