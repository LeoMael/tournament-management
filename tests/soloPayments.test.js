import test from 'node:test'
import assert from 'node:assert/strict'
import { soloPaymentRows } from '../src/lib/soloPayments.js'

test('prioriza todos los pendientes antes de paginar y conserva los datos originales', () => {
  const rows = [
    { id: 'zero', kind: 'reward', amount: '0.00', paid_at: '2026-11-14' },
    { id: 'paid', kind: 'reward', amount: '50.00', paid_at: '2026-11-14' },
    { id: 'small', kind: 'reward', amount: '0.50', paid_at: null },
    { id: 'refund', kind: 'refund', amount: '2.00', paid_at: null },
    { id: 'winner', kind: 'reward', amount: '12.00', paid_at: null },
  ]
  const snapshot = structuredClone(rows)
  assert.deepEqual(soloPaymentRows(rows).map((p) => p.id), ['winner', 'refund', 'small', 'paid'])
  assert.deepEqual(soloPaymentRows(rows, 'pending').map((p) => p.id), ['winner', 'refund', 'small'])
  assert.deepEqual(soloPaymentRows(rows, 'all').map((p) => p.id), ['winner', 'refund', 'small', 'paid', 'zero'])
  assert.deepEqual(soloPaymentRows(rows).slice(0, 2).map((p) => p.id), ['winner', 'refund'])
  assert.deepEqual(rows, snapshot)
})

test('Booyah encabeza su grupo aunque otro gane más, sin adelantar pagados a pendientes', () => {
  const rows = [
    { id: 'high', registration_id: 'a', kind: 'reward', amount: 30, paid_at: null },
    { id: 'booyah', registration_id: 'b', kind: 'reward', amount: 12, paid_at: null },
    { id: 'paid-high', registration_id: 'c', kind: 'reward', amount: 50, paid_at: '2026-11-14' },
    { id: 'paid-booyah', registration_id: 'd', kind: 'reward', amount: 12, paid_at: '2026-11-14' },
  ]
  const results = { b: { booyah: true }, d: { booyah: true } }
  assert.deepEqual(soloPaymentRows(rows, 'all', results).map((p) => p.id), ['booyah', 'high', 'paid-booyah', 'paid-high'])
})
