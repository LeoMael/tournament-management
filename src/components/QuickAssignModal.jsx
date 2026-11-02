import { useMemo, useState } from 'react'
import { Modal } from './ui'
import { autoSchedule } from '../lib/schedule'
import { toLocalInput } from '../lib/format'

// Asignación rápida: reparte horas a los partidos pendientes de una fase por orden de ronda.
// Muestra cómo quedarían las horas y, al aplicar, las devuelve para guardarlas.
//   items: [{ id, label, round, position, hasTime }]  (solo partidos que se pueden jugar)
export default function QuickAssignModal({ items, onApply, onClose }) {
  const [day, setDay] = useState('')
  const [time, setTime] = useState('')
  const [gapMin, setGapMin] = useState('30')
  const [perSlot, setPerSlot] = useState('1')
  const [onlyEmpty, setOnlyEmpty] = useState(true)

  const targets = useMemo(() => items.filter((i) => !onlyEmpty || !i.hasTime), [items, onlyEmpty])
  const start = day && time ? new Date(`${day}T${time}`) : null
  const plan = useMemo(
    () => (start && Number(gapMin) >= 0 ? autoSchedule(targets, { start, gapMin: Number(gapMin), perSlot: Number(perSlot) || 1 }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, day, time, gapMin, perSlot])
  const label = new Map(items.map((i) => [i.id, i.label]))

  return (
    <Modal title="Asignación rápida de horas" onClose={onClose}>
      <p className="hint">Reparte las horas por orden de ronda. Revisa cómo quedan abajo antes de aplicar.</p>
      <div className="form-row">
        <label className="field"><span>Día</span><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
        <label className="field"><span>Hora de inicio</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <div className="form-row">
        <label className="field"><span>Minutos entre franjas</span><input type="number" min="0" max="600" value={gapMin} onChange={(e) => setGapMin(e.target.value)} /></label>
        <label className="field"><span>Partidos por franja</span><input type="number" min="1" max="12" value={perSlot} onChange={(e) => setPerSlot(e.target.value)} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} /> Solo los que aún no tienen hora</label>

      {plan.length > 0 ? (
        <ul className="qa-preview">
          {plan.slice(0, 8).map((p) => (
            <li key={p.id}><b>{p.at.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })}</b><span>{label.get(p.id)}</span></li>
          ))}
          {plan.length > 8 && <li className="hint">… y {plan.length - 8} más</li>}
        </ul>
      ) : <p className="hint">{targets.length === 0 ? 'No hay partidos pendientes por asignar.' : 'Elige el día y la hora de inicio para ver cómo quedaría.'}</p>}

      <button className="btn btn--primary" type="button" disabled={plan.length === 0}
        onClick={() => { onApply(Object.fromEntries(plan.map((p) => [p.id, toLocalInput(p.at.toISOString())]))); onClose() }}>
        Aplicar y guardar en {plan.length} {plan.length === 1 ? 'partido' : 'partidos'}
      </button>
    </Modal>
  )
}
