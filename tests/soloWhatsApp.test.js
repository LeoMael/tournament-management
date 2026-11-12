import test from 'node:test'
import assert from 'node:assert/strict'
import { whatsappPhone, soloAccessLink, soloConfirmationLink, soloWhatsAppAction } from '../src/lib/soloWhatsApp.js'

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
  assert.ok(link.searchParams.get('text').includes(room.name))
  assert.ok(!link.searchParams.get('text').includes('RAGNAROK U-Series'))
})

test('sin acceso guardado prepara confirmación con sala, hora peruana y slot', () => {
  const action = soloWhatsAppAction(room, person, null)
  assert.equal(action.label, 'Confirmar inscripción')
  const link = new URL(action.href)
  assert.equal(link.pathname, '/51987654321')
  const text = link.searchParams.get('text')
  for (const value of [person.nickname, room.name, 'fue aprobada', 'Tu slot: 07', '8:00', 'Perú', 'Mantente atento']) assert.ok(text.includes(value))
  assert.ok(!text.includes('RAGNAROK U-Series'))
  assert.ok(!text.includes('ID:'))
  assert.ok(!text.includes('Contraseña:'))
})

test('solo ID y contraseña completos y guardados de la sala actual activan el envío de acceso', () => {
  const action = soloWhatsAppAction(room, person, access)
  assert.equal(action.label, 'Enviar acceso')
  assert.equal(action.href, soloAccessLink(room, person, access))
  for (const incomplete of [null, {}, { ...access, game_room_id: '' }, { ...access, room_password: '' }, { ...access, room_password: '   ' }, { ...access, room_id: 'room-b' }]) {
    const fallback = soloWhatsAppAction(room, person, incomplete)
    assert.equal(fallback.label, 'Confirmar inscripción')
    assert.equal(fallback.href, soloConfirmationLink(room, person))
    assert.ok(!new URL(fallback.href).searchParams.get('text').includes(access.room_password))
  }
})

test('confirmación respeta bloqueos de estado, aprobación, slot y teléfono', () => {
  for (const status of ['draft', 'finished', 'cancelled']) assert.equal(soloConfirmationLink({ ...room, status }, person), null)
  for (const status of ['pending', 'rejected', 'refunded']) assert.equal(soloConfirmationLink(room, { ...person, status }), null)
  assert.equal(soloConfirmationLink(room, { ...person, slot: null }), null)
  assert.equal(soloConfirmationLink(room, { ...person, whatsapp: 'no' }), null)
  for (const status of ['open', 'closed', 'playing']) assert.ok(soloConfirmationLink({ ...room, status }, person))
})
test('bloquea pendientes, salas terminadas, teléfonos inválidos y acceso de otra sala', () => {
  assert.equal(soloAccessLink(room, { ...person, status: 'pending' }, access), null)
  assert.equal(soloAccessLink({ ...room, status: 'finished' }, person, access), null)
  assert.equal(soloAccessLink(room, person, { ...access, room_id: 'room-b' }), null)
  assert.equal(soloAccessLink(room, { ...person, slot: null }, access), null)
  assert.equal(soloAccessLink(room, { ...person, whatsapp: 'no' }, access), null)
})
