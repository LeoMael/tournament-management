# Pausar inscripciones sin cerrar la sala para jugar

Ejecutar una vez `020_pause_solo_registrations.sql` después de 019. La migración añade `solo_rooms.is_paused` con valor `false` para todas las salas; no pausa ni abre salas por sí sola.

En una sala abierta, el administrador tiene «Pausar inscripciones». La confirmación conserva participantes, slots, tarifas, premios, fechas y acceso. El botón pasa a «Abrir inscripciones». Si el plazo venció, ajustarlo con «Editar horario» antes de abrir. La modalidad y las inscripciones generales deben estar habilitadas, y el cierre debe estar dentro del plazo general.

La pausa no devuelve la sala a borrador: en la tabla privada conserva `status='open'` y solo cambia `is_paused`. Así las tarifas siguen fijadas y la revisión de inscripciones ya recibidas, las credenciales, WhatsApp y eliminación individual conservan sus controles actuales. El panel muestra «Inscripciones aún no abiertas» y permite filtrar salas pausadas.

«Cerrar inscripciones» sigue siendo la acción anterior para preparar la partida, y aparece cuando la sala está recibiendo inscripciones. Para iniciar una sala pausada, abrirla y luego cerrar sus inscripciones como antes. No se reabren estados `closed`, `playing`, `finished` ni `cancelled` mediante esta función.

## Compatibilidad pública

La vista `public_solo_rooms` agrega `is_paused`. Para una sala abierta pero pausada, presenta **`status='draft', is_announced=true, is_paused=true`**. Es una proyección pública de sala en espera, compatible con el frontend que ya muestra anuncios sin botón ni opción de inscripción. Al abrir nuevamente, devuelve el estado y anuncio reales. El UUID, las fechas, tarifas, ocupación (`taken`) y demás campos permanecen iguales; los aprobados siguen disponibles en `public_solo_results` con sus slots. Los demás estados conservan la proyección anterior.

Los campos públicos son: `id, edition_id, name, scheduled_at, closes_at, capacity, entry_price, kill_reward, booyah_reward, status, taken, is_announced, is_paused`. Se mantiene el filtro de edición actual y no se exponen credenciales, teléfonos ni comprobantes. No requiere cambiar la web pública para respetar la pausa: reconoce el borrador anunciado. Un cliente futuro puede usar `is_paused` para diferenciar pausa de primer anuncio.

## Backend

`set_solo_room_paused` exige administrador y edición actual, bloquea la sala con el mismo orden que las operaciones existentes y registra la modificación mediante el trigger de auditoría. Un trigger previo a insertar en `solo_registrations` rechaza nuevas inscripciones durante la pausa, incluso desde formularios antiguos. La RPC de inscripción conserva sus validaciones e idempotencia; un reintento ya registrado no crea un segundo cupo. Las inscripciones simultáneas con una pausa se serializan por el bloqueo de sala. Probar concurrencia real en staging si operan varios árbitros.

No se cambian las RPC de aprobación, resultados, pagos o acceso por WhatsApp. Los archivos históricos previos quedan intactos. No se realiza ninguna transferencia ni devolución al pausar.
