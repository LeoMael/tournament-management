import test from 'node:test'
import assert from 'node:assert/strict'
import { ffRoomCanDelete } from '../src/lib/ffRooms.js'
test('papelera admite abiertas/cerradas y conserva protección de juego y borradores con historial', () => {
  for (const status of ['open', 'closed', 'finished', 'cancelled']) assert.equal(ffRoomCanDelete({ status }, true, true), true)
  assert.equal(ffRoomCanDelete({ status: 'playing' }, false), false)
  assert.equal(ffRoomCanDelete({ status: 'draft' }, false), true)
  assert.equal(ffRoomCanDelete({ status: 'draft' }, true), false)
  assert.equal(ffRoomCanDelete({ status: 'draft' }, false, true), false)
})
