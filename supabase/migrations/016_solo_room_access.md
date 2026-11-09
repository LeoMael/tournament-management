# Acceso privado de salas Solo

Ejecuta 016_solo_room_access.sql en el SQL Editor después de la migración 015. Después recarga el panel.

En Solo, abre Detalles de la sala, completa ID y contraseña y guarda. En Inscripciones, el botón Enviar acceso queda al lado del teléfono de cada aprobado. Abre WhatsApp con nickname, sala, fecha/hora de Perú, ID, contraseña y slot; la organización revisa y envía manualmente.

Los móviles peruanos de 9 dígitos reciben el prefijo 51. Para otros países registra el número internacional con prefijo. El sistema no verifica que el teléfono tenga WhatsApp.

Solo admin y revisor_arbitro leen/guardan el acceso. Se almacena aparte, con RLS y RPC, sin exponerlo en vistas públicas, exportaciones, auditoría ni historial público. Al eliminar la sala se elimina su acceso por cascada. No modifica pagos, resultados, revisión de solicitudes ni sus RPC.

La contraseña viaja en el enlace de WhatsApp al abrir el chat: no compartas ese enlace. El panel no marca mensajes como enviados porque abrir WhatsApp no confirma entrega. Los cambios de acceso deben guardarse antes de volver a enviar.
