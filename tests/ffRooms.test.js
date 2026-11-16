import test from 'node:test'
import assert from 'node:assert/strict'
import { FF_ROOM_KINDS, ffRoomDraft, ffParticipantName } from '../src/lib/ffRooms.js'

const values = { name: ' Sala prueba ', capacity: '48', entry_price: '2.50', scheduled_at: '2026-11-29T19:00:00-05:00', closes_at: '2026-11-29T18:30:00-05:00', top_prizes: ['100', '60', '40', '20'], kill_reward: '1.25', booyah_reward: '10' }

test('Solo Top envía importes por posición al contrato preparado en la 030', () => {
  const payload = ffRoomDraft('solo_top', values)
  assert.equal(FF_ROOM_KINDS.solo_top.draftRpc, 'manage_solo_top_room_draft')
  assert.deepEqual(payload.top_prizes, [100, 60, 40, 20])
  assert.equal(payload.capacity, 48)
  assert.equal(payload.entry_price, 2.5)
  assert.equal(payload.name, 'Sala prueba')
  assert.equal(Object.hasOwn(payload, 'kill_reward'), false)
})
test('Dúo cuenta parejas y diferencia premios fijos de kills', () => {
  const top = ffRoomDraft('duo_top', { ...values, capacity: '24' })
  assert.equal(top.mode, 'top')
  assert.equal(top.kill_reward, 0)
  assert.equal(top.booyah_reward, 0)
  const kills = ffRoomDraft('duo_kills', { ...values, capacity: '24' })
  assert.deepEqual(kills.top_prizes, [])
  assert.equal(kills.kill_reward, 1.25)
  assert.equal(kills.booyah_reward, 10)
  assert.equal(ffParticipantName({ nickname_1: 'Æ & uno', nickname_2: 'Dos | ñ' }), 'Æ & uno / Dos | ñ')
})
test('rechaza cupos, importes y fechas inválidos y protege la ruta de Solo por kills', () => {
  assert.throws(() => ffRoomDraft('solo_kills', values))
  for (const patch of [{ capacity: 1 }, { capacity: 101 }, { capacity: 2.5 }, { entry_price: -1 }, { entry_price: '1.001' }, { name: ' ' }, { closes_at: 'invalid' }, { top_prizes: [] }, { capacity: 2 }]) assert.throws(() => ffRoomDraft('solo_top', { ...values, ...patch }))
  assert.throws(() => ffRoomDraft('duo_kills', { ...values, capacity: 51 }))
})
