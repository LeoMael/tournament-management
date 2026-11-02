import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { Modal } from './ui'
import { GAME_LABEL, toLocalInput } from '../lib/format'

// Evento libre del cronograma (inauguración, descanso, premiación…). `event` null = nuevo.
export default function EventModal({ event, onClose, onSaved, onDelete }) {
  const toast = useToast()
  const [form, setForm] = useState({
    title: event?.title ?? '', game_key: event?.game_key ?? '', starts: event ? toLocalInput(event.starts_at) : '',
    ends: event?.ends_at ? toLocalInput(event.ends_at) : '', note: event?.note ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Ponle un título al evento.')
    if (!form.starts) return toast.error('Elige la fecha y hora de inicio.')
    if (form.ends && new Date(form.ends) <= new Date(form.starts)) return toast.error('El fin debe ser posterior al inicio.')
    setBusy(true)
    const row = {
      title: form.title.trim(), game_key: form.game_key || null, starts_at: new Date(form.starts).toISOString(),
      ends_at: form.ends ? new Date(form.ends).toISOString() : null, note: form.note.trim(),
    }
    const { error } = event ? await supabase.from('schedule_events').update(row).eq('id', event.id) : await supabase.from('schedule_events').insert(row)
    setBusy(false)
    if (error) return toast.error(error.message.includes('schedule_events') ? 'Falta ejecutar 01_schema.sql actualizado en Supabase (cronograma).' : error.message)
    toast.success(event ? 'Evento actualizado.' : 'Evento agregado.')
    onSaved()
    onClose()
  }

  return (
    <Modal title={event ? 'Editar evento' : 'Nuevo evento'} onClose={onClose}>
      <form onSubmit={save} className="grid" style={{ gap: '.9rem' }}>
        <label className="field"><span>Título</span><input value={form.title} maxLength={80} placeholder="Ej.: Inauguración" onChange={(e) => set('title', e.target.value)} /></label>
        <div className="form-row">
          <label className="field"><span>Inicio</span><input type="datetime-local" value={form.starts} onChange={(e) => set('starts', e.target.value)} /></label>
          <label className="field"><span>Fin (opcional)</span><input type="datetime-local" value={form.ends} onChange={(e) => set('ends', e.target.value)} /></label>
        </div>
        <div className="form-row">
          <label className="field"><span>Juego</span>
            <select value={form.game_key} onChange={(e) => set('game_key', e.target.value)}>
              <option value="">Ambos juegos</option>
              {Object.entries(GAME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <label className="field"><span>Nota (opcional)</span><input value={form.note} maxLength={200} placeholder="Lugar, detalle…" onChange={(e) => set('note', e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar'}</button>
          {onDelete && <button className="btn btn--bad" disabled={busy} type="button" onClick={onDelete} style={{ marginLeft: 'auto' }}>Eliminar</button>}
        </div>
      </form>
    </Modal>
  )
}
