export const FF_ROOM_KINDS = {
  solo_kills: { label: 'Solo por kills', participation: 'solo', mode: 'kills' },
  solo_top: { label: 'Solo por Top', participation: 'solo', mode: 'top', table: 'solo_top_rooms', prizes: 'solo_top_room_prizes', draftRpc: 'manage_solo_top_room_draft', maxCapacity: 100 },
  duo_kills: { label: 'Dúo por kills', participation: 'duo', mode: 'kills', table: 'duo_rooms', prizes: 'duo_room_prizes', draftRpc: 'manage_duo_room_draft', maxCapacity: 50 },
  duo_top: { label: 'Dúo por Top', participation: 'duo', mode: 'top', table: 'duo_rooms', prizes: 'duo_room_prizes', draftRpc: 'manage_duo_room_draft', maxCapacity: 50 },
}

export const ffParticipantName = (person) => [person.nickname_1, person.nickname_2].filter(Boolean).join(' / ')

function amount(value, max) {
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(String(value)) || Number(value) > max) {
    throw new Error('Revisa los importes. Usa números no negativos con hasta dos decimales.')
  }
  return Number(value)
}

export function ffRoomDraft(kind, values) {
  const config = FF_ROOM_KINDS[kind]
  if (!config?.draftRpc) throw new Error('Selecciona una modalidad de sala válida.')
  const capacity = Number(values.capacity)
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > config.maxCapacity) throw new Error('Revisa el cupo de la sala.')
  const name = values.name.trim()
  if (name.length < 3 || name.length > 100) throw new Error('El nombre debe tener entre 3 y 100 caracteres.')
  const scheduled = new Date(values.scheduled_at), closes = new Date(values.closes_at)
  if (!Number.isFinite(scheduled.getTime()) || !Number.isFinite(closes.getTime()) || closes > scheduled) throw new Error('El cierre debe ser anterior o igual a la partida.')
  const topPrizes = config.mode === 'top' ? values.top_prizes.map((value) => amount(value, 1000000)) : []
  if (config.mode === 'top' && (!topPrizes.length || topPrizes.length > capacity)) throw new Error('Revisa la cantidad de puestos premiados.')
  const payload = { name, capacity, entry_price: amount(values.entry_price, 10000), scheduled_at: values.scheduled_at, closes_at: values.closes_at, top_prizes: topPrizes }
  if (config.participation === 'duo') {
    payload.mode = config.mode
    payload.kill_reward = config.mode === 'kills' ? amount(values.kill_reward, 10000) : 0
    payload.booyah_reward = config.mode === 'kills' ? amount(values.booyah_reward, 1000000) : 0
  }
  return payload
}
