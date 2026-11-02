import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { ErrorBox, PageHeader, Spinner } from '../components/ui'
import { GAME_LABEL } from '../lib/format'

const PLATFORMS = ['YouTube', 'Facebook', 'TikTok', 'Twitch', 'Instagram', 'Kick', 'X (Twitter)']
const OTHER = 'Otro'
const MAX_LINKS = 8

const isHttps = (value) => {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}
// Un enlace nuevo en blanco. `custom` = el nombre de la red se escribe a mano ("Otro").
const blank = () => ({ platform: PLATFORMS[0], custom: '', url: '' })
const fromSaved = (link) => (PLATFORMS.includes(link.platform) ? { platform: link.platform, custom: '', url: link.url } : { platform: OTHER, custom: link.platform, url: link.url })
const toSaved = (row) => ({ platform: row.platform === OTHER ? row.custom.trim() : row.platform, url: row.url.trim() })

function LiveCard({ game, onSaved }) {
  const toast = useToast()
  const [rows, setRows] = useState(() => (game.live_links?.length ? game.live_links.map(fromSaved) : [blank()]))
  const [busy, setBusy] = useState(false)
  const savedLinks = game.live_links ?? []
  const setRow = (i, patch) => setRows((r) => r.map((row, k) => (k === i ? { ...row, ...patch } : row)))

  const write = async (patch, okText) => {
    setBusy(true)
    const { error } = await supabase.from('games').update({ ...patch, updated_at: new Date().toISOString() }).eq('key', game.key)
    setBusy(false)
    if (error) {
      toast.error(error.message.includes('live') ? 'Falta ejecutar 01_schema.sql actualizado en Supabase (en vivo).' : error.message)
      return false
    }
    toast.success(okText)
    onSaved()
    return true
  }

  const saveLinks = async () => {
    const links = rows.filter((r) => r.url.trim() || (r.platform === OTHER && r.custom.trim())).map(toSaved)
    if (links.some((l) => !l.platform)) return toast.error('Escribe el nombre de la red en los enlaces "Otro".')
    if (links.some((l) => !isHttps(l.url))) return toast.error('Cada enlace debe empezar con https://')
    if (game.live && links.length === 0) return toast.error('Mientras estés en vivo debe quedar al menos un enlace.')
    if (await write({ live_links: links }, 'Enlaces guardados.')) setRows(links.length ? links.map(fromSaved) : [blank()])
  }

  const toggleLive = async () => {
    if (!game.live && savedLinks.length === 0) return toast.error('Guarda primero al menos un enlace de transmisión.')
    await write({ live: !game.live }, game.live ? 'Transmisión terminada.' : `${GAME_LABEL[game.key]} está en vivo.`)
  }

  const dirty = JSON.stringify(rows.filter((r) => r.url.trim()).map(toSaved)) !== JSON.stringify(savedLinks.map((l) => ({ platform: l.platform, url: l.url })))

  return (
    <div className={`card live-card ${game.live ? 'live-card--on' : ''}`}>
      <div className="live-head">
        <h2><span className={`tag tag--${game.key}`}>{GAME_LABEL[game.key]}</span> {game.name}</h2>
        <button type="button" className={`live-switch ${game.live ? 'live-switch--on' : ''}`} role="switch" aria-checked={game.live} disabled={busy} onClick={toggleLive}>
          <i aria-hidden="true" />{game.live ? 'EN VIVO · Terminar' : 'Poner en vivo'}
        </button>
      </div>
      <p className="card-sub">{game.live ? 'El sitio muestra el aviso "EN VIVO" con estos enlaces.' : 'Agrega dónde se transmite y pon el juego en vivo cuando empiece.'}</p>

      <div className="live-links">
        {rows.map((row, i) => (
          <div className="live-row" key={i}>
            <select value={row.platform} aria-label="Red social" onChange={(e) => setRow(i, { platform: e.target.value })}>
              {[...PLATFORMS, OTHER].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {row.platform === OTHER && <input className="live-custom" placeholder="Nombre" maxLength={30} value={row.custom} onChange={(e) => setRow(i, { custom: e.target.value })} />}
            <input className="live-url" type="url" inputMode="url" placeholder="https://…" maxLength={300} value={row.url} onChange={(e) => setRow(i, { url: e.target.value })}
              aria-invalid={row.url.trim() !== '' && !isHttps(row.url.trim())} />
            <button type="button" className="btn btn--sm btn--ghost" aria-label="Quitar enlace" onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, k) => k !== i) : [blank()]))}>×</button>
          </div>
        ))}
      </div>
      <div className="live-actions">
        <button type="button" className="btn btn--sm" disabled={rows.length >= MAX_LINKS} onClick={() => setRows((r) => [...r, blank()])}>+ Agregar enlace</button>
        <button type="button" className="btn btn--primary" disabled={busy || !dirty} onClick={saveLinks}>{busy ? 'Guardando…' : 'Guardar enlaces'}</button>
      </div>
    </div>
  )
}

export default function Live() {
  const [games, setGames] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('games').select('key, name, live, live_links').order('key')
    if (err) setError(err.message.includes('live') ? 'Falta ejecutar 01_schema.sql actualizado en Supabase (columnas de en vivo).' : err.message)
    else { setGames(data); setError(null) }
  }, [])
  useEffect(() => { load() }, [load])

  if (error) return <ErrorBox error={error} />
  if (!games) return <Spinner />
  return (
    <>
      <PageHeader eyebrow="Torneo" title="En vivo" subtitle="Cada juego tiene su propia transmisión: pon los enlaces de las redes y márcalo en vivo cuando empiece." />
      <div className="grid grid--2">
        {games.map((g) => <LiveCard key={g.key} game={g} onSaved={load} />)}
      </div>
    </>
  )
}
