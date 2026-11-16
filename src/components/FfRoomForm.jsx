import { useState } from 'react'
import { Modal, ErrorBox } from './ui'
import { FF_ROOM_KINDS, ffRoomDraft } from '../lib/ffRooms'
import { toLocalInput } from '../lib/format'

export default function FfRoomForm({ kind, room, prizes = [], busy, onClose, onSave }) {
  const config = FF_ROOM_KINDS[kind]
  const isDuo = config.participation === 'duo'
  const [values, setValues] = useState({
    name: room?.name || '', capacity: room?.capacity || (isDuo ? 24 : 48),
    entry_price: room?.entry_price ?? 0, kill_reward: room?.kill_reward ?? 0, booyah_reward: room?.booyah_reward ?? 0,
    scheduled_at: toLocalInput(room?.scheduled_at), closes_at: toLocalInput(room?.closes_at),
  })
  const [topPrizes, setTopPrizes] = useState(prizes.length ? prizes.map((row) => row.amount) : [0, 0, 0, 0])
  const [error, setError] = useState('')
  const update = (field, value) => setValues((previous) => ({ ...previous, [field]: value }))
  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    try {
      const dates = { ...values }
      for (const field of ['scheduled_at', 'closes_at']) {
        dates[field] = room && values[field] === toLocalInput(room[field]) ? room[field] : new Date(values[field]).toISOString()
      }
      const problem = await onSave(ffRoomDraft(kind, { ...dates, top_prizes: topPrizes }))
      setError(problem || '')
    } catch (problem) { setError(problem.message) }
  }
  return <Modal title={`${room ? 'Editar borrador' : 'Nueva sala'} · ${config.label}`} onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <label className="field">Nombre<input required minLength={3} maxLength={100} disabled={busy} value={values.name} onChange={(e) => update('name', e.target.value)} /></label>
      <div className="form-row">{[['scheduled_at', 'Fecha de partida'], ['closes_at', 'Cierre de inscripción']].map(([field, label]) => <label key={field} className="field">{label}<input type="datetime-local" required disabled={busy} value={values[field]} onChange={(e) => update(field, e.target.value)} /></label>)}</div>
      <div className="form-row">
        <label className="field">{isDuo ? 'Cupo de dúos' : 'Cupo de jugadores'}<input type="number" min={2} max={config.maxCapacity} step={1} required disabled={busy} value={values.capacity} onChange={(e) => update('capacity', e.target.value)} /></label>
        <label className="field">{isDuo ? 'Entrada por dúo (S/)' : 'Entrada por jugador (S/)'}<input type="number" min={0} max={10000} step="0.01" required disabled={busy} value={values.entry_price} onChange={(e) => update('entry_price', e.target.value)} /></label>
      </div>
      {config.mode === 'kills' ? <div className="form-row">
        <label className="field">Por kill (S/)<input type="number" min={0} max={10000} step="0.01" required disabled={busy} value={values.kill_reward} onChange={(e) => update('kill_reward', e.target.value)} /></label>
        <label className="field">Bono Booyah (S/)<input type="number" min={0} max={1000000} step="0.01" required disabled={busy} value={values.booyah_reward} onChange={(e) => update('booyah_reward', e.target.value)} /></label>
      </div> : <>
        <label className="field">Puestos premiados<input type="number" min={1} max={Number(values.capacity) || config.maxCapacity} step={1} required disabled={busy} value={topPrizes.length} onChange={(e) => {
          const count = Number(e.target.value)
          if (Number.isInteger(count) && count >= 1 && count <= config.maxCapacity) setTopPrizes((previous) => Array.from({ length: count }, (_, i) => previous[i] ?? 0))
        }} /></label>
        <div className="ff-prize-inputs">{topPrizes.map((value, index) => <label className="field" key={index}>{index + 1}.º puesto (S/)<input type="number" min={0} max={1000000} step="0.01" required disabled={busy} value={value} onChange={(e) => setTopPrizes((previous) => previous.map((amount, i) => i === index ? e.target.value : amount))} /></label>)}</div>
      </>}
      <p className="hint">Una sala corresponde a una partida. {isDuo ? 'Cada inscripción y slot corresponden a una pareja.' : 'Cada inscripción y slot corresponden a un jugador.'} Revisa el cupo que admite la sala del juego.</p>
      <ErrorBox error={error} />
      <div className="tm-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Volver</button><button className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar borrador'}</button></div>
    </form>
  </Modal>
}
