# Mostrar slots en la web pública

Ejecutar una vez `014_public_solo_slots.sql`, después de 013. No repetir 013.

Añade `slot` a `public_solo_results`, que ya consulta el frontend `u-series`. Su componente `Solo.jsx` ya muestra `player.slot`, por lo que basta recargar la página pública después de aplicar la migración.

Solo se muestran los slots de aprobados de la edición activa en salas que no sean borradores ni canceladas. Kills, Booyah y ganancias siguen ocultos hasta finalizar la partida. Contactos y comprobantes siguen privados. No reasigna slots ni altera inscripciones, resultados, pagos o archivos históricos anteriores. Los futuros archivos públicos incluirán el slot porque el cierre ya copia esta vista.
