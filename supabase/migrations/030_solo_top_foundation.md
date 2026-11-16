# Base de Solo por Top

Estado: **aplicada en Supabase según confirmación del usuario**, al igual que la 029. La comprobación técnica se hizo en una base aislada. Los archivos siguen locales, sin commit ni push.

## Configuración preparada

- `solo_top_rooms` guarda borradores de una sala para una sola partida individual. El cupo cuenta jugadores y la entrada corresponde a cada participante.
- `solo_top_room_prizes` guarda el premio fijo de cada puesto. Una lista `[100,60,40,20]` establece cuatro puestos premiados. Puede configurarse desde uno hasta la cantidad de jugadores admitidos.
- Los premios consecutivos deben cubrir exactamente `1..rewarded_places`, con importes de S/ 0 a S/ 1 000 000 y hasta dos decimales.
- El cupo técnico es de 2 a 100 jugadores y la entrada de S/ 0 a S/ 10 000. El cupo usado debe ajustarse a la sala real de juego.
- La asignación por posición, los resultados y los pagos se conectarán en sus siguientes etapas. Esta entrega permite configurar borradores.

## API administrativa

`manage_solo_top_room_draft(p_action text,p_data jsonb)` admite `create`, `edit` y `delete`, exclusivamente para administradores.

Para crear o editar, enviar `edition_id`, `name`, `capacity`, `scheduled_at`, `closes_at`, `entry_price` y `top_prizes`. Editar requiere también `room_id` y la configuración completa. Eliminar requiere `edition_id`, `room_id` y `confirmation` con el nombre exacto.

La respuesta incluye `id`, `participation="solo"`, `mode="top"`, `status="draft"`, `capacity` y `rewarded_places`. `kill_reward` y `booyah_reward` se rechazan en esta API. Los premios corresponden al puesto final individual.

## Estado e integración

La apertura de inscripciones se habilitará junto con las etapas de panel y registro. Las dos tablas tienen RLS explícita, lectura administrativa, permisos por edición y escritura mediante la RPC. Los revisores consultan la edición actual. Los editores y visitantes carecen de acceso.

Los borradores conservan su edición al cerrarse un torneo y quedan disponibles para consulta privada del administrador. La integración con el archivo del panel se realizará al conectar el ciclo operativo, como en la base Dúo de la 029.

Esta migración agrega tablas, funciones y triggers propios. Las definiciones y datos de Solo por kills, Dúo, equipos FF y MLBB se verificaron antes y después de aplicarla en memoria. Los contratos públicos existentes se conservan.

Cuando corresponda activar esta base, aplicar una sola vez `030_solo_top_foundation.sql` después de la 029. Esta etapa continúa local y aún requiere conectar el panel.

## Comprobaciones

La suite SQL cubre uno/cuatro/seis puestos, premios decimales y cero, edición conservando el ID, eliminación con confirmación y cascada, cantidades e importes inválidos, fechas, premios consecutivos, permisos/RLS, edición archivada y auditoría. También ejecuta las pruebas existentes de Solo, Dúo, escuadras, MLBB y archivo.
