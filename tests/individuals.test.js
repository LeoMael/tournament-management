import test from 'node:test'
import assert from 'node:assert/strict'
import { groupReady, validGroupUrl, validTeamName, REVIEW_TRANSITIONS } from '../src/lib/individuals.js'
const roles = ['exp', 'jungle', 'mid', 'gold', 'roam']
const players = roles.map((assigned_role, i) => ({ id: String(i), assigned_role }))
const group = { game_key: 'mlbb', status: 'draft', captain_id: '0', whatsapp_group_url: 'https://chat.whatsapp.com/abcdefghij' }
test('exige roster, capitán integrante, URL y roles únicos para MLBB', () => {
  assert.equal(groupReady(group, players, 5), true)
  assert.equal(groupReady(group, players.slice(1), 5), false)
  assert.equal(groupReady({ ...group, captain_id: 'x' }, players, 5), false)
  assert.equal(groupReady(group, players.map((p) => ({ ...p, assigned_role: 'mid' })), 5), false)
  assert.equal(groupReady({ ...group, status: 'registered' }, players, 5), false)
  assert.equal(validGroupUrl('https://chat.whatsapp.com.evil.test/abc'), false)
})
test('Free Fire usa el tamaño configurado', () => {
  assert.equal(groupReady({ ...group, game_key: 'ff' }, players.slice(0, 4), 4), true)
  assert.equal(groupReady({ ...group, game_key: 'ff' }, players.slice(0, 3), 4), false)
  assert.equal(groupReady({ ...group, game_key: 'ff' }, players, 5), false)
})

test('valida nombres y enlaces sin caminos, parámetros ni credenciales', () => {
  assert.equal(validTeamName(''), true)
  assert.equal(validTeamName('AB'), false)
  assert.equal(validTeamName('Equipo válido'), true)
  assert.equal(validTeamName('Nombre\u0001'), false)
  assert.equal(validGroupUrl('https://chat.whatsapp.com/abcdefghij?x=1'), false)
  assert.equal(validGroupUrl('https://user@chat.whatsapp.com/abcdefghij'), false)
  assert.equal(validGroupUrl('https://chat.whatsapp.com/abcdefghij/extra'), false)
})

test('solo permite transiciones de revisión válidas', () => {
  assert.deepEqual(REVIEW_TRANSITIONS.pending, ['approved', 'rejected', 'refund_pending'])
  assert.deepEqual(REVIEW_TRANSITIONS.approved, ['rejected', 'refund_pending'])
  assert.deepEqual(REVIEW_TRANSITIONS.rejected, ['refund_pending'])
  assert.deepEqual(REVIEW_TRANSITIONS.refund_pending, ['refunded'])
  for (const status of ['grouped', 'registered', 'refunded']) assert.equal(REVIEW_TRANSITIONS[status], undefined)
})
