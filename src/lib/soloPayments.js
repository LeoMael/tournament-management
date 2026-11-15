// Pendientes, pagados y ceros; dentro de cada grupo, Booyah y mayor importe.
export function soloPaymentRows(payments, filter = 'positive', results = {}) {
  const group = (p) => Number(p.amount) > 0 ? (p.paid_at ? 1 : 0) : 2
  const winner = (p) => p.kind === 'reward' && results[p.registration_id]?.booyah ? 1 : 0
  return payments.filter((p) => filter === 'all'
    || (Number(p.amount) > 0 && (filter !== 'pending' || !p.paid_at)))
    .sort((a, b) => group(a) - group(b)
      || winner(b) - winner(a)
      || Number(b.amount) - Number(a.amount)
      || a.id.localeCompare(b.id))
}
