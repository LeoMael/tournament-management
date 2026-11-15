import { useToast } from '../context/ToastContext'
import { prizeYapePhone } from '../lib/soloPhones'

export default function SoloPaymentRecipient({ person, kind }) {
  const toast = useToast()
  const phone = kind === 'reward' ? prizeYapePhone(person) : null
  const copy = async () => {
    if (!phone) return
    try { await navigator.clipboard.writeText(phone); toast.success('Número de Yape copiado.') }
    catch { toast.error('No se pudo copiar. Selecciona el número para copiarlo manualmente.') }
  }
  return <div className="tm-payment-recipient">
    <strong>{person?.nickname || 'Participante no disponible'}</strong>
    {person?.full_name && <small className="tm-cell-note">{person.full_name}</small>}
    {kind === 'reward' ? <div className="tm-payment-contact">
      <span><small>Yape para premios</small><strong className="tm-payment-number">{phone || 'No indicado'}</strong></span>
      {phone && <button type="button" className="btn btn--sm" onClick={copy}>Copiar número</button>}
    </div> : <p>Confirma el destino de devolución con quien pagó. WhatsApp de contacto: {person?.whatsapp || 'No indicado'}.</p>}
  </div>
}
