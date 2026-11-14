import { dateTime, money } from '../lib/format'
import { prizeYapePhone } from '../lib/soloPhones'
import { useToast } from '../context/ToastContext'

export default function SoloPayments({ payments, totalDue, hasPayments, people, admin, busy, onPay }) {
  const toast = useToast()
  const copyNumber = async (person) => {
    const phone = prizeYapePhone(person)
    if (!phone) return
    try { await navigator.clipboard.writeText(phone); toast.success('Número de Yape copiado.') }
    catch { toast.error('No se pudo copiar. Selecciona el número para copiarlo manualmente.') }
  }
  const peopleById = Object.fromEntries(people.map((person) => [person.id, person]))
  return <>
    <div className="tm-payment-summary"><span>Pendiente de esta sala</span><strong>{money(totalDue)}</strong></div>
    <div className="table-wrap"><table><thead><tr><th>Jugador / concepto</th><th>Yape para premios</th><th>Importe</th><th>Estado</th><th>Pago</th></tr></thead><tbody>
      {payments.map((payment) => <tr key={payment.id}>
        <td><strong>{peopleById[payment.registration_id]?.nickname || 'Participante no disponible'}</strong><small className="tm-cell-note">{payment.kind === 'reward' ? 'Premio por kills y Booyah' : 'Devolución de inscripción'}</small></td>
        <td>{payment.kind === 'reward' ? <><span className="tm-payment-number">{prizeYapePhone(peopleById[payment.registration_id]) || 'No indicado'}</span>{prizeYapePhone(peopleById[payment.registration_id]) && <button type="button" className="btn btn--sm" onClick={() => copyNumber(peopleById[payment.registration_id])}>Copiar número</button>}</> : <><span>Confirmar destino de devolución</span><small className="tm-cell-note">WhatsApp de contacto: {peopleById[payment.registration_id]?.whatsapp || 'No indicado'}</small></>}</td>
        <td><strong>{money(payment.amount)}</strong></td>
        <td><span className={`tm-status tm-status--${payment.paid_at ? 'finished' : 'pending'}`}>{payment.paid_at ? 'Pagado' : 'Por pagar'}</span></td>
        <td>{payment.paid_at ? <><span>{dateTime(payment.paid_at)}</span>{payment.reference && <small className="tm-cell-note">{payment.reference}</small>}</> : admin ? <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => onPay(payment)}>Registrar pago</button> : <span className="tm-cell-note">Lo registra un administrador</span>}</td>
      </tr>)}
    </tbody></table></div>
    {!payments.length && <div className="tm-empty"><h3>{hasPayments ? 'No encontramos ese jugador' : 'Todavía no hay liquidaciones'}</h3><p>{hasPayments ? 'Prueba otro nombre, nickname o número.' : 'Los premios se generan al finalizar la partida. Las devoluciones aparecen al cancelar o devolver una inscripción.'}</p></div>}
  </>
}
