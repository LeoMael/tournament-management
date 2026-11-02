import { DEFAULT_PLACEMENT_POINTS } from '../lib/bracket'

// Puntos de Battle Royale: una casilla por puesto (1.º a 12.º, el máximo de equipos por sala) y los puntos
// por kill, con un ejemplo en vivo y un botón para volver al reglamento.
//   placement: lista de 12 textos; kill: texto.
export default function PointsEditor({ placement, kill, onPlacement, onKill, onReset }) {
  const num = (v) => (v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v))
  const first = num(placement[0])
  const exampleKills = 5
  const example = first === null || num(kill) === null ? null : first + exampleKills * num(kill)
  return (
    <div className="pts-ed">
      <div className="pts-ed-grid">
        {placement.map((value, i) => (
          <label key={i} className={`pts-ed-cell ${i < 3 ? 'pts-ed-cell--top' : ''} ${num(value) === null ? 'pts-ed-cell--bad' : ''}`}>
            <span>{i + 1}.º</span>
            <input type="number" min="0" step="0.5" inputMode="decimal" value={value} aria-label={`Puntos del puesto ${i + 1}`} onChange={(e) => onPlacement(i, e.target.value)} />
          </label>
        ))}
      </div>
      <div className="pts-ed-foot">
        <label className="pts-ed-kill"><span>Por cada kill</span>
          <span className="lb-kills" role="group" aria-label="Puntos por kill">
            <button type="button" aria-label="Menos" disabled={(num(kill) ?? 0) <= 0} onClick={() => onKill(String(Math.max(0, (num(kill) ?? 0) - 0.5)))}>−</button>
            <input type="number" min="0" step="0.5" value={kill} onChange={(e) => onKill(e.target.value)} aria-label="Puntos por kill" />
            <button type="button" aria-label="Más" onClick={() => onKill(String((num(kill) ?? 0) + 0.5))}>+</button>
          </span>
        </label>
        {example !== null && <span className="hint">Ejemplo: 1.º con {exampleKills} kills = <b>{example} pts</b></span>}
        <button type="button" className="btn btn--sm btn--ghost" style={{ marginLeft: 'auto' }}
          onClick={onReset} disabled={placement.every((v, i) => Number(v) === DEFAULT_PLACEMENT_POINTS[i]) && Number(kill) === 1}>Restablecer reglamento</button>
      </div>
    </div>
  )
}
