import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useToast } from '../../context/ToastContext'

function Setting({ row, onChanged }) {
  const [open, setOpen] = useState(row.is_open)
  const [hours, setHours] = useState(String(row.naming_hours))
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const save = async (e) => {
    e.preventDefault()
    const namingHours = Number(hours)
    if (!Number.isInteger(namingHours) || namingHours < 1 || namingHours > 720) return toast.error('Indica un plazo válido en horas.')
    setBusy(true)
    const { error } = await supabase.from('individual_settings').upsert({ game_key: row.game_key, is_open: open, price: 4, naming_hours: namingHours }, { onConflict: 'game_key' })
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Configuración individual guardada.')
    onChanged()
  }
  return <form className="card" onSubmit={save}>
      <h3>
        {row.game_key.toUpperCase()}
      </h3>
      <p>Inscripción: S/ 4 por persona</p>
      <label>
      <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Inscripciones individuales abiertas</label>
      <label className="field">
      <span>Plazo para nombre (horas)</span>
      <input type="number" min="1" max="720" required value={hours} onChange={(e) => setHours(e.target.value)} />
      </label>
      <button className="btn" disabled={busy}>Guardar</button>
      </form>
}
export default function IndividualSettings({ settings, onChanged }) {
  return <section>
      <h2>Configuración individual</h2>
      <div className="grid grid--2">
        {settings.map((row) => <Setting key={row.game_key} row={row} onChanged={onChanged} />)}
      </div>
      </section>
}
