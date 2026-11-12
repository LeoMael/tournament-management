# Detalle y eliminación individual de participantes Solo

Ejecutar una vez `018_delete_solo_registration.sql` después de 017. No repetir migraciones anteriores ni ejecutar el esquema o reset. Aplicarla solo crea la función; no elimina inscripciones por sí sola.

En Inscripciones → «Ver detalle» se muestran nickname, nombre, teléfono, institución, slot, estado, importe, fechas y comprobante. El comprobante mantiene su URL privada firmada de 60 segundos, con botón para renovarla y soporte para imagen/PDF.

«Eliminar participante» está disponible únicamente para el administrador, con sala abierta o cerrada (antes de jugar), para inscripciones pendientes, aprobadas o rechazadas sin resultados ni registros de pago. Cualquier pago, incluso liquidado, o una devolución en curso/registrada impide la eliminación. Se exige escribir el nickname exacto; el backend vuelve a validar rol, edición, sala, estado y dependencias bajo los bloqueos existentes.

La eliminación es permanente para la inscripción y no devuelve dinero. Libera el cupo ocupado, mantiene la sala y sus credenciales y conserva los slots de todos los demás jugadores. El slot eliminado puede utilizarse en una aprobación futura conforme a la regla actual de slots libres. El comprobante de Storage se conserva y el trigger existente deja copia de la inscripción eliminada en Auditoría.

No se alteran las RPC de aprobación, resultados, pagos o WhatsApp. Los revisores pueden consultar el detalle, pero no eliminar. No se agregan permisos de borrado directo sobre tablas a los clientes.

Pruebas en `supabase/tests/solo_registration_deletion.sql`, ejecutadas con el runner aislado `supabase/tests/run.mjs`. No ejecutarlas en producción.
