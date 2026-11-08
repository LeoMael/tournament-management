# Solo sin ID de jugador

Aplicar `010_solo_nickname_registration.sql` **después de 009** y antes de publicar la versión del formulario Solo que usa nickname. No volver a ejecutar 008 o el esquema general.

- El formulario solicita nickname, nombre y WhatsApp; universidad/instituto y carrera siguen siendo opcionales y usan los mismos buscadores del resto del sitio.
- El ID del juego deja de ser obligatorio y no se solicita ni se genera para las nuevas inscripciones Solo. Los IDs existentes se conservan como datos anteriores; no se sobrescriben.
- Las nuevas solicitudes se identifican por nickname dentro de cada sala, ignorando mayúsculas y espacios al inicio/final. No se puede repetir un nickname pendiente o aprobado en esa sala. Sí puede participar en otras salas con otra inscripción.
- Se conserva el comportamiento de reintentos, los comprobantes, los cupos y las condiciones económicas. Los clientes anteriores todavía pueden enviar un ID, pero las solicitudes nuevas se guardan por nickname.
- Si ya había apodos repetidos con distintos IDs antes de esta migración, sus filas se conservan. La RPC detecta también esos apodos al validar nuevas solicitudes; el índice nuevo protege las nuevas filas sin ID.

La migración es transaccional y no borra datos. El runner `supabase/tests/run.mjs` aplica también 010 y verifica solicitudes sin ID, duplicados por nickname con otro comprobante, participación en varias salas, liquidaciones e históricos.
