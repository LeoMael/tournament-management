# Editar horario y ampliar el cierre de una sala Solo

Ejecutar una vez `019_solo_room_schedule.sql` después de 018. Aplicarla crea una función; no cambia horarios por sí sola.

El administrador puede usar «Editar horario» en salas abiertas o cerradas para cambiar la fecha de partida y el cierre de inscripción. Los borradores conservan su editor completo. Durante la partida, al finalizar o al cancelar no se permite cambiar el horario.

La RPC `update_solo_room_schedule` solo actualiza `scheduled_at` y `closes_at`. Valida edición y rol, bloquea la sala con el mismo orden de las operaciones existentes, exige fechas finitas y cierre futuro, cierre no posterior a la partida y dentro del plazo general `tournament_settings.registration_deadline`. Si ese plazo es insuficiente, debe ampliarse primero en Configuración. No lo extiende automáticamente.

Una sala `open` cuyo cierre venció puede recibir inscripciones nuevamente al ampliar su plazo, siempre que se cumplan las condiciones generales actuales de inscripción. Una sala cerrada manualmente (`closed`) permanece cerrada: este cambio no incorpora una función de reapertura.

Precios, premios, capacidad, estado, anuncios, slots, participantes, resultados, pagos y credenciales permanecen intactos. La vista pública ya usa las fechas de `solo_rooms`, por lo que no requiere otra migración ni cambios para recibir el nuevo horario. Los enlaces nuevos de WhatsApp usan la fecha actualizada, pero los mensajes ya enviados no se editan; la organización debe avisar a los jugadores.

El formulario usa la hora local del dispositivo, igual que el editor actual de borradores, y muestra su zona horaria. El cambio queda registrado por el trigger de auditoría existente. Pruebas en `supabase/tests/solo_room_schedule.sql`, mediante el runner local aislado.
