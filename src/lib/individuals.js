export const MLBB_ROLES = ['exp', 'jungle', 'mid', 'gold', 'roam']
export const validGroupUrl = (value) => /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{10,60}$/.test(value || '')
export const validTeamName = (value) => {
  const name = value.trim()
  return !name || (Array.from(name).length >= 3 && Array.from(name).length <= 40 && !Array.from(name).some((char) => char.codePointAt(0) < 32 || char.codePointAt(0) === 127))
}
export const INDIVIDUAL_STATUS = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', grouped: 'Agrupado', registered: 'Inscrito', refund_pending: 'Devolución pendiente', refunded: 'Devuelto', draft: 'Provisional' }
export function groupReady(group, members, starters) {
  if (group.status !== 'draft' || !Number.isInteger(starters) || members.length !== starters || !members.some((m) => m.id === group.captain_id) || !validGroupUrl(group.whatsapp_group_url)) return false
  if (group.game_key === 'mlbb') return members.length === 5 && MLBB_ROLES.every((role) => members.filter((m) => m.assigned_role === role).length === 1)
  return group.game_key === 'ff' && starters === 4 && members.length === 4
}

export const REVIEW_TRANSITIONS = { pending: ['approved', 'rejected', 'refund_pending'], approved: ['rejected', 'refund_pending'], rejected: ['refund_pending'], refund_pending: ['refunded'] }
