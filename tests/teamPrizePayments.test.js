import test from 'node:test'
import assert from 'node:assert/strict'
import { teamPrizeNoticeLink, teamPrizeTotals } from '../src/lib/teamPrizePayments.js'

const settlement = { id: 'batch', edition_id: 'edition', game_key: 'ff', edition_name: 'Torneo & Final' }
const payment = { settlement_id: 'batch', edition_id: 'edition', registration_id: 'team', place: 1, team_name: 'Wolves & Ñ', prize_yape_phone: '912345678', amount: '100.50', paid_at: '2026-11-15T15:00:00Z' }
const team = { id: 'team', game_key: 'ff', captain_whatsapp: '987654321', prize_yape_phone: '999999999' }

test('avisa al WhatsApp actual y describe el destino histórico realmente pagado', () => {
  const link = new URL(teamPrizeNoticeLink(settlement, payment, team))
  assert.equal(link.pathname, '/51987654321')
  const message = link.searchParams.get('text')
  for (const value of ['Wolves & Ñ', 'Torneo & Final', '1.º lugar', 'S/ 100.50', '912345678', '✓']) assert.ok(message.includes(value))
  assert.ok(!message.includes('999999999'))
  assert.ok(!message.startsWith('Hola'))
})

test('MLBB conserva juego y puesto; no confunde Yape con contacto', () => {
  const link = new URL(teamPrizeNoticeLink({ ...settlement, game_key: 'mlbb' }, { ...payment, place: 3 }, { ...team, game_key: 'mlbb' }))
  assert.ok(link.searchParams.get('text').includes('Mobile Legends: Bang Bang'))
  assert.ok(link.searchParams.get('text').includes('3.º lugar'))
  assert.equal(link.pathname, '/51987654321')
})

test('no prepara avisos para pendientes, premios cero, otro equipo/lote/edición o contacto inválido', () => {
  for (const patch of [{ paid_at: null }, { amount: 0 }, { amount: 'abc' }, { settlement_id: 'other' }, { edition_id: 'old' }, { registration_id: 'other' }, { prize_yape_phone: '' }, { place: 4 }]) assert.equal(teamPrizeNoticeLink(settlement, { ...payment, ...patch }, team), null)
  assert.equal(teamPrizeNoticeLink(settlement, payment, { ...team, captain_whatsapp: '' }), null)
  assert.equal(teamPrizeNoticeLink(settlement, payment, { ...team, game_key: 'mlbb' }), null)
})

test('totales suman centavos y separan entregas de dinero sin inferir importes del texto', () => {
  assert.deepEqual(teamPrizeTotals([
    { amount: '100.10', paid_at: 'now', item_text: 'Medalla', delivered_at: null },
    { amount: '50.20', paid_at: null, item_text: '' },
    { amount: '0', reward_text: 'S/ 999', item_text: 'Teclado', delivered_at: 'now' },
  ]), { total: 150.3, paid: 100.1, due: 50.2, deliveriesPending: 1 })
  assert.deepEqual(teamPrizeTotals([]), { total: 0, paid: 0, due: 0, deliveriesPending: 0 })
})
