import { useState } from 'react'
import { shortDateTime } from '../lib/format'

// Cruce con el resultado cargado ahí mismo:
//  - BO1: un clic en el equipo ganador.
//  - BO3 / BO5: un clic en el ganador y luego en el marcador (2–0, 2–1…).
export default function MatchCard({ match, label, nameA, nameB, busy, onResult, onClear, onSchedule }) {
  const [picking, setPicking] = useState(null) // 'a' | 'b'
  const done = match.status === 'completed'
  const playable = Boolean(match.team_a && match.team_b) && !busy
  const need = (match.best_of + 1) / 2

  const choose = (side) => {
    if (!playable) return
    if (match.best_of === 1) onResult(side === 'a' ? 1 : 0, side === 'a' ? 0 : 1)
    else setPicking(picking === side ? null : side)
  }
  const pick = (side, loss) => {
    setPicking(null)
    onResult(side === 'a' ? need : loss, side === 'a' ? loss : need)
  }

  const row = (side, name, id, score) => {
    const win = done && match.winner_id === id
    const className = `bm-team ${win ? 'bm-team--win' : ''} ${id ? '' : 'bm-team--empty'} ${picking === side ? 'bm-team--picking' : ''}`
    const content = <><span className="bm-name">{name}</span><b className="bm-score">{done ? score : ''}</b></>
    return playable
      ? <button type="button" className={className} onClick={() => choose(side)} title={`Marcar a ${name} como ganador`}>{content}</button>
      : <div className={className}>{content}</div>
  }

  return (
    <div className={`bm ${done ? 'bm--done' : ''}`}>
      <div className="bm-head">
        <span className="bm-num">{label}</span>
        <span className="bm-bo">BO{match.best_of}</span>
        <button type="button" className={`bm-time ${match.scheduled_at ? '' : 'bm-time--empty'}`} onClick={onSchedule} title="Fecha y hora del partido">
          {match.scheduled_at ? shortDateTime(match.scheduled_at) : '+ Hora'}
        </button>
      </div>
      {row('a', nameA, match.team_a, match.score_a)}
      {row('b', nameB, match.team_b, match.score_b)}
      {picking && (
        <div className="bm-pick">
          <span>Marcador, gana {picking === 'a' ? nameA : nameB}:</span>
          {Array.from({ length: need }, (_, loss) => (
            <button key={loss} type="button" className="bm-pick-btn" onClick={() => pick(picking, loss)}>
              {picking === 'a' ? `${need} – ${loss}` : `${loss} – ${need}`}
            </button>
          ))}
        </div>
      )}
      {!picking && playable && !done && <p className="bm-hint">Toca al ganador</p>}
      {done && onClear && <button type="button" className="bm-clear" disabled={busy} onClick={onClear}>Deshacer resultado</button>}
    </div>
  )
}
