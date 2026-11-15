import { soloRoster } from './soloExports.js'

export function parseSoloResultImport(text, room, people) {
  if (typeof text !== 'string' || text.length > 200000) throw new Error('El JSON está vacío o es demasiado grande.')
  const raw = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1')
  let payload
  try { payload = JSON.parse(raw) } catch { throw new Error('Pega únicamente el bloque JSON de importación, sin la tabla ni el resumen.') }
  if (!payload || payload.schema_version !== 1 || payload.room_id !== room.id || payload.edition_id !== room.edition_id) throw new Error('El JSON no corresponde a esta sala y edición, o su formato no es compatible.')
  for (const key of ['kill_reward', 'booyah_reward']) {
    if (!['number', 'string'].includes(typeof payload[key]) || String(payload[key]).trim() === ''
      || !Number.isFinite(Number(payload[key])) || Number(payload[key]) !== Number(room[key])) throw new Error('Las tarifas del JSON no coinciden con la sala. Vuelve a copiar el prompt.')
  }
  const roster = soloRoster(people)
  if (!roster.length || !Array.isArray(payload.results) || payload.results.length !== roster.length) throw new Error('Incluye una fila por cada jugador aprobado de la nómina actual, también los pendientes de verificar.')
  const byId = new Map(roster.map((p) => [p.id, p])), seen = new Set()
  const rows = payload.results.map((item) => {
    const person = item && byId.get(item.registration_id)
    if (!person || seen.has(person.id) || !Number.isInteger(person.slot) || item.slot !== person.slot || item.nickname !== person.nickname) throw new Error('Hay un jugador duplicado, ajeno a la sala, o un slot/nickname registrado que no coincide. Usa la nómina actual.')
    seen.add(person.id)
    if (!['verified', 'similarity', 'unverified', 'discard'].includes(item.status)) throw new Error(`Slot ${person.slot}: estado de revisión inválido.`)
    for (const [key, max] of [['nickname_read', 150], ['source', 300], ['notes', 1500]]) {
      if (typeof item[key] !== 'string' || item[key].length > max) throw new Error(`Slot ${person.slot}: ${key} debe ser texto y respetar el límite de longitud.`)
    }
    if (item.kills !== null && (!Number.isInteger(item.kills) || item.kills < 0 || item.kills > 1000)) throw new Error(`Slot ${person.slot}: kills debe ser un entero de 0 a 1000 o null.`)
    if (item.booyah !== null && typeof item.booyah !== 'boolean') throw new Error(`Slot ${person.slot}: booyah debe ser true, false o null.`)
    const position = item.position ?? null
    if (position !== null && (!Number.isInteger(position) || position < 1 || position > 100)) throw new Error(`Slot ${person.slot}: posición debe ser un entero de 1 a 100 o null.`)
    const ready = ['verified', 'similarity'].includes(item.status)
    if (ready && (item.kills === null || item.booyah === null || !item.nickname_read.trim() || !item.source.trim())) throw new Error(`Slot ${person.slot}: faltan kills, Booyah o evidencia. Usa unverified si no se pueden comprobar.`)
    if (item.status === 'verified' && item.nickname_read !== person.nickname) throw new Error(`Slot ${person.slot}: el nickname leído difiere del registrado. Usa similarity o unverified.`)
    if (ready && item.booyah && position !== null && position !== 1) throw new Error(`Slot ${person.slot}: Booyah y posición final no coinciden. Revisa la captura.`)
    return { ...item, position, ready, gain: ready ? (item.kills * Math.round(Number(room.kill_reward) * 100) + (item.booyah ? Math.round(Number(room.booyah_reward) * 100) : 0)) / 100 : null }
  }).sort((a, b) => a.slot - b.slot)
  if (rows.filter((r) => r.ready && r.booyah).length > 1) throw new Error('El JSON asigna Booyah a más de un jugador.')
  return rows
}

export function soloImportPreviewRows(rows, order = 'position', pendingOnly = false) {
  return rows.filter((r) => !pendingOnly || !r.ready).sort((a, b) =>
    (order === 'position' ? (a.position ?? Infinity) - (b.position ?? Infinity) : 0) || a.slot - b.slot)
}

export function soloImportedDraft(rows) {
  return Object.fromEntries(rows.map((r) => [r.registration_id, {
    kills: r.ready ? r.kills : '', booyah: r.ready ? r.booyah : false,
    reviewRequired: !r.ready,
    importRead: r.nickname_read, importNote: r.notes, importSource: r.source,
    importPosition: r.position,
  }]))
}

export function soloResultPeople(people, results, order = 'slot') {
  return [...people].sort((a, b) =>
    (order === 'position' ? (results[a.id]?.importPosition ?? Infinity) - (results[b.id]?.importPosition ?? Infinity) : 0)
    || (a.slot ?? Infinity) - (b.slot ?? Infinity) || a.id.localeCompare(b.id))
}
