import { FF_ROOM_KINDS } from './ffRooms.js'

export function ffResultPayload(kind, people, drafts, saved) {
  return people.filter((p) => p.status === 'approved').map((p) => {
    const row = drafts[p.id] ?? saved.find((s) => s.registration_id === p.id)
    if (!row) throw new Error(`Falta completar el slot #${p.slot}.`)
    if (row.reviewRequired) throw new Error(`Confirma la revisión pendiente del slot #${p.slot}.`)
    const integer = (value, max, label) => {
      if (!/^[0-9]+$/.test(String(value)) || Number(value) > max) throw new Error(`Revisa ${label} del slot #${p.slot}.`)
      return Number(value)
    }
    const placement = row.placement === '' || row.placement == null ? null : integer(row.placement, FF_ROOM_KINDS[kind].maxCapacity, 'la posición')
    if (placement === 0 || (kind !== 'duo_kills' && placement == null)) throw new Error(`Indica la posición del slot #${p.slot}.`)
    return { registration_id: p.id, placement, kills_1: integer(kind !== 'duo_kills' && row.kills_1 === '' ? 0 : row.kills_1, 1000, 'las kills'), kills_2: kind === 'solo_top' ? 0 : integer(kind === 'duo_top' && row.kills_2 === '' ? 0 : row.kills_2, 1000, 'las kills del segundo jugador'), booyah: placement == null ? !!row.booyah : placement === 1 }
  })
}

export function ffEarnings(kind, room, prizes, result) {
  if (!result) return null
  if (kind === 'duo_kills') return (Number(result.kills_1 || 0) + Number(result.kills_2 || 0)) * Number(room.kill_reward) + (result.booyah ? Number(room.booyah_reward) : 0)
  return Number(prizes.find((p) => p.place === Number(result.placement))?.amount ?? 0)
}

export function ffPaymentTotals(payments) {
  const sum = (concept, paid) => payments.filter((p) => p.concept === concept && !!p.paid_at === paid).reduce((total, p) => total + Math.round(Number(p.amount) * 100), 0) / 100
  return { pending: sum('reward', false), paid: sum('reward', true), refundsPending: sum('refund', false), refundsPaid: sum('refund', true) }
}
