import { useEffect, useState } from 'react'
import { Modal, ErrorBox, Spinner } from './ui'
import { signedReceiptUrl } from '../lib/storage'
import { ffParticipantName } from '../lib/ffRooms'
import { dateTime, money } from '../lib/format'
import { SOLO_STATUS } from '../lib/tournamentModules'

export default function FfRoomParticipantDetail({ person, room, admin, busy, onClose, onReview, onDelete, onPhones }) {
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')
  const [broken, setBroken] = useState(false)
  const [version, setVersion] = useState(0)
  const [action, setAction] = useState('')
  const [text, setText] = useState('')
  const [editingPhones, setEditingPhones] = useState(false)
  const [whatsapp, setWhatsapp] = useState(person.whatsapp)
  const [yape, setYape] = useState(person.prize_yape_phone)
  const name = ffParticipantName(person)
  const beforeGame = ['open', 'closed'].includes(room.status)
  useEffect(() => {
    let active = true
    signedReceiptUrl(person.receipt_path).then((url) => {
      if (active) setReceipt(url)
    }).catch((problem) => { if (active) setError(problem.message) })
    return () => { active = false }
  }, [person.receipt_path, version])
  const submit = async (event) => {
    event.preventDefault()
    const problem = action === 'delete' ? await onDelete(person, text) : await onReview(person, 'rejected', text)
    setError(problem || '')
    if (!problem) { setAction(''); setText('') }
  }
  const footer = <>
    {action ? <form onSubmit={submit}>
      {action === 'delete' && <p>Se eliminará esta inscripción, se liberará su cupo y se conservarán los números de slot de los demás. Esta acción no devuelve dinero.</p>}
      <label className="field">{action === 'delete' ? `Escribe ${name} para confirmar` : 'Motivo de rechazo'}<input required disabled={busy} maxLength={action === 'delete' ? 103 : 500} minLength={action === 'delete' ? 1 : 3} value={text} onChange={(e) => setText(e.target.value)} /></label>
      <div className="row-actions"><button type="button" className="btn" disabled={busy} onClick={() => { setAction(''); setText('') }}>Volver</button><button className="btn btn--bad" disabled={busy || (action === 'delete' && text !== name)}>Confirmar</button></div>
    </form> : <div className="row-actions">
      {beforeGame && person.status === 'pending' && <><button type="button" className="btn btn--primary" disabled={busy} onClick={async () => { const problem = await onReview(person, 'approved', ''); setError(problem || '') }}>Aprobar inscripción</button><button type="button" className="btn" disabled={busy} onClick={() => setAction('reject')}>Rechazar</button></>}
      {admin && beforeGame && !['refund_pending', 'refunded'].includes(person.status) && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setAction('delete')}>Eliminar inscripción</button>}
    </div>}
  </>
  return <Modal wide title={name} onClose={() => !busy && onClose()} footer={footer}>
    <div className="row-actions"><span className={`tm-status tm-status--${person.status}`}>{SOLO_STATUS[person.status]}</span><strong>{person.slot ? `Slot #${person.slot}` : 'Sin slot asignado'}</strong><span>{money(person.amount_due)}</span></div>
    <dl className="kv">
      <dt>Sala</dt><dd>{room.name}</dd>
      <dt>Nombre registrado</dt><dd>{person.full_name}</dd>
      <dt>Nickname</dt><dd>{person.nickname_1}</dd>
      {person.nickname_2 && <><dt>Segundo jugador</dt><dd>{person.nickname_2}</dd></>}
      <dt>WhatsApp de contacto</dt><dd>{person.whatsapp}</dd>
      <dt>Yape para premios</dt><dd>{person.prize_yape_phone}</dd>
      <dt>Registrado</dt><dd>{dateTime(person.created_at)}</dd>
      {person.reviewed_at && <><dt>Revisado</dt><dd>{dateTime(person.reviewed_at)}</dd></>}
      {person.reason && <><dt>Motivo</dt><dd>{person.reason}</dd></>}
    </dl>
    {admin && (editingPhones ? <form onSubmit={async (e) => {
      e.preventDefault()
      const problem = await onPhones(whatsapp, yape)
      setError(problem || '')
      if (!problem) setEditingPhones(false)
    }}>
      <label className="field">WhatsApp de contacto<input required pattern="[0-9]{8,15}" inputMode="numeric" disabled={busy} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></label>
      <label className="field">Yape para premios<input required pattern="[0-9]{8,15}" inputMode="numeric" disabled={busy} value={yape} onChange={(e) => setYape(e.target.value)} /></label>
      <p className="hint">El Yape de pagos ya registrados se conserva en su historial.</p>
      <div className="row-actions"><button className="btn btn--primary" disabled={busy}>Guardar números</button><button type="button" className="btn" disabled={busy} onClick={() => setEditingPhones(false)}>Volver</button></div>
    </form> : <button className="btn btn--sm" disabled={busy} onClick={() => { setWhatsapp(person.whatsapp); setYape(person.prize_yape_phone); setEditingPhones(true) }}>Corregir teléfonos</button>)}
    <ErrorBox error={error} />
    <h3>Comprobante de pago</h3>
    {!receipt && !error && <Spinner />}
    {receipt && (person.receipt_path.toLowerCase().endsWith('.pdf')
      ? <iframe className="receipt-frame" title={`Comprobante de ${name}`} src={receipt} sandbox="" />
      : !broken && <img className="receipt" src={receipt} alt={`Comprobante de ${name}`} onError={() => { setBroken(true); setError('No se pudo cargar la imagen.') }} />)}
    <div className="row-actions">{receipt && <a href={receipt} target="_blank" rel="noopener noreferrer">Abrir comprobante ↗</a>}<button type="button" className="btn btn--sm" onClick={() => { setError(''); setBroken(false); setVersion((previous) => previous + 1) }}>Renovar enlace</button></div>
  </Modal>
}
