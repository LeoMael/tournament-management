# Anunciar salas Solo antes de abrir inscripciones

Ejecutar **una vez** `017_solo_room_announcements.sql`, después de 016. No ejecutar resets ni el esquema base. No se aplica automáticamente al publicar el panel.

`solo_rooms.is_announced` es booleano, obligatorio y empieza en `false`, también para todas las salas existentes. Solo controla la visibilidad pública de los borradores: `draft` + `false` permanece oculto; `draft` + `true` es visible, pero no admite jugadores.

Solo el administrador puede usar «Anunciar sala» / «Ocultar anuncio». La RPC `set_solo_room_announcement` valida rol, edición actual, sala y estado borrador bajo el bloqueo de edición y de sala existentes. No cambia el estado, las tarifas, la capacidad ni crea inscripciones. El trigger existente de salas registra el cambio en auditoría.

«Abrir inscripciones» sigue utilizando `manage_solo('open', ...)` sin modificaciones ni requisito de anuncio previo. La RPC pública `submit_solo_registration` tampoco se reemplaza: exige sala `open`, modalidad habilitada, apertura global, edición, plazo, cupo y demás validaciones actuales. El indicador puede quedar en `true` al abrir una sala; el estado determina si admite inscripciones. Todos los estados que ya eran públicos siguen visibles independientemente del indicador.

## Contrato público

`public_solo_rooms` devuelve exactamente:

`id, edition_id, name, scheduled_at, closes_at, capacity, entry_price, kill_reward, booyah_reward, status, taken, is_announced`.

El filtro de edición actual permanece. No incluye ID de acceso, contraseña, teléfonos, comprobantes ni datos de contacto. `id` es el UUID interno público de la sala; no es el ID de acceso del juego.

El frontend público se adapta por separado: cuando `status === 'draft' && is_announced`, mostrar «Próximamente · Inscripciones aún no abiertas» sin botón de inscripción. No basta con `is_announced` para decidir si una sala recibe jugadores.

## Validación local

`supabase/tests/solo_room_announcements.sql` comprueba visibilidad, permisos, privacidad, rechazo de inscripciones en borradores anunciados, ocultación, apertura directa y apertura tras anunciar. El runner aislado aplica todas las migraciones, incluida 016, y ejecuta las suites previas de resultados, pagos, slots y eliminación. No conecta a producción ni lee `.env`.
