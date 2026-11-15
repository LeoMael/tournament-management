import test from 'node:test'
import assert from 'node:assert/strict'
import { squadAccessLink } from '../src/lib/squadWhatsApp.js'

const context = {
  stage: { id: 'stage-a', edition_id: 'edition-a', game_key: 'ff', type: 'battle_royale', name: 'Final', config: { rooms: 2, participants: ['team-a'], room_of: { 'team-a': 2 } } },
  match: { id: 'match-a', stage_id: 'stage-a', edition_id: 'edition-a', round: 3, status: 'scheduled', scheduled_at: '2026-11-16T01:00:00Z' }, room: 2,
  team: { id: 'team-a', edition_id: 'edition-a', game_key: 'ff', status: 'approved', team_name: 'Equipo & +', captain_name: 'Capitán', captain_whatsapp: '987654321', prize_yape_phone: '912345678' }, slot: 4,
  access: { match_id: 'match-a', room_no: 2, game_room_id: '123456', room_password: 'a&+ ñ' },
}
test('acceso de escuadras se dirige al capitán con slot, partida y sala exactos', () => {
  const link = new URL(squadAccessLink(context)), message = link.searchParams.get('text')
  assert.equal(link.pathname, '/51987654321')
  for (const part of ['SLOT DE TU EQUIPO: 04', 'Partida: 3', 'Sala: 2', 'Equipo & +', 'ID: 123456', 'Contraseña: a&+ ñ', 'Perú']) assert.ok(message.includes(part))
  assert.ok(message.indexOf('*SLOT') < message.indexOf('Equipo:'))
})
test('no prepara acceso de otra sala, fase, partida, edición, no aprobados o partidas terminadas', () => {
  for (const patch of [
    { room: 1 }, { closed: true }, { slot: 0 },
    { access: { ...context.access, match_id: 'other' } }, { access: { ...context.access, room_password: '' } },
    { match: { ...context.match, stage_id: 'other' } }, { match: { ...context.match, status: 'completed' } },
    { team: { ...context.team, game_key: 'mlbb' } }, { team: { ...context.team, status: 'pending' } },
    { team: { ...context.team, edition_id: 'other' } }, { team: { ...context.team, captain_whatsapp: 'no' } },
    { stage: { ...context.stage, config: { ...context.stage.config, participants: [] } } },
  ]) assert.equal(squadAccessLink({ ...context, ...patch }), null)
})
test('no inventa fecha si la partida no tiene horario', () => {
  const link = new URL(squadAccessLink({ ...context, match: { ...context.match, scheduled_at: null } }))
  assert.ok(!link.searchParams.get('text').includes('Fecha y hora:'))
})
