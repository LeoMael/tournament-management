// Generación de grupos y llaves. Solo lógica pura (sin Supabase).

export function shuffle(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    const j = buf[0] % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Reparte equipos barajados en N grupos de forma pareja.
export function drawGroups(teamIds, groupCount) {
  const groups = Array.from({ length: groupCount }, () => [])
  shuffle(teamIds).forEach((id, i) => groups[i % groupCount].push(id))
  return groups
}

// Round-robin (método del círculo). Devuelve [{round, a, b}].
export function roundRobin(teamIds) {
  const teams = [...teamIds]
  if (teams.length % 2) teams.push(null)
  const n = teams.length
  const out = []
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i]
      const b = teams[n - 1 - i]
      if (a && b) out.push({ round: r + 1, a, b })
    }
    teams.splice(1, 0, teams.pop())
  }
  return out
}

function seedOrder(size) {
  let order = [1, 2]
  while (order.length < size) {
    const next = order.length * 2 + 1
    order = order.flatMap((s) => [s, next - s])
  }
  return order
}

// Eliminación simple con byes. Devuelve matches [{round, position, a, b, winner}].
// Los byes se resuelven y el ganador pasa a la ronda siguiente.
export function singleElimination(teamIds, shuffled = true) {
  const teams = shuffled ? shuffle(teamIds) : [...teamIds]
  if (teams.length < 2) return []
  const size = 2 ** Math.ceil(Math.log2(teams.length))
  const slots = seedOrder(size).map((seed) => teams[seed - 1] ?? null)
  const rounds = Math.log2(size)
  const matches = []
  for (let r = 1; r <= rounds; r++) {
    for (let p = 0; p < size / 2 ** r; p++) {
      matches.push({ round: r, position: p, a: null, b: null, winner: null })
    }
  }
  const at = (r, p) => matches.find((m) => m.round === r && m.position === p)
  for (let p = 0; p < size / 2; p++) {
    const m = at(1, p)
    m.a = slots[p * 2]
    m.b = slots[p * 2 + 1]
  }
  // Resolver byes de la ronda 1
  for (let p = 0; p < size / 2; p++) {
    const m = at(1, p)
    if ((m.a && !m.b) || (!m.a && m.b)) {
      m.winner = m.a || m.b
      advance(matches, m)
    }
  }
  return matches
}

// Coloca el ganador de `match` en su slot de la ronda siguiente (mutando la lista).
export function advance(matches, match) {
  const next = matches.find((m) => m.round === match.round + 1 && m.position === Math.floor(match.position / 2))
  if (!next) return null
  if (match.position % 2 === 0) next.a = match.winner
  else next.b = match.winner
  return next
}

export function totalRounds(matches) {
  return matches.reduce((max, m) => Math.max(max, m.round), 0)
}

export function roundName(round, total) {
  const fromEnd = total - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinal'
  if (fromEnd === 2) return 'Cuartos de final'
  return `Ronda ${round}`
}

// Tabla de posiciones de un grupo. 3 pts por victoria.
export function groupStandings(teamIds, matches) {
  const rows = new Map(teamIds.map((id) => [id, { id, played: 0, wins: 0, losses: 0, diff: 0, points: 0 }]))
  for (const m of matches) {
    if (m.status !== 'completed') continue
    const a = rows.get(m.team_a)
    const b = rows.get(m.team_b)
    if (!a || !b) continue
    a.played++; b.played++
    a.diff += (m.score_a ?? 0) - (m.score_b ?? 0)
    b.diff += (m.score_b ?? 0) - (m.score_a ?? 0)
    const winner = m.winner_id === m.team_a ? a : b
    const loser = winner === a ? b : a
    winner.wins++; winner.points += 3
    loser.losses++
  }
  return [...rows.values()].sort((x, y) => y.points - x.points || y.diff - x.diff)
}

export const DEFAULT_PLACEMENT_POINTS = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0]

export function brPoints(placement, kills, config) {
  const table = config?.placement_points ?? DEFAULT_PLACEMENT_POINTS
  const killPts = config?.kill_points ?? 1
  return (table[placement - 1] ?? 0) + kills * killPts
}
