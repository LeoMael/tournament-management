# Ediciones, historial y Free Fire Solo

Aplicar en SQL Editor sobre una base existente, en este orden:

1. Verificar que están aplicadas **001 a 006**.
2. `007_tournament_editions.sql`
3. `008_free_fire_solo.sql`
4. `009_tournament_archive.sql`
5. Aplicar también `010_solo_nickname_registration.sql` para el formulario Solo sin ID.
6. Publicar las nuevas versiones de **ambos** frontends.

Estos scripts son incrementales y se aplican **una vez**. No ejecutar `00_reset.sql`, `01_schema.sql` ni los seeds sobre una base existente. No ejecutar las pruebas SQL sobre producción. No se necesita una Edge Function nueva ni claves privadas en los frontends.

## Compatibilidad y primera edición

007 adopta todos los registros actuales como «RAGNAROK U-Series 2026», sin borrarlos. Su nombre, descripción y portada se editan desde **Torneos anteriores → Edición activa → Editar presentación**. La fecha de inicio registrada al adoptar los datos corresponde al momento de aplicar la migración.

007 exige `edition_id` en las RPC públicas de inscripción por equipos e individual. Los frontends anteriores y formularios abiertos antes de actualizar se rechazan con «La edición cambió. Actualiza la página». Coordinar la publicación de ambos clientes inmediatamente después de las migraciones; durante ese intervalo no se aceptan envíos de clientes antiguos.

Las inscripciones y configuraciones anteriores siguen vigentes; Solo empieza deshabilitado. Las RPC anteriores quedan inaccesibles para clientes y solo se utilizan internamente. Los permisos actuales de admin/editor/revisor se mantienen; el historial, el cierre y las condiciones económicas Solo son exclusivos de admin.

## Operación de Solo

1. Configuración → activar el interruptor general y **Habilitar Free Fire Solo**. La apertura de escuadras FF es independiente.
2. Free Fire Solo → nueva sala: nombre, horario, cierre, cupo (2 a 100 jugadores; inicial 50), entrada, tarifa por kill y bono Booyah. Todos los montos son soles, con dos decimales.
3. Abrir inscripciones fija las condiciones económicas y el cupo. El cierre de sala debe quedar dentro del cierre general de inscripciones.
4. La web ofrece Solo desde el formulario de Free Fire y `/solo`. Cada inscripción paga una única partida. El mismo jugador puede participar en varias salas con comprobantes distintos y también en escuadras.
5. Revisar solicitudes: aprobar, rechazar con motivo o devolver el importe. Pendientes y aprobadas ocupan cupo; no se reutilizan comprobantes de otras modalidades ni del historial.
6. Cerrar inscripciones y comenzar la partida después de revisar todos los pendientes. Cargar kills para cada jugador aprobado y asignar un único Booyah.
7. Finalizar fija los resultados y genera `kills × tarifa + bono Booyah` para el ganador. Los importes cero se consideran liquidados automáticamente.
8. El admin registra el pago realizado fuera del sistema; la referencia es opcional. El sistema no transfiere dinero ni exige comprobante del pago saliente.
9. Cancelar antes de finalizar genera devoluciones para aprobados y rechaza pendientes. Las devoluciones requieren registro de pago; no hay premios en salas canceladas.

Solo terminado publica nickname, kills, Booyah y ganancia. Contactos, ID de Free Fire, comprobantes y pagos permanecen privados. Deshabilitar Solo detiene inscripciones nuevas y conserva la gestión y resultados existentes.

## Cerrar una edición

Configuración → Edición y cierre → revisar. Se bloquea el cierre si hay equipos pendientes, individuales sin resolver (incluidos grupos provisionales), partidos sin terminar, salas Solo no terminadas/canceladas, ganancias o devoluciones sin pagar. Los participantes individuales deben quedar inscritos en equipo, rechazados o reembolsados.

Indicar el nombre y cierre futuro de la siguiente edición y escribir el nombre exacto de la actual. La RPC vuelve a validar todo, archiva y limpia en una transacción bajo una barrera compartida con las escrituras operativas. Un error revierte toda la operación. Un reintento del mismo cierre devuelve la edición archivada sin afectar la siguiente.

Se archivan todas las filas operativas y la configuración en registros JSON versionados por edición, conservando identificadores y relaciones. El público recibe otra proyección, construida desde vistas públicas. Los resultados deportivos no pueden editarse en el archivo.

La siguiente edición arranca vacía, con inscripciones y transmisiones apagadas. Conserva contenido, usuarios, auditoría, datos de pago y tarifas base. Salas y cronograma no se copian; bolsas y premios quedan en cero y por anunciar. El archivo queda oculto hasta publicarlo desde **Torneos anteriores**; puede ocultarse de nuevo y el detalle público deja de responder.

Los archivos referenciados en el histórico se conservan en sus buckets originales y sus rutas se registran. Las políticas impiden eliminarlos o sobrescribirlos mediante clientes autenticados. Los comprobantes archivados solo son consultables por admin. Una limpieza externa con service role debe respetar `tournament_archive_assets`; service role y propietarios de base pueden omitir RLS.

## Verificación local aislada

El runner crea un PostgreSQL WASM efímero con stubs mínimos de Auth y Storage, aplica el esquema y **todas** las migraciones y ejecuta cuatro suites. No lee `.env` ni conecta a Supabase. No añade dependencias a los builds del producto.

```sh
npm install --prefix /tmp/ragnarok-sql-test @electric-sql/pglite@0.4.1
PGLITE_MODULE=file:///tmp/ragnarok-sql-test/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/run.mjs
npm run lint
npm run build
```

Ejecutar también lint y build en la web pública. Las suites comprueban cálculo decimal, reintentos, duplicados, privacidad, permisos, bloqueo de pendientes, archivo de relaciones circulares, limpieza, ocultación, devoluciones y protección frente a ediciones antiguas.

El formulario Solo usa el diseño de inscripción del sitio con tres pasos, sin pedir ID. Universidad y carrera tienen buscadores y son opcionales.

PGlite no reproduce la concurrencia multisesión ni la API HTTP de Supabase Storage. Antes de publicar, en staging con las políticas reales, probar dos envíos sobre el último cupo, inscripción simultánea con cierre, eliminación de archivo simultánea con cierre y rollback por fallo. Recorrer también los formularios y enlaces en escritorio y móvil.
