export function whatsappPhone(value) {
  const raw = String(value ?? '').trim()
  if (!raw || !/^[+\d\s().-]+$/.test(raw) || (raw.includes('+') && !raw.startsWith('+'))) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (!raw.startsWith('+') && /^9\d{8}$/.test(digits)) digits = '51' + digits
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}

export function soloAccessLink(room, person, access) {
  const phone = whatsappPhone(person.whatsapp)
  if (!phone || person.status !== 'approved' || !Number.isInteger(person.slot) || person.slot < 1
    || !['open', 'closed', 'playing'].includes(room.status)
    || access?.room_id !== room.id || !access.game_room_id || !access.room_password) return null
  const time = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(room.scheduled_at))
  const message = [
    'Hola, ' + person.nickname + '. Estos son tus datos de acceso a RAGNAROK U-Series:',
    '', 'Sala: ' + room.name, 'Fecha y hora: ' + time + ' (Perú)',
    'ID: ' + access.game_room_id, 'Contraseña: ' + access.room_password,
    'Tu slot: ' + String(person.slot).padStart(2, '0'),
    '', 'Ubícate en tu slot asignado y evita compartir el acceso.',
  ].join('\n')
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message)
}
