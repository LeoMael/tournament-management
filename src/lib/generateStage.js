import { supabase } from '../supabaseClient'
import { drawGroups, roundRobin, singleElimination } from './bracket'

// Crea grupos/cruces/partidas de una fase. Por defecto con sorteo aleatorio (al crear y al re-sortear);
// con `ordered`, `ids` ya viene en orden de siembra (se usa al continuar desde una fase de grupos).
export async function generateStage({ stageId, type, ids, config, ordered = false }) {
  const bestOf = Number(config.best_of) || 1
  if (type === 'groups') {
    const drawn = drawGroups(ids, Number(config.groups) || 1)
    const { data: groups, error: gErr } = await supabase.from('groups').insert(
      drawn.map((_, i) => ({ stage_id: stageId, name: `Grupo ${String.fromCharCode(65 + i)}` }))).select()
    if (gErr) throw new Error(gErr.message)
    groups.sort((a, b) => a.name.localeCompare(b.name))
    const links = []
    const matches = []
    drawn.forEach((teamIds, i) => {
      teamIds.forEach((rid) => links.push({ group_id: groups[i].id, registration_id: rid }))
      roundRobin(teamIds).forEach((m, idx) => matches.push({
        stage_id: stageId, group_id: groups[i].id, round: m.round, position: idx, team_a: m.a, team_b: m.b, best_of: bestOf,
      }))
    })
    const r1 = await supabase.from('group_teams').insert(links)
    if (r1.error) throw new Error(r1.error.message)
    if (matches.length) {
      const r2 = await supabase.from('matches').insert(matches)
      if (r2.error) throw new Error(r2.error.message)
    }
  } else if (type === 'single_elim') {
    const rows = singleElimination(ids, !ordered).map((m) => ({
      stage_id: stageId, round: m.round, position: m.position, team_a: m.a, team_b: m.b,
      best_of: Number(config.best_of_by_round?.[m.round - 1]) || bestOf,
      winner_id: m.winner, status: m.winner ? 'completed' : 'scheduled',
    }))
    const r = await supabase.from('matches').insert(rows)
    if (r.error) throw new Error(r.error.message)
  } else {
    const lobbies = Number(config.lobbies)
    if (!Number.isInteger(lobbies) || lobbies < 1 || lobbies > 20) throw new Error('Cantidad de partidas inválida (1–20).')
    const r = await supabase.from('matches').insert(
      Array.from({ length: lobbies }, (_, i) => ({ stage_id: stageId, round: i + 1, position: 0, ...(Number(config.rooms) > 1 ? { rooms: Number(config.rooms) } : {}) })))
    if (r.error) throw new Error(r.error.message)
  }
}
