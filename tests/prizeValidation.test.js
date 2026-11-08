import test from 'node:test'
import assert from 'node:assert/strict'
import { validPoolAmount, validPrizeReward } from '../src/lib/prizeValidation.js'

test('una bolsa independiente acepta solo montos válidos', () => {
  for (const value of [null, undefined, '', '-1', '1000001', 'abc', 'Infinity']) assert.equal(validPoolAmount(value), false)
  for (const value of ['0', '100.50', '1000000']) assert.equal(validPoolAmount(value), true)
})
test('un premio anunciado requiere texto y admite premios no monetarios', () => {
  assert.equal(validPrizeReward('', false), true)
  assert.equal(validPrizeReward('  ', true), false)
  assert.equal(validPrizeReward('Teclado gamer', true), true)
  assert.equal(validPrizeReward('S/ 100 + medalla', true), true)
  assert.equal(validPrizeReward('a'.repeat(241), false), false)
})
