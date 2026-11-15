# WhatsApp de Free Fire escuadras

Estado: **aplicada en Supabase según confirmación del usuario**; no se verificó producción con una conexión directa. No repetir si terminó correctamente. Para otras instalaciones, ejecutar una vez `024_ff_squad_whatsapp.sql` después de la 023, antes de publicar estos cambios del panel. Sin resets.

## Uso

- Inscripciones de equipos FF: «Confirmar inscripción» conserva el mensaje actual al capitán y añade el contador compartido.
- Grupos y llaves → Free Fire → fase Battle Royale → partida → Cargar/Editar resultado → abrir «Acceso por WhatsApp · Partida N · Sala N».
- Escribir ID y contraseña y pulsar «Guardar acceso». Los datos se guardan únicamente para esa combinación de partida/sala.
- Cada fila muestra el slot del equipo, su capitán/WhatsApp, confirmación y acceso con sus respectivos contadores. «Enviar acceso» abre el chat del capitán con slot destacado, equipo, fase, partida, sala, ID y contraseña. Si hay horario programado, lo incluye en hora de Perú; de lo contrario, no inventa una fecha.
- Las credenciales editadas deben guardarse antes de poder enviarlas. Salas terminadas solo permiten consultar el acceso.
- La distribución de varias salas debe estar guardada en la fase. Si es una fase antigua sin `room_of` completo, revisar y guardar la distribución existente desde la gestión de salas; no se reasigna ningún equipo automáticamente.

## Persistencia y API

- `registrations.ff_confirmation_click_count`, inicia en 0 para todos, sin presumir mensajes antiguos. Cuenta clics de confirmación FF por inscripción.
- `ff_squad_room_access`: tabla privada por `(match_id, room_no)`, ID, contraseña, fecha y usuario de actualización.
- `ff_squad_access_clicks`: contador privado por `(match_id, room_no, registration_id)`; inicia en 0. Modificar las credenciales no reinicia este historial de clics.
- RPC `save_ff_squad_room_access(p_edition_id uuid,p_match_id uuid,p_room integer,p_game_room_id text,p_room_password text)`.
- RPC `count_ff_squad_access_click(p_edition_id uuid,p_match_id uuid,p_room integer,p_registration_id uuid)`.
- RPC `count_ff_squad_confirmation_click(p_edition_id uuid,p_registration_id uuid)`.
- Escritura por RPC, exclusiva para admin/revisor. Cada acción comprueba edición actual y ámbito FF; acceso comprueba fase Battle Royale, partida, sala, equipo aprobado/participante y distribución guardada.
- Actualización visible cada 15 segundos con la página visible y al volver a la ventana. Cuenta aperturas por clic normal; WhatsApp sigue requiriendo que el organizador pulse Enviar. No confirma envío/entrega, no reintenta automáticamente incrementos fallidos.

## Alcance

No se modifican la inscripción pública, vistas públicas, puntos, resultados, slots, llaves, reglas de premios, pagos, MLBB ni Solo. Los botones de confirmación de MLBB conservan su comportamiento sin contador.

Las credenciales no se añaden a configuraciones públicas, snapshots públicos ni audit_log. Las tablas privadas se eliminan por cascada al eliminar sus partidas/equipos; el archivado existente no publica ni conserva contraseñas.

Pruebas SQL aisladas: permisos/RLS, edición, ámbitos, equipos de otra sala/fase, separación de credenciales y contadores por partida/sala, preservación de inscripción/configuración/resultados, bloqueo de salas terminadas y ausencia de secretos en público/auditoría. Pruebas JS: mensaje, teléfono del capitán, slot, fecha opcional y bloqueos de contexto; regresiones de MLBB y Solo.
