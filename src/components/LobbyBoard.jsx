// Resultado de una sala Battle Royale: se tocan los equipos en el orden en que terminaron
// (1.º, 2.º…), y los kills se ajustan con +/−. Los puntos se calculan al instante.
export default function LobbyBoard({ teams, order, kills, onOrder, onKills, pointsOf }) {
  const byId = new Map(teams.map((t) => [t.id, t]))
  const waiting = teams.filter((t) => !order.includes(t.id))

  const move = (index, delta) => {
    const next = [...order]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onOrder(next)
  }
  const setKills = (id, value) => onKills(id, Math.max(0, Math.min(99, value)))

  return (
    <div className="lb">
      <div>
        <h3>Posiciones ({order.length}/{teams.length})</h3>
        {order.length === 0 ? (
          <p className="hint">Toca abajo al equipo que quedó 1.º, luego al 2.º, y así sucesivamente.</p>
        ) : (
          <ol className="lb-list">
            {order.map((id, i) => {
              const k = kills[id] ?? 0
              return (
                <li key={id} className="lb-row">
                  <span className={`lb-place ${i < 3 ? 'lb-place--top' : ''}`}>{i + 1}</span>
                  <span className="lb-name">{byId.get(id)?.name}</span>
                  <span className="lb-kills" role="group" aria-label={`Kills de ${byId.get(id)?.name}`}>
                    <button type="button" aria-label="Menos kills" disabled={k <= 0} onClick={() => setKills(id, k - 1)}>−</button>
                    <output>{k}<small>kills</small></output>
                    <button type="button" aria-label="Más kills" onClick={() => setKills(id, k + 1)}>+</button>
                  </span>
                  <b className="lb-pts">{pointsOf(i + 1, k)}<small>pts</small></b>
                  <span className="lb-move">
                    <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" aria-label="Bajar" disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button type="button" aria-label="Quitar" onClick={() => onOrder(order.filter((x) => x !== id))}>×</button>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </div>
      {waiting.length > 0 && (
        <div>
          <h3>Sin ubicar ({waiting.length})</h3>
          <div className="lb-chips">
            {waiting.map((t) => (
              <button key={t.id} type="button" className="lb-chip" onClick={() => onOrder([...order, t.id])}>{t.name}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
