import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'

const labels = ['CAMPEÓN', 'SUBCAMPEÓN', 'TERCER LUGAR']

export default function PrizesCard({ game, prizes, onSaved }) {
  const toast = useToast()
  const [rows, setRows] = useState(() => labels.map((label, i) => {
    const prize = prizes.find((p) => p.place === i + 1)
    return { place: i + 1, label: prize?.label ?? label, amount: String(prize?.amount ?? 0), description: prize?.description ?? '', is_announced: prize?.is_announced ?? false }
  }))
  const [busy, setBusy] = useState(false)
  const setRow = (place, key, value) => setRows((current) => current.map((row) => row.place === place ? { ...row, [key]: value } : row))

  const save = async (event) => {
    event.preventDefault()
    if (rows.some((row) => !row.label.trim() || row.amount.trim() === '' || !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0 || Number(row.amount) > 1000000)) {
      toast.error('Revisa las etiquetas y montos de los premios.')
      return
    }
    setBusy(true)
    const payload = rows.map((row) => ({ game_key: game.key, place: row.place, label: row.label.trim(), amount: Number(row.amount), description: row.description.trim(), is_announced: row.is_announced, updated_at: new Date().toISOString() }))
    const { data, error } = await supabase.from('prizes').upsert(payload, { onConflict: 'game_key,place' }).select('game_key,place')
    setBusy(false)
    if (error) return toast.error(error.message)
    if (data?.length !== payload.length || payload.some((row) => !data.some((saved) => saved.game_key === row.game_key && saved.place === row.place))) return toast.error('No se pudo verificar que se guardaran todos los premios.')
    toast.success(`Premios de ${game.name} guardados.`)
    onSaved()
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>Premios · {game.name}</h2>
      {rows.map((row) => (
        <div className="form-row" key={row.place}>
          <label className="field"><span>Puesto {row.place}</span><input required maxLength={40} value={row.label} onChange={(e) => setRow(row.place, 'label', e.target.value)} /></label>
          <label className="field"><span>Monto (S/)</span><input required type="number" min="0" max="1000000" step="0.01" value={row.amount} onChange={(e) => setRow(row.place, 'amount', e.target.value)} /></label>
          <label className="field"><span>Descripción</span><input maxLength={120} value={row.description} onChange={(e) => setRow(row.place, 'description', e.target.value)} /></label>
          <label><input type="checkbox" checked={row.is_announced} onChange={(e) => setRow(row.place, 'is_announced', e.target.checked)} /> {row.is_announced ? 'Publicado' : 'Por anunciar'}</label>
        </div>
      ))}
      <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar premios'}</button>
    </form>
  )
}
