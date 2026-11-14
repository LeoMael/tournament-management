import test from 'node:test'
import assert from 'node:assert/strict'
import { prizeYapePhone } from '../src/lib/soloPhones.js'
import { soloPhones } from '../src/lib/soloExports.js'
import { soloAccessLink, soloConfirmationLink } from '../src/lib/soloWhatsApp.js'

test('premios, mensajes y Excel usan el teléfono correspondiente, aunque sean diferentes', () => {
  const person = { id: 'a', status: 'approved', slot: 1, nickname: 'Jugador', whatsapp: '987654321', prize_yape_phone: '912345678' }
  const room = { id: 'r', status: 'open', scheduled_at: '2026-11-20T20:00:00Z', name: 'Sala' }
  assert.equal(prizeYapePhone(person), '912345678')
  assert.deepEqual(soloPhones([person]), ['987654321'])
  assert.equal(new URL(soloConfirmationLink(room, person)).pathname, '/51987654321')
  assert.equal(new URL(soloAccessLink(room, person, { room_id: 'r', game_room_id: '123', room_password: 'abc' })).pathname, '/51987654321')
  assert.equal(prizeYapePhone({ whatsapp: person.whatsapp }), null)
  assert.equal(prizeYapePhone({ prize_yape_phone: '' }), null)
  assert.equal(prizeYapePhone({ prize_yape_phone: 'invalid' }), null)
})
