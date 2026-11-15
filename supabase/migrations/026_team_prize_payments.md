# Premios finales y pagos de equipos FF y MLBB

Estado: **aplicada en Supabase según confirmación del usuario**. Se probó en una base aislada; no se verificó producción con una conexión directa ni se transfirió dinero. No repetir si terminó correctamente.

## Activación

1. Ejecutar una vez `026_team_prize_payments.sql`, después de la 025. No repetir las anteriores ni ejecutar el esquema inicial.
2. Publicar el panel después de aplicar la migración. Mientras no se aplique, únicamente el nuevo bloque muestra el aviso de migración; el resto de Equipos y puntos continúa funcionando.
3. En Configuración → Premios por puesto → Detalles, revisar **Premio en dinero (S/)** para los tres puestos de cada juego. El importe numérico es independiente del texto público: «S/ 100 + medallas» escrito como texto no establece automáticamente un importe monetario.
4. En Equipos y puntos, elegir FF o MLBB y abrir **Revisar y confirmar premios** cuando todas las partidas del juego hayan terminado.

## Puestos y confirmación

- Se usa la última fase de cada juego (posición, fecha de creación e ID).
- FF: requiere una fase final Battle Royale con su podio oficial de tres equipos confirmado desde Grupos y llaves. No toma el Top 3 provisional de la clasificación general acumulada. Si hay un empate, resolverlo allí antes de confirmar el podio.
- MLBB: requiere una final de eliminación directa terminada, con dos equipos y un ganador. El ganador y perdedor de la final son 1.º y 2.º. El 3.º se selecciona explícitamente entre los semifinalistas eliminados según el resultado/desempate de las bases; el panel no inventa un tercer puesto por victorias acumuladas.
- Solo se admiten tres equipos distintos, aprobados, del mismo juego y edición. La confirmación exige revisar puestos, importes y destinos.
- Cada puesto permite indicar un **objeto o entrega adicional** opcional, que se registra separado del pago monetario. No se interpreta automáticamente el texto público del premio para decidir qué objetos entregar.
- Se congela edición, fase, puesto, equipo, nombre registrado, Yape, importe y descripción del premio. Cambios posteriores de resultados o configuración no recalculan una liquidación confirmada.
- Solo un administrador confirma, registra pagos/entregas o rehace una liquidación. Los revisores pueden consultar y abrir el aviso de un pago ya registrado. Los editores y visitantes no tienen acceso.

## Pago, correcciones e historial

- El botón **Copiar número** está junto al Yape en la misma columna y solo aparece si el importe es positivo. Nunca copia WhatsApp como sustituto del Yape.
- **Registrar pago** abre una confirmación con equipo, nombre registrado, importe, Yape y referencia opcional. Se pulsa después de hacer la transferencia; no transfiere dinero.
- Un segundo registro del mismo pago devuelve el registro original: no cambia fecha, autor ni referencia.
- Las entregas adicionales se confirman mediante **Registrar entrega** y conservan su propia fecha/autor. No entran en los totales monetarios.
- Totales por juego: premio monetario total, pagado, pendiente y cantidad de entregas pendientes. No se mezclan con Solo ni con ingresos por inscripción.
- Una liquidación sin ningún pago ni entrega puede rehacerse escribiendo `REHACER PREMIOS`. Con algún pago o entrega se bloquea su eliminación.
- Si se corrigió el Yape en Inscripciones antes de pagar un puesto, aparece **Actualizar destino**: exige confirmar el nuevo número antes de guardarlo. No cambia el destino de pagos ya registrados. El nombre mostrado sigue siendo el registrado; no se interpreta como titular verificado del Yape.
- **Avisar pago** abre WhatsApp con el contacto actual del equipo. El mensaje muestra el Yape realmente usado en el pago, aunque la inscripción haya cambiado después. No certifica el envío del mensaje ni lo envía automáticamente.
- Los pagos y entregas pendientes bloquean el cierre de edición. Al cerrar, se copian las dos tablas al archivo privado y se limpian antes de los equipos/fases. Se consultan en Torneos anteriores. No se incluyen en el archivo público ni se alteran las vistas públicas.
- Todo cambio de estas dos tablas se registra en `audit_log`, visible solo para administradores.

## Contrato interno

- `team_prize_context(p_edition_id uuid, p_game_key text)`: contexto privado para el juego seleccionado, con fase, bloqueo explicativo, podio/candidatos al tercer puesto, equipos aprobados y premios configurados.
- `confirm_team_prizes(p_edition_id uuid, p_game_key text, p_stage_id uuid, p_podium uuid[], p_items jsonb, p_expected_prizes jsonb)`: crea una única liquidación por edición/juego y tres filas de premio de forma atómica. `p_items` contiene exactamente tres cadenas. `p_expected_prizes` es la lista exacta que devuelve el contexto; evita confirmar importes cambiados mientras el modal estaba abierto.
- `record_team_prize_payment(p_edition_id uuid, p_payment_id uuid, p_action text, p_reference text, p_expected_amount numeric, p_expected_yape text)`: acciones `pay`, `deliver`, `refresh_yape`. Para `refresh_yape`, `p_reference` lleva el número corregido que el administrador vio y confirmó; no sustituye la referencia histórica de pago. Valida el importe y destino originales y conserva los datos de operaciones ya realizadas.
- `cancel_team_prizes(p_edition_id uuid, p_settlement_id uuid, p_confirmation text)`: solo liquidaciones sin pagos ni entregas; confirmación exacta `REHACER PREMIOS`.

Tablas privadas: `team_prize_settlements`, `team_prize_payments`. Sin permisos de escritura directa para clientes. Las RPC comprueban roles, edición, estado y destinatarios, con bloqueos de filas y la barrera de cierre de edición existente.

El frontend público, las inscripciones, los slots, los resultados, los comprobantes, el acceso por WhatsApp y el funcionamiento de Solo permanecen fuera de este cambio. No se requiere adaptar el formulario público.

## Mensaje de pago

```text
{Equipo}, ¡el premio de tu equipo ya fue pagado! ✓

Torneo: {Nombre de la edición}
Juego: {Free Fire o Mobile Legends: Bang Bang}
Puesto: {1, 2 o 3}.º lugar
Importe: S/ {importe con dos decimales}
Yape de destino del pago: {Yape conservado en el pago}

Revisa tu Yape para confirmar que recibiste el depósito.

¡Gracias por participar y confiar en RAGNAROK! Te esperamos en el próximo torneo.
```

No se añadieron nuevos mensajes a confirmación ni acceso: conservan su comportamiento anterior.

## Verificación

`supabase/tests/team_prize_payments.sql`: FF y MLBB, partidas pendientes, podio/final válidos, duplicados, edición incorrecta, importes obsoletos, destinos obsoletos, pagos idempotentes, rechazo de cero, entregas, corrección de Yape, conservación de resultados/equipos, roles/RLS, privacidad y cierre con archivo privado. Se ejecuta desde `supabase/tests/run.mjs` en memoria.

`tests/teamPrizePayments.test.js`: totales en centavos, mensajes de ambos juegos, contacto distinto de Yape y rechazo de avisos para pagos inválidos o pendientes.
