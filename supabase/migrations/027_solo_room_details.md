# Editar nombre y horario de salas Solo

Estado: **ejecución en Supabase pendiente de confirmar**. Se verificó en una base aislada; no se conectó a producción. Aplicar una sola vez después de la 026 y no repetir si ya terminó correctamente.

## Activación y uso

1. Ejecutar una vez `027_solo_room_details.sql`, después de la 026. No repetir migraciones anteriores ni ejecutar el esquema inicial.
2. Publicar el panel. En salas abiertas (incluidas las pausadas) o cerradas antes de jugar, el botón **Editar horario** pasa a ser **Editar sala**.
3. El formulario permite cambiar nombre (3 a 100 caracteres), fecha de partida y cierre. Los borradores conservan su edición existente; las salas en juego, finalizadas y canceladas no admiten esta nueva edición.

Solo un administrador puede guardar. La nueva RPC `update_solo_room_details(p_edition_id uuid,p_room_id uuid,p_name text,p_scheduled_at timestamptz,p_closes_at timestamptz)` valida edición y estado, bloquea la fila de sala y actualiza únicamente nombre y fechas. No crea tablas ni cambia permisos de tablas o vistas públicas.

Cambiar solo el nombre permite conservar horarios ya vencidos. El formulario preserva segundos y milisegundos de fechas no editadas. Si se cambia alguna fecha, la RPC delega en `update_solo_room_schedule` y conserva todas sus validaciones: fechas finitas, cierre futuro, cierre no posterior a partida y plazo general del torneo. Esta función anterior permanece disponible sin cambios para clientes existentes.

Se conserva el ID de sala, estado, pausa, anuncio, tarifas, cupos, participantes, slots, teléfonos, contadores, comprobantes, resultados, pagos y credenciales privadas. La sala pausada sigue pausada y una sala cerrada no se reabre. El nombre público se actualiza automáticamente porque la vista existente lee `solo_rooms.name`. Los cambios quedan registrados por el trigger de auditoría existente.

No requiere modificar el frontend público. Los mensajes preparados posteriormente y los prompts usan el nuevo nombre al leer la sala actual; no se reenvían ni modifican mensajes ya compartidos. Si se había comunicado otro nombre u horario, avisar a los participantes.

## Verificación

`supabase/tests/solo_room_details.sql` comprueba renombrado de una sala pausada con horario vencido, conservación de fechas exactas e identidad, nombres inválidos, actualización atómica de nombre y fechas, rechazo de horarios inválidos y edición incorrecta, protección por estados/roles, compatibilidad de la RPC 019, conservación de datos relacionados, proyección pública y auditoría. Se ejecuta en memoria desde `supabase/tests/run.mjs`.
