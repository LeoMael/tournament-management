import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { validPoolAmount } from '../lib/prizeValidation'

export default function PrizePoolCard({ game, pool }) {
  const toast = useToast()
  const [amount, setAmount] = useState(String(pool?.amount ?? 0))
  const [announced, setAnnounced] = useState(pool?.is_announced ?? false)
  const [busy, setBusy] = useState(false)
  const save = async (event) => {
    event.preventDefault()
    if (!validPoolAmount(amount)) return toast.error('Ingresa un monto válido para la bolsa total.')
    setBusy(true)
    try {
      const { data, error } = await supabase.from('game_prize_pools').upsert({ game_key: game.key, amount: Number(amount), is_announced: announced, updated_at: new Date().toISOString() }, { onConflict: 'game_key' }).select('game_key').single()
      if (error) throw error
      if (data?.game_key !== game.key) throw new Error('No se pudo verificar que se guardara la bolsa.')
      toast.success(`Bolsa de ${game.name} guardada.`)
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  return (
    <form className="prize-config__pool" onSubmit={save}>
      <label className="field"><span>Bolsa total (S/)</span><input type="number" required min="0" max="1000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="prize-config__toggle"><input type="checkbox" checked={announced} onChange={(e) => setAnnounced(e.target.checked)} /> {announced ? 'Publicada' : 'Por anunciar'}</label>
      <button className="btn" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar bolsa'}</button>
      <p className="hint">La bolsa total es independiente de los premios por puesto.</p>
    </form>
  )
}
