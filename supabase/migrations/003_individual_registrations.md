# Inscripción individual (migración 003)

La migración es independiente y requiere que 001 y 002 estén aplicadas. Revisa la migración y prueba en un entorno aislado antes de aplicarla; no ejecutes de nuevo el esquema global ni el reset sobre datos existentes. La aplicación de SQL y el despliegue son decisiones separadas. La migración registra su versión en la misma transacción.

Para cada juego la inscripción individual empieza cerrada y cuesta S/ 4 por persona. Un administrador puede abrirla y cambiar el plazo de nombre en Inscripciones individuales. Los comprobantes permanecen en el bucket privado `receipts`; su comprobación automática revisa tamaño y metadatos, mientras que el personal debe verificar el pago. El navegador valida la firma del archivo, pero esa validación se puede eludir mediante un cliente directo. No se aplica un límite por IP y las subidas fallidas pueden dejar archivos huérfanos.

La inscripción individual no solicita ID de servidor; las inscripciones de equipo conservan su flujo existente. Los participantes aprobados se sortean por juego en grupos provisionales. MLBB utiliza cinco roles compatibles y Free Fire cuatro integrantes. El sorteo reserva cupos de equipos, pero no crea aún inscripciones de equipo; los participantes restantes esperan y pueden solicitar reembolso. Se coordina manualmente el enlace de WhatsApp y la elección del capitán. El plazo del nombre se fija al crear el grupo; el nombre generado se usa si no se escogió otro. La acción de inscripción final crea un equipo aprobado y un roster fijo usando la suma de los pagos individuales, sin comprobante de equipo ficticio. Los datos individuales no se publican como tales.

Las operaciones de revisión, sorteo, edición del grupo y finalización requieren administrador o revisor/árbitro. La confirmación de reembolso requiere comprobante privado. Los cambios quedan en auditoría y el sorteo acepta una clave de solicitud para reintentos. Coordina los cambios de permisos y de interfaz con la migración antes de abrir inscripciones.

## Pruebas de integración pendientes en entorno aislado

Estas pruebas están pendientes; no se han ejecutado contra PostgreSQL. Usa una base desechable con Auth y Storage simulados o equivalentes, nunca datos reales.

| Caso | Resultado esperado |
|---|---|
| Aplicar 001, 002 y 003 en orden; provocar error dentro de 003 | Versiones previas aplicadas; ante error no queda una 003 parcial ni su entrada de historial. |
| Consultar datos privados o escribir directamente como `anon` | Acceso denegado; solo configuración y vistas públicas autorizadas son legibles. |
| Enviar inscripción con institución/carrera vacías y consentimiento válido | Se registra sin ID de servidor como pendiente por S/ 4 con comprobante válido; términos ausentes o incorrectos se rechazan. |
| Repetir un ID en roster o entre inscripción individual y equipo, en ambos órdenes | Se rechaza el duplicado, incluso en operaciones concurrentes y reactivaciones. |
| Revisar como admin, revisor y editor | Admin y revisor pueden ejecutar transiciones autorizadas; editor y anónimo no. Verificar rechazo y reembolso pendiente. |
| Sortear MLBB con roles flexibles que hacen fallar una asignación voraz | Cada grupo contiene cinco jugadores y un jugador por rol compatible; sobrantes permanecen aprobados. |
| Sortear Free Fire | Cada grupo contiene cuatro jugadores; sobrantes permanecen aprobados. |
| Reintentar sorteo con mismo UUID y luego con UUID distinto | Mismo UUID devuelve el resultado anterior sin duplicar grupos; nueva solicitud solo considera personas aún disponibles. |
| Consultar inscripciones tras sortear | Los grupos siguen siendo provisionales: no existe inscripción de equipo hasta la acción final. |
| Competir por cupos o nombres entre un grupo provisional y un equipo tradicional | Las reservas se respetan en ambas direcciones, sin superar el cupo ni duplicar nombres; la vista pública incluye reservas. |
| Guardar grupo con capitán ajeno o modificar roster finalizado | Ambas acciones se rechazan; un capitán miembro y enlace válido permiten la finalización, y el capitán elegido ocupa el puesto 1 del roster. |
| Reintentar finalización | Devuelve el mismo `registration_id` sin crear otro equipo ni jugadores. |
| Completar reembolso sin comprobante válido | Se rechaza; con comprobante privado válido queda registrado y el reintento es seguro. |
