# Slots de Free Fire Solo

Ejecutar `013_solo_registration_slots.sql` una vez, después de 012, en el SQL Editor.

- Cada aprobación asigna automáticamente el siguiente slot libre dentro de esa sala, desde 1 hasta su capacidad. Dos aprobaciones se serializan con el bloqueo de sala que ya usa `manage_solo`.
- El slot queda guardado, no depende de la página, el buscador, el nombre ni del orden del listado. Cada sala comienza en 1.
- Pendientes y rechazados sin aprobación aparecen sin slot. Un slot ya asignado se conserva incluso al cancelar y reembolsar; no se reasigna ni se renumeran jugadores.
- Los aprobados existentes reciben slots por `reviewed_at`, luego `created_at` e `id` como desempate. Cuando no hay fecha de revisión, se usa su fecha de registro al final de la lista. No es posible reconstruir un orden exacto si no quedó registrado.
- Resultados, kills, pagos y comprobantes permanecen intactos. El histórico ya archivado no se modifica; futuros archivos incluyen el slot en el registro privado de inscripción.
- El panel muestra la columna Slot en Inscripciones y Resultados, y permite buscar por número de slot.

La migración no abre salas, no aprueba solicitudes ni agrega permisos de escritura para clientes. Las suites de `supabase/tests/run.mjs` comprueban asignación, capacidad, permisos e integración con resultados, cancelaciones e historial. PGlite no reproduce concurrencia multisesión; verificar aprobaciones simultáneas en staging antes de operar con varios árbitros.
