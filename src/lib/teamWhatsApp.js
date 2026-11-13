import { whatsappPhone } from './soloWhatsApp.js'

const GAME_NAMES = { mlbb: 'Mobile Legends: Bang Bang', ff: 'Free Fire' }

export function teamConfirmationLink(registration) {
  if (!registration || registration.status !== 'approved' || !GAME_NAMES[registration.game_key]) return null
  const phone = whatsappPhone(registration.captain_whatsapp)
  if (!phone || !registration.team_name?.trim() || !registration.captain_name?.trim()) return null
  const message = [
    'Hola, ' + registration.captain_name + '. La inscripción de tu equipo fue aprobada. ✓',
    '', 'Equipo: ' + registration.team_name,
    'Juego: ' + GAME_NAMES[registration.game_key],
    '', 'Mantente atento a este chat y al cronograma oficial para conocer los horarios e indicaciones de tus partidas.',
  ].join('\n')
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message)
}
