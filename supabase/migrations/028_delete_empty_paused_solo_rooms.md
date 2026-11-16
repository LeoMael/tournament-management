# Eliminar salas Solo pausadas vacías

Estado: **ejecución en Supabase pendiente de confirmar**. Se probó en una base aislada. No se borraron salas de producción. Aplicar una sola vez después de la 027; no repetir si ya terminó correctamente.

Aplicar una vez `028_delete_empty_paused_solo_rooms.sql` después de la 027 y publicar el panel. La migración solo actualiza la función de eliminación; no ejecuta ninguna eliminación ni crea tablas.

La papelera aparece también en salas con `status='open'` e `is_paused=true`, únicamente si no tienen ninguna inscripción (de ningún estado) ni resultados. Se exige administrador, edición actual y nombre exacto. Se comparte el bloqueo de fila de sala con el registro de jugadores y las pausas; el backend vuelve a comprobar que siga vacía al confirmar.

Una sala pausada con participantes o historial debe cancelarse antes de poder usar la eliminación existente. Las salas abiertas sin pausa, cerradas para jugar y en juego conservan su restricción anterior. Borradores vacíos, finalizadas y canceladas conservan su comportamiento anterior, confirmaciones y auditoría.

El acceso privado de una sala eliminada se limpia mediante la FK con `ON DELETE CASCADE` ya existente. No se modifica ninguna otra sala, pago, resultado, teléfono ni vista pública.

## Edición del nombre

La edición ya está disponible desde el commit `1f33d2e` y requiere la migración 027. Una sala pausada tiene estado interno `open`, por lo que puede editarse con esa función. El botón nuevo es **Editar sala**; si todavía se ve **Editar horario**, comprobar URL, despliegue y recarga completa del navegador antes de cambiar más código o SQL.

## Verificación

`supabase/tests/empty_paused_solo_room_deletion.sql`: eliminación de pausada vacía, cascada de acceso, conservación de otras salas, confirmación, edición, roles, auditoría, rechazo de cualquier inscripción/historial y protección de salas activas. El runner también conserva las pruebas anteriores de eliminación de salas finalizadas/canceladas y edición de nombre/horario.
