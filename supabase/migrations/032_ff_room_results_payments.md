# Paso 3: resultados y pagos de las modalidades nuevas

**Aplicada en Supabase según confirmación del usuario.** La 031 también fue confirmada como aplicada. El asistente no ejecutó SQL remoto ni hizo commit/push.

Solo por kills y Booyah conserva sus tablas, RPC, importación de IA y pagos actuales. La 032 utiliza exclusivamente `ff_room_results`, `ff_room_payments` y las salas/inscripciones nuevas de las migraciones 029–031.

## Flujo

1. Cerrar inscripciones y revisar todas las solicitudes pendientes.
2. Iniciar partida (administrador o revisor).
3. En Resultados, completar posiciones y, en Dúo kills, las kills de cada integrante. Top admite kills de referencia, inicialmente cero; no afectan el premio. El primer puesto marca el Booyah automáticamente. En Dúo kills se puede indicar Booyah sin posición.
4. Revisar el borrador y pulsar **Guardar todos los resultados**. Incluye todos los aprobados, aunque el buscador los oculte. Un borrador incompleto no se guarda parcialmente. Se puede ordenar por slot o posición final. Los borradores duran en memoria hasta recargar/cerrar el panel; cambiar entre modalidades visitadas conserva sus borradores. Se advierte si otro organizador guardó una versión más reciente.
5. **Finalizar partida** (administrador) fija resultados y genera premios. Requiere un ganador y resultados de todos los aprobados. No hay puntos acumulados: cada sala es una partida.
6. En Pagos, copiar el Yape y registrar la operación ya realizada con su referencia. No se realizan transferencias desde el panel. Se muestran totales pagados/pendientes y devoluciones por separado. Los premios cero no ofrecen acciones de pago/copia. El orden prioriza pendientes y, dentro del mismo estado, Booyah e importe.

Top: premio fijo de la posición configurada; fuera de los puestos premiados, cero. Dúo kills: `(kills_1 + kills_2) × kill_reward + bono Booyah`. Una pareja ocupa un slot y recibe un pago.

Cancelar una sala antes de finalizar conserva registros, rechaza pendientes y genera devolución de la entrada para aprobados. Requiere escribir su nombre exacto. Antes de devolver, confirmar el destino con el participante; se usa el Yape registrado, corregible en Ver detalle. No hay borrado de resultados/pagos finalizados desde esta etapa.

## Privacidad y teléfonos

- Las tablas son privadas, con RLS, permisos explícitos, auditoría y protección por edición. No hay escrituras directas de clientes.
- Ver detalle permite corregir WhatsApp y Yape independientemente. El nombre registrado se muestra sin asumir que identifica al titular del Yape.
- Al registrar un pago se verifica importe y destino esperados; el destino pagado queda guardado en `paid_phone`. Cambiar el teléfono después no cambia pagos históricos. Reintentar un pago registrado devuelve el original.
- La vista pública `public_ff_room_results` expone únicamente `id`, `room_id`, `room_kind`, `slot`, `nickname_1`, `nickname_2`, `placement`, `kills_1`, `kills_2`, `booyah`, `earnings`. Estadísticas y ganancias solo se publican al finalizar; no incluye teléfonos, nombres de comprobante, rutas privadas ni referencias de pago.
- El cierre de edición bloquea liquidaciones positivas pendientes y archiva resultados/pagos privados y la proyección pública sanitizada.

## Contratos nuevos

- `save_ff_room_results(p_edition_id uuid, p_kind text, p_room_id uuid, p_results jsonb, p_expected_updated_at timestamptz = null, p_expect_empty boolean = false)`; filas `{registration_id, placement: numero|null, kills_1: entero, kills_2: entero, booyah: boolean}`. La interfaz envía la versión leída antes de editar para detectar guardados de otro organizador.
- `manage_ff_room(p_action, p_data)` conserva su contrato y añade `start`, `finish`, `cancel` con devoluciones.
- `pay_ff_room_payment(p_edition_id, p_payment_id, p_amount, p_phone, p_reference)` solo registra pagos; no transfiere dinero.
- `update_ff_room_phones(p_edition_id, p_registration_id, p_whatsapp, p_prize_yape_phone)` para correcciones administrativas.

## Pendientes del plan

Paso 4 preparado localmente: consultar `033_ff_room_whatsapp.md` para Excel, Copiar para IA, importación/carga de borrador desde JSON y WhatsApp. Requiere aplicar 033; no se anuncia como desplegado.

Paso 5: conectar el frontend público desde su repositorio. No se modificó ese frontend.

## Comprobación local

Pruebas SQL con PGlite: ciclo real de las tres modalidades, resultados completos, rechazos atómicos, conflictos de versión, fórmulas, pagos idempotentes, destinos históricos, cancelación/devolución, permisos/RLS, vistas públicas y archivo. Se ejecutaron también las pruebas previas de Solo y los demás módulos. Pruebas JS, lint y compilación del panel. No sustituye una prueba con tu sesión real de Supabase tras aplicar la migración.
