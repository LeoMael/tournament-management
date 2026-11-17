import { useState } from 'react'
import { ErrorBox, Modal } from './ui'
import { dateTime, toLocalInput } from '../lib/format'

export default function SoloScheduleForm({ room, deadline, busy, onClose, onSave }) {
  const [name, setName] = useState(room.name)
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(room.scheduled_at))
  const [closesAt, setClosesAt] = useState(toLocalInput(room.closes_at))
  const [error, setError] = useState('')
  const save = async (event) => {
    event.preventDefault()
    if (busy) return
    const cleanName = name.trim()
    if (cleanName.length < 3 || cleanName.length > 100) { setError('El nombre debe tener entre 3 y 100 caracteres.'); return }
    const scheduledChanged = scheduledAt !== toLocalInput(room.scheduled_at)
    const closesChanged = closesAt !== toLocalInput(room.closes_at)
    const datesChanged = scheduledChanged || closesChanged
    const scheduled = new Date(scheduledChanged ? scheduledAt : room.scheduled_at), closes = new Date(closesChanged ? closesAt : room.closes_at)
    if (!Number.isFinite(scheduled.getTime()) || !Number.isFinite(closes.getTime())) { setError('Completa ambas fechas.'); return }
    if (datesChanged && closes.getTime() <= Date.now()) { setError('El nuevo cierre debe estar en el futuro.'); return }
    if (datesChanged && closes > scheduled) { setError('El cierre no puede ser posterior a la partida. Mueve también la fecha de partida si necesitas más tiempo.'); return }
    if (datesChanged && deadline && closes > new Date(deadline)) { setError('El cierre supera el plazo general. Amplíalo primero en Configuración.'); return }
    setError('')
    const problem = await onSave({ room_id: room.id, name: cleanName, scheduled_at: scheduledChanged ? scheduled.toISOString() : room.scheduled_at, closes_at: closesChanged ? closes.toISOString() : room.closes_at })
    if (problem) setError(problem)
  }
  return <Modal title={`Editar sala · ${room.name}`} onClose={() => !busy && onClose()}>
    <form onSubmit={save}>
      <label className="field">Nombre de la sala<input type="text" required minLength={3} maxLength={100} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <div className="form-row">
        <label className="field">Cierre de inscripción<input type="datetime-local" required value={closesAt} disabled={busy} onChange={(event) => setClosesAt(event.target.value)} /></label>
        <label className="field">Fecha y hora de partida<input type="datetime-local" required value={scheduledAt} disabled={busy} onChange={(event) => setScheduledAt(event.target.value)} /></label>
      </div>
      <p className="hint">Hora del dispositivo: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Puedes cambiar el nombre y las fechas; los precios, premios y participantes se conservan.</p>
      {deadline && <p className="hint">Plazo general del torneo: {dateTime(deadline)}. Para superar ese plazo, amplíalo primero en Configuración.</p>}
      {room.status === 'closed' && <p className="tm-notice">Esta sala seguirá con las inscripciones cerradas. Cambiar el horario no las reabre.</p>}
      {room.status === 'open' && room.is_paused && <p className="tm-notice">Esta sala seguirá pausada. Después de ajustar el horario, usa «Abrir inscripciones» cuando quieras recibir jugadores.</p>}
      <p className="hint">Si ya compartiste el nombre o el horario con los jugadores, avísales del cambio por WhatsApp.</p>
      <ErrorBox error={error} />
      <div className="tm-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Volver</button><button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </form>
  </Modal>
}
