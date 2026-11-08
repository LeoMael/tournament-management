# Bolsa total y premios por puesto

Revisa y aplica manualmente solo `006_game_prize_pools.sql` después de confirmar que las migraciones 001 y 002 están registradas. No requiere las migraciones de inscripciones individuales 003–005. No vuelvas a ejecutar migraciones anteriores. La versión 006 se registra en la misma transacción.

Cada juego recibe una bolsa de cero por anunciar, independiente de los premios por puesto. No se infiere de montos anteriores. `prizes.amount` se conserva para compatibilidad, y los montos anteriores mayores que cero se copian a `reward_text`. Los valores anteriormente publicados como premio de campeón pueden representar una bolsa total incorrectamente: revisa y corrige manualmente cada bolsa y premio antes de publicar.

El cliente público anterior todavía lee `prizes.amount`; coordina el despliegue del panel y del sitio actualizado para que usen `game_prize_pools` y `reward_text`. La migración no publica una bolsa automáticamente.
