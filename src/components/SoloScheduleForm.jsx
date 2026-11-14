import { useState } from 'react'
import { ErrorBox, Modal } from './ui'
import { dateTime, toLocalInput } from '../lib/format'

export default function SoloScheduleForm({ room, deadline, busy, onClose, onSave }) {
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(room.scheduled_at))
  const [closesAt, setClosesAt] = useState(toLocalInput(room.closes_at))
  const [error, setError] = useState('')
  const save = async (event) => {
    event.preventDefault()
    if (busy) return
    const scheduled = new Date(scheduledAt), closes = new Date(closesAt)
    if (!Number.isFinite(scheduled.getTime()) || !Number.isFinite(closes.getTime())) { setError('Completa ambas fechas.'); return }
    if (closes.getTime() <= Date.now()) { setError('El nuevo cierre debe estar en el futuro.'); return }
    if (closes > scheduled) { setError('El cierre no puede ser posterior a la partida. Mueve también la fecha de partida si necesitas más tiempo.'); return }
    if (deadline && closes > new Date(deadline)) { setError('El cierre supera el plazo general. Amplíalo primero en Configuración.'); return }
    setError('')
    const problem = await onSave({ room_id: room.id, scheduled_at: scheduled.toISOString(), closes_at: closes.toISOString() })
    if (problem) setError(problem)
  }
  return <Modal title={`Editar horario · ${room.name}`} onClose={() => !busy && onClose()}>
    <form onSubmit={save}>
      <div className="form-row">
        <label className="field">Fecha y hora de partida<input type="datetime-local" required value={scheduledAt} disabled={busy} onChange={(event) => setScheduledAt(event.target.value)} /></label>
        <label className="field">Cierre de inscripción<input type="datetime-local" required value={closesAt} disabled={busy} onChange={(event) => setClosesAt(event.target.value)} /></label>
      </div>
      <p className="hint">Hora del dispositivo: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Solo se modifican estas dos fechas.</p>
      {deadline && <p className="hint">Plazo general del torneo: {dateTime(deadline)}. Para superar ese plazo, amplíalo primero en Configuración.</p>}
      {room.status === 'closed' && <p className="tm-notice">Esta sala seguirá con las inscripciones cerradas. Cambiar el horario no las reabre.</p>}
      {room.status === 'open' && room.is_paused && <p className="tm-notice">Esta sala seguirá pausada. Después de ajustar el horario, usa «Abrir inscripciones» cuando quieras recibir jugadores.</p>}
      <p className="hint">Si ya compartiste el horario con los jugadores, avísales del cambio por WhatsApp.</p>
      <ErrorBox error={error} />
      <div className="tm-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Volver</button><button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar horario'}</button></div>
    </form>
  </Modal>
}
