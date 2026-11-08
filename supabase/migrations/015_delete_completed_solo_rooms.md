# Eliminar salas Solo de prueba con participantes

Ejecutar `015_delete_completed_solo_rooms.sql` una vez después de 014 y actualizar el panel. Aplicar la migración crea la función; no elimina ninguna sala por sí sola.

Solo el administrador puede eliminar salas finalizadas o canceladas, además de borradores vacíos. Una sala abierta, cerrada o en juego debe finalizarse o cancelarse antes. La confirmación exige escribir el nombre exacto de la sala y muestra inscripciones, resultados, registros de pago y el importe pendiente que desaparecerá de la gestión.

La eliminación es permanente para la gestión operativa: elimina pagos (incluidos pendientes), resultados, inscripciones y sala en una transacción. No transfiere dinero, no paga premios ni devuelve entradas. No usar sobre salas reales con obligaciones pendientes. Los triggers existentes conservan el contenido anterior de cada fila en Auditoría; no se borran comprobantes de Storage ni archivos de ediciones históricas.

La RPC valida el rol, edición y nombre en el servidor, y comparte el bloqueo de sala con aprobaciones, resultados y pagos. La función de 011 sigue disponible para clientes antiguos, conservando su restricción a salas vacías.
