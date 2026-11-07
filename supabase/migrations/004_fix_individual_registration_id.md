# Corrección de inscripción individual

Si la migración 003 ya está aplicada, ejecuta únicamente `004_fix_individual_registration_id.sql` en el SQL Editor del mismo proyecto; no vuelvas a ejecutar 003. La corrección reemplaza la función de envío y registra la versión 004 en una transacción. No modifica inscripciones ni requiere realizar otro pago.

Después de aplicar 004, vuelve a intentar la inscripción usando el comprobante de pago existente. Verifica que llegue la confirmación y que aparezca una sola inscripción en el panel. El SQL fue revisado estáticamente; queda pendiente probarlo en un PostgreSQL aislado con las migraciones previas.
