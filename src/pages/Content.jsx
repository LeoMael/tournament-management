import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { ErrorBox, PageHeader, Spinner } from '../components/ui'
import { GAME_LABEL } from '../lib/format'
import { publicUrl, removeFile, uploadFile } from '../lib/storage'

const uid = () => crypto.randomUUID()

/* ------------------------- PDF + textos del juego ------------------------- */
function GameTexts({ game, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ subtitle: game.subtitle, badge: game.badge })
  const [pdf, setPdf] = useState(null)
  const [music, setMusic] = useState(null)
  const [dropMusic, setDropMusic] = useState(false)
  const [busy, setBusy] = useState(false)
  const url = publicUrl('public-assets', game.rules_pdf_path)
  const musicUrl = dropMusic ? null : publicUrl('public-assets', game.music_path)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      let pdfPath = game.rules_pdf_path
      if (pdf) pdfPath = await uploadFile('public-assets', pdf, { allowPdf: true })
      let musicPath = game.music_path ?? null
      if (music) musicPath = await uploadFile('public-assets', music, { allowAudio: true })
      else if (dropMusic) musicPath = null
      const { error } = await supabase.from('games').update({
        subtitle: form.subtitle.trim(), badge: form.badge.trim(), rules_pdf_path: pdfPath, music_path: musicPath, updated_at: new Date().toISOString(),
      }).eq('key', game.key)
      if (error) {
        throw new Error(error.message.includes('music_path') ? 'Falta ejecutar 01_schema.sql actualizado en Supabase (columna de música).' : error.message)
      }
      if (pdf && game.rules_pdf_path) await removeFile('public-assets', game.rules_pdf_path)
      if ((music || dropMusic) && game.music_path) await removeFile('public-assets', game.music_path)
      setPdf(null)
      setMusic(null)
      setDropMusic(false)
      toast.success('Reglamento y textos guardados.')
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>Documento oficial y encabezado</h2>
      <p className="card-sub">El PDF se descarga desde la sección de reglas y desde el formulario de inscripción.</p>
      <div className="form-row">
        <label className="field"><span>Subtítulo</span>
          <input value={form.subtitle} maxLength={120} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
        </label>
        <label className="field"><span>Etiqueta (badge)</span>
          <input value={form.badge} maxLength={60} onChange={(e) => setForm({ ...form, badge: e.target.value })} />
        </label>
      </div>
      <div className="form-row">
        <label className="field"><span>Reglamento en PDF (máx. 10 MB)</span>
          <input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
        </label>
        <p className="hint">
          {pdf ? `Se subirá: ${pdf.name}` : url
            ? <a href={url} target="_blank" rel="noopener noreferrer">Ver PDF publicado ↗</a>
            : 'Sin PDF propio. El sitio usa el PDF que trae por defecto.'}
        </p>
      </div>
      <div className="form-row">
        <label className="field"><span>Música de fondo de {game.key === 'ff' ? 'Free Fire' : 'Mobile Legends'} (MP3, OGG o M4A · máx. 20 MB)</span>
          <input type="file" accept="audio/mpeg,audio/ogg,audio/mp4,audio/aac" onChange={(e) => { setMusic(e.target.files?.[0] ?? null); setDropMusic(false) }} />
        </label>
        <div className="music-preview">
          {music && <p className="hint">Se subirá: {music.name}</p>}
          {!music && musicUrl && <audio controls preload="none" src={musicUrl} aria-label="Música actual" />}
          {!music && !musicUrl && <p className="hint">Sin música. Ese juego sonará en silencio.</p>}
          {!music && musicUrl && <button type="button" className="btn btn--sm btn--bad" onClick={() => setDropMusic(true)}>Quitar música</button>}
          {dropMusic && <p className="hint">Se quitará al guardar.</p>}
        </div>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>Usa solo música que tengas derecho a usar (propia, libre de derechos o con autorización del titular).</p>
      <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar'}</button>
    </form>
  )
}

/* ------------------------- Secciones del reglamento ------------------------- */
function RulesEditor({ game, initial, onSaved }) {
  const toast = useToast()
  const [rows, setRows] = useState(() => initial.map((r) => ({ key: r.id, id: r.id, title: r.title, highlight: r.highlight, points: r.points.join('\n') })))
  const [removed, setRemoved] = useState([])
  const [busy, setBusy] = useState(false)
  const [openKey, setOpenKey] = useState(null)

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const move = (index, dir) => setRows((rs) => {
    const next = [...rs]
    const target = index + dir
    if (target < 0 || target >= next.length) return rs
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })
  const add = () => {
    const key = uid()
    setRows((rs) => [...rs, { key, id: null, title: '', highlight: '', points: '' }])
    setOpenKey(key)
  }
  const remove = (row) => {
    if (!window.confirm(`¿Quitar la sección "${row.title || 'sin título'}"?`)) return
    setRows((rs) => rs.filter((r) => r.key !== row.key))
    if (row.id) setRemoved((ids) => [...ids, row.id])
  }

  const save = async () => {
    if (rows.some((r) => !r.title.trim())) return toast.error('Todas las secciones necesitan un título.')
    setBusy(true)
    const results = []
    if (removed.length) results.push(await supabase.from('rules_sections').delete().in('id', removed))
    const payload = rows.map((r, i) => ({
      game_key: game.key, position: i + 1, title: r.title.trim(), highlight: r.highlight.trim(),
      points: r.points.split('\n').map((p) => p.trim()).filter(Boolean), updated_at: new Date().toISOString(),
    }))
    for (let i = 0; i < rows.length; i++) {
      results.push(rows[i].id
        ? await supabase.from('rules_sections').update(payload[i]).eq('id', rows[i].id)
        : await supabase.from('rules_sections').insert(payload[i]))
    }
    setBusy(false)
    const failed = results.find((r) => r.error)
    if (failed) return toast.error(failed.error.message)
    toast.success('Reglamento guardado.')
    setRemoved([])
    onSaved()
  }

  return (
    <div className="card">
      <h2>Secciones del reglamento <span className="tag">{rows.length}</span></h2>
      <p className="card-sub">En el sitio se ven como acordeón. Abre una sección para editarla.</p>
      <div className="acc-list">
        {rows.map((r, i) => {
          const open = openKey === r.key
          const count = r.points.split('\n').filter((p) => p.trim()).length
          return (
            <div className={`acc ${open ? 'acc--open' : ''}`} key={r.key}>
              <div className="acc-head">
                <button type="button" className="acc-toggle" aria-expanded={open} onClick={() => setOpenKey(open ? null : r.key)}>
                  <span className="rule-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="acc-title">{r.title || 'Sección sin título'}</span>
                  <span className="acc-meta">{count} {count === 1 ? 'punto' : 'puntos'}</span>
                  <svg className="acc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <div className="row-actions">
                  <button type="button" className="btn btn--sm btn--ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir sección">↑</button>
                  <button type="button" className="btn btn--sm btn--ghost" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Bajar sección">↓</button>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => remove(r)} aria-label="Quitar sección">Quitar</button>
                </div>
              </div>
              {open && (
                <div className="acc-body">
                  <label className="field"><span>Título</span>
                    <input value={r.title} maxLength={120} onChange={(e) => update(r.key, { title: e.target.value })} />
                  </label>
                  <label className="field"><span>Resumen en una línea</span>
                    <input value={r.highlight} maxLength={240} onChange={(e) => update(r.key, { highlight: e.target.value })} />
                  </label>
                  <label className="field"><span>Puntos (uno por línea)</span>
                    <textarea rows={7} value={r.points} onChange={(e) => update(r.key, { points: e.target.value })} />
                  </label>
                </div>
              )}
            </div>
          )
        })}
        {rows.length === 0 && <p className="empty">No hay secciones. Agrega la primera.</p>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={add}>Agregar sección</button>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar reglamento'}</button>
      </div>
    </div>
  )
}

/* ------------------------- Tabla de puntuación ------------------------- */
function ScoringEditor({ game, onSaved }) {
  const toast = useToast()
  const [rows, setRows] = useState(() => (game.scoring_table ?? []).map((r) => ({ key: uid(), ...r })))
  const [busy, setBusy] = useState(false)
  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const save = async () => {
    const clean = rows.map((r) => ({ pos: r.pos.trim(), pts: r.pts.trim() })).filter((r) => r.pos && r.pts)
    setBusy(true)
    const { error } = await supabase.from('games').update({ scoring_table: clean, updated_at: new Date().toISOString() }).eq('key', game.key)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Tabla de puntos guardada.')
    onSaved()
  }

  return (
    <div className="card">
      <h2>Tabla de puntuación</h2>
      <p className="card-sub">Se muestra dentro de la sección de puntuación del reglamento. Déjala vacía si no aplica.</p>
      <div className="stack" style={{ gap: 10 }}>
        {rows.map((r) => (
          <div className="form-row" style={{ marginBottom: 0 }} key={r.key}>
            <input aria-label="Posición" placeholder="Ej.: 1ro (Booyah!)" value={r.pos} maxLength={40} onChange={(e) => update(r.key, { pos: e.target.value })} />
            <input aria-label="Puntos" placeholder="Ej.: 12 pts" value={r.pts} maxLength={30} onChange={(e) => update(r.key, { pts: e.target.value })} />
            <button type="button" className="btn btn--sm btn--bad" style={{ justifySelf: 'start' }} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>Quitar</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" className="btn" onClick={() => setRows((rs) => [...rs, { key: uid(), pos: '', pts: '' }])}>Agregar fila</button>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar tabla'}</button>
      </div>
    </div>
  )
}

/* ------------------------- Pasos "Cómo participar" ------------------------- */
function StepsEditor({ initial, onSaved }) {
  const toast = useToast()
  const [rows, setRows] = useState(() => initial.map((s) => ({ key: s.id, id: s.id, title: s.title, body: s.body, detail: s.detail })))
  const [removed, setRemoved] = useState([])
  const [busy, setBusy] = useState(false)
  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const save = async () => {
    if (rows.some((r) => !r.title.trim())) return toast.error('Cada paso necesita un título.')
    setBusy(true)
    const results = []
    if (removed.length) results.push(await supabase.from('participation_steps').delete().in('id', removed))
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const payload = { position: i + 1, title: r.title.trim(), body: r.body.trim(), detail: r.detail.trim() }
      results.push(r.id
        ? await supabase.from('participation_steps').update(payload).eq('id', r.id)
        : await supabase.from('participation_steps').insert(payload))
    }
    setBusy(false)
    const failed = results.find((r) => r.error)
    if (failed) return toast.error(failed.error.message)
    toast.success('Pasos guardados.')
    setRemoved([])
    onSaved()
  }

  return (
    <div className="card">
      <h2>Pasos de “Cómo participar” <span className="tag">todo el sitio</span></h2>
      <div className="stack">
        {rows.map((r, i) => (
          <div className="rule-block" key={r.key}>
            <div className="rule-block-head">
              <span className="rule-num">PASO {String(i + 1).padStart(2, '0')}</span>
              <button type="button" className="btn btn--sm btn--bad" onClick={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); if (r.id) setRemoved((ids) => [...ids, r.id]) }}>Quitar</button>
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label className="field"><span>Título</span><input value={r.title} maxLength={80} onChange={(e) => update(r.key, { title: e.target.value })} /></label>
              <label className="field"><span>Etiqueta inferior</span><input value={r.detail} maxLength={80} onChange={(e) => update(r.key, { detail: e.target.value })} /></label>
            </div>
            <label className="field"><span>Descripción</span><textarea rows={3} maxLength={400} value={r.body} onChange={(e) => update(r.key, { body: e.target.value })} /></label>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={() => setRows((rs) => [...rs, { key: uid(), id: null, title: '', body: '', detail: '' }])}>Agregar paso</button>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar pasos'}</button>
      </div>
    </div>
  )
}

/* --------------------------------- Página --------------------------------- */
const SECTIONS = [['doc', 'Documento y textos'], ['rules', 'Reglamento'], ['scoring', 'Tabla de puntos'], ['steps', 'Cómo participar']]

export default function Content() {
  const [section, setSection] = useState('doc')
  const [game, setGame] = useState('mlbb')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)

  const load = useCallback(async () => {
    const [g, r, s] = await Promise.all([
      supabase.from('games').select('*').order('key'),
      supabase.from('rules_sections').select('*').order('position'),
      supabase.from('participation_steps').select('*').order('position'),
    ])
    const err = g.error || r.error || s.error
    if (err) return setError(err.message)
    setData({ games: g.data, rules: r.data, steps: s.data })
    setVersion((v) => v + 1)
  }, [])
  useEffect(() => { load() }, [load])

  if (error) return <ErrorBox error={error.includes('does not exist') || error.includes('schema cache') ? 'Falta ejecutar la migración 003_content.sql en Supabase.' : error} />
  if (!data) return <Spinner />
  const current = data.games.find((g) => g.key === game)
  const perGame = section !== 'steps'

  return (
    <>
      <PageHeader eyebrow="Torneo" title="Contenido del sitio" subtitle="Lo que guardes aquí aparece en la página pública." />
      <div className="narrow">
        <div className="section-tabs" role="tablist" aria-label="Secciones de contenido">
          {SECTIONS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={section === key} type="button" className={`section-tab ${section === key ? 'section-tab--active' : ''}`} onClick={() => setSection(key)}>{label}</button>
          ))}
        </div>
        {perGame && (
          <div className="tabs" aria-label="Juego">
            {data.games.map((g) => (
              <button key={g.key} type="button" className={`tab ${game === g.key ? 'tab--active' : ''}`} onClick={() => setGame(g.key)}>{GAME_LABEL[g.key]}</button>
            ))}
          </div>
        )}
        <div key={`${section}-${game}-${version}`}>
          {section === 'doc' && <GameTexts game={current} onSaved={load} />}
          {section === 'rules' && <RulesEditor game={current} initial={data.rules.filter((r) => r.game_key === game)} onSaved={load} />}
          {section === 'scoring' && <ScoringEditor game={current} onSaved={load} />}
          {section === 'steps' && <StepsEditor initial={data.steps} onSaved={load} />}
        </div>
      </div>
    </>
  )
}
