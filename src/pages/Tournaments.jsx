import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import '../tournament-modules.css'
import { supabase } from '../supabaseClient'
import { ErrorBox, Modal, PageHeader, Spinner } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { dateTime } from '../lib/format'
import { uploadFile, publicUrl, signedReceiptUrl } from '../lib/storage'
import { allRows, rpc, MIGRATION_MESSAGE } from '../lib/tournamentModules'

const SOURCES = { registrations: 'Inscripciones de equipos', players: 'Jugadores', individual_registrations: 'Inscripciones individuales', individual_groups: 'Grupos individuales', individual_draws: 'Sorteos individuales', stages: 'Fases', groups: 'Grupos', group_teams: 'Integrantes de grupos', matches: 'Partidos y llaves', match_results: 'Resultados', schedule_events: 'Cronograma', solo_rooms: 'Salas Solo', solo_registrations: 'Inscripciones Solo', solo_results: 'Resultados Solo', solo_payments: 'Pagos Solo', tournament_settings: 'Configuración general', games: 'Juegos', prizes: 'Premios', game_prize_pools: 'Bolsas', individual_settings: 'Configuración individual', rules_sections: 'Reglamento', participation_steps: 'Pasos de participación' }
const LABELS = { full_name: 'Nombre', nickname: 'Apodo', team_name: 'Equipo', captain_name: 'Capitán', captain_whatsapp: 'WhatsApp', game_player_id: 'ID del juego', status: 'Estado', amount_due: 'Monto de inscripción', receipt_path: 'Comprobante', refund_receipt_path: 'Comprobante de devolución', logo_path: 'Logo', kills: 'Kills', booyah: 'Booyah', name: 'Nombre', scheduled_at: 'Horario', paid_at: 'Fecha de pago', reference: 'Referencia', amount: 'Monto', registration_id: 'Inscripción', id: 'Identificador' }

function MetadataForm({ edition, busy, save, close }) {
  return <Modal title="Datos de la edición" onClose={close}><form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save({ name: f.get('name'), description: f.get('description'), published: f.get('published') === 'on', cover: f.get('cover') }) }}>
    <label className="field">Nombre<input name="name" required minLength={3} maxLength={120} defaultValue={edition.name} /></label>
    <label className="field">Descripción<textarea name="description" maxLength={3000} defaultValue={edition.description} /></label>
    <label className="field">Portada (opcional)<input name="cover" type="file" accept="image/png,image/jpeg,image/webp" /></label>
    {edition.cover_path && <img alt="Portada" src={publicUrl('public-assets', edition.cover_path)} style={{ maxHeight: 140 }} />}
    {edition.status === 'archived' && <label className="check"><input name="published" type="checkbox" defaultChecked={edition.is_published} />Mostrar en la web pública</label>}
    <button className="btn btn--primary" disabled={busy}>Guardar</button>
  </form></Modal>
}

export default function Tournaments() {
  const toast = useToast()
  const [editions, setEditions] = useState(null), [error, setError] = useState(''), [selected, setSelected] = useState(null), [editing, setEditing] = useState(null), [busy, setBusy] = useState(false)
  const [source, setSource] = useState('registrations'), [rows, setRows] = useState([]), [page, setPage] = useState(0), [loadingRows, setLoadingRows] = useState(false)
  const load = useCallback(async () => {
    try { setEditions(await allRows('tournament_editions', 'created_at')); setError('') } catch (err) { setError(`${err.message}. ${MIGRATION_MESSAGE}`) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!selected) return
    let active = true
    supabase.from('tournament_archive_records').select('id,data').eq('edition_id', selected.id).eq('source', source).order('id').range(page * 50, page * 50 + 49).then(({ data, error: err }) => {
      if (!active) return
      if (err) { setError(err.message); setRows([]) } else { setError(''); setRows(data) }
      setLoadingRows(false)
    })
    return () => { active = false }
  }, [selected, source, page])
  const save = async (values) => {
    setBusy(true)
    try {
      const path = values.cover?.size ? await uploadFile('public-assets', values.cover) : editing.cover_path
      await rpc('update_edition_metadata', { p_id: editing.id, p_name: values.name, p_description: values.description, p_cover_path: path, p_published: values.published })
      setEditing(null); await load(); toast.success('Edición actualizada.')
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  const file = async (key, path) => {
    try {
      const url = key.includes('receipt') ? await signedReceiptUrl(path) : publicUrl(key === 'logo_path' ? 'team-logos' : 'public-assets', path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) { toast.error(err.message) }
  }
  return <div className="tournament-admin">
    <PageHeader eyebrow="Archivo de la competición" title="Torneos anteriores" subtitle="Conserva cada edición y elige cuáles forman parte de la historia pública de la arena." actions={<Link className="btn" to="/configuracion">Gestionar edición activa ↗</Link>} />
    <ErrorBox error={error} />{!editions && !error && <Spinner />}
    {editions && <div className="tm-stats"><div className="tm-stat"><span>Ediciones archivadas</span><strong>{editions.filter((e) => e.status === 'archived').length}</strong><small>Resultados y archivos conservados</small></div><div className="tm-stat"><span>Publicadas</span><strong>{editions.filter((e) => e.is_published).length}</strong><small>Disponibles en la web pública</small></div><div className="tm-stat"><span>Ocultas</span><strong>{editions.filter((e) => e.status === 'archived' && !e.is_published).length}</strong><small>Solo para consulta administrativa</small></div><div className="tm-stat"><span>Edición actual</span><strong style={{ fontSize: 16 }}>{editions.find((e) => e.status === 'active')?.name || 'Sin edición activa'}</strong><small>El siguiente capítulo de la arena</small></div></div>}
    <div className="tm-edition-grid">{editions?.slice().reverse().map((e) => <article className="card tm-edition-card" key={e.id}><div className="tm-edition-cover">{e.cover_path ? <img src={publicUrl('public-assets', e.cover_path)} alt="" loading="lazy" /> : <strong aria-hidden="true">R//</strong>}<span className={`tm-status tm-status--${e.status === 'active' ? 'active' : e.is_published ? 'published' : 'draft'}`}>{e.status === 'active' ? 'Edición activa' : e.is_published ? 'Publicada' : 'Oculta'}</span></div><div className="tm-edition-body"><span className="eyebrow">{e.status === 'active' ? 'EN ESTA EDICIÓN' : 'ARCHIVO DEL TORNEO'}</span><h2>{e.name}</h2><p>{e.description || (e.status === 'active' ? 'La edición que estás organizando. Sus participantes y resultados se guardarán al cerrarla.' : 'Todos los participantes, resultados y archivos de esta edición, conservados para consulta.')}</p><p>{e.status === 'active' ? `Inicio ${dateTime(e.started_at)}` : `Finalizada ${dateTime(e.closed_at)}`}</p><div className="tm-actions"><button className="btn" onClick={() => setEditing(e)}>{e.status === 'active' ? 'Editar edición' : 'Presentación y visibilidad'}</button>{e.status === 'archived' && <button className="btn btn--primary" onClick={() => { setSelected(e); setPage(0); setLoadingRows(true) }}>Consultar archivo ↗</button>}</div></div></article>)}</div>
    {selected && <Modal title={`Archivo · ${selected.name}`} wide onClose={() => setSelected(null)}><label className="field">Datos archivados<select value={source} onChange={(e) => { setSource(e.target.value); setPage(0); setLoadingRows(true) }}>{Object.entries(SOURCES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {loadingRows ? <Spinner /> : rows.map((r) => <details key={r.id} className="tm-record"><summary>{r.data.team_name || r.data.nickname || r.data.full_name || r.data.name || r.data.label || r.data.id || r.data.registration_id || 'Registro'}</summary><dl>{Object.entries(r.data).map(([key, value]) => <div key={key}><dt><strong>{LABELS[key] || key.replaceAll('_', ' ')}</strong></dt><dd>{value === null ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}{typeof value === 'string' && /^(receipt_path|refund_receipt_path|logo_path|rules_pdf_path|music_path|yape_qr_path)$/.test(key) && <button className="btn btn--sm" onClick={() => file(key, value)}>Abrir archivo</button>}</dd></div>)}</dl></details>)}
      {!loadingRows && rows.length === 0 && <p>No hay registros en esta sección.</p>}
      <div className="tm-pagination"><button className="btn" disabled={page === 0 || loadingRows} onClick={() => { setLoadingRows(true); setPage(page - 1) }}>Anterior</button><span>Página {page + 1}</span><button className="btn" disabled={rows.length < 50 || loadingRows} onClick={() => { setLoadingRows(true); setPage(page + 1) }}>Siguiente</button></div>
    </Modal>}
    {editing && <MetadataForm edition={editing} busy={busy} save={save} close={() => !busy && setEditing(null)} />}
  </div>
}
