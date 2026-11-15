import test from 'node:test'
import assert from 'node:assert/strict'
import { squadAiPrompt, squadImportTemplate, parseSquadResultImport, squadImportedDraft } from '../src/lib/squadResultImport.js'

const context = {
  stage: { id: 'phase-a', edition_id: 'edition-a', game_key: 'ff', type: 'battle_royale', name: 'Semifinal', config: { rooms: 2, placement_points: [20, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0], kill_points: 2 } },
  match: { id: 'match-a', stage_id: 'phase-a', round: 2 }, room: 1,
  teams: [
    { id: 'team-b', slot: 2, name: 'Equipo | B', whatsapp: '999999999', players: [{ nickname: 'Nick "B"', is_substitute: false }] },
    { id: 'team-a', slot: 1, name: 'Equipo A', captain_name: 'Privado', players: [{ nickname: 'Nick ☆', is_substitute: false }, { nickname: 'Suplente', is_substitute: true }] },
  ],
}
const completed = () => {
  const payload = squadImportTemplate(context)
  payload.results = payload.results.map((r, i) => ({ ...r, names_read: [r.players[0].nickname], placement: i + 1, kills: i === 0 ? 3 : 0, status: 'verified', source: 'Captura 1', notes: 'Total explícito de la escuadra' }))
  return payload
}
const parse = (payload, current = context) => parseSquadResultImport(JSON.stringify(payload), current)

test('prompt de escuadras conserva reglas, titulares y suplentes, sin dinero ni datos de contacto', () => {
  const prompt = squadAiPrompt(context)
  const template = JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```/)[1])
  assert.equal(template.mode, 'ff_squads')
  assert.equal(template.match_id, 'match-a')
  assert.equal(template.room, 1)
  assert.equal(template.kill_points, 2)
  assert.equal(template.results[0].players[1].substitute, true)
  assert.ok(!prompt.includes('999999999'))
  assert.ok(!prompt.includes('Privado'))
  assert.ok(prompt.includes('No calcules soles'))
  assert.ok(prompt.includes('no dupliques'))
})

test('calcula puntos con las reglas actuales y usa puesto de escuadra, sin cambiar el slot', () => {
  const payload = completed(), snapshot = structuredClone(payload)
  const rows = parse(payload)
  assert.equal(rows[0].points, 26)
  assert.equal(rows[1].points, 10)
  assert.equal(rows[0].slot, 1)
  assert.deepEqual(squadImportedDraft(rows).placements, { 'team-a': 1, 'team-b': 2 })
  assert.deepEqual(payload, snapshot)
  const defaults = { ...context, stage: { ...context.stage, config: {} } }
  const empty = squadImportTemplate(defaults)
  assert.equal(empty.placement_points[0], 12)
  assert.equal(empty.kill_points, 1)
})

test('pendientes permanecen vacíos y no se transforman en cero kills ni puestos inventados', () => {
  const payload = completed()
  Object.assign(payload.results[1], { status: 'unverified', kills: null, placement: null, names_read: [], notes: 'Falta evidencia' })
  const rows = parse(payload), draft = squadImportedDraft(rows)
  assert.equal(rows[1].points, null)
  assert.equal(draft.placements['team-b'], '')
  assert.equal(draft.kills['team-b'], '')
  assert.equal(draft.pending['team-b'], true)
  assert.equal(draft.pending['team-a'], false)
})

test('bloquea mezclar salas, fases, partidas, edición, reglas y plantillas de Solo o MLBB', () => {
  for (const patch of [{ room: 2 }, { match_id: 'other' }, { stage_id: 'other' }, { edition_id: 'other' }, { mode: 'solo' }, { kill_points: 1 }, { placement_points: [99] }]) assert.throws(() => parse({ ...completed(), ...patch }))
  assert.throws(() => squadImportTemplate({ ...context, stage: { ...context.stage, game_key: 'mlbb' } }))
  assert.throws(() => squadImportTemplate({ ...context, match: { ...context.match, stage_id: 'otro' } }))
})

test('rechaza equipo ajeno, duplicado, puesto repetido, integrante cambiado y datos inválidos', () => {
  for (const patch of [{ registration_id: 'ajeno' }, { slot: 99 }, { team_name: 'cambiado' }, { placement: 1.5 }, { placement: 13 }, { kills: -1 }, { kills: '3' }, { kills: 100 }, { status: 'discard' }, { names_read: [] }, { source: '' }, { players: [] }]) {
    const payload = completed(); Object.assign(payload.results[0], patch); assert.throws(() => parse(payload))
  }
  const repeated = completed(); repeated.results[1].placement = 1; assert.throws(() => parse(repeated), /repetidos/)
  const duplicate = completed(); duplicate.results[1] = duplicate.results[0]; assert.throws(() => parse(duplicate))
  const missing = completed(); missing.results.pop(); assert.throws(() => parse(missing))
  assert.throws(() => parseSquadResultImport('null', context))
  assert.throws(() => parseSquadResultImport('Tabla sin json', context))
})
