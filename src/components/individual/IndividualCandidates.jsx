import { useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useToast } from '../../context/ToastContext'
import { Modal } from '../ui'
import { signedReceiptUrl, uploadFile } from '../../lib/storage'
import { INDIVIDUAL_STATUS, REVIEW_TRANSITIONS } from '../../lib/individuals'
import { dateTime, GAME_LABEL, money, whatsappUrl } from '../../lib/format'

const badge = (status) => ['pending', 'refund_pending'].includes(status) ? 'pending' : ['approved', 'registered'].includes(status) ? 'approved' : status === 'rejected' ? 'rejected' : 'withdrawn'

function CandidateDetail({ person, onClose, onChanged }) {
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [receiptLink, setReceiptLink] = useState(null)
  const [receiptIsPdf, setReceiptIsPdf] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const receiptRequest = useRef(0)
  const uploaded = useRef(new WeakMap())
  const toast = useToast()
  const transitions = person.group_id ? [] : REVIEW_TRANSITIONS[person.status] || []
  const receipt = async (path) => {
    if (!path) return toast.error('No hay comprobante disponible.')
    const request = ++receiptRequest.current
    try {
      const url = await signedReceiptUrl(path)
      if (request !== receiptRequest.current) return
      setReceiptLink(url)
      setReceiptIsPdf(path.toLowerCase().endsWith('.pdf'))
      setPreviewFailed(false)
    } catch (e) { toast.error(e.message) }
  }
  const review = async (status) => {
    if (status === 'refunded' && !file) return toast.error('Adjunta el comprobante de devolución.')
    if (!window.confirm(`¿Cambiar ${person.full_name} a ${INDIVIDUAL_STATUS[status]}?`)) return
    setBusy(true)
    try {
      let path = null
      if (status === 'refunded') {
        path = uploaded.current.get(file)
        if (!path) { path = await uploadFile('receipts', file, { allowPdf: true }); uploaded.current.set(file, path) }
      }
      const { error } = await supabase.rpc('review_individual_registration', { p_id: person.id, p_status: status, p_reason: reason.trim() || null, p_refund_receipt_path: path })
      if (error) throw error
      toast.success('Estado actualizado.')
      onClose()
      onChanged()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={person.full_name} onClose={onClose} wide footer={transitions.length > 0 && <div className="foot-actions">{transitions.map((status) => <button type="button" className={`btn ${status === 'approved' ? 'btn--ok' : status === 'rejected' ? 'btn--bad' : ''}`} key={status} disabled={busy} onClick={() => review(status)}>{status === 'approved' ? 'Aprobar' : status === 'rejected' ? 'Rechazar' : status === 'refund_pending' ? 'Pendiente devolución' : 'Confirmar devolución'}</button>)}</div>}>
      <div><span className={`tag tag--${person.game_key}`}>{GAME_LABEL[person.game_key]}</span> <span className={`badge badge--${badge(person.status)}`}>{INDIVIDUAL_STATUS[person.status]}</span> <strong>{money(person.amount_due)}</strong></div>
      <div className="individual-detail-grid">
        <div><h3>Jugador</h3><p><strong>{person.nickname}</strong> · ID {person.game_player_id}</p><p>Roles: {person.preferred_roles?.length ? person.preferred_roles.join(', ') : 'Cualquiera'}{person.assigned_role ? ` · Asignado: ${person.assigned_role}` : ''}</p><p><a href={whatsappUrl(person.whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp: {person.whatsapp}</a></p></div>
        <div><h3>Datos de inscripción</h3><p>{person.other_institution || person.institution || 'Institución no indicada'} · {person.professional_school || 'Carrera no indicada'}</p><p>Recibida: {dateTime(person.created_at)}</p><p>Términos: {person.terms_version || '—'} · {dateTime(person.terms_accepted_at)}</p>{person.reason && <p>Motivo: {person.reason}</p>}</div>
      </div>
      <div><h3>Comprobantes</h3><div className="row-actions"><button type="button" className="btn" onClick={() => receipt(person.receipt_path)}>Abrir pago</button>{person.refund_receipt_path && <button type="button" className="btn" onClick={() => receipt(person.refund_receipt_path)}>Abrir devolución</button>}</div>{receiptLink && <p><a href={receiptLink} target="_blank" rel="noopener noreferrer">Ver comprobante ↗</a> <span className="hint">Enlace válido 60 segundos.</span></p>}</div>
      {receiptLink && !previewFailed && (receiptIsPdf ? (
        <iframe className="receipt-frame" title="Comprobante seleccionado" src={receiptLink} sandbox="" />
      ) : (
        <img className="receipt" src={receiptLink} alt="Comprobante seleccionado" onError={() => setPreviewFailed(true)} />
      ))}
      {transitions.length > 0 && <div><h3>Revisión</h3><label className="field"><span>Motivo</span><input maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>{transitions.includes('refunded') && <label className="field"><span>Comprobante de devolución</span><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} /></label>}</div>}
    </Modal>
  )
}
export default function IndividualCandidates({ people, onChanged }) {
  const [game, setGame] = useState('')
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(null)
  const toast = useToast()
  const visible = people.filter((p) => (!game || p.game_key === game) && (!status || p.status === status) && (!query.trim() || `${p.full_name} ${p.nickname} ${p.whatsapp}`.toLowerCase().includes(query.trim().toLowerCase())))
  const approve = async (person) => {
    if (!window.confirm(`¿Aprobar a ${person.full_name}? Confirma que verificaste el pago.`)) return
    setBusy(person.id)
    try {
      const { error } = await supabase.rpc('review_individual_registration', { p_id: person.id, p_status: 'approved', p_reason: null, p_refund_receipt_path: null })
      if (error) throw error
      toast.success('Solicitud aprobada.')
      onChanged()
    } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }
  return (
    <section>
      <div className="filter-bar">
        <input aria-label="Buscar jugador" placeholder="Buscar jugador, nickname o WhatsApp…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="seg" role="group" aria-label="Juego">{[['', 'Todos'], ['mlbb', 'MLBB'], ['ff', 'Free Fire']].map(([value, label]) => <button key={value} type="button" className={`seg-btn ${game === value ? 'seg-btn--on' : ''}`} aria-pressed={game === value} onClick={() => setGame(value)}>{label}</button>)}</div>
        <select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos los estados</option>{['pending', 'approved', 'rejected', 'grouped', 'registered', 'refund_pending', 'refunded'].map((s) => <option key={s} value={s}>{INDIVIDUAL_STATUS[s]}</option>)}</select>
      </div>
      <div className="table-wrap"><table className="table-nowrap table-lg"><thead><tr><th>Jugador</th><th>Juego</th><th>Rol preferido</th><th>Estado</th><th>Fecha</th><th className="th-actions">Acciones</th></tr></thead><tbody>
        {visible.map((person) => <tr key={person.id}><td><div className="team-cell"><span>{person.full_name}</span><span className="obs-line">{person.nickname}</span></div></td><td><span className={`tag tag--${person.game_key}`}>{GAME_LABEL[person.game_key]}</span></td><td>{person.game_key === 'ff' ? 'Integrante' : person.preferred_roles?.length ? person.preferred_roles.join(', ') : 'Cualquiera'}</td><td><span className={`badge badge--${badge(person.status)}`}>{INDIVIDUAL_STATUS[person.status]}</span></td><td>{dateTime(person.created_at)}</td><td><div className="row-actions row-actions--end"><button type="button" className="btn btn--sm" onClick={() => setSelected(person)}>Ver</button>{person.status === 'pending' && !person.group_id && <button type="button" className="btn btn--sm btn--ok" disabled={busy === person.id} onClick={() => approve(person)}>Aprobar</button>}</div></td></tr>)}
      </tbody></table>{!visible.length && <p className="empty">No hay solicitudes con esos filtros.</p>}</div>
      {selected && <CandidateDetail key={selected.id} person={selected} onClose={() => setSelected(null)} onChanged={onChanged} />}
    </section>
  )
}
