import test from 'node:test'
import assert from 'node:assert/strict'
import { teamConfirmationLink } from '../src/lib/teamWhatsApp.js'

const registration = { status: 'approved', game_key: 'mlbb', team_name: '꧁Team & + ñ꧂', captain_name: 'Capitán + & ñ', captain_whatsapp: '987654321' }

test('confirmación MLBB abre el número del capitán con equipo y juego correctos', () => {
  const link = new URL(teamConfirmationLink(registration))
  assert.equal(link.origin, 'https://wa.me')
  assert.equal(link.pathname, '/51987654321')
  const message = link.searchParams.get('text')
  for (const value of [registration.captain_name, registration.team_name, 'Mobile Legends: Bang Bang', 'fue aprobada']) assert.ok(message.includes(value))
  assert.ok(!message.includes('Contraseña:'))
  assert.ok(!message.includes('Tu slot:'))
  assert.ok(!message.includes('Fecha y hora:'))
})

test('confirmación Free Fire funciona para equipos y conserva el prefijo internacional', () => {
  const link = new URL(teamConfirmationLink({ ...registration, game_key: 'ff', captain_whatsapp: '+57 3001234567' }))
  assert.equal(link.pathname, '/573001234567')
  assert.ok(link.searchParams.get('text').includes('Juego: Free Fire'))
  assert.ok(!link.searchParams.get('text').includes('Mobile Legends'))
})

test('no prepara confirmaciones para no aprobados, juegos ajenos o datos inválidos', () => {
  for (const status of ['pending', 'rejected', 'withdrawn']) assert.equal(teamConfirmationLink({ ...registration, status }), null)
  assert.equal(teamConfirmationLink({ ...registration, game_key: 'other' }), null)
  assert.equal(teamConfirmationLink({ ...registration, captain_whatsapp: 'no válido' }), null)
  assert.equal(teamConfirmationLink({ ...registration, captain_name: '   ' }), null)
  assert.equal(teamConfirmationLink({ ...registration, team_name: '' }), null)
})
