import test from 'node:test'
import assert from 'node:assert/strict'
import { soloImportTemplate, soloAiPrompt } from '../src/lib/soloExports.js'
import { parseSoloResultImport, soloImportedDraft, soloImportPreviewRows, soloResultPeople } from '../src/lib/soloResultImport.js'

const room = { id: 'room-a', edition_id: 'edition-a', name: 'Prueba', kill_reward: '0.50', booyah_reward: '5.00' }
const people = Array.from({ length: 27 }, (_, i) => ({ id: `person-${i}`, room_id: room.id, status: 'approved', slot: i + 1, nickname: i === 0 ? 'A | "B" \\ ☆' : `Jugador ${i}` }))
const completed = () => {
  const payload = soloImportTemplate(room, people)
  payload.results = payload.results.map((r, i) => ({ ...r, nickname_read: r.nickname, kills: i === 0 ? 3 : 0, booyah: i === 0, status: 'verified', source: 'Captura 1', notes: '' }))
  return payload
}
const parse = (payload, roster = people) => parseSoloResultImport(JSON.stringify(payload), room, roster)

test('plantilla y prompt permiten copiar JSON sin romper símbolos, sin incluir datos personales', () => {
  const prompt = soloAiPrompt(room, people)
  const template = JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```/)[1])
  assert.equal(template.results.length, 27)
  assert.equal(template.results[0].nickname, people[0].nickname)
  const draft = soloImportedDraft(parse(template))
  assert.equal(draft['person-0'].kills, '')
  assert.equal(draft['person-26'].reviewRequired, true)
})

test('importa la nómina completa como borrador, recalcula importes y tolera bloque json', () => {
  const payload = completed(), before = structuredClone(payload)
  const rows = parseSoloResultImport('```json\n' + JSON.stringify(payload) + '\n```', room, people)
  assert.equal(rows.length, 27)
  assert.equal(rows[0].gain, 6.5)
  assert.equal(rows[26].gain, 0)
  const draft = soloImportedDraft(rows)
  assert.equal(Object.keys(draft).length, 27)
  assert.equal(draft['person-0'].booyah, true)
  assert.equal(draft['person-26'].kills, 0)
  assert.deepEqual(payload, before)
})

test('similitud visible y pendientes/descarte no se convierten en cero ni generan ganancias', () => {
  const payload = completed()
  Object.assign(payload.results[1], { status: 'similarity', nickname_read: 'Jugadr 1', notes: 'Falta una letra' })
  Object.assign(payload.results[2], { status: 'discard', nickname_read: 'Sin identificar', kills: 7, booyah: null, notes: 'Confirmar asociación' })
  Object.assign(payload.results[3], { status: 'unverified', nickname_read: '', kills: null, booyah: null })
  const rows = parse(payload), draft = soloImportedDraft(rows)
  assert.equal(draft['person-1'].kills, 0)
  assert.equal(draft['person-1'].importRead, 'Jugadr 1')
  for (const i of [2, 3]) {
    assert.equal(rows[i].gain, null)
    assert.equal(draft[`person-${i}`].kills, '')
    assert.equal(draft[`person-${i}`].reviewRequired, true)
  }
})

test('rechaza sala, edición, tarifas y nómina desactualizadas sin modificar los resultados', () => {
  for (const patch of [{ room_id: 'otra' }, { edition_id: 'otra' }, { schema_version: 2 }, { kill_reward: 99 }, { booyah_reward: '' }]) assert.throws(() => parse({ ...completed(), ...patch }))
  const missing = completed(); missing.results.pop(); assert.throws(() => parse(missing))
  const duplicate = completed(); duplicate.results[1] = duplicate.results[0]; assert.throws(() => parse(duplicate))
  const foreign = completed(); foreign.results[0].registration_id = 'ajeno'; assert.throws(() => parse(foreign))
  const slot = completed(); slot.results[0].slot = 27; assert.throws(() => parse(slot))
  const nick = completed(); nick.results[0].nickname = 'reemplazado'; assert.throws(() => parse(nick))
  assert.throws(() => parse(completed(), people.filter((p) => p.slot !== 27)))
})

test('rechaza kills inválidas, Booyah ambiguo, dos ganadores y falsas coincidencias exactas', () => {
  for (const patch of [{ kills: -1 }, { kills: 1.5 }, { kills: '3' }, { kills: 1001 }, { booyah: 'Sí' }, { booyah: null }, { status: 'invalido' }, { source: '' }, { nickname_read: 'otro nombre' }]) {
    const payload = completed(); Object.assign(payload.results[0], patch); assert.throws(() => parse(payload))
  }
  const two = completed(); two.results[1].booyah = true; assert.throws(() => parse(two), /más de un/)
  assert.throws(() => parseSoloResultImport('Texto y tabla, no JSON', room, people))
  assert.throws(() => parseSoloResultImport('null', room, people))
})

test('ordena por posición real sin confundirla con slot y filtra pendientes sin cambiar el lote', () => {
  const payload = completed()
  payload.results[0].position = 1
  payload.results[1].position = 20
  payload.results[2].position = 3
  Object.assign(payload.results[3], { position: 2, status: 'unverified', kills: null, booyah: null })
  const rows = parse(payload), before = structuredClone(rows)
  assert.deepEqual(soloImportPreviewRows(rows).slice(0, 4).map((r) => r.slot), [1, 4, 3, 2])
  assert.deepEqual(soloImportPreviewRows(rows, 'slot').slice(0, 4).map((r) => r.slot), [1, 2, 3, 4])
  assert.deepEqual(soloImportPreviewRows(rows, 'position', true).map((r) => r.slot), [4])
  assert.equal(Object.keys(soloImportedDraft(rows)).length, 27)
  assert.deepEqual(rows, before)
})

test('acepta JSON anterior sin posiciones y rechaza posiciones inválidas o Booyah contradictorio', () => {
  const old = completed(); old.results.forEach((r) => { delete r.position })
  assert.ok(parse(old).every((r) => r.position === null))
  for (const position of [0, 101, -1, 1.5, '1']) {
    const payload = completed(); payload.results[1].position = position; assert.throws(() => parse(payload))
  }
  const conflict = completed(); conflict.results[0].position = 2
  assert.throws(() => parse(conflict), /Booyah y posición/)
})

test('Resultados cambia entre slot y posición antes de paginar sin alterar kills ni Booyah', () => {
  const payload = completed()
  payload.results[0].position = 1
  payload.results[26].position = 2
  payload.results[20].position = 3
  const draft = soloImportedDraft(parse(payload)), before = structuredClone({ people, draft })
  assert.deepEqual(soloResultPeople(people, draft, 'position').slice(0, 3).map((p) => p.slot), [1, 27, 21])
  assert.deepEqual(soloResultPeople(people, draft, 'slot').slice(0, 3).map((p) => p.slot), [1, 2, 3])
  assert.deepEqual(soloResultPeople(people, {}, 'position').slice(0, 3).map((p) => p.slot), [1, 2, 3])
  assert.deepEqual({ people, draft }, before)
})
