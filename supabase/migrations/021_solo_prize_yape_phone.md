# Solo: WhatsApp de contacto y Yape para premios

Estado: **aplicada en Supabase según confirmación del usuario**. Probada también localmente en una base aislada; no se verificó producción mediante una conexión directa.

## Despliegue

1. Ejecutar una vez `021_solo_prize_yape_phone.sql` después de la 020, en el SQL Editor del proyecto correspondiente. No ejecutar resets ni rehacer el esquema.
2. Publicar después los cambios del panel. Si la migración ya se ejecutó correctamente, no volver a ejecutarla.
3. Adaptar posteriormente el frontend público desde su repositorio. El formulario actual sigue funcionando mientras omita el nuevo campo.

## Datos y compatibilidad

- `solo_registrations.whatsapp`: WhatsApp de contacto, conserva nombre y validación actuales.
- `solo_registrations.prize_yape_phone`: Yape para premios; texto obligatorio de 8 a 15 dígitos, sin espacios, signo `+` ni separadores. Enviar números como cadenas, no números JSON.
- La migración copia WhatsApp únicamente cuando el nuevo campo es NULL o vacío. Nunca sobrescribe un Yape no vacío. No sincroniza posteriores cambios de contacto.
- La RPC conserva su firma `submit_solo_registration(payload jsonb)`, respuesta `{id, amount_due}`, bloqueos, edición actual, comprobantes, disponibilidad, pausas, cupos e idempotencia. Si `prize_yape_phone` no existe en el payload, copia `whatsapp`; si existe, debe ser una cadena válida (NULL o vacío generan error).
- Los reintentos deben conservar exactamente el payload y `request_id` del intento original; no añadir el nuevo campo a un intento antiguo en curso. Las correcciones administrativas no cambian su fingerprint ni reescriben un registro al reintentarlo.
- No se modifican vistas públicas: siguen proyectando campos explícitos sin teléfonos, titulares ni comprobantes. El archivo histórico privado y la auditoría conservan los datos según sus permisos existentes.

## Envío esperado desde el futuro frontend

```js
const { data, error } = await supabase.rpc('submit_solo_registration', {
  payload: {
    edition_id: editionId, // UUID de la edición actual
    room_id: roomId,       // UUID de la sala
    request_id: requestId, // UUID estable para reintentos
    full_name: 'María Pérez López', // titular del comprobante de inscripción
    whatsapp: '987654321',
    prize_yape_phone: '912345678', // o el mismo whatsapp si marcó la casilla
    nickname: 'Nickname exacto del juego',
    institution: '',         // opcional; también se puede omitir
    professional_school: '',// opcional; también se puede omitir
    receipt_path: receiptPath, // nombre UUID del archivo ya subido a receipts
    website: ''              // honeypot existente
  }
})
```

## Panel

- «Ver detalle» → «Editar números»: ambos campos independientes, solo administradores. RPC `update_solo_registration_phones(p_edition_id uuid, p_room_id uuid, p_registration_id uuid, p_whatsapp text, p_prize_yape_phone text)`. Se envían los dos valores actuales aunque solo uno cambie. No cambia inscripción, slot, comprobante, resultados ni importes.
- Mensajes de aprobación y acceso, coordinación y Excel `phone`: exclusivamente WhatsApp de contacto. El prompt para IA continúa sin teléfonos.
- Premios: tabla y ventana «Registrar pago» muestran/copian exclusivamente `prize_yape_phone`. Si falta, «No indicado», sin fallback silencioso al contacto.
- Devoluciones: confirmar el destino con quien pagó. No se infiere que el Yape de premios o el contacto pertenezcan al titular del comprobante. No cambian generación, importes ni registro de devoluciones.
- `full_name` sigue representando al titular del comprobante, no acredita al titular del Yape para premios. El Yape receptor de la organización permanece igual.
- Corregir un teléfono no modifica transferencias ya realizadas. La tabla muestra el destino actual de premios; los pagos y sus referencias se conservan.

## Comprobaciones

Suite SQL aislada: backfill NULL/vacío, conservación de Yape previo, compatibilidad de payload antiguo, destino separado, rechazos de valores inválidos, reintentos, edición independiente, conservación de slot/datos, auditoría, permisos y ausencia de teléfonos en vistas públicas. Además, regresiones existentes de salas, pagos, cancelación, pausa, resultados y slots.

Pruebas JavaScript: los enlaces WhatsApp y el Excel usan contacto aunque el Yape sea diferente; el destino de premios nunca se deduce del WhatsApp al leer los registros.
