# Paso 2 de Salas Free Fire

Estado: **migración 031 aplicada en Supabase, según confirmación del usuario**. Cambios locales. La 029 y la 030 también fueron aplicadas por el usuario. No se hizo commit ni push.

## Uso en el panel

El menú pasa a **Salas Free Fire** y conserva la ruta `/solo`. Los filtros Participación (Solo/Dúo) y Premiación (kills/Top) dan acceso a las cuatro modalidades. `Nueva sala` permite elegir una modalidad antes de configurar su borrador.

- Solo por kills continúa utilizando `solo_rooms`, `manage_solo` y sus componentes de resultados/pagos. El componente se conserva montado al cambiar los filtros para mantener los borradores locales de resultados.
- Solo Top utiliza la base 030 y los premios fijos por puesto.
- Dúo Top y Dúo kills utilizan la base 029. La entrada y el cupo cuentan parejas. Una inscripción tiene dos nicknames, un WhatsApp y un Yape para premios.

Los nuevos formularios permiten crear/editar borradores y elegir cantidad e importes de puestos Top. Al abrir inscripciones se fijan modalidad, cupo y condiciones monetarias. Después se permite editar nombre/horario, pausar o cerrar inscripciones. El borrador puede anunciarse para que el frontend lo muestre al conectarse a la nueva vista.

La lista de inscripciones permite buscar por nickname/nombre/teléfonos, abrir comprobantes privados, aprobar/rechazar y consultar el slot. Cada aprobación asigna el primer slot libre al jugador o a la pareja completa. Se conservan los números de otros slots al eliminar una inscripción. Solo un administrador puede eliminar y debe escribir los nicknames exactos con el formato `Nickname 1 / Nickname 2` (o un nickname en Solo Top).

Los resultados, inicio/finalización de las nuevas partidas y sus pagos corresponden al paso 3. Los mensajes y la IA se conectarán en el paso 4, y el formulario público en el paso 5. El código del frontend público sigue en su propio repositorio.

## Activación

1. Ejecutar una vez `031_ff_room_registrations.sql`, después de la 030.
2. Revisar localmente el panel. Para abrir una sala nueva, las inscripciones generales deben estar activadas y el cierre futuro debe estar dentro del plazo general.
3. La publicación del panel se hará cuando el usuario lo solicite. Para recibir solicitudes desde la web pública se requiere adaptar allí el formulario a la nueva API.

La migración crea `ff_room_registrations` y amplía el ciclo de los borradores Dúo/Solo Top. La cancelación/eliminación disponible en este paso se limita a salas nuevas vacías porque las devoluciones se integrarán con los pagos en el paso 3.

## Contrato de inscripción preparado para el frontend

RPC `submit_ff_room_registration(payload jsonb)`, disponible para `anon` y `authenticated`, con validación de edición, estado abierto, pausa, fechas, cupo, comprobante y límites de solicitudes.

```json
{
  "payload": {
    "edition_id": "UUID_EDICION_ACTUAL",
    "room_kind": "duo_top",
    "room_id": "UUID_SALA",
    "request_id": "UUID_ESTABLE_POR_INTENTO",
    "full_name": "Nombre del titular del comprobante",
    "whatsapp": "987654321",
    "prize_yape_phone": "912345678",
    "nickname_1": "Primer jugador",
    "nickname_2": "Segundo jugador",
    "receipt_path": "UUID_DEL_ARCHIVO.png",
    "website": ""
  }
}
```

`room_kind` admite `solo_top`, `duo_top` y `duo_kills`. Solo Top utiliza `nickname_1` y omite `nickname_2` (o envía `null`). Dúo requiere ambos nicknames distintos. Cada nickname admite 1 a 50 caracteres. Teléfonos como cadenas de 8 a 15 dígitos. Se exige comprobante válido ya subido al bucket privado `receipts`, con nombre, extensión y metadata admitidas por el servidor. La tarifa la toma el servidor de la sala.

Respuesta `{ "id": "UUID_INSCRIPCION", "amount_due": 4 }`. Reintentar con el mismo `request_id` y exactamente el mismo payload devuelve la inscripción original. El servidor rechaza reutilizar ese intento con datos distintos.

La aprobación es `review_ff_room_registration(p_edition_id,p_kind,p_room_id,p_registration_id,p_status,p_reason)`. Solo staff puede aprobar/rechazar. El slot lo asigna el servidor y no se acepta desde el formulario. La eliminación es `delete_ff_room_registration(...)`, exclusiva de administrador, con confirmación exacta y antes de jugar.

## Datos públicos y seguridad

- `public_ff_rooms` devuelve únicamente ID, edición, `room_kind`, participación, premiación, nombre, fechas, cupo, entrada, tarifas, cantidad de puestos, estado, anuncio, pausa y cupos ocupados. Una pareja ocupa un cupo.
- `public_ff_room_prizes` devuelve `room_id`, `room_kind`, `place` y `amount`, solo de salas visibles.
- Las inscripciones y sus teléfonos/comprobantes quedan bajo RLS privada. Los revisores consultan la edición actual y el administrador conserva acceso privado al historial.
- Se añade una comprobación de exclusividad del comprobante a los módulos existentes y al nuevo registro. Usa el mismo bloqueo por ruta y evita reutilizar un comprobante entre Solo, equipos, individuales y las nuevas salas. Las definiciones de las RPC anteriores de inscripción conservan sus firmas.
- El cierre de edición avisa de nuevas salas activas, solicitudes sin revisar y devoluciones pendientes. El archivo incluye las salas nuevas, premios, inscripciones y referencias de comprobantes. Las tablas nuevas conservan sus filas asociadas a la edición archivada y las consultas del panel filtran la edición actual.
- El archivo público incluye únicamente las proyecciones explícitas de salas y premios, sin teléfonos ni comprobantes.

## Verificación

Pruebas SQL en memoria de las tres modalidades nuevas, anuncio, apertura, pausa, cierre, nombres/horarios, cupos, tarifa del servidor, dos integrantes por dúo, nicknames cruzados, aprobación y slots, eliminación confirmada, reintentos, exclusividad de comprobantes con Solo, roles/RLS, solicitudes anónimas y archivo privado/público. Se ejecuta también la suite anterior de Solo, escuadras, MLBB y las bases 029/030.

Pruebas JS de construcción de formularios y selección de los contratos 029/030, con importes numéricos, cupos de parejas y rechazo de configuraciones inválidas. Compilación y lint del panel.
