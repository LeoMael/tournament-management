import { whatsappPhone } from './soloWhatsApp.js'

export function squadAccessLink({ stage, match, room, team, slot, access, closed = false }) {
  const phone = whatsappPhone(team?.captain_whatsapp)
  const rooms = Number(stage.config?.rooms) || 1
  const assigned = rooms === 1 ? room === 1 : Number(stage.config?.room_of?.[team?.id]) === room
  if (!phone || !team?.captain_name?.trim() || !team?.team_name?.trim() || closed || stage.game_key !== 'ff' || stage.type !== 'battle_royale' || match.stage_id !== stage.id
    || match.edition_id !== stage.edition_id || team?.edition_id !== stage.edition_id || team?.game_key !== 'ff' || team?.status !== 'approved'
    || match.status === 'completed' || !assigned || !Number.isInteger(slot) || slot < 1 || slot > 12
    || stage.config?.participants && !stage.config.participants.includes(team.id)
    || access?.match_id !== match.id || access?.room_no !== room || !access.game_room_id?.trim() || !access.room_password?.trim()) return null
  const lines = [
    'Hola, ' + team.captain_name + '. Estos son los datos de acceso de tu escuadra:',
    '', '*SLOT DE TU EQUIPO: ' + String(slot).padStart(2, '0') + '*',
    '', 'Equipo: ' + team.team_name, 'Fase: ' + stage.name, 'Partida: ' + match.round, 'Sala: ' + room,
  ]
  if (match.scheduled_at && Number.isFinite(new Date(match.scheduled_at).getTime())) lines.push('Fecha y hora: ' + new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(match.scheduled_at)) + ' (Perú)')
  lines.push('ID: ' + access.game_room_id, 'Contraseña: ' + access.room_password, '', 'Comparte el acceso únicamente con tus integrantes. Toda la escuadra debe ubicarse en el slot asignado.')
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(lines.join('\n'))
}
