# Botones de modalidad y eliminación de salas abiertas

**Migración 035 aplicada en Supabase según confirmación del usuario**, después de la 034. El asistente no ejecutó SQL remoto. La publicación del código del panel es independiente de esa ejecución.

## Panel

El selector se reemplaza por cuatro botones: Solo por kills y Booyah, Solo por Top, Dúo por kills y Booyah y Dúo por Top. No hay vista Todos. Una inscripción Dúo cuenta como un cupo de pareja.

Cada modalidad conserva su lista y su motor de gestión: Solo por kills usa sus componentes/RPC actuales; Solo Top y Dúo utilizan los suyos. Los componentes permanecen montados al cambiar filtros para conservar los borradores locales. El panel inicia en Solo por kills y Booyah. Se mantienen los filtros de estado de cada modalidad.

## Eliminación

La 035 amplía únicamente las acciones de eliminación de los contratos actuales:

- Solo por kills: `delete_solo_room(p_edition_id,p_room_id,p_confirmation)`.
- Solo Top/Dúo: `manage_ff_room('delete',{edition_id,room_kind,room_id,confirmation})`.

Los administradores pueden eliminar salas abiertas (pausadas o no) y cerradas, vacías o con inscripciones. Se conservan las finalizadas/canceladas y los borradores vacíos. Un borrador con historial debe cancelarse antes de borrarlo. Una partida **en juego** se debe finalizar o cancelar antes de eliminarla: no se amplía esa operación.

Es obligatorio escribir el nombre exacto. La confirmación advierte que se borran inscripciones, resultados y registros de pago, incluidos pendientes. No realiza transferencias ni devoluciones. Las filas eliminadas se conservan en auditoría privada, salvo las credenciales, que nunca se auditan. Se mantienen los comprobantes en Storage y las demás salas/ediciones intactas. Aplicar el SQL no elimina ninguna sala.

Las funciones comprueban administrador, edición actual, estado y nombre bajo el mismo bloqueo de sala utilizado por inscripción, resultados y pagos. No se cambian aprobaciones, slots, precios, fórmulas, mensajes ni vistas públicas.

## Activación y pruebas

La 035 ya fue aplicada según el usuario; no repetirla. Tras publicar el panel, revisar los cuatro botones y probar una eliminación de sala de prueba con confirmación. No se eliminaron salas reales durante el desarrollo. Quitar Todos no requiere modificar ni volver a ejecutar esta migración.

Pruebas: integración SQL de abiertas/pausadas/cerradas en las cuatro modalidades, pendientes y aprobados, comprobación de nombre/edición/permisos, auditoría y preservación de otras salas y archivos; pruebas anteriores de eliminación finalizada y protección de juego; reglas de la papelera; lint, renderizado y compilación.
