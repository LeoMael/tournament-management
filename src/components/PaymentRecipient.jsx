import { useToast } from '../context/ToastContext'

export default function PaymentRecipient({ person }) {
  const toast = useToast()
  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(person.whatsapp)
      toast.success('Número copiado.')
    } catch {
      toast.error('No se pudo copiar. Selecciona y copia el número que aparece en pantalla.')
    }
  }
  return <div className="tm-payment-recipient">
    <strong>{person?.nickname || 'Participante no disponible'}</strong>
    {person?.full_name && <small className="tm-cell-note">{person.full_name}</small>}
    <div className="tm-payment-contact">
      <span><small>Número registrado</small><strong className="tm-payment-number">{person?.whatsapp || 'No disponible'}</strong></span>
      {person?.whatsapp && <button type="button" className="btn btn--sm" aria-label={`Copiar número de ${person.nickname}`} onClick={copyNumber}>Copiar número</button>}
    </div>
  </div>
}
