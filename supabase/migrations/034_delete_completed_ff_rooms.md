# Eliminar salas finalizadas de Solo Top y Dúo

**Aplicada en Supabase según confirmación del usuario.** Requiere la 033, también confirmada como aplicada. El asistente no ejecutó SQL remoto. La publicación del código del panel es independiente de la ejecución de esta migración.

La papelera aparece para administradores en salas Solo Top, Dúo Top y Dúo por kills finalizadas o canceladas, aunque tengan inscripciones/resultados/pagos. Se conserva la eliminación anterior de salas vacías en borrador, cerradas o abiertas en pausa. No permite eliminar salas en juego ni salas abiertas/cerradas con participantes.

Se utiliza el mismo contrato `manage_ff_room('delete', {edition_id,room_kind,room_id,confirmation})`. Es obligatorio escribir el nombre exacto de la sala. El backend verifica administrador, edición actual, modalidad y estado, y bloquea la sala con el mismo bloqueo utilizado para resultados, pagos y mensajes.

Eliminar una sala terminada borra atómicamente sus pagos (incluidos pendientes y registrados), resultados, inscripciones, configuración de premios y credenciales privadas. No realiza transferencias ni devuelve dinero. La confirmación muestra esta advertencia. Los archivos de comprobantes no se borran de Storage. Los registros de sala, premios, inscripciones, resultados y pagos quedan en la auditoría privada existente; las credenciales no se copian a la auditoría.

No se modifica la eliminación de Solo por kills, sus funciones, sus vistas o sus tablas. Tampoco escuadras, MLBB, fórmulas de premio ni frontend público. Una sala eliminada deja de aparecer en las vistas públicas existentes sin cambiar sus contratos. Los borradores locales de resultados no son pagos ni historial persistente.

Las acciones anteriores de `manage_ff_room` se delegan a la función anterior, cuyo acceso directo de clientes queda revocado. La operación nueva no elimina ni modifica otras salas ni ediciones archivadas.
