# Contador de Enviar acceso

Aplicada en Supabase según la captura del usuario: versión 023 registrada en `public.schema_migrations`. No volver a ejecutarla. Para otras instalaciones, aplicar una vez `023_solo_access_counter.sql` después de la 022, antes de publicar estos cambios del panel.

`solo_registrations.access_click_count`: entero privado que empieza en 0 para todos; la migración no modifica el contador existente de confirmación. No se presume que los accesos anteriores hayan sido enviados.

RPC `count_solo_access_click(p_edition_id uuid,p_room_id uuid,p_registration_id uuid)` incrementa atómicamente y devuelve `{id, access_click_count}`. Solo administradores y revisores, edición actual, sala open/closed/playing con acceso guardado y jugador aprobado con slot. No devuelve ni modifica ID/contraseña.

Se muestra solo un número junto al botón actual. «Confirmar inscripción» muestra e incrementa `confirmation_click_count`; «Enviar acceso» muestra e incrementa `access_click_count`. Los valores se conservan independientemente al cambiar de tipo de mensaje. Cada clic normal abre WhatsApp y guarda el incremento; no verifica envío ni entrega. No se reintentan incrementos automáticamente si falla la conexión.

Ambos se actualizan desde Supabase cada 15 segundos con la página visible, al abrir la sala y al volver a la ventana. No se modifican vistas públicas, teléfonos, mensajes, slots, pagos ni resultados. No se modifica el frontend público.
