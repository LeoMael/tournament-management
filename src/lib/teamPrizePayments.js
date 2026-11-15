import { whatsappPhone } from './soloWhatsApp.js'

export function teamPrizeTotals(payments) {
  let total = 0, paid = 0, deliveriesPending = 0
  for (const row of payments) {
    const cents = Math.round(Number(row.amount) * 100)
    total += cents
    if (row.paid_at) paid += cents
    if (row.item_text && !row.delivered_at) deliveriesPending++
  }
  return { total: total / 100, paid: paid / 100, due: (total - paid) / 100, deliveriesPending }
}

export function teamPrizeNoticeLink(settlement, payment, team) {
  const phone = whatsappPhone(team?.captain_whatsapp)
  const amount = Number(payment?.amount)
  if (!phone || !['ff', 'mlbb'].includes(settlement?.game_key)
    || payment?.settlement_id !== settlement?.id || payment?.edition_id !== settlement?.edition_id
    || team?.id !== payment?.registration_id || team?.game_key !== settlement?.game_key
    || !/^[0-9]{8,15}$/.test(payment?.prize_yape_phone ?? '')
    || !payment?.paid_at || !Number.isFinite(amount) || amount <= 0
    || ![1, 2, 3].includes(payment?.place)) return null
  const message = [
    payment.team_name + ', ¡el premio de tu equipo ya fue pagado! ✓',
    '', 'Torneo: ' + settlement.edition_name,
    'Juego: ' + (settlement.game_key === 'ff' ? 'Free Fire' : 'Mobile Legends: Bang Bang'),
    'Puesto: ' + payment.place + '.º lugar',
    'Importe: S/ ' + amount.toFixed(2),
    'Yape de destino del pago: ' + payment.prize_yape_phone,
    '', 'Revisa tu Yape para confirmar que recibiste el depósito.',
    '', '¡Gracias por participar y confiar en RAGNAROK! Te esperamos en el próximo torneo.',
  ].join('\n')
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message)
}
