import { useState } from 'react'
import { Modal } from './ui'
import PointsEditor from './PointsEditor'
import { DEFAULT_PLACEMENT_POINTS } from '../lib/bracket'

// Cambiar los puntos de una fase Battle Royale ya creada. Los resultados cargados se recalculan.
export default function PointsModal({ stage, hasResults, busy, onClose, onSave }) {
  const initial = Array.from({ length: 12 }, (_, i) => String(stage.config?.placement_points?.[i] ?? 0))
  const [placement, setPlacement] = useState(initial)
  const [kill, setKill] = useState(String(stage.config?.kill_points ?? 1))
  const invalid = placement.some((v) => v === '' || !Number.isFinite(Number(v)) || Number(v) < 0) || kill === '' || !Number.isFinite(Number(kill)) || Number(kill) < 0

  return (
    <Modal title="Puntos de la fase" onClose={onClose}>
      <PointsEditor placement={placement} kill={kill}
        onPlacement={(i, v) => setPlacement((p) => p.map((x, k) => (k === i ? v : x)))} onKill={setKill}
        onReset={() => { setPlacement(DEFAULT_PLACEMENT_POINTS.map(String)); setKill('1') }} />
      {hasResults && <p className="pv-caption pv-caption--warn">Los resultados ya cargados se recalculan con estos puntos.</p>}
      <button className="btn btn--primary" type="button" disabled={busy || invalid} onClick={() => onSave(placement.map(Number), Number(kill))}>
        {busy ? 'Guardando…' : 'Guardar puntos'}
      </button>
    </Modal>
  )
}
