# Publicación de equipos confirmados por juego

**036 aplicada en Supabase según confirmación del usuario.** No se ejecutó SQL remoto desde este desarrollo. No se modificó el frontend público.

## Panel y backend

Debajo del título **Equipos inscritos** y antes de los filtros, los administradores ven una fila compacta **Visibilidad en la web**, con interruptores MLBB y Free Fire. Cada uno indica Publicado u Oculto. Los controles son independientes del filtro de juego de la tabla y del estado de aprobación de las inscripciones. La tabla privada permanece igual.

Se añade únicamente `public.games.public_teams_visible boolean not null default true`. Conserva inicialmente la publicación actual de ambos juegos. No modifica `is_open`, inscripciones, integrantes, comprobantes, precios, puntos, premios ni las salas Solo/Dúo. Los lectores públicos pueden consultar `key`, `name` y `public_teams_visible`.

RPC administrativa:

```js
supabase.rpc('set_public_team_list_visibility', {
  p_edition_id: editionId,
  p_game_key: 'ff',                 // 'ff' o 'mlbb'
  p_visible: false,                // destino deseado
  p_expected_visible: true         // estado observado antes del cambio
})
```

Respuesta: `{game_key,edition_id,public_teams_visible}`. Verifica administrador, edición, juego y booleanos bajo la barrera de edición y bloqueo de fila. Reintentar el mismo destino devuelve el estado actual sin duplicar auditoría. Los cambios quedan en `audit_games`. Un trigger adicional protege el campo incluso ante UPDATE directo de un editor/revisor, sin cambiar sus permisos actuales de textos o En vivo.

El control comparte estado entre administradores; la pantalla lo vuelve a consultar cada 15 segundos cuando está visible. Si falta la migración o hay un error, deshabilita los controles y muestra el error dentro de esta sección, sin impedir revisar inscripciones.

La visibilidad se conserva como configuración por juego entre ediciones. El archivo privado de juegos la incorpora automáticamente en su snapshot existente; no se cambia el proceso de archivo.

## Conexión pendiente en el frontend público

**El estado no oculta automáticamente la página web hasta adaptar el frontend.** El backend prepara el indicador y el panel lo administra. Se conservan las vistas públicas actuales para no afectar clasificación, llaves ni otros módulos. Es un control de presentación de la sección Equipos.

Instrucciones para el chat del frontend:

1. Leer `public_teams_visible` de `games` junto con `key`; reutilizar la consulta/configuración existente de juegos.
2. En la página Equipos, evaluar el juego seleccionado (`mlbb`/`ff`). Si su campo es false, ocultar tarjetas, contador, buscador y mensajes de lista vacía de ese juego. Mantener los botones MLBB/Free Fire para poder cambiar entre ellos.
3. Mostrar el texto neutral: **«Próximamente: equipos participantes»** y **«La lista oficial de equipos se publicará próximamente. Mantente atento a las novedades del torneo.»** No inferir que no hay solicitudes ni mostrar cantidades ficticias.
4. Si true, conservar el listado real aprobado, búsqueda y contador actuales. Distinguir equipos publicados sin resultados de búsqueda de una lista configurada como oculta.
5. Esperar a conocer la configuración antes de mostrar tarjetas/contadores para evitar un destello del listado oculto. Un error de configuración/consulta debe mostrar una opción para reintentar, no un falso «no hay equipos».
6. Conservar inscripción, precios, cupos y resultados. Este campo no abre/cierra inscripciones ni afecta Solo/Dúo. No aplicar la configuración actual al historial de ediciones anteriores.
7. Reconsultar la configuración al volver a la pestaña o periódicamente si se desea reflejar cambios del panel sin recargar. Usar la configuración pública; nunca llamar a la RPC administrativa desde visitantes.

## Activación y comprobaciones

1. Ejecutar una vez `036_public_team_list_visibility.sql` en el proyecto correcto, después de la 035.
2. Revisar los controles en el panel local y conectar el frontend con las instrucciones anteriores.
3. Probar ocultar y publicar cada juego independientemente, confirmar que el panel conserva sus equipos y que las inscripciones siguen funcionando. No se cambiaron publicaciones reales durante el desarrollo.

Pruebas SQL locales: defaults y conservación de datos/funciones/vistas existentes; independencia de los dos juegos; auditoría e idempotencia; equipos y roster intactos; apertura/precios/cupos intactos; permisos RPC y UPDATE directo de editor/revisor/anon; conservación de edición de textos y En vivo. Renderizado de controles disponibles/deshabilitados/error y compilación/lint del panel.
