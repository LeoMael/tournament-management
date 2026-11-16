import test from 'node:test'
import assert from 'node:assert/strict'
import { ffResultPayload, ffEarnings, ffPaymentTotals } from '../src/lib/ffRoomResults.js'

const people = [{ id: 'a', slot: 1, status: 'approved' }, { id: 'b', slot: 2, status: 'approved' }, { id: 'c', status: 'pending' }]
test('Dúo guarda ambas kills, conserva ceros y exige todos los aprobados', () => {
  const drafts = { a: { placement: '1', kills_1: '2', kills_2: '3', booyah: false }, b: { placement: '2', kills_1: '0', kills_2: '0', booyah: false } }
  const payload = ffResultPayload('duo_kills', people, drafts, [])
  assert.equal(payload.length, 2)
  assert.equal(payload[0].booyah, true)
  assert.equal(payload[1].kills_1, 0)
  assert.equal(ffEarnings('duo_kills', { kill_reward: 0.5, booyah_reward: 5 }, [], payload[0]), 7.5)
  assert.throws(() => ffResultPayload('duo_kills', people, { a: drafts.a }, []), /slot #2/)
  assert.throws(() => ffResultPayload('duo_kills', people, { ...drafts, b: { ...drafts.b, kills_2: '' } }, []), /segundo jugador/)
})
test('Top usa puesto, nunca kills, y rechaza posiciones vacías', () => {
  const prizes = [{ place: 1, amount: 100 }, { place: 2, amount: 50 }]
  assert.equal(ffEarnings('solo_top', {}, prizes, { placement: 1, kills_1: 999 }), 100)
  assert.equal(ffEarnings('duo_top', {}, prizes, { placement: 3, kills_1: 999 }), 0)
  assert.throws(() => ffResultPayload('solo_top', people, { a: { placement: '', kills_1: 0 } }, []), /posición/)
  const rows = ffResultPayload('solo_top', people, { a: { placement: '1', kills_1: 0 } }, [{ registration_id: 'b', placement: 2, kills_1: 1 }])
  assert.equal(rows[1].kills_2, 0)
})
test('Totales separan premios de devoluciones y suman centavos', () => {
  const rows = [
    { concept: 'reward', amount: 0.1, paid_at: 'fecha' }, { concept: 'reward', amount: 0.2, paid_at: 'fecha' },
    { concept: 'reward', amount: 7.5 }, { concept: 'refund', amount: 4 }, { concept: 'refund', amount: 2, paid_at: 'fecha' },
  ]
  assert.deepEqual(ffPaymentTotals(rows), { paid: 0.3, pending: 7.5, refundsPending: 4, refundsPaid: 2 })
})
