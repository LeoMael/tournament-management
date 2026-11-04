// Estado de cada sala en una partida Battle Royale. Las salas pueden terminar a horas distintas, así que
// cada una tiene su propio estado:
//   'done' = terminada (todos sus equipos tienen puesto, o se marcó como terminada a mano)
//   'live' = en curso (ya hay resultados, pero faltan equipos)
//   'idle' = pendiente (sin resultados)
// Las marcas manuales se guardan en la configuración de la fase: config.finished = { [partida]: [salas] }.

export const roomOfStage = (stage) => {
  const rooms = Number(stage?.config?.rooms) || 1
  if (rooms <= 1) return () => 1

  const roomOfMap = stage?.config?.room_of || {}
  const counts = Array.from({ length: rooms + 1 }, () => 0)
  Object.values(roomOfMap).forEach((r) => {
    if (r >= 1 && r <= rooms) counts[r]++
  })

  const fallbackCache = new Map()

  return (id) => {
    const saved = roomOfMap[id]
    if (saved && saved >= 1 && saved <= rooms) return saved
    if (fallbackCache.has(id)) return fallbackCache.get(id)

    // Buscar la sala con cupo (< 12) que tenga menos equipos para balancear
    let bestRoom = 1
    let minCount = Infinity
    for (let r = 1; r <= rooms; r++) {
      if (counts[r] < 12 && counts[r] < minCount) {
        minCount = counts[r]
        bestRoom = r
      }
    }
    counts[bestRoom]++
    fallbackCache.set(id, bestRoom)
    return bestRoom
  }
}

export function roomState(stage, matchId, room, results, teams) {
  const roomOf = roomOfStage(stage)
  const total = teams.filter((t) => roomOf(t.id) === room).length
  const placed = results.filter((r) => r.match_id === matchId && roomOf(r.registration_id) === room).length
  const marked = (stage.config?.finished?.[matchId] ?? []).includes(room)
  const state = marked || (total > 0 && placed >= total) ? 'done' : placed > 0 ? 'live' : 'idle'
  return { state, placed, total, marked }
}

// Estado de la partida completa: terminada solo cuando todas sus salas terminaron.
export function lobbyState(stage, matchId, results, teams) {
  const rooms = Number(stage.config?.rooms) || 1
  const states = Array.from({ length: rooms }, (_, i) => roomState(stage, matchId, i + 1, results, teams).state)
  if (states.every((s) => s === 'done')) return 'done'
  return states.some((s) => s !== 'idle') ? 'live' : 'idle'
}

export const STATE_LABEL = { done: 'Terminada', live: 'En curso', idle: 'Pendiente' }
