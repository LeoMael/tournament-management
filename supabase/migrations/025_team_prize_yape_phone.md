# Equipos FF y MLBB: contacto separado de Yape para premios

Estado: **aplicada en Supabase según confirmación del usuario**, al igual que la 024. No se verificó producción mediante una conexión directa. No repetir si terminó correctamente.

## Despliegue

1. Ejecutar una vez `025_team_prize_yape_phone.sql`, después de la 024. Sin resets ni reejecutar el esquema inicial.
2. Publicar después los cambios de este panel. Antes de la migración, la edición muestra un aviso para evitar guardar contra una columna ausente.
3. Adaptar luego el formulario público desde su repositorio y probar números distintos y la casilla de mismo número. No se modificó ese frontend en esta tarea.

## Campos exactos

- `registrations.captain_whatsapp`: contacto para mensajes, coordinación y acceso de FF. Mantiene su comportamiento y validación anteriores; se recomienda enviar cadena de 8 a 15 dígitos.
- `registrations.prize_yape_phone`: Yape receptor de premios. Cadena obligatoria de 8 a 15 dígitos, sin espacios, signos ni separadores. No identifica al titular del comprobante.
- `captain_name`: conserva su valor y uso actual. El panel lo identifica como titular del comprobante en las inscripciones por equipos, sin asumir que es titular de este Yape.

La migración completa únicamente `prize_yape_phone` NULL o vacío con `captain_whatsapp`; no sobrescribe ningún Yape no vacío. En inserciones internas antiguas, el nuevo campo ausente se completa con el contacto. Actualizar uno después no cambia el otro.

## Contrato de inscripción

Se conserva `submit_registration(payload jsonb)`, disponible a `anon` y `authenticated`, respuesta `{id, amount_due}` y lógica previa para juego, disponibilidad, cupos, institución, carrera, archivos, integrantes y duplicados. No se introduce un nuevo request_id ni se cambian las reglas existentes de reenvío.

La RPC sigue delegando la inscripción en `submit_registration_before_editions(payload)`, que continúa inaccesible directamente a clientes. Si `prize_yape_phone` está presente, se valida y guarda junto a la nueva inscripción, en la misma transacción. Si está ausente, se usa el WhatsApp normalizado que ya guarda la función anterior. Si está presente pero es vacío, NULL, número JSON o texto inválido, se rechaza; no se oculta un error del nuevo formulario con un fallback silencioso.

```js
const { data, error } = await supabase.rpc('submit_registration', {
  payload: {
    edition_id: editionId,
    game_key: 'ff', // o 'mlbb'
    team_name: 'Equipo Ejemplo',
    captain_name: 'María Pérez López', // nombre registrado/titular del comprobante
    captain_whatsapp: '987654321',
    prize_yape_phone: '912345678',
    institution: 'Otra', // conserva los valores actuales: UNAP u Otra
    other_institution: 'Instituto Ejemplo',
    professional_school: 'Carrera Ejemplo',
    receipt_path: receiptPath, // UUID.ext del archivo ya subido a receipts
    logo_path: null,
    players: players, // roster actual: nickname, game_player_id, server_id según juego
    website: ''
  }
})
```

`players` y archivos conservan su contrato actual: FF requiere sus 4 titulares y MLBB sus 5; suplentes según la configuración del juego. No hace falta enviar el nuevo dato en cada integrante: corresponde a la inscripción del equipo.

El futuro frontend mostrará ambos campos inicialmente y la casilla desmarcada «Mi WhatsApp y mi Yape tienen el mismo número». Al marcarla debe enviar el WhatsApp actual también en `prize_yape_phone`; al desmarcarla debe exigir el Yape alternativo. El backend no necesita recibir el booleano de la casilla.

## Panel y alcance

- Inscripciones → Ver → Editar datos: WhatsApp y Yape independientes, misma actualización y permisos existentes. Detalle con Yape para premios y botón para copiar solo ese número; sin fallback al contacto para mostrar/copiar premios.
- CSV: columnas diferenciadas «WhatsApp de contacto» y «Yape para premios»; el buscador acepta ambos.
- Mensajes existentes de confirmación FF/MLBB, chat y acceso FF siguen usando exclusivamente `captain_whatsapp`. No se modifican sus textos ni contadores por este cambio.
- Aún no existe gestión de pagos de premios de equipos. El destino queda preparado; al añadirla deberá consumir `prize_yape_phone`, nunca deducirlo de WhatsApp o del nombre del comprobante.
- No cambia el Yape de la organización, precios, cobros de inscripción, integrantes, instituciones, carreras, comprobantes, resultados ni el registro individual. No se modifica Solo.
- No se cambian vistas públicas: ningún teléfono ni nombre del titular se añade a salas, equipos, jugadores o resultados públicos. El histórico privado mantiene sus datos según los permisos actuales.

## Comprobaciones

Pruebas SQL aisladas: backfill NULL/vacío y preservación de Yape existente; FF y MLBB con campo omitido/igual/distinto; contrato de respuesta; roster/comprobantes/institución/carrera; valores inválidos sin filas parciales; edición independiente; RPC bajo rol anónimo y ausencia de teléfonos en vistas públicas. Se ejecutan también las suites previas de Solo, archivos, resultados, permisos y WhatsApp FF.
