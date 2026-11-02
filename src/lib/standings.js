// Clasificación general por equipo. Solo lógica pura (sin Supabase).
//
// Puntos:
//  - Fase de grupos: 3 por victoria (igual que la tabla de cada grupo).
//  - Battle Royale: suma de los puntos de cada sala (posición + kills).
//  - Eliminación directa: no da puntos; solo cuenta partidos y victorias.
// Los byes (cruce sin rival) no cuentan como partido.

export function computeStandings(teams, stages, matches, results) {
  const stageById = new Map(stages.map((s) => [s.id, s]))
  const rows = new Map(teams.map((team) => [team.id, { team, played: 0, wins: 0, losses: 0, diff: 0, kills: 0, points: 0 }]))

  for (const m of matches) {
    const type = stageById.get(m.stage_id)?.type
    if (!type || type === 'battle_royale') continue
    if (m.status !== 'completed' || !m.team_a || !m.team_b || !m.winner_id) continue
    const a = rows.get(m.team_a)
    const b = rows.get(m.team_b)
    if (!a || !b) continue
    a.played++; b.played++
    a.diff += (m.score_a ?? 0) - (m.score_b ?? 0)
    b.diff += (m.score_b ?? 0) - (m.score_a ?? 0)
    const winner = m.winner_id === m.team_a ? a : b
    const loser = winner === a ? b : a
    winner.wins++
    loser.losses++
    if (type === 'groups') winner.points += 3
  }

  const matchStage = new Map(matches.map((m) => [m.id, m.stage_id]))
  for (const r of results) {
    if (stageById.get(matchStage.get(r.match_id))?.type !== 'battle_royale') continue
    const row = rows.get(r.registration_id)
    if (!row) continue
    row.played++
    row.points += Number(r.points)
    row.kills += r.kills
    if (r.placement === 1) row.wins++
  }

  // Activos primero (por puntos, victorias, diferencia, kills); los retirados al final, sin número.
  const sorted = [...rows.values()].sort((x, y) =>
    (x.team.status === 'withdrawn') - (y.team.status === 'withdrawn')
    || y.points - x.points || y.wins - x.wins || y.diff - x.diff || y.kills - x.kills
    || x.team.team_name.localeCompare(y.team.team_name))
  let rank = 0
  return sorted.map((row) => ({ ...row, rank: row.team.status === 'withdrawn' ? null : ++rank }))
}

// En qué fase está cada equipo (según las fases creadas del juego, en orden):
//  - 'champion'   : ganó la final de la última llave
//  - 'playing'    : sigue en la última fase
//  - 'eliminated' : cayó en una llave (o no clasificó de grupos a una fase posterior)
// Devuelve Map(id -> { tone, label }).
export function teamPhases(teams, stages, matches, results) {
  const ordered = [...stages].sort((a, b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)))
  const out = new Map()
  if (!ordered.length) return out
  const last = ordered.length - 1
  const inStage = ordered.map((s) => {
    const ids = new Set()
    matches.filter((m) => m.stage_id === s.id).forEach((m) => { if (m.team_a) ids.add(m.team_a); if (m.team_b) ids.add(m.team_b) })
    const matchIds = new Set(matches.filter((m) => m.stage_id === s.id).map((m) => m.id))
    results.filter((r) => matchIds.has(r.match_id)).forEach((r) => ids.add(r.registration_id))
    // Fases creadas con "Continuar fase" guardan quiénes participan aunque aún no tengan partidas jugadas.
    ;(s.config?.participants ?? []).forEach((id) => ids.add(id))
    return ids
  })

  for (const t of teams) {
    if (t.status === 'withdrawn') continue
    let idx = -1
    inStage.forEach((ids, i) => { if (ids.has(t.id)) idx = i })
    if (idx === -1) { out.set(t.id, { tone: 'idle', label: 'Sin fase' }); continue }
    const stage = ordered[idx]
    if (idx < last) {
      out.set(t.id, { tone: 'out', label: stage.type === 'single_elim' ? `Eliminado · ${stage.name}` : 'No clasificó' })
      continue
    }
    if (stage.type === 'battle_royale' && stage.config?.champion) {
      out.set(t.id, stage.config.champion === t.id ? { tone: 'champion', label: 'Campeón' } : { tone: 'out', label: `Terminó · ${stage.name}` })
      continue
    }
    if (stage.type === 'single_elim') {
      const mine = matches.filter((m) => m.stage_id === stage.id && (m.team_a === t.id || m.team_b === t.id) && m.team_a && m.team_b)
      const total = Math.max(...matches.filter((m) => m.stage_id === stage.id).map((m) => m.round))
      const lost = mine.find((m) => m.status === 'completed' && m.winner_id && m.winner_id !== t.id)
      if (lost) { out.set(t.id, { tone: 'out', label: `Eliminado · ${roundLabel(lost.round, total)}` }); continue }
      const final = mine.find((m) => m.round === total && m.status === 'completed' && m.winner_id === t.id)
      if (final) { out.set(t.id, { tone: 'champion', label: 'Campeón' }); continue }
    }
    out.set(t.id, { tone: 'playing', label: `En juego · ${stage.name}` })
  }
  return out
}

function roundLabel(round, total) {
  const fromEnd = total - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinal'
  if (fromEnd === 2) return 'Cuartos de final'
  return `Ronda ${round}`
}

// Tabla general de una fase Battle Royale. Desempate (reglamento): puntos, más Booyahs, más kills.
export function battleRoyaleTotals(teams, results) {
  return teams.map((t) => {
    const mine = results.filter((r) => r.registration_id === t.id)
    return {
      id: t.id,
      played: mine.length,
      points: mine.reduce((sum, r) => sum + Number(r.points), 0),
      kills: mine.reduce((sum, r) => sum + r.kills, 0),
      wins: mine.filter((r) => r.placement === 1).length,
    }
  }).sort((a, b) => b.points - a.points || b.wins - a.wins || b.kills - a.kills)
}
