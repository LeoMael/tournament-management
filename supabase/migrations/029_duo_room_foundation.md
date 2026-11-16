# Paso 1: base privada de salas Dúo y premios

Estado: **aplicada en Supabase según confirmación del usuario**. Los archivos siguen locales, sin commit ni push. La comprobación técnica se hizo en una base aislada.

## Alcance de esta entrega

Esta primera parte prepara la configuración de las salas. No publica Dúo, no habilita inscripciones y no añade todavía botones al panel. La conexión visual y el registro de parejas corresponden a los siguientes pasos.

Se usan tablas nuevas y separadas de Solo:

- `duo_rooms`: borradores privados de salas para **una sola partida**, con modalidad `top` o `kills`, nombre, fechas, cupo, entrada y condiciones monetarias.
- `duo_room_prizes`: importe fijo por puesto de cada sala Top.

El futuro panel podrá reunir Solo y Dúo en el mismo apartado aunque los datos estén separados. Las salas actuales continúan siendo Solo por su origen en `solo_rooms`: no se reclasifican ni copian sus filas.

No se alteran tablas, columnas, RPC, vistas públicas ni políticas existentes de Solo, escuadras FF, MLBB o individuales. Tampoco se cambia `solo_enabled`. No se crean datos Dúo automáticamente.

## Reglas preparadas

- `mode='top'`: premio fijo por puesto final, sin puntos acumulados. La cantidad de puestos se deriva de la lista de premios, desde 1 hasta el cupo de parejas de la sala. Puede ser hasta 4.º, menos o más; no está fijada a cuatro.
- Los puestos son consecutivos `1..N`. Cada importe admite de S/ 0 a S/ 1 000 000, con hasta dos decimales. La base no permite huecos ni cantidades incongruentes de premios al confirmar una transacción.
- `mode='kills'`: tarifa por kill y bono Booyah configurables; no admite una lista de premios Top. La tarifa está destinada a aplicarse a la suma de kills de ambos integrantes en el paso de resultados.
- En Top, tarifa por kill y bono Booyah deben ser cero, para no mezclar ambas reglas monetarias.
- `capacity` cuenta **parejas**, no personas. El límite técnico en esta base es de 2 a 50 parejas; la cantidad que se use deberá ajustarse a la capacidad real de la sala de juego. No presupone que el juego admita ese máximo.
- `entry_price` es la entrada total de la pareja para una partida. No se cobra automáticamente a cada integrante.
- Se valida nombre, modalidad, cupo, fechas finitas, cierre no posterior a partida e importes numéricos no negativos. Los borradores pueden planificarse fuera del plazo general; las condiciones de apertura se añadirán al conectar el flujo.

La tabla tiene una restricción **solo borradores**. En este paso ni el panel ni una llamada al servidor pueden abrir una sala Dúo, aprobar parejas, guardar resultados o registrar pagos. Se habilitarán de forma controlada mediante las próximas migraciones.

## Contrato administrativo preparado

`manage_duo_room_draft(p_action text,p_data jsonb)` devuelve un objeto con ID, modalidad, estado `draft`, cupo de parejas y cantidad de puestos premiados. Solo un administrador puede ejecutarla. Los revisores pueden consultar borradores de la edición actual; no modificarlos. Los editores y visitantes no pueden consultar estas tablas.

Acciones:

- `create`: crea un borrador y su lista de premios de forma atómica.
- `edit`: sustituye la configuración del mismo borrador conservando su ID. Permite cambiar Top/kills y puestos mientras sea borrador. Requiere la configuración completa, no un parche parcial.
- `delete`: exige el ID y el nombre exacto en `confirmation`. Elimina únicamente ese borrador y sus premios, con auditoría.

Ejemplo Top con cuatro puestos:

```json
{
  "p_action": "create",
  "p_data": {
    "edition_id": "UUID_DE_LA_EDICION_ACTUAL",
    "name": "Dúo Top",
    "mode": "top",
    "capacity": 24,
    "scheduled_at": "2026-11-29T19:00:00-05:00",
    "closes_at": "2026-11-29T18:30:00-05:00",
    "entry_price": 4,
    "kill_reward": 0,
    "booyah_reward": 0,
    "top_prizes": [100, 60, 40, 20]
  }
}
```

El primer importe corresponde al 1.º, el segundo al 2.º, y así sucesivamente. Para dos puestos, enviar solo dos importes; la base calculará `rewarded_places=2`.

Para Dúo por kills usar `mode="kills"`, `top_prizes=[]` y los valores deseados de `kill_reward` y `booyah_reward`. Estos ejemplos son configuración de prueba; no se crearon salas en producción.

## Seguridad y compatibilidad

- RLS habilitada explícitamente y sin escritura directa para clientes; no hay lecturas ni RPC Dúo concedidas a `anon`.
- Las mutaciones verifican administrador y edición, utilizan la barrera existente de cierre de edición y bloquean la sala al editar.
- Sala y premios comparten edición mediante una clave foránea compuesta. No puede trasladarse un premio a otra sala o edición.
- Los cambios quedan en `audit_log` mediante el trigger existente, sin modificar su definición.
- No se añadieron teléfonos, comprobantes ni credenciales a ninguna vista pública.
- No se modificó el cierre de edición existente. Si se crearan borradores Dúo desde esta RPC durante la preparación, se conservan en sus tablas originales ligados a su edición, y el administrador mantiene consulta privada. No aparecen todavía en Torneos anteriores ni en el archivo público. No hay inscripciones, resultados ni pagos Dúo que puedan quedar fuera del archivo en este paso, porque no están habilitados. La integración completa del ciclo y archivo se hará antes de habilitar la operación real de Dúo.

## Aplicación

No es necesario ejecutarla para revisar este trabajo local. Cuando se decida aplicar la base, ejecutar **una sola vez** `029_duo_room_foundation.sql`, después de la 028. Sin resets ni reejecutar `01_schema.sql`. Esto no activa Dúo para los participantes.

## Comprobaciones

- Antes/después: datos Solo existentes, slots, teléfonos, contadores, acceso, resultados y pagos; columnas Solo, definiciones de todas las funciones existentes y vistas públicas sin cambios.
- CRUD de borradores Top y kills, dos/cuatro/seis puestos, importes decimales y cero, cambio de modalidad, validaciones y rollback ante errores.
- Integridad de la lista de premios al finalizar la transacción, cascada de un borrador eliminado y auditoría.
- Roles reales `authenticated`/`anon`, restricción por edición, escritura directa denegada y bloqueo de acciones no habilitadas.
- Cierre de edición previo conservado y retención privada de borradores, sin publicar Dúo.
- Suite SQL existente de Solo, escuadras, MLBB, permisos y archivo ejecutada en memoria, sin `.env` ni conexión de producción.

Siguiente paso: conectar el panel y preparar inscripciones de parejas con dos nicknames y un slot por dúo. Resultados, liquidaciones, WhatsApp, IA y formulario público siguen pendientes de sus respectivas etapas.
