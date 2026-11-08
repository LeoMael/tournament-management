import { useEffect, useState } from 'react'
import '../tournament-modules.css'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Modal } from './ui'
import { rpc, MIGRATION_MESSAGE } from '../lib/tournamentModules'

export default function EditionSettings() {
  const toast = useToast()
  const [edition, setEdition] = useState(null), [preview, setPreview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase.from('tournament_editions').select('*').eq('status', 'active').single().then(({ data, error: err }) => { if (err) setError(MIGRATION_MESSAGE); else setEdition(data) })
  }, [])
  const review = async () => {
    setBusy(true); setError('')
    try { setPreview(await rpc('edition_close_preview')) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const close = async (e) => {
    e.preventDefault(); const f = new FormData(e.currentTarget)
    setBusy(true); setError('')
    try {
      await rpc('close_tournament_edition', { p_edition_id: preview.edition_id, p_confirmation: f.get('confirmation'), p_next_name: f.get('next_name'), p_next_deadline: new Date(f.get('deadline')).toISOString() })
      toast.success('Edición archivada. La siguiente edición tiene las inscripciones cerradas.'); window.location.reload()
    } catch (err) { setError(err.message); try { setPreview(await rpc('edition_close_preview')) } catch { /* conservar el diagnóstico anterior */ } } finally { setBusy(false) }
  }
  const blocked = preview && Object.values(preview.blockers).some((n) => n > 0)
  return <section className="card tm-room-overview"><span className="eyebrow">CICLO DEL TORNEO</span><h2>Edición y cierre del torneo</h2><ErrorBox error={error} /><p>Edición activa: <strong>{edition?.name || 'No disponible'}</strong></p><p>El cierre archiva MLBB y Free Fire juntos y vacía inscripciones, llaves, resultados y cronograma. Conserva usuarios y configuración; los premios nuevos quedan por anunciar.</p><button className="btn" disabled={!edition || busy} onClick={review}>Revisar cierre y preparar siguiente edición</button>
    {preview && <Modal title={`Cerrar ${edition.name}`} onClose={() => !busy && setPreview(null)}><ErrorBox error={error} /><h3>Datos que se archivarán</h3><ul className="tm-archive-counts">{Object.entries(preview.counts).map(([key, n]) => <li key={key}>{key.replaceAll('_', ' ')}<strong>{n}</strong></li>)}</ul><h3>Pendientes</h3>{Object.entries(preview.blockers).map(([key, n]) => n > 0 && <p className="error-box" key={key}>{key}: {n}</p>)}{!blocked && <p>No hay pendientes que impidan cerrar.</p>}
      <form onSubmit={close}><label className="field">Nombre de la siguiente edición<input name="next_name" required minLength={3} maxLength={120} /></label><label className="field">Nuevo cierre de inscripciones<input name="deadline" type="datetime-local" required /></label><label className="field">Escribe «{edition.name}» para confirmar<input name="confirmation" required autoComplete="off" /></label><p>El archivo quedará oculto hasta que lo publiques desde Torneos anteriores. Las inscripciones y transmisiones quedarán apagadas.</p><button className="btn btn--primary" disabled={busy || blocked}>Archivar y preparar siguiente edición</button></form>
    </Modal>}
  </section>
}
