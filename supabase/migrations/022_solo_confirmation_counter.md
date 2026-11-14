# Contador de confirmaciones Solo

Aplicada en Supabase según confirmación del usuario. No se verificó producción mediante conexión directa. Para otras instalaciones, aplicar una vez `022_solo_confirmation_counter.sql` después de la 021, antes de publicar el panel. No repetir si ya se ejecutó correctamente. Sin resets ni cambios al frontend público.

`solo_registrations.confirmation_click_count`: entero privado, inicialmente 0. Por indicación del usuario, la migración inicializa en 1 a los aprobados existentes de la edición actual, porque ya recibieron su confirmación. Los nuevos aprobados empiezan en 0. Este valor cuenta clics, no verifica envío ni recepción en WhatsApp.

RPC `count_solo_confirmation_click(p_edition_id uuid,p_room_id uuid,p_registration_id uuid)`: incrementa atómicamente y devuelve `{id, confirmation_click_count}`; únicamente administradores y revisores, edición actual, jugador aprobado con slot y sala open/closed/playing. No modifica teléfonos, inscripción, slots, resultados ni pagos. Auditoría existente y vistas públicas conservadas.

El panel muestra solo un número pequeño al lado de «Confirmar inscripción». Cada clic izquierdo normal abre WhatsApp y solicita el incremento; si no se guarda, se muestra un aviso. «Enviar acceso» conserva su comportamiento y no incrementa este contador. Abrir el enlace desde el menú contextual del navegador no genera el evento de clic del botón.

El contador se comparte en base de datos. Se actualiza al abrir la sala, cada 15 segundos mientras la página está visible y al volver a la ventana, sin recargar la lista completa ni perder lo que se está editando. El incremento local se muestra al confirmar la respuesta del servidor. Un fallo de conexión no se reintenta automáticamente para evitar contar dos veces una misma petición.

Pruebas SQL aisladas: inicialización de aprobados existentes, cero en nuevos registros, incremento compartido admin/revisor, preservación de datos, permisos, edición y estados.
