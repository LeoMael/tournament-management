import test from 'node:test'
import assert from 'node:assert/strict'
import { soloRoster, soloPhones, soloAiPrompt } from '../src/lib/soloExports.js'

const people = [
  { id: 'b', status: 'approved', slot: 2, nickname: '꧁Nightツ꧂', whatsapp: '099999999', full_name: 'Privado Dos' },
  { id: 'a', status: 'approved', slot: 1, nickname: 'ＦＥＮＩＸ ✦', whatsapp: '51987654321', full_name: 'Privado Uno' },
  { id: 'c', status: 'pending', nickname: 'Pendiente', whatsapp: '999999998' },
  { id: 'd', status: 'rejected', nickname: 'Rechazado', whatsapp: '999999997' },
  { id: 'e', status: 'approved', slot: 3, nickname: 'Otro', whatsapp: '51987654321' },
]

test('exporta solo aprobados, ordenados por slot sin modificar la nómina original', () => {
  assert.deepEqual(soloRoster(people).map((p) => p.id), ['a', 'b', 'e'])
  assert.equal(people[0].id, 'b')
})

test('teléfonos únicos conservan ceros iniciales y prefijos registrados', () => {
  assert.deepEqual(soloPhones(people), ['51987654321', '099999999'])
  assert.deepEqual(soloPhones([]), [])
})

test('prompt incluye nicknames exactos y condiciones económicas, sin datos personales', () => {
  const prompt = soloAiPrompt({ name: 'Sala oficial', kill_reward: '1.25', booyah_reward: '10.50' }, people)
  assert.ok(prompt.includes('Slot 1 | "ＦＥＮＩＸ ✦"'))
  assert.ok(prompt.includes('Slot 2 | "꧁Nightツ꧂"'))
  assert.ok(prompt.includes('S/ 1.25'))
  assert.ok(prompt.includes('S/ 10.50'))
  assert.ok(prompt.includes('3 aprobados'))
  for (const secret of ['51987654321', '099999999', 'Privado Uno', 'Privado Dos', 'Pendiente', 'Rechazado']) {
    assert.ok(!prompt.includes(secret))
  }
  assert.ok(prompt.includes('Por verificar'))
  assert.ok(prompt.includes('No supongas cero kills'))
})
