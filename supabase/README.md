# Base de datos — RAGNAROK U-Series (Supabase)

Pensado para desarrollo: pocos archivos, todos en el SQL Editor y en este orden.

| Archivo | Para qué sirve |
|---|---|
| `00_reset.sql` | (Opcional) Borra tablas y datos del torneo para empezar de cero. Conserva usuarios y `admins`. |
| `01_schema.sql` | Tablas, RLS, vistas públicas, auditoría, Storage y la función de inscripción. |
| `02_seed.sql` | Datos iniciales = lo que hoy muestra el sitio (precios, premios, reglamento, pasos). |
| `03_admin.sql` | Registra al **primer** administrador (cambia el correo antes). El resto del equipo se gestiona desde el panel → **Equipo**. |
| `functions/manage-team/` | Edge Function que el panel usa para crear usuarios, cambiar roles y contraseñas. Hay que desplegarla (ver abajo). |
| `extras/test_teams.sql` | (Opcional) 28 equipos de prueba. `test_teams_cleanup.sql` los borra. |

## Primera vez
1. Crea el proyecto en https://supabase.com.
2. **Authentication → Providers → Email**: desactiva **"Allow new users to sign up"**.
3. Ejecuta `01_schema.sql` y luego `02_seed.sql`.
4. **Authentication → Users → Add user** (email + contraseña fuerte, Auto confirm). Solo para el primer admin.
5. Ejecuta `03_admin.sql` con tu correo.
5b. Despliega la función `manage-team` (sección siguiente) para gestionar el equipo desde el panel.
6. **Project Settings → API**: copia la URL y la clave pública (`anon` o `publishable`) a los `.env` de
   `admin-panel/` y `esports-tournament-manager/`. **Nunca** uses la `service_role`.

## Gestión del equipo desde el panel
El admin crea usuarios, cambia roles y contraseñas, y quita accesos en **Panel → Sistema → Equipo**. Eso necesita permisos de servidor
(la `service_role`), que nunca van al navegador, por eso existe la Edge Function `functions/manage-team/index.ts`:
1. **Edge Functions → Deploy a new function → Via Editor**, nombre exacto `manage-team`, pega el contenido de `functions/manage-team/index.ts` y despliega.
2. En la función → **Details / Settings**, desactiva **Verify JWT with legacy secret** (la función valida la sesión por sí misma).
3. No hay que configurar secretos: Supabase le inyecta `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

La función solo responde a usuarios con rol `admin`, no permite quitar al último admin ni quitarse el acceso a uno mismo, y registra cada cambio en Auditoría.

## Roles del panel
| Rol | Puede |
|---|---|
| `admin` | Todo: configuración, premios, auditoría, borrar inscripciones y el resto de módulos. |
| `editor` | Solo **Contenido del sitio** (reglamento, pasos, textos, PDF, música, tabla de puntos). |
| `revisor_arbitro` | **Inscripciones** (aprobar, rechazar, editar) y **Grupos y llaves** (sorteo, resultados, publicar). |

Sin la función, también se puede cambiar un rol por SQL: `update public.admins set role = 'editor' where email = 'correo@dominio.com';`
`01_schema.sql` es repetible: en una base ya creada, volver a ejecutarlo agrega la columna `role` (los admins existentes quedan como `admin`) y actualiza las políticas, sin borrar datos.

## Empezar de cero otra vez
`00_reset.sql` → `01_schema.sql` → `02_seed.sql` (no hace falta repetir `03_admin.sql`).

## Qué protege qué
- RLS activo en todas las tablas. `anon` no puede leer inscripciones, jugadores, comprobantes ni auditoría.
- Las inscripciones solo entran por `submit_registration`: valida cupo, fecha, formato, tipo y tamaño reales del archivo,
  jugadores duplicados, caracteres no permitidos, campo trampa y un máximo de 15 envíos por minuto. **El precio lo fija el servidor.**
- Comprobantes: bucket privado `receipts` (el admin los ve con URL firmada de 60 s). Logos: `team-logos`. Bases, QR: `public-assets` (solo escribe el admin).
- `public_availability` y `public_teams` exponen solo conteos y equipos aprobados, sin datos personales.
- No hay límite por IP: si esperas tráfico malicioso, usa Cloudflare (Turnstile o rate limit) delante del sitio.
- Archivos subidos que no terminan en una inscripción quedan huérfanos en Storage; límpialos de vez en cuando.
