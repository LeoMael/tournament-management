import test from 'node:test'
import assert from 'node:assert/strict'
import { ffImportTemplate, ffAiPrompt, parseFfImport, ffImportedDraft, ffContactPhones } from '../src/lib/ffRoomImport.js'
import { ffResultPayload } from '../src/lib/ffRoomResults.js'

const room = { id: 'room-a', edition_id: 'edition-a', name: 'Partida', capacity: 24, kill_reward: '0.50', booyah_reward: '5' }
const base = [{ id: 'a', slot: 1, status: 'approved', nickname_1: 'Kavass|★', nickname_2: 'Jugador B', whatsapp: '999999999', prize_yape_phone: '988888888', full_name: 'PERSONAL PRIVADO' }, { id: 'b', slot: 2, status: 'approved', nickname_1: 'Jugador C', nickname_2: 'Jugador D', whatsapp: '999999999' }, { id: 'c', status: 'pending', nickname_1: 'Pendiente oculto', whatsapp: '977777777' }]
const prizes = [{ place: 1, amount: 100 }, { place: 2, amount: 50 }]
const roster = (kind) => kind === 'solo_top' ? base.map((p) => ({ ...p, nickname_2: null })) : base
const verified = (kind) => {
  const t = ffImportTemplate(kind, room, roster(kind), prizes)
  t.results = t.results.map((r, i) => ({ ...r, nickname_1_read: r.nickname_1, nickname_2_read: r.nickname_2 ?? '', placement: i + 1, kills_1: kind === 'duo_kills' ? i ? 0 : 2 : null, kills_2: kind === 'duo_kills' ? i ? 0 : 3 : null, booyah: i === 0, status: 'verified', source: 'Captura 1, pareja/fila ' + (i + 1) }))
  return t
}
test('cada modalidad genera contrato propio, nómina completa y prompt sin teléfonos/datos privados', () => {
  for (const kind of ['solo_top', 'duo_top', 'duo_kills']) {
    const prompt = ffAiPrompt(kind, room, roster(kind), prizes)
    assert.match(prompt, /Kavass\|★/)
    assert.match(prompt, /ff_rooms_v1/)
    for (const secret of ['999999999', '988888888', 'PERSONAL PRIVADO', 'Pendiente oculto']) assert.ok(!prompt.includes(secret))
    assert.match(prompt, kind === 'duo_kills' ? /kills del jugador 1 \+ kills del jugador 2/ : /Las kills NO suman dinero/)
    const rows = parseFfImport(JSON.stringify(verified(kind)), kind, room, roster(kind), prizes)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].gain, kind === 'duo_kills' ? 7.5 : 100)
    assert.equal(ffResultPayload(kind, roster(kind), ffImportedDraft(rows), [])[0].placement, 1)
  }
  assert.deepEqual(ffContactPhones(base), ['999999999'])
})
test('bloquea mezclar modalidad, sala, edición, tarifas, premios, roster y slots', () => {
  const t = verified('duo_kills')
  const check = (p) => parseFfImport(JSON.stringify(p), 'duo_kills', room, base, prizes)
  for (const key of ['room_kind', 'room_id', 'edition_id', 'schema_version']) assert.throws(() => check({ ...t, [key]: 'otro' }))
  assert.throws(() => check({ ...t, rules: { ...t.rules, kill_reward: 10 } }), /reglas/)
  assert.throws(() => check({ ...t, results: t.results.slice(0, 1) }), /todos/)
  assert.throws(() => check({ ...t, results: [t.results[0], t.results[0]] }), /duplicado/)
  for (const key of ['slot', 'nickname_1', 'nickname_2', 'registration_id']) assert.throws(() => check({ ...t, results: [{ ...t.results[0], [key]: 'otro' }, t.results[1]] }))
  const top = verified('duo_top')
  assert.throws(() => parseFfImport(JSON.stringify({ ...top, rules: { top_prizes: [{ place: 1, amount: 999 }, prizes[1]] } }), 'duo_top', room, base, prizes), /reglas/)
  assert.doesNotThrow(() => check({ ...t, rules: { booyah_reward: 5, kill_reward: 0.5 } }))
})
test('un pendiente nunca se convierte en resultado listo; revisión manual y kills obligatorias para Dúo kills', () => {
  const t = verified('duo_kills')
  t.results[1] = { ...t.results[1], status: 'discard', placement: null, kills_1: null, kills_2: null, booyah: null }
  const rows = parseFfImport(JSON.stringify(t), 'duo_kills', room, base, prizes)
  assert.equal(rows[1].gain, null)
  const draft = ffImportedDraft(rows)
  assert.equal(draft.b.reviewRequired, true)
  assert.throws(() => ffResultPayload('duo_kills', base, draft, []), /revisión pendiente/)
  draft.b.reviewRequired = false
  assert.throws(() => ffResultPayload('duo_kills', base, draft, []), /kills/)
  for (const mutate of [
    (p) => { p.results[1].kills_1 = 0 },
    (p) => { p.results[0].kills_2 = null },
    (p) => { p.results[0].booyah = false },
    (p) => { p.results[0].nickname_1_read = 'Kvass' },
    (p) => { p.results[0].source = '' },
  ]) { const copy = structuredClone(t); mutate(copy); assert.throws(() => parseFfImport(JSON.stringify(copy), 'duo_kills', room, base, prizes)) }
})
test('rechaza puestos duplicados, ganador doble y lecturas incompletas; similitud conserva la lectura', () => {
  const t = verified('duo_top')
  t.results[0].nickname_1_read = 'Kvass'; t.results[0].status = 'similarity'
  const rows = parseFfImport('```json\n' + JSON.stringify(t) + '\n```', 'duo_top', room, base, prizes)
  assert.equal(ffImportedDraft(rows).a.importRead1, 'Kvass')
  for (const change of [{ placement: 1, booyah: true }, { placement: 25 }, { placement: null }, { nickname_2_read: '' }, { kills_1: -1 }]) {
    const copy = structuredClone(t); Object.assign(copy.results[1], change)
    assert.throws(() => parseFfImport(JSON.stringify(copy), 'duo_top', room, base, prizes))
  }
})
