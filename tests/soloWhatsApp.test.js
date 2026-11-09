import test from 'node:test'
import assert from 'node:assert/strict'
import { whatsappPhone, soloAccessLink } from '../src/lib/soloWhatsApp.js'

test('normaliza móvil peruano y conserva prefijos internacionales', () => {
  assert.equal(whatsappPhone('987 654 321'), '51987654321')
  assert.equal(whatsappPhone('+51 987-654-321'), '51987654321')
  assert.equal(whatsappPhone('0057 3001234567'), '573001234567')
  assert.equal(whatsappPhone('abc987654321'), null)
  assert.equal(whatsappPhone('123'), null)
})
const room = { id: 'room-a', name: 'Sala & 1', status: 'closed', scheduled_at: '2026-11-10T01:00:00Z' }
const person = { nickname: 'P + & ñ', whatsapp: '987654321', slot: 7, status: 'approved' }
const access = { room_id: 'room-a', game_room_id: '123', room_password: 'a&+# ñ' }
test('mensaje usa slot persistente y codifica caracteres sin alterar el texto', () => {
  const link = new URL(soloAccessLink(room, person, access))
  assert.equal(link.hostname, 'wa.me')
  assert.match(link.searchParams.get('text'), /Tu slot: 07/)
  assert.ok(link.searchParams.get('text').includes('Contraseña: a&+# ñ'))
  assert.ok(link.searchParams.get('text').includes(person.nickname))
})
test('bloquea pendientes, salas terminadas, teléfonos inválidos y acceso de otra sala', () => {
  assert.equal(soloAccessLink(room, { ...person, status: 'pending' }, access), null)
  assert.equal(soloAccessLink({ ...room, status: 'finished' }, person, access), null)
  assert.equal(soloAccessLink(room, person, { ...access, room_id: 'room-b' }), null)
  assert.equal(soloAccessLink(room, { ...person, slot: null }, access), null)
  assert.equal(soloAccessLink(room, { ...person, whatsapp: 'no' }, access), null)
})
