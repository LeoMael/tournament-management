import { useState } from 'react'

// Barras horizontales ordenadas (una sola tonalidad): etiqueta y cifras en texto, la barra solo compara.
//   rows: [{ key, label, sub, teams, players }]; `selected` resalta una fila y el resto se atenúa.
export default function RankBars({ rows, selected = null, onSelect, limit = 10, emptyText = 'Sin datos.' }) {
  const [all, setAll] = useState(false)
  if (!rows.length) return <p className="empty">{emptyText}</p>
  const max = Math.max(...rows.map((r) => r.teams))
  const shown = all ? rows : rows.slice(0, limit)
  return (
    <div className="rb">
      <ol className="rb-list">
        {shown.map((r, i) => {
          const dim = selected && selected !== r.key
          const body = (
            <>
              <span className="rb-rank">{i + 1}</span>
              <span className="rb-label"><b>{r.label}</b>{r.sub && <small>{r.sub}</small>}</span>
              <span className="rb-nums"><b>{r.teams}</b> {r.teams === 1 ? 'equipo' : 'equipos'} · {r.players} jug.</span>
              <span className="rb-track" aria-hidden="true"><i style={{ width: `${(r.teams / max) * 100}%` }} /></span>
            </>
          )
          return (
            <li key={r.key} className={dim ? 'rb-row rb-row--dim' : 'rb-row'}>
              {onSelect
                ? <button type="button" className="rb-btn" aria-pressed={selected === r.key} title={`${r.label}: ${r.teams} equipos, ${r.players} jugadores`} onClick={() => onSelect(selected === r.key ? null : r.key)}>{body}</button>
                : <div className="rb-btn" title={`${r.label}: ${r.teams} equipos, ${r.players} jugadores`}>{body}</div>}
            </li>
          )
        })}
      </ol>
      {rows.length > limit && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAll(!all)}>{all ? 'Ver menos' : `Ver todas (${rows.length})`}</button>
      )}
    </div>
  )
}
