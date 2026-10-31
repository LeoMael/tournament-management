import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { ErrorBox, PageHeader, Spinner } from '../components/ui'
import { money, toLocalInput } from '../lib/format'
import { publicUrl, removeFile, uploadFile } from '../lib/storage'

function GeneralCard({ initial, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({
    registration_open: initial.registration_open,
    deadline: toLocalInput(initial.registration_deadline),
    yape_number: initial.yape_number,
    yape_holder: initial.yape_holder,
    contact_whatsapp: initial.contact_whatsapp,
    whatsapp_group_url: initial.whatsapp_group_url ?? '',
  })
  const [qrFile, setQrFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async (e) => {
    e.preventDefault()
    if (!form.deadline) return toast.error('Define la fecha de cierre.')
    const group = form.whatsapp_group_url.trim()
    if (group && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{10,60}$/.test(group)) {
      return toast.error('El enlace del grupo debe ser de la forma https://chat.whatsapp.com/…')
    }
    setBusy(true)
    try {
      let qrPath = initial.yape_qr_path
      if (qrFile) qrPath = await uploadFile('public-assets', qrFile)
      const { error } = await supabase.from('tournament_settings').update({
        registration_open: form.registration_open,
        registration_deadline: new Date(form.deadline).toISOString(),
        yape_number: form.yape_number.trim(),
        yape_holder: form.yape_holder.trim(),
        contact_whatsapp: form.contact_whatsapp.replace(/\D/g, ''),
        whatsapp_group_url: group || null,
        yape_qr_path: qrPath,
        updated_at: new Date().toISOString(),
      }).eq('id', 1)
      if (error) throw new Error(error.message)
      if (qrFile && initial.yape_qr_path) await removeFile('public-assets', initial.yape_qr_path)
      setQrFile(null)
      toast.success('Configuración general guardada.')
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const qr = publicUrl('public-assets', initial.yape_qr_path)
  return (
    <form className="card" onSubmit={save}>
      <h2>Inscripciones y pago</h2>
      <label className="check" style={{ marginBottom: '.9rem' }}>
        <input type="checkbox" checked={form.registration_open} onChange={(e) => set('registration_open', e.target.checked)} />
        Inscripciones abiertas (interruptor general)
      </label>
      <div className="form-row">
        <label className="field"><span>Cierre de inscripciones (hora local)</span>
          <input type="datetime-local" required value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
        </label>
        <label className="field"><span>WhatsApp de contacto</span>
          <input value={form.contact_whatsapp} maxLength={15} inputMode="tel" onChange={(e) => set('contact_whatsapp', e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label className="field"><span>Enlace del grupo de WhatsApp (comunidad)</span>
          <input type="url" placeholder="https://chat.whatsapp.com/…" maxLength={120} value={form.whatsapp_group_url} onChange={(e) => set('whatsapp_group_url', e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label className="field"><span>Número Yape</span>
          <input value={form.yape_number} maxLength={20} onChange={(e) => set('yape_number', e.target.value)} />
        </label>
        <label className="field"><span>Titular de la cuenta</span>
          <input value={form.yape_holder} maxLength={80} onChange={(e) => set('yape_holder', e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label className="field"><span>QR de Yape (PNG / JPG / WEBP)</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setQrFile(e.target.files?.[0] ?? null)} />
        </label>
        {qr && <img src={qr} alt="QR Yape actual" className="receipt" style={{ maxHeight: 140 }} />}
      </div>
      <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar'}</button>
    </form>
  )
}

function GameCard({ game, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({
    price: String(game.price), max_teams: String(game.max_teams), is_open: game.is_open,
    starters: String(game.starters), substitutes: String(game.substitutes),
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async (e) => {
    e.preventDefault()
    const price = Number(form.price)
    const max = Number(form.max_teams)
    const starters = Number(form.starters)
    const subs = Number(form.substitutes)
    if (!(price >= 0 && price <= 10000)) return toast.error('Precio inválido.')
    if (!Number.isInteger(max) || max < 1) return toast.error('Cupo inválido.')
    if (!Number.isInteger(starters) || starters < 1 || !Number.isInteger(subs) || subs < 0) return toast.error('Roster inválido.')
    if (price !== Number(game.price) && !window.confirm(`¿Cambiar la tarifa de ${game.name} de ${money(game.price)} a ${money(price)}? Las inscripciones ya recibidas conservan su monto.`)) return
    setBusy(true)
    try {
      const { error } = await supabase.from('games').update({
        price, max_teams: max, is_open: form.is_open, starters, substitutes: subs,
        updated_at: new Date().toISOString(),
      }).eq('key', game.key)
      if (error) throw new Error(error.message)
      toast.success(`${game.name} actualizado.`)
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <h2><span className={`tag tag--${game.key}`}>{game.key.toUpperCase()}</span> {game.name}</h2>
      <label className="check" style={{ marginBottom: '.9rem' }}>
        <input type="checkbox" checked={form.is_open} onChange={(e) => set('is_open', e.target.checked)} />
        Inscripciones abiertas para este juego
      </label>
      <div className="form-row">
        <label className="field"><span>Precio por equipo (S/)</span>
          <input type="number" min="0" max="10000" step="0.5" value={form.price} onChange={(e) => set('price', e.target.value)} />
        </label>
        <label className="field"><span>Cupo máximo de equipos</span>
          <input type="number" min="1" max="1000" value={form.max_teams} onChange={(e) => set('max_teams', e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label className="field"><span>Titulares</span>
          <input type="number" min="1" max="10" value={form.starters} onChange={(e) => set('starters', e.target.value)} />
        </label>
        <label className="field"><span>Suplentes</span>
          <input type="number" min="0" max="5" value={form.substitutes} onChange={(e) => set('substitutes', e.target.value)} />
        </label>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>El reglamento en PDF y sus textos se editan en “Contenido del sitio”.</p>
      <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar'}</button>
    </form>
  )
}

function PrizesCard({ prizes, onSaved }) {
  const toast = useToast()
  const [rows, setRows] = useState(() => prizes.map((p) => ({ ...p, amount: String(p.amount) })))
  const [busy, setBusy] = useState(false)
  const setRow = (place, k, v) => setRows((rs) => rs.map((r) => (r.place === place ? { ...r, [k]: v } : r)))
  const total = rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0)

  const save = async (e) => {
    e.preventDefault()
    for (const r of rows) {
      const amount = Number(r.amount)
      if (!r.label.trim() || !(amount >= 0 && amount <= 1000000)) return toast.error(`Premio ${r.place}: datos inválidos.`)
    }
    setBusy(true)
    const results = await Promise.all(rows.map((r) =>
      supabase.from('prizes').update({
        label: r.label.trim(), amount: Number(r.amount), description: r.description.trim(), updated_at: new Date().toISOString(),
      }).eq('place', r.place)))
    setBusy(false)
    const failed = results.find((r) => r.error)
    if (failed) return toast.error(failed.error.message)
    toast.success('Premios guardados.')
    onSaved()
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>Premios · Bolsa total {money(total)}</h2>
      {rows.map((r) => (
        <div className="form-row" key={r.place}>
          <label className="field"><span>Puesto {r.place}</span>
            <input value={r.label} maxLength={40} onChange={(e) => setRow(r.place, 'label', e.target.value)} />
          </label>
          <label className="field"><span>Monto (S/)</span>
            <input type="number" min="0" step="10" value={r.amount} onChange={(e) => setRow(r.place, 'amount', e.target.value)} />
          </label>
          <label className="field"><span>Descripción</span>
            <input value={r.description} maxLength={120} onChange={(e) => setRow(r.place, 'description', e.target.value)} />
          </label>
        </div>
      ))}
      <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar premios'}</button>
    </form>
  )
}

export default function Settings() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [s, g, p] = await Promise.all([
        supabase.from('tournament_settings').select('*').eq('id', 1).single(),
        supabase.from('games').select('*').order('key'),
        supabase.from('prizes').select('*').order('place'),
      ])
      if (!active) return
      const err = s.error || g.error || p.error
      if (err) setError(err.message)
      else setData({ settings: s.data, games: g.data, prizes: p.data })
    })()
    return () => { active = false }
  }, [version])

  const reload = () => setVersion((v) => v + 1)
  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />

  // `key` fuerza a reiniciar el estado del formulario tras guardar.
  return (
    <>
      <PageHeader eyebrow="Sistema" title="Configuración" subtitle="Precios, premios, cupos, fecha de cierre, datos de pago y bases. Los cambios se reflejan en el sitio público." />
      <div className="grid" style={{ gap: '1rem' }}>
        <GeneralCard key={`g-${version}`} initial={data.settings} onSaved={reload} />
        <div className="grid grid--2">
          {data.games.map((g) => <GameCard key={`${g.key}-${version}`} game={g} onSaved={reload} />)}
        </div>
        <PrizesCard key={`p-${version}`} prizes={data.prizes} onSaved={reload} />
      </div>
    </>
  )
}
