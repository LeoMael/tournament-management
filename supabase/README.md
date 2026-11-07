# Base de datos — RAGNAROK U-Series (Supabase)

Pensado para desarrollo: pocos archivos, todos en el SQL Editor y en este orden.

| Archivo | Para qué sirve |
|---|---|
| `00_reset.sql` | (Opcional) Borra tablas y datos del torneo para empezar de cero. Conserva usuarios y `admins`. |
| `01_schema.sql` | Tablas, RLS, vistas públicas, auditoría, Storage y la función de inscripción. |
| `02_seed.sql` | Datos iniciales = lo que hoy muestra el sitio (precios, premios, reglamento, pasos). |
| `03_admin.sql` | Registra al **primer** administrador (cambia el correo antes). El resto del equipo se gestiona desde el panel → **Equipo**. |
| `functions/manage-team/` | Edge Function que el panel usa para crear usuarios, cambiar roles y contraseñas. Hay que desplegarla (ver abajo). |
| `extras/test_teams.sql` | (Opcional) Datos de prueba en un solo script: 16 equipos MLBB y 24 de Free Fire (todos aprobados, 2 salas de 12). Repetible. `test_teams_cleanup.sql` los borra. |

## Primera vez
1. Crea el proyecto en https://supabase.com.
2. **Authentication → Providers → Email**: desactiva **"Allow new users to sign up"**.
3. Ejecuta `01_schema.sql` y luego `02_seed.sql`.
4. **Authentication → Users → Add user** (email + contraseña fuerte, Auto confirm). Solo para el primer admin.
5. Ejecuta `03_admin.sql` con tu correo.
5b. Despliega la función `manage-team` (sección siguiente) para gestionar el equipo desde el panel.
5c. Ejecuta en orden `migrations/001_prizes_by_game.sql` y `migrations/002_schema_migrations.sql`.
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
No vuelvas a ejecutar `01_schema.sql` ni `00_reset.sql` sobre una base existente: contienen operaciones que pueden eliminar o alterar datos y políticas. Usa únicamente migraciones independientes revisadas.

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

## Migraciones de premios e historial

Para una base existente, revisa y aplica manualmente desde SQL Editor, en orden: `migrations/001_prizes_by_game.sql`, luego `migrations/002_schema_migrations.sql`. No vuelvas a ejecutar el esquema global ni el reset. Para una instalación nueva, aplica primero los archivos originales `01_schema.sql`, `02_seed.sql` y `03_admin.sql`, y luego ambas migraciones en ese orden.

La migración 001 conserva los premios anteriores con `game_key` nulo, pendientes de asignación manual; crea tres premios por juego con monto cero y estado por anunciar, sin sobrescribir premios existentes. La política RLS permite lectura pública solo de premios asociados a un juego y anunciados; los administradores pueden leer también borradores y legado. El panel muestra el legado solo para consulta.

Si ya se aplicó la versión anterior `extras/prizes_by_game.sql`, puede omitirse 001 y aplicarse 002, que verifica sus requisitos antes de registrar versiones. Si la verificación falla, revisa el estado y aplica 001 antes de repetir 002. `public.schema_migrations` registra versión, descripción y fecha; solo administradores pueden leerlo desde la API y la escritura corresponde al propietario al aplicar SQL manualmente. La fecha registrada para 001 durante esta adopción es la fecha de verificación, no necesariamente la fecha de su aplicación original. Las migraciones posteriores deben registrar su propia versión en la misma transacción que sus cambios. El panel exige exactamente 001 para editar premios; una versión posterior no prueba que esté aplicada. El historial no acredita que se haya ejecutado el seed.
