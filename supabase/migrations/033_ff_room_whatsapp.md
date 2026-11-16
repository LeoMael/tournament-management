# Paso 4: IA, Excel y WhatsApp para las nuevas salas

**033 aplicada en Supabase según confirmación del usuario.** La 032 también fue confirmada como aplicada. La publicación del código del panel es independiente de esa ejecución. No se modificó el frontend público ni los módulos existentes de Solo por kills, escuadras o MLBB.

## IA y borradores

`Copiar para IA` copia toda la nómina aprobada de la sala, aunque el buscador oculte registros. El prompt excluye nombres personales, teléfonos, comprobantes y credenciales. Se adapta a la modalidad:

- Dúo kills: ambas kills individuales, suma por pareja y bono Booyah; un único premio por dúo.
- Solo/Dúo Top: posición final y premio fijo configurado; las kills de referencia no afectan el premio. Un slot representa un jugador o una pareja, respectivamente.

Contrato JSON `schema_version: "ff_rooms_v1"`: sala, edición, modalidad y reglas fijadas; una fila por registro aprobado con su UUID, slot y ambos nicknames originales. Cada fila contiene `nickname_1_read`, `nickname_2_read`, `placement`, `kills_1`, `kills_2`, `booyah`, `status`, `source`, `notes`. En Solo el segundo nickname es null y su lectura vacía. Estados: verified, similarity, unverified, discard. Los dos últimos requieren resultados null y revisión manual.

En Resultados → Importar resultados de IA:

1. Pegar solo el JSON y **Verificar y previsualizar**. Se validan sala, edición, modalidad, reglas, nómina completa, slots, nombres, duplicados, posiciones y ganador. No se aceptan ganancias calculadas por la IA como importes autorizados: las calcula el panel.
2. Revisar la propuesta, ordenar por posición/slot y filtrar pendientes. No se comparan columnas Panel/IA.
3. Durante `playing`, aceptar y **Cargar borrador**. Reemplaza el borrador de toda la sala, sin escribir en Supabase. Los pendientes conservan campos vacíos y una confirmación de revisión manual antes de poder guardar. En Top, kills desconocidas se cargan como 0 de referencia, explícitamente indicado en la vista previa; no afecta al premio por puesto.
4. En la tabla principal solo se añade **Leído:** cuando difiere del nickname, sin fuente ni observaciones extensas. Corregir y **Guardar todos los resultados**; después finalizar normalmente. La posición importada sí ocupa la columna Posición y puede ordenar las filas.

Salas terminadas admiten únicamente vista previa. **Probar con esta nómina** genera datos ficticios para previsualizar; ese ejemplo no ofrece Cargar borrador. Metadatos de lectura/revisión son locales, no columnas públicas ni resultados persistidos. El borrador se pierde al recargar/cerrar el panel.

## Excel

Exporta un `.xlsx` de una columna `phone`, con los WhatsApp de contacto únicos de todos los aprobados. En Dúo hay un contacto por inscripción. Nunca exporta el Yape receptor en lugar del contacto. Se reutiliza el generador de Excel existente sin cambiar su comportamiento para Solo.

## WhatsApp

En Inscripciones aparece un bloque plegable **Acceso privado de la sala**. Guarda ID/contraseña manuales mientras está abierta, cerrada o en juego. La contraseña tiene opción Mostrar/Ocultar.

- Sin credenciales guardadas, o mientras se editan cambios sin guardar: **Confirmar inscripción** con nombre de la sala, hora de Perú y `*TU SLOT ASIGNADO: 07*`.
- Con acceso guardado: **Enviar acceso**, con slot destacado después del saludo y antes de sala/hora/ID/contraseña. En Dúo incluye ambos nicknames e indica que compartan el acceso solo entre los dos.
- Cada botón muestra únicamente su contador pequeño. Confirmación y acceso son independientes, compartidos entre organizadores y se refrescan cada 15 segundos mientras la modalidad está visible. Son clics, no confirmaciones de envío.
- El servidor valida estado, edición, inscripción aprobada y slot; obtiene las credenciales actuales e incrementa el contador en una sola operación. El navegador abre WhatsApp; la persona revisa y pulsa Enviar. Si el navegador bloquea la ventana antes de preparar el mensaje, no se incrementa.
- En Pagos, **Avisar pago** solo para premios positivos registrados: usa el WhatsApp actual como contacto y muestra el Yape histórico `paid_phone` del pago. No se ofrece para pendientes, importes cero ni devoluciones.

Se usa `✓`, sin emojis que anteriormente dieron problemas de codificación.

## Backend y privacidad

- Campos privados nuevos en `ff_room_registrations`: `confirmation_click_count`, `access_click_count`, ambos inicialmente 0. No se alteran los contadores del Solo existente.
- Tabla privada `ff_room_access`, con RLS y lectura de admin/revisor únicamente en la edición actual. Referencias a las salas reales y borrado en cascada. No hay escritura directa del cliente.
- `save_ff_room_access(p_edition_id uuid,p_kind text,p_room_id uuid,p_game_room_id text,p_room_password text)` guarda las credenciales.
- `prepare_ff_room_whatsapp(p_edition_id uuid,p_kind text,p_room_id uuid,p_registration_id uuid,p_action text)` acepta `confirmation` o `access`; devuelve los datos mínimos del mensaje y contadores actualizados. Confirmación nunca devuelve credenciales.
- Sin auditoría de contraseñas ni snapshots de acceso; al cerrar la edición se descartan las credenciales. Se conservan los contadores en las inscripciones archivadas.
- Ningún cambio en las vistas públicas ni teléfonos nuevos en ellas.

## Activación y comprobación

1. Ejecutar una vez **033_ff_room_whatsapp.sql** en el proyecto correcto, después de 032.
2. Probar localmente con una sala de la modalidad nueva: Excel, prompt/JSON, vista previa y borrador. Probar confirmación, guardar acceso y comprobar ambos contadores con otra sesión de organización. No se realizaron envíos reales durante las pruebas del asistente.
3. Tras revisar, hacer commit/push cuando el usuario lo autorice. El frontend público se conectará aparte; su contrato de inscripción de la 031 permanece igual.

Validación local: suite SQL completa con PGlite y permisos/RLS, aislamiento entre modalidades, credenciales actualizadas, contadores separados, rechazo de pendientes/canceladas y eliminación de secretos al archivar; pruebas JS de prompts, importación, revisión manual y mensajes; renderizado de componentes, lint y compilación. Hace falta la prueba con las capturas reales y la sesión real después de aplicar 033.
