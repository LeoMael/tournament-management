import test from 'node:test'
import assert from 'node:assert/strict'
import { migrationStatus } from '../src/lib/migrations.js'

test('exige la versión exacta 001, incluso si existe una posterior', () => {
  assert.equal(migrationStatus([], null).hasPrizes, false)
  assert.equal(migrationStatus([{ version: '002' }], null).hasPrizes, false)
  assert.equal(migrationStatus([{ version: '002' }, { version: '001' }], null).hasPrizes, true)
})
test('distingue tabla ausente de permisos y rechaza habilitar al fallar', () => {
  for (const code of ['42P01', 'PGRST205']) assert.deepEqual(migrationStatus(null, { code }), { state: 'missing', hasPrizes: false, rows: [] })
  assert.deepEqual(migrationStatus(null, { code: '42501' }), { state: 'error', hasPrizes: false, rows: [] })
})
