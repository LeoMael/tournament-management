# Eliminación controlada de solicitudes individuales

Revisa y aplica manualmente solo `005_delete_individual_registration.sql` en el SQL Editor de la base correspondiente, después de confirmar que la migración 004 está registrada. No vuelvas a ejecutar las migraciones anteriores. La operación registra la versión 005 en la misma transacción.

Solo un administrador puede eliminar solicitudes rechazadas o reembolsadas que no estén vinculadas a un grupo. El trigger de auditoría existente registra la eliminación. Los comprobantes de pago y devolución se conservan en Storage; esta migración no borra archivos.
