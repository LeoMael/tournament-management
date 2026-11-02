import { useState } from 'react'
import { Modal } from './ui'

// Elegir al campeón de una fase Battle Royale. Viene preseleccionado el actual o, si no hay,
// el primero de la tabla; se puede elegir a otro (por ejemplo ante un empate).
export default function ChampionModal({ totals, teamName, current, pending, busy, onClose, onSave }) {
  const [picked, setPicked] = useState(current ?? totals[0]?.id ?? null)
  return (
    <Modal title="Seleccionar campeón" onClose={onClose}>
      {pending > 0 && <p className="pv-caption pv-caption--warn">Aún hay {pending} {pending === 1 ? 'partida pendiente' : 'partidas pendientes'}.</p>}
      <p className="hint">Toca al equipo ganador del torneo.</p>
      <div className="qual-group">
        {totals.map((r, i) => {
          const on = picked === r.id
          return (
            <button key={r.id} type="button" className={`qual-row ${on ? 'qual-row--on' : ''}`} aria-pressed={on} onClick={() => setPicked(r.id)}>
              <span className="qual-rank">{i + 1}</span>
              <span className="qual-name">{teamName(r.id)}</span>
              <span />
              <span className="qual-pts">{r.points} pts · {r.wins} Booyah</span>
              <span className="qual-mark" aria-hidden="true">{on ? '✓' : ''}</span>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn--primary" type="button" disabled={busy || !picked} onClick={() => onSave(picked)}>Confirmar campeón</button>
        {current && <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => onSave(null)}>Quitar campeón</button>}
      </div>
    </Modal>
  )
}
