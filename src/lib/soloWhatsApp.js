export function whatsappPhone(value) {
  const raw = String(value ?? '').trim()
  if (!raw || !/^[+\d\s().-]+$/.test(raw) || (raw.includes('+') && !raw.startsWith('+'))) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (!raw.startsWith('+') && /^9\d{8}$/.test(digits)) digits = '51' + digits
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}

function recipientPhone(room, person) {
  const phone = whatsappPhone(person.whatsapp)
  if (!phone || person.status !== 'approved' || !Number.isInteger(person.slot) || person.slot < 1
    || !['open', 'closed', 'playing'].includes(room.status)) return null
  return phone
}

function hasSavedAccess(room, access) {
  return access?.room_id === room.id
    && typeof access.game_room_id === 'string' && access.game_room_id.trim().length > 0
    && typeof access.room_password === 'string' && access.room_password.trim().length > 0
}

export function soloAccessLink(room, person, access) {
  const phone = recipientPhone(room, person)
  if (!phone || !hasSavedAccess(room, access)) return null
  const time = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(room.scheduled_at))
  const message = [
    'Hola, ' + person.nickname + '. Estos son tus datos de acceso:',
    '', '*TU SLOT ASIGNADO: ' + String(person.slot).padStart(2, '0') + '*',
    '', 'Sala: ' + room.name, 'Fecha y hora: ' + time + ' (Perú)',
    'ID: ' + access.game_room_id, 'Contraseña: ' + access.room_password,
    '', 'Ubícate únicamente en ese slot y evita compartir el acceso.',
  ].join('\n')
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message)
}

export function soloConfirmationLink(room, person) {
  const phone = recipientPhone(room, person)
  if (!phone) return null
  const time = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(room.scheduled_at))
  const message = [
    'Hola, ' + person.nickname + '. Tu inscripción a «' + room.name + '» fue aprobada. ✓',
    '', 'Fecha y hora: ' + time + ' (Perú)',
    '', '*TU SLOT ASIGNADO: ' + String(person.slot).padStart(2, '0') + '*',
    '', 'Te enviaremos el ID y la contraseña antes de comenzar la partida. Mantente atento a este chat.',
  ].join('\n')
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message)
}

export function soloWhatsAppAction(room, person, access) {
  return hasSavedAccess(room, access)
    ? { label: 'Enviar acceso', href: soloAccessLink(room, person, access) }
    : { label: 'Confirmar inscripción', href: soloConfirmationLink(room, person) }
}
import { prizeYapePhone } from './soloPhones.js'


export function soloPaymentNoticeLink(room, person, payment) {
  const phone = whatsappPhone(person?.whatsapp)
  const yape = prizeYapePhone(person)
  const amount = Number(payment?.amount)
  if (!phone || !yape || !room?.id || person?.room_id !== room.id
    || payment?.registration_id !== person?.id || payment?.kind !== 'reward'
    || !payment.paid_at || !Number.isFinite(amount) || amount <= 0) return null
  const message = [
    person.nickname + ', ¡tu premio de «' + room.name + '» ya fue pagado! ✓',
    '', 'Importe: S/ ' + amount.toFixed(2),
    'Yape para premios registrado: ' + yape,
    '', 'Revisa tu Yape para confirmar que recibiste el depósito.',
    '', '¡Gracias por participar y confiar en RAGNAROK! Te esperamos en la próxima partida.',
  ].join('\n')
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message)
}
