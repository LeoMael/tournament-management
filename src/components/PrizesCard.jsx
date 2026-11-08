import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { validPrizeReward } from '../lib/prizeValidation'

const labels = ['CAMPEÓN', 'SUBCAMPEÓN', 'TERCER LUGAR']

export default function PrizesCard({ game, prizes }) {
  const toast = useToast()
  const [rows, setRows] = useState(() => labels.map((label, i) => {
    const prize = prizes.find((p) => p.place === i + 1)
    return { place: i + 1, label: prize?.label ?? label, amount: prize?.amount ?? 0, reward_text: prize?.reward_text ?? '', description: prize?.description ?? '', is_announced: prize?.is_announced ?? false }
  }))
  const [busy, setBusy] = useState(false)
  const setRow = (place, key, value) => setRows((current) => current.map((row) => row.place === place ? { ...row, [key]: value } : row))

  const save = async (event) => {
    event.preventDefault()
    if (rows.some((row) => !row.label.trim() || !validPrizeReward(row.reward_text, row.is_announced))) {
      toast.error('Revisa las etiquetas y escribe un premio para cada puesto publicado.')
      return
    }
    setBusy(true)
    const payload = rows.map((row) => ({ game_key: game.key, place: row.place, label: row.label.trim(), amount: row.amount, reward_text: row.reward_text.trim(), description: row.description.trim(), is_announced: row.is_announced, updated_at: new Date().toISOString() }))
    const { data, error } = await supabase.from('prizes').upsert(payload, { onConflict: 'game_key,place' }).select('game_key,place')
    setBusy(false)
    if (error) return toast.error(error.message)
    if (data?.length !== payload.length || payload.some((row) => !data.some((saved) => saved.game_key === row.game_key && saved.place === row.place))) return toast.error('No se pudo verificar que se guardaran todos los premios.')
    toast.success(`Premios de ${game.name} guardados.`)
  }

  return (
    <form className="prize-config__prizes" onSubmit={save}>
      <h3>Premios por puesto</h3>
      {rows.map((row) => (
        <div className="prize-config__place" key={row.place}>
          <div className="prize-config__row">
            <strong>{row.place}. {row.label}</strong>
            <label className="field"><span className="sr-only">Premio para el puesto {row.place}</span><input maxLength={240} placeholder="Ej. Teclado gamer o S/ 100 + medalla" value={row.reward_text} onChange={(e) => setRow(row.place, 'reward_text', e.target.value)} /></label>
            <label className="prize-config__toggle"><input type="checkbox" checked={row.is_announced} onChange={(e) => setRow(row.place, 'is_announced', e.target.checked)} /> {row.is_announced ? 'Publicado' : 'Por anunciar'}</label>
          </div>
          <details>
            <summary>Detalles</summary>
            <div className="form-row">
              <label className="field"><span>Etiqueta</span><input maxLength={40} value={row.label} onChange={(e) => setRow(row.place, 'label', e.target.value)} /></label>
              <label className="field"><span>Descripción</span><input maxLength={120} value={row.description} onChange={(e) => setRow(row.place, 'description', e.target.value)} /></label>
            </div>
          </details>
        </div>
      ))}
      <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar premios'}</button>
    </form>
  )
}
