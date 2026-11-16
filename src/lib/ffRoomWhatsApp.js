import { whatsappPhone } from './soloWhatsApp.js'

export function ffPreparedWhatsAppLink(message, expected) {
  if (!message || ['room_id', 'room_kind', 'edition_id', 'registration_id', 'action'].some((key) => message[key] !== expected[key])
    || !['solo_top', 'duo_top', 'duo_kills'].includes(message.room_kind) || !['open', 'closed', 'playing'].includes(message.status)
    || !Number.isInteger(message.slot) || message.slot < 1 || message.slot > 100 || !message.nickname_1) return null
  const phone = whatsappPhone(message.whatsapp)
  const when = new Date(message.scheduled_at)
  if (!phone || !Number.isFinite(when.getTime())) return null
  const names = [message.nickname_1, message.nickname_2].filter(Boolean).join(' / ')
  const slot = '*TU SLOT ASIGNADO: ' + String(message.slot).padStart(2, '0') + '*'
  const time = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(when) + ' (Perú)'
  let lines
  if (message.action === 'access') {
    if (!message.game_room_id?.trim() || !message.room_password?.trim()) return null
    lines = [`Hola, ${names}. Estos son tus datos de acceso:`, '', slot, '', 'Sala: ' + message.name, 'Fecha y hora: ' + time, 'ID: ' + message.game_room_id, 'Contraseña: ' + message.room_password, '', message.room_kind === 'solo_top' ? 'Ubícate únicamente en ese slot y evita compartir el acceso.' : 'Ambos integrantes deben ubicarse en el slot de su dúo. Comparte el acceso únicamente con tu compañero.']
  } else if (message.action === 'confirmation') {
    lines = [`Hola, ${names}. Tu inscripción a «${message.name}» fue aprobada. ✓`, '', 'Fecha y hora: ' + time, '', slot, '', 'Te enviaremos el ID y la contraseña antes de comenzar la partida. Mantente atento a este chat.']
  } else return null
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(lines.join('\n'))
}

export function ffPaymentNoticeLink(kind, room, person, payment) {
  const phone = whatsappPhone(person?.whatsapp)
  if (!['solo_top', 'duo_top', 'duo_kills'].includes(kind) || !phone || !person || !payment || person.edition_id !== room.edition_id || person.room_kind !== kind || person.room_id !== room.id
    || payment.edition_id !== room.edition_id || payment.room_kind !== kind || payment.room_id !== room.id || payment.registration_id !== person.id
    || payment.concept !== 'reward' || !payment.paid_at || !/^[0-9]{8,15}$/.test(payment.paid_phone ?? '') || !Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0) return null
  const names = [person.nickname_1, person.nickname_2].filter(Boolean).join(' / ')
  const text = [`${names}, ¡tu premio de «${room.name}» ya fue pagado! ✓`, '', 'Importe: S/ ' + Number(payment.amount).toFixed(2), 'Yape receptor del pago: ' + payment.paid_phone, '', 'Revisa tu Yape para confirmar que recibiste el depósito.', '', '¡Gracias por participar y confiar en RAGNAROK! Te esperamos en la próxima partida.'].join('\n')
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text)
}
