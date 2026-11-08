# Eliminar salas Solo vacías

Aplicar `011_delete_empty_solo_room.sql` en el SQL Editor de Supabase después de 010 y actualizar el panel.
No requiere volver a ejecutar el esquema ni el reset.

El administrador verá una papelera en las tarjetas de «Tus salas» para borradores y salas canceladas sin ninguna inscripción ni resultado. La confirmación muestra el nombre de la sala que se eliminará, incluso si hay otra seleccionada.

La RPC `delete_empty_solo_room` valida el rol, la edición actual y el estado bajo el mismo bloqueo de sala usado por las inscripciones. Conserva cualquier sala con inscripciones (incluidas rechazadas o reembolsadas), resultados o pagos asociados. La eliminación queda registrada en auditoría. Los clientes no reciben permisos de borrado directo sobre las tablas.

Las pruebas locales aisladas están en `supabase/tests/solo_room_deletion.sql` y se ejecutan con `supabase/tests/run.mjs` junto con las suites existentes.
