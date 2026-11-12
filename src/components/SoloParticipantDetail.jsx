import { useEffect, useState } from 'react'
import { ErrorBox, Modal, Spinner } from './ui'
import { signedReceiptUrl } from '../lib/storage'
import { dateTime, money } from '../lib/format'
import { SOLO_STATUS } from '../lib/tournamentModules'

export default function SoloParticipantDetail({ person, room, isAdmin, hasResults, hasPayments, busy, onClose, onDelete }) {
  const [receipt, setReceipt] = useState({ url: null, error: '' })
  const [brokenImage, setBrokenImage] = useState(false)
  const [receiptVersion, setReceiptVersion] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const beforeGame = ['open', 'closed'].includes(room.status)
  const refundable = ['refund_pending', 'refunded'].includes(person.status)
  const canDelete = isAdmin && beforeGame && !hasResults && !hasPayments && !refundable

  useEffect(() => {
    let active = true
    if (person.receipt_path) signedReceiptUrl(person.receipt_path)
      .then((url) => { if (active) setReceipt({ url, error: '' }) })
      .catch((error) => { if (active) setReceipt({ url: null, error: error.message }) })
    return () => { active = false }
  }, [person.receipt_path, receiptVersion])

  const reloadReceipt = () => {
    setReceipt({ url: null, error: '' }); setBrokenImage(false); setReceiptVersion((version) => version + 1)
  }
  const remove = async (event) => {
    event.preventDefault()
    if (busy || !canDelete || confirmation !== person.nickname) return
    setDeleteError('')
    const error = await onDelete(confirmation)
    if (error) setDeleteError(error)
  }
  const footer = confirming ? <form onSubmit={remove} className="solo-participant-delete">
    <p>Se eliminará la inscripción de <strong>{person.nickname}</strong> en <strong>{room.name}</strong>. Es permanente, libera su cupo y no devuelve dinero. Los slots de los demás jugadores no cambian.</p>
    <label className="field">Escribe su nickname exacto para confirmar<input autoComplete="off" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} required /></label>
    <ErrorBox error={deleteError} />
    <div className="foot-actions"><button type="button" className="btn" disabled={busy} onClick={() => { setConfirming(false); setConfirmation(''); setDeleteError('') }}>Volver</button><button type="submit" className="btn btn--bad" disabled={busy || !canDelete || confirmation !== person.nickname}>{busy ? 'Eliminando…' : 'Eliminar participante'}</button></div>
  </form> : <div className="solo-participant-footer">
    {isAdmin && <><span className="hint">{!beforeGame ? 'Solo se elimina antes de iniciar la partida.' : hasResults || hasPayments || refundable ? 'Con resultados, pagos o devoluciones asociados, la inscripción debe conservarse.' : 'Puedes eliminar esta inscripción sin borrar la sala.'}</span><button type="button" className="btn btn--ghost solo-delete-participant" disabled={busy || !canDelete} onClick={() => setConfirming(true)}>Eliminar participante</button></>}
  </div>

  return <Modal title={person.nickname} wide onClose={() => !busy && onClose()} footer={footer}>
    <div className="solo-participant-summary"><span className={`tm-status tm-status--${person.status}`}>{SOLO_STATUS[person.status]}</span><span className="solo-slot">{person.slot != null ? `Slot #${person.slot}` : 'Sin slot asignado'}</span><strong>{money(person.amount_due)}</strong></div>
    <dl className="kv">
      <dt>Sala</dt><dd>{room.name}</dd>
      <dt>Participante</dt><dd>{person.full_name}</dd>
      <dt>Nickname</dt><dd>{person.nickname}</dd>
      <dt>WhatsApp</dt><dd>{person.whatsapp}</dd>
      <dt>Institución</dt><dd>{person.institution || 'Sin institución'}{person.professional_school ? ` · ${person.professional_school}` : ''}</dd>
      <dt>Registrado</dt><dd>{dateTime(person.created_at)}</dd>
      {person.reviewed_at && <><dt>Revisado</dt><dd>{dateTime(person.reviewed_at)}</dd></>}
      {person.game_player_id && <><dt>ID anterior</dt><dd>{person.game_player_id}</dd></>}
      {person.reason && <><dt>Observación</dt><dd>{person.reason}</dd></>}
    </dl>
    <section className="solo-participant-receipt"><h3>Comprobante de pago</h3>
      {!person.receipt_path ? <p className="hint">Sin comprobante.</p> : <>
        {!receipt.url && !receipt.error && <Spinner label="Cargando comprobante…" />}
        <ErrorBox error={receipt.error || (brokenImage ? 'No se pudo cargar la imagen. Puedes renovar el enlace o abrirlo en otra pestaña.' : '')} />
        {receipt.url && (person.receipt_path.toLowerCase().endsWith('.pdf')
          ? <iframe title={`Comprobante de ${person.nickname}`} className="receipt-frame" src={receipt.url} sandbox="" />
          : !brokenImage && <img className="receipt" src={receipt.url} alt={`Comprobante de pago de ${person.nickname}`} onError={() => setBrokenImage(true)} />)}
        <div className="solo-participant-receipt-actions">{receipt.url && <a href={receipt.url} target="_blank" rel="noopener noreferrer">Abrir comprobante ↗</a>}<button type="button" className="btn btn--sm" onClick={reloadReceipt}>Renovar enlace</button><span className="hint">Enlace privado válido durante 60 segundos.</span></div>
      </>}
    </section>
  </Modal>
}
