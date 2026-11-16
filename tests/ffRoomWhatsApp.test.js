import test from 'node:test'
import assert from 'node:assert/strict'
import { ffPreparedWhatsAppLink, ffPaymentNoticeLink } from '../src/lib/ffRoomWhatsApp.js'

const expected = { room_id: 'r', room_kind: 'duo_kills', edition_id: 'e', registration_id: 'a', action: 'confirmation' }
const data = { ...expected, name: 'Sala prueba', scheduled_at: '2026-11-28T19:00:00-05:00', status: 'open', slot: 7, nickname_1: 'Jugador A', nickname_2: 'Jugador B', whatsapp: '930475802' }
test('confirmación y acceso usan contacto, ambos integrantes y slot destacado antes de la sala', () => {
  const confirm = ffPreparedWhatsAppLink(data, expected)
  assert.match(confirm, /wa.me\/51930475802/)
  const text = decodeURIComponent(confirm)
  assert.match(text, /Jugador A \/ Jugador B/)
  assert.match(text, /\*TU SLOT ASIGNADO: 07\*/)
  assert.match(text, /aprobada. ✓/)
  assert.ok(!text.includes('ID:'))
  const access = decodeURIComponent(ffPreparedWhatsAppLink({ ...data, action: 'access', game_room_id: '12345', room_password: 'abcd' }, { ...expected, action: 'access' }))
  assert.ok(access.indexOf('TU SLOT') < access.indexOf('Sala:'))
  assert.match(access, /Contraseña: abcd/)
  assert.match(access, /Ambos integrantes/)
})
test('no prepara mensajes ajenos, finalizados, sin acceso, sin slot o teléfono', () => {
  for (const bad of [{ room_id: 'otro' }, { room_kind: 'solo_top' }, { edition_id: 'otro' }, { registration_id: 'otro' }, { slot: 0 }, { status: 'finished' }, { whatsapp: '' }, { action: 'otro' }]) assert.equal(ffPreparedWhatsAppLink({ ...data, ...bad }, expected), null)
  assert.equal(ffPreparedWhatsAppLink({ ...data, action: 'access' }, { ...expected, action: 'access' }), null)
})
test('aviso pagado contacta WhatsApp actual y muestra el Yape histórico del pago', () => {
  const room = { id: 'r', edition_id: 'e', name: 'Premio' }
  const person = { id: 'a', room_kind: 'duo_top', room_id: 'r', edition_id: 'e', nickname_1: 'A', nickname_2: 'B', whatsapp: '930475802', prize_yape_phone: '999999999' }
  const paid = { id: 'p', room_kind: 'duo_top', room_id: 'r', edition_id: 'e', registration_id: 'a', concept: 'reward', amount: '100', paid_at: 'fecha', paid_phone: '988888888' }
  const href = decodeURIComponent(ffPaymentNoticeLink('duo_top', room, person, paid))
  assert.match(href, /51930475802/)
  assert.match(href, /988888888/)
  assert.ok(!href.includes('999999999'))
  for (const bad of [{ concept: 'refund' }, { paid_at: null }, { amount: 0 }, { registration_id: 'otro' }, { room_id: 'otra' }, { edition_id: 'otra' }, { paid_phone: null }]) assert.equal(ffPaymentNoticeLink('duo_top', room, person, { ...paid, ...bad }), null)
})
