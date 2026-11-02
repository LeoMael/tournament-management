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

// Reglamento de Free Fire: 1.º 12 pts, 2.º 9, 3.º 8, … 9.º 2 y del 10.º al 12.º 1 pt; +1 por kill.
export const DEFAULT_PLACEMENT_POINTS = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1]

export function brPoints(placement, kills, config) {
  const table = config?.placement_points ?? DEFAULT_PLACEMENT_POINTS
  const killPts = config?.kill_points ?? 1
  return (table[placement - 1] ?? 0) + kills * killPts
}

// Cruce sin rival (bye): tiene un solo equipo, que pasa solo a la siguiente ronda.
export const isBye = (m) => m.status === 'completed' && Boolean(m.winner_id) && !m.team_a !== !m.team_b
// Cruce sin ningún equipo (los dos lados vacíos): no se juega y no manda a nadie a la siguiente ronda.
export const isDead = (m) => m.status === 'completed' && !m.winner_id && !m.team_a && !m.team_b

// Numera los cruces reales (sin byes) por ronda y posición: M1, M2…
export function numberMatches(matches) {
  const map = new Map()
  let n = 0
  ;[...matches].sort((a, b) => a.round - b.round || a.position - b.position).forEach((m) => {
    if (!isBye(m) && !isDead(m)) map.set(m.id, ++n)
  })
  return map
}

// Texto de un cupo vacío: "Ganador M3" (el cruce que lo alimenta) o "Por definir".
export function pendingLabel(match, side, matches, numbers) {
  if (match.round === 1) return 'Por definir'
  const feeder = matches.find((m) => m.round === match.round - 1 && m.position === match.position * 2 + (side === 'a' ? 0 : 1))
  const n = feeder && numbers.get(feeder.id)
  if (feeder && isDead(feeder)) return 'Sin rival'
  return n ? `Ganador M${n}` : 'Por definir'
}

// Formato sugerido por ronda: las primeras a BO1 y las últimas (semifinal y final) a BO3.
export const defaultRoundBo = (index, rounds) => (index >= rounds - 2 && rounds >= 2 ? 3 : rounds === 1 ? 3 : 1)

// Vista previa de lo que generaría una fase con `n` equipos (sin crear nada).
export function previewStage(type, n, config, names = null) {
  if (type === 'groups') {
    const g = Math.max(1, Math.floor(Number(config.groups) || 1))
    const sizes = Array.from({ length: g }, (_, i) => Math.floor(n / g) + (i < n % g ? 1 : 0))
    const matches = sizes.reduce((sum, s) => sum + (s * (s - 1)) / 2, 0)
    const qualify = Math.max(1, Math.floor(Number(config.qualify_per_group) || 0))
    const advancing = sizes.reduce((sum, s) => sum + Math.min(qualify, s), 0)
    return { kind: 'groups', sizes, matches, qualify, advancing, valid: n >= 2 && g <= Math.floor(n / 2) }
  }
  if (type === 'single_elim') {
    if (n < 2) return { kind: 'single_elim', valid: false }
    const size = 2 ** Math.ceil(Math.log2(n))
    const byes = size - n
    const rounds = Math.log2(size)
    const order = seedOrder(size)
    // Esquema de la llave: cada cruce con sus dos cupos nombrados (Equipo 3, Bye, Ganador M2…).
    const seedName = (seed) => names?.[seed - 1] ?? `Equipo ${seed}`
    let number = 0
    const columns = []
    for (let r = 1; r <= rounds; r++) {
      const boxes = []
      for (let p = 0; p < size / 2 ** r; p++) {
        if (r === 1) {
          const sa = order[p * 2]
          const sb = order[p * 2 + 1]
          const bye = sa > n || sb > n
          boxes.push({ key: `1-${p}`, bye, number: bye ? null : ++number, a: sa > n ? 'Bye' : seedName(sa), b: sb > n ? 'Bye' : seedName(sb) })
        } else {
          const feed = (k) => {
            const f = columns[r - 2].boxes[p * 2 + k]
            return f.bye ? (f.a === 'Bye' ? f.b : f.a) : `Ganador M${f.number}`
          }
          boxes.push({ key: `${r}-${p}`, bye: false, number: ++number, a: feed(0), b: feed(1) })
        }
      }
      columns.push({ round: r, boxes })
    }
    return { kind: 'single_elim', size, byes, rounds, columns, matches: number, valid: true }
  }
  const lobbies = Math.floor(Number(config.lobbies) || 0)
  return { kind: 'battle_royale', lobbies, valid: n >= 2 && lobbies >= 1 && lobbies <= 20 }
}

// Clasificados de una fase de grupos: los `perGroup` mejores de cada grupo (puntos, luego diferencia).
// `tie` marca a quienes empatan en el corte para que el organizador decida a mano.
export function groupQualifiers(groups, groupTeams, matches, perGroup) {
  const out = []
  for (const g of groups) {
    const ids = groupTeams.filter((x) => x.group_id === g.id).map((x) => x.registration_id)
    const rows = groupStandings(ids, matches.filter((m) => m.group_id === g.id))
    const cut = rows[perGroup - 1]
    const after = rows[perGroup]
    const tie = Boolean(cut && after && cut.points === after.points && cut.diff === after.diff)
    rows.forEach((r, i) => out.push({
      id: r.id, group: g.name, rank: i + 1, points: r.points, diff: r.diff,
      qualified: i < perGroup, tie: tie && (i === perGroup - 1 || i === perGroup),
    }))
  }
  return out
}

// Orden de siembra para la llave: primeros de cada grupo, luego segundos, etc., evitando
// en lo posible que en la primera ronda se enfrenten dos equipos del mismo grupo.
export function crossSeed(entries) {
  const list = [...entries].sort((a, b) => a.rank - b.rank || a.group.localeCompare(b.group))
  const n = list.length
  if (n >= 4) {
    const size = 2 ** Math.ceil(Math.log2(n))
    const order = seedOrder(size)
    const pairs = []
    for (let i = 0; i < size; i += 2) pairs.push([order[i] - 1, order[i + 1] - 1])
    const clash = (i, j) => i < n && j < n && list[i].group === list[j].group
    for (const p of pairs) {
      if (!clash(p[0], p[1])) continue
      const low = Math.max(p[0], p[1])
      const high = p[0] === low ? p[1] : p[0]
      for (const q of pairs) {
        if (q === p) continue
        const swapWith = q.find((i) => i < n && i !== low && list[i].rank === list[low].rank)
        if (swapWith === undefined) continue
        const other = q[0] === swapWith ? q[1] : q[0]
        if (!clash(high, swapWith) && !clash(other, low)) {
          ;[list[low], list[swapWith]] = [list[swapWith], list[low]]
          break
        }
      }
    }
  }
  return list.map((e) => e.id)
}

// Máximo de clasificados por grupo que tiene sentido: uno menos que el grupo más pequeño (mínimo 1).
export const maxQualify = (n, groups) => Math.max(1, Math.floor(n / Math.max(1, groups)) - 1)

// "Clasifica el primero de cada grupo" / "Clasifican los 2 primeros de cada grupo".
export const qualifyText = (n) => (n === 1 ? 'Clasifica el primero de cada grupo' : `Clasifican los ${n} primeros de cada grupo`)

// Acomoda la llave tras un cambio (emparejamientos o un resultado): pasa a cada cruce los ganadores de
// los anteriores y resuelve solo los byes en cadena. Un cruce con un equipo y el otro lado sin rival pasa
// directo; uno con los dos lados vacíos queda "sin equipos". Los cruces ya jugados (con marcador) no se tocan.
export function settleBracket(matches) {
  const list = matches.map((m) => ({ ...m }))
  const at = (round, position) => list.find((m) => m.round === round && m.position === position)
  const total = list.reduce((max, m) => Math.max(max, m.round), 0)
  for (let r = 1; r <= total; r++) {
    for (const m of list.filter((x) => x.round === r).sort((a, b) => a.position - b.position)) {
      let deadA
      let deadB
      if (r === 1) {
        deadA = !m.team_a
        deadB = !m.team_b
      } else {
        const fa = at(r - 1, m.position * 2)
        const fb = at(r - 1, m.position * 2 + 1)
        m.team_a = fa?.winner_id ?? null
        m.team_b = fb?.winner_id ?? null
        deadA = Boolean(fa) && isDead(fa)
        deadB = Boolean(fb) && isDead(fb)
      }
      if (m.score_a !== null && m.score_a !== undefined) continue // ya jugado
      const hasA = Boolean(m.team_a)
      const hasB = Boolean(m.team_b)
      m.score_a = null
      m.score_b = null
      m.winner_id = null
      m.status = 'scheduled'
      if (!hasA && !hasB) {
        if (deadA && deadB) m.status = 'completed'
      } else if (hasA !== hasB && (hasA ? deadB : deadA)) {
        m.status = 'completed'
        m.winner_id = m.team_a ?? m.team_b
      }
    }
  }
  return list
}

// Llave "en borrador" mientras se editan los emparejamientos: aplica los lugares elegidos a la ronda 1
// y recalcula todo lo demás, sin tocar la base. `slots` = [a1, b1, a2, b2, …] (null = lugar vacío).
export function draftBracket(matches, slots) {
  const blank = { status: 'scheduled', winner_id: null, score_a: null, score_b: null }
  return settleBracket(matches.map((m) => (m.round === 1
    ? { ...m, ...blank, team_a: slots[m.position * 2] ?? null, team_b: slots[m.position * 2 + 1] ?? null }
    : { ...m, ...blank, team_a: null, team_b: null })))
}

// Una sala de Free Fire admite hasta 12 escuadras. Con más equipos hacen falta varias salas.
export const ROOM_SIZE = 12
export const roomsNeeded = (teamCount) => Math.max(1, Math.ceil(teamCount / ROOM_SIZE))

// Reparte equipos al azar y por igual en `rooms` salas: { id: sala }.
export function distributeRooms(ids, rooms) {
  const out = {}
  shuffle(ids).forEach((id, i) => { out[id] = (i % rooms) + 1 })
  return out
}

// Número fijo de cada equipo dentro de su sala (1…12): es su identificación y no cambia con la clasificación.
// Conserva los guardados (válidos y sin repetir) y asigna a los demás el menor número libre, por orden alfabético.
export function resolveSlots(teams, roomOf, slotOf = {}) {
  const out = {}
  const byRoom = new Map()
  teams.forEach((t) => {
    const room = roomOf(t.id)
    if (!byRoom.has(room)) byRoom.set(room, [])
    byRoom.get(room).push(t)
  })
  for (const list of byRoom.values()) {
    const used = new Set()
    list.forEach((t) => {
      const n = slotOf?.[t.id]
      if (Number.isInteger(n) && n >= 1 && !used.has(n)) { out[t.id] = n; used.add(n) }
    })
    let next = 1
    ;[...list].sort((a, b) => a.team_name.localeCompare(b.team_name)).forEach((t) => {
      if (out[t.id]) return
      while (used.has(next)) next++
      out[t.id] = next
      used.add(next)
    })
  }
  return out
}

// Reparte `total` equipos en `rooms` salas lo más parejo posible: [12, 12], [9, 8, 8]…
export const equalSizes = (total, rooms) => Array.from({ length: rooms }, (_, i) => Math.floor(total / rooms) + (i < total % rooms ? 1 : 0))

// Reparte al azar los equipos en salas con los tamaños dados: { id: sala }.
export function distributeBySizes(ids, sizes) {
  const out = {}
  const shuffled = shuffle(ids)
  let at = 0
  sizes.forEach((size, i) => { shuffled.slice(at, at + size).forEach((id) => { out[id] = i + 1 }); at += size })
  return out
}
