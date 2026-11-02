// Resultado de una sala Battle Royale. Dos partes lado a lado:
//  - IZQUIERDA: los equipos de la sala (con su N.º fijo). Se toca cada equipo cuando termina: el primero
//    que se toca queda 1.º, el siguiente 2.º, y así.
//  - DERECHA: la tabla de posiciones que se va armando (puesto, N.º, equipo, kills y puntos), donde se
//    ajustan los kills y se corrige el orden con ↑ ↓ o se quita un equipo con ×.
//  teams: [{ id, name, slot }]
export default function LobbyBoard({ teams, order, kills, onOrder, onKills, pointsOf }) {
  const sorted = [...teams].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99) || a.name.localeCompare(b.name))
  const byId = new Map(teams.map((t) => [t.id, t]))
  const setKills = (id, value) => onKills(id, Math.max(0, Math.min(99, value)))
  const place = (id) => order.indexOf(id) + 1
  const move = (index, delta) => {
    const next = [...order]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onOrder(next)
  }

  return (
    <div className="tb-layout">
      <section className="tb-pick">
        <h3>Equipos de la sala</h3>
        <p className="hint">Toca cada equipo <b>cuando termine</b>: el primero que toques queda 1.º, el siguiente 2.º…</p>
        <div className="tb-grid">
          {sorted.map((t) => {
            const p = place(t.id)
            return (
              <button key={t.id} type="button" className={`tb-card ${p ? 'tb-card--on' : ''} ${p === 1 ? 'tb-card--first' : ''}`} disabled={p > 0}
                onClick={() => onOrder([...order, t.id])} title={p ? `Ya tiene el puesto ${p}` : 'Tocar si terminó en el siguiente puesto'}>
                <span className="tb-slot" title="Número fijo en la sala">{t.slot ?? '·'}</span>
                <span className="tb-name">{t.name}</span>
                <span className="tb-place">{p ? `${p}°` : ''}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="tb-table-box">
        <div className="tb-table-head">
          <h3>Posiciones <span className="tb-count">{order.length}/{teams.length}</span></h3>
          <button className="btn btn--sm" type="button" disabled={!order.length} onClick={() => onOrder(order.slice(0, -1))}>Deshacer último</button>
          <button className="btn btn--sm btn--ghost" type="button" disabled={!order.length} onClick={() => onOrder([])}>Limpiar</button>
        </div>
        {order.length === 0 ? (
          <p className="tb-empty">Aún no hay posiciones. Toca el primer equipo que terminó.</p>
        ) : (
          <div className="table-wrap">
            <table className="tb-table">
              <thead><tr><th>Puesto</th><th>N.º</th><th>Equipo</th><th>Kills</th><th className="num">Pts</th><th /></tr></thead>
              <tbody>
                {order.map((id, i) => {
                  const k = kills[id] ?? 0
                  return (
                    <tr key={id} className={i === 0 ? 'tb-row--first' : undefined}>
                      <td><b className="tb-pos">{i + 1}°</b></td>
                      <td><span className="slot-chip">{byId.get(id)?.slot ?? '·'}</span></td>
                      <td className="tb-team">{byId.get(id)?.name}</td>
                      <td>
                        <span className="lb-kills" role="group" aria-label={`Kills de ${byId.get(id)?.name}`}>
                          <button type="button" aria-label="Menos kills" disabled={k <= 0} onClick={() => setKills(id, k - 1)}>−</button>
                          <output>{k}</output>
                          <button type="button" aria-label="Más kills" onClick={() => setKills(id, k + 1)}>+</button>
                        </span>
                      </td>
                      <td className="num"><strong>{pointsOf(i + 1, k)}</strong></td>
                      <td>
                        <span className="lb-move">
                          <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                          <button type="button" aria-label="Bajar" disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
                          <button type="button" aria-label="Quitar" onClick={() => onOrder(order.filter((x) => x !== id))}>×</button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
