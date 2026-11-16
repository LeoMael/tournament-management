import { useState } from 'react'
import { Modal, ErrorBox } from './ui'
import { ffPaymentTotals } from '../lib/ffRoomResults'
import { dateTime, money } from '../lib/format'
import { ffPaymentNoticeLink } from '../lib/ffRoomWhatsApp'

export default function FfRoomPayments({ kind, room, people, payments, results, visibleIds, admin, busy, onPay }) {
  const [filter, setFilter] = useState('positive')
  const [selection, setSelection] = useState(null)
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')
  const totals = ffPaymentTotals(payments)
  const personFor = (p) => people.find((a) => a.id === p.registration_id)
  const payment = selection?.payment
  const person = selection?.person
  const winner = (p) => !!results.find((r) => r.registration_id === p.registration_id)?.booyah
  const rows = payments.filter((p) => visibleIds.has(p.registration_id) && (filter === 'all' || (filter === 'pending' ? !p.paid_at && Number(p.amount) > 0 : Number(p.amount) > 0)))
    .sort((a, b) => Number(!!a.paid_at) - Number(!!b.paid_at) || Number(winner(b)) - Number(winner(a)) || Number(b.amount) - Number(a.amount))
  return <>
    <div className="solo-summary"><span>Por pagar <strong>{money(totals.pending)}</strong></span><span>Pagado <strong>{money(totals.paid)}</strong></span><span>Por devolver <strong>{money(totals.refundsPending)}</strong></span><span>Devuelto <strong>{money(totals.refundsPaid)}</strong></span></div>
    <label className="field">Mostrar<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="positive">Con importe</option><option value="pending">Pendientes</option><option value="all">Todos</option></select></label>
    <ErrorBox error={error} />
    <div className="table-wrap ff-room-scroll"><table><thead><tr><th>Jugador / nombre</th><th>Yape para premios</th><th>Importe</th><th>Estado</th><th>Pago</th></tr></thead><tbody>{rows.map((p) => {
      const a = personFor(p)
      const phone = p.paid_phone || a?.prize_yape_phone
      const notice = room && ffPaymentNoticeLink(kind, room, a, p)
      return <tr key={p.id}>
        <td><strong>{a?.nickname_1}{a?.nickname_2 ? ` / ${a.nickname_2}` : ''}</strong>{winner(p) && <strong> · Booyah</strong>}<small className="tm-cell-note">{a?.full_name}</small><small className="tm-cell-note">{p.concept === 'refund' ? 'Devolución de inscripción' : 'Premio'}</small></td>
        <td><span className="ff-room-contact">{phone} {Number(p.amount) > 0 && phone && <button className="btn btn--sm" onClick={async () => { try { await navigator.clipboard.writeText(phone); setError('') } catch { setError('No se pudo copiar el número.') } }}>Copiar número</button>}</span></td>
        <td><strong>{money(p.amount)}</strong></td><td>{Number(p.amount) === 0 ? 'Sin importe' : p.paid_at ? 'Pagado' : 'Por pagar'}</td>
        <td>{p.paid_at ? <>{dateTime(p.paid_at)}<small className="tm-cell-note">{p.reference}</small>{notice && <a className="btn btn--sm" href={notice} target="_blank" rel="noopener noreferrer">Avisar pago</a>}</> : Number(p.amount) > 0 && admin && <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => { setSelection({ payment: p, person: a }); setReference(''); setError('') }}>Registrar {p.concept === 'refund' ? 'devolución' : 'pago'}</button>}</td>
      </tr>
    })}</tbody></table></div>
    {!rows.length && <p className="hint">Sin pagos con este filtro. Los premios se generan al finalizar la partida.</p>}
    {payment && person && <Modal title="Registrar pago realizado" onClose={() => !busy && setSelection(null)}><form onSubmit={async (e) => {
      e.preventDefault()
      const problem = await onPay(payment, person.prize_yape_phone, reference)
      setError(problem || '')
      if (!problem) setSelection(null)
    }}>
      <p><strong>{person.nickname_1}{person.nickname_2 ? ` / ${person.nickname_2}` : ''}</strong><br />{person.full_name}</p>
      <p>Yape: <strong>{person.prize_yape_phone}</strong> · <strong>{money(payment.amount)}</strong></p>
      {payment.concept === 'refund' && <p>Confirma con el participante el destino de la devolución antes de pagar.</p>}
      <p className="hint">Registra aquí la operación que ya realizaste. El panel no transfiere dinero.</p>
      <label className="field">Referencia del pago<input required maxLength="200" value={reference} disabled={busy} onChange={(e) => setReference(e.target.value)} /></label>
      <ErrorBox error={error} /><button className="btn btn--primary" disabled={busy}>Confirmar pago realizado</button>
    </form></Modal>}
  </>
}
