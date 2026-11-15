import { dateTime, money } from '../lib/format'
import { prizeYapePhone } from '../lib/soloPhones'
import { useToast } from '../context/ToastContext'
import { soloPaymentNoticeLink } from '../lib/soloWhatsApp'

export default function SoloPayments({ room, payments, totals, hasPayments, people, results, admin, busy, onPay }) {
  const toast = useToast()
  const copyNumber = async (person) => {
    const phone = prizeYapePhone(person)
    if (!phone) return
    try { await navigator.clipboard.writeText(phone); toast.success('Número de Yape copiado.') }
    catch { toast.error('No se pudo copiar. Selecciona el número para copiarlo manualmente.') }
  }
  const peopleById = Object.fromEntries(people.map((person) => [person.id, person]))
  return <>
    <div className="solo-payment-totals">
      <div className="tm-payment-summary"><span>Pendiente de esta sala</span><strong>{money(totals.due)}</strong></div>
      <div className="tm-payment-summary"><div><span>Total pagado de esta sala</span>{totals.refundsPaid > 0 && <small className="tm-cell-note">Premios: {money(totals.rewardsPaid)} · Devoluciones: {money(totals.refundsPaid)}</small>}</div><strong>{money(totals.paid)}</strong></div>
    </div>
    <div className="table-wrap solo-scroll-table" tabIndex={0} role="region" aria-label="Pagos de la sala"><table><thead><tr><th>Jugador / nombre</th><th>Yape para premios</th><th>Importe</th><th>Estado</th><th>Pago</th></tr></thead><tbody>
      {payments.map((payment) => {
        const person = peopleById[payment.registration_id]
        const hasAmount = Number(payment.amount) > 0
        const notice = soloPaymentNoticeLink(room, person, payment)
        return <tr key={payment.id}>
        <td><div className="solo-payment-player"><strong>{person?.nickname || 'Participante no disponible'}</strong>{payment.kind === 'reward' && results?.[payment.registration_id]?.booyah && <span className="solo-slot">Booyah</span>}{payment.kind === 'refund' && <span className="tm-status tm-status--pending">Devolución</span>}</div>{person?.full_name && <small className="tm-cell-note">{person.full_name}</small>}</td>
        <td>{!hasAmount ? <span className="tm-cell-note">—</span> : payment.kind === 'reward' ? <div className="solo-payment-number"><span className="tm-payment-number">{prizeYapePhone(person) || 'No indicado'}</span>{prizeYapePhone(person) && <button type="button" className="btn btn--sm" onClick={() => copyNumber(person)}>Copiar número</button>}</div> : <><span>Confirmar destino de devolución</span><small className="tm-cell-note">WhatsApp de contacto: {person?.whatsapp || 'No indicado'}</small></>}</td>
        <td><strong>{money(payment.amount)}</strong></td>
        <td><span className={`tm-status tm-status--${!hasAmount ? 'draft' : payment.paid_at ? 'finished' : 'pending'}`}>{!hasAmount ? (payment.kind === 'reward' ? 'Sin premio' : 'Sin devolución') : payment.paid_at ? 'Pagado' : 'Por pagar'}</span></td>
        <td>{!hasAmount ? <span className="tm-cell-note">—</span> : payment.paid_at ? <><span>{dateTime(payment.paid_at)}</span>{payment.reference && <small className="tm-cell-note">{payment.reference}</small>}{notice && <div className="tm-row-actions"><a className="btn btn--sm solo-send-access" href={notice} target="_blank" rel="noopener noreferrer" aria-label={`Avisar pago por WhatsApp a ${person.nickname}`}>Avisar pago</a></div>}</> : admin ? <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => onPay(payment)}>Registrar pago</button> : <span className="tm-cell-note">Lo registra un administrador</span>}</td>
      </tr>})}
    </tbody></table></div>
    {!payments.length && <div className="tm-empty"><h3>{hasPayments ? 'No hay pagos con estos filtros' : 'Todavía no hay liquidaciones'}</h3><p>{hasPayments ? 'Cambia el filtro a Todos o prueba otro nombre, nickname o número.' : 'Los premios se generan al finalizar la partida. Las devoluciones aparecen al cancelar o devolver una inscripción.'}</p></div>}
  </>
}
