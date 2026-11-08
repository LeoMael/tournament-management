# Guardado general de resultados Solo

Ejecutar `012_solo_bulk_results.sql` después de 011 y actualizar el panel. No ejecutar el esquema, reset ni migraciones anteriores de nuevo.

El botón «Guardar todos los resultados» guarda todos los aprobados, incluidos los ocultos por el buscador. La función valida la edición, sala en juego, participantes, kills enteras entre 0 y 1000 y como máximo un Booyah. Admin y revisor/árbitro pueden guardar. La operación es transaccional: un error revierte todos los cambios. No modifica pagos ni finaliza la partida.

Se puede guardar sin Booyah durante la carga; finalizar sigue requiriendo exactamente uno. Cambiar de ganador desmarca al anterior. Los borradores permanecen en memoria al cambiar de sala, pestaña o filtro; recargar avisa si se han editado datos. Guardar vuelve a enviar la tabla completa; se recomienda un solo árbitro editando cada sala para evitar sobrescribir cambios de otro operador.
