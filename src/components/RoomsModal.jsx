import { useState } from 'react'
import { Modal } from './ui'
import { ROOM_SIZE, distributeRooms, resolveSlots, roomsNeeded } from '../lib/bracket'

const MAX_ROOMS = 12

function buildInitialAssign(teams, initialRooms, minRooms, roomOf) {
  const totalRooms = Math.max(initialRooms, minRooms)
  if (initialRooms <= 1 && totalRooms > 1) {
    return distributeRooms(teams.map((t) => t.id), totalRooms)
  }

  const result = {}
  const roomCounts = Array.from({ length: totalRooms + 1 }, () => 0)
  const unassigned = []

  teams.forEach((t) => {
    const saved = roomOf?.[t.id]
    if (saved && saved >= 1 && saved <= totalRooms) {
      result[t.id] = saved
      roomCounts[saved]++
    } else {
      unassigned.push(t)
    }
  })

  // Distribuir equipos nuevos o sin sala en las salas que tienen espacio (< 12)
  // priorizando las que tienen menos equipos para mantener el equilibrio
  unassigned.forEach((t) => {
    let bestRoom = 1
    let minCount = Infinity
    for (let r = 1; r <= totalRooms; r++) {
      if (roomCounts[r] < ROOM_SIZE && roomCounts[r] < minCount) {
        minCount = roomCounts[r]
        bestRoom = r
      }
    }
    result[t.id] = bestRoom
    roomCounts[bestRoom]++
  })

  return result
}

// Salas de una fase Battle Royale. Cada sala es una competencia aparte: sus equipos juegan entre sí
// y tienen su propia tabla (y sus propios clasificados). Máximo 12 equipos por sala.
export default function RoomsModal({ teams, rooms: initialRooms, roomOf, slotOf, hasResults, busy, onClose, onSave }) {
  const minRooms = roomsNeeded(teams.length)
  const [rooms, setRooms] = useState(Math.max(initialRooms, minRooms))
  const [assign, setAssign] = useState(() => buildInitialAssign(teams, initialRooms, minRooms, roomOf))

  // Número fijo de cada equipo en su sala: se conserva si no cambia de sala y se puede editar.
  const [slots, setSlots] = useState(() => resolveSlots(teams, (id) => assign[id], slotOf))
  const list = Array.from({ length: rooms }, (_, i) => i + 1)
  const reslot = (nextAssign, keep) => setSlots(resolveSlots(teams, (id) => nextAssign[id], keep))
  const inRoom = (room) => teams.filter((t) => assign[t.id] === room)
  const overfull = list.filter((r) => inRoom(r).length > ROOM_SIZE)
  const dupSlot = (room, id) => !slots[id] || inRoom(room).some((o) => o.id !== id && slots[o.id] === slots[id])
  const hasDup = list.some((r) => inRoom(r).some((t) => dupSlot(r, t.id)))

  const changeRooms = (value) => {
    const n = Math.max(minRooms, Math.min(MAX_ROOMS, value))
    if (n === rooms) return
    setRooms(n)
    // Al pasar de 1 sala a varias se reparten solos; si no, solo se acomodan los de salas que ya no existen.
    const next = rooms === 1 ? distributeRooms(teams.map((t) => t.id), n) : Object.fromEntries(teams.map((t) => [t.id, Math.min(assign[t.id], n)]))
    setAssign(next)
    reslot(next, rooms === 1 ? {} : slots)
  }
  const draw = () => {
    if (hasResults && !window.confirm('Sortear vuelve a repartir los equipos entre las salas: las tablas de cada sala cambiarán. ¿Continuar?')) return
    const next = distributeRooms(teams.map((t) => t.id), rooms)
    setAssign(next)
    reslot(next, {})
  }

  return (
    <Modal title="Salas de la fase" onClose={onClose} wide>
      <p className="hint">Cada sala juega por separado y tiene su propia tabla. Máximo {ROOM_SIZE} equipos por sala. El número de cada equipo es fijo y no depende de su posición.</p>
      <div className="room-bar">
        <span className="room-bar-label">Salas</span>
        <span className="lb-kills" role="group" aria-label="Cantidad de salas">
          <button type="button" aria-label="Menos salas" disabled={rooms <= minRooms} onClick={() => changeRooms(rooms - 1)}>−</button>
          <output>{rooms}</output>
          <button type="button" aria-label="Más salas" disabled={rooms >= MAX_ROOMS} onClick={() => changeRooms(rooms + 1)}>+</button>
        </span>
        {rooms > 1 && <button className="btn btn--sm" type="button" onClick={draw}>Sortear equipos</button>}
        <button className="btn btn--sm btn--ghost" type="button" onClick={() => setSlots(resolveSlots(teams, (id) => assign[id], slots))}>Recorrer slots</button>
        {minRooms > 1 && <span className="hint">{teams.length} equipos: mínimo {minRooms} salas.</span>}
      </div>
      {overfull.length > 0 && <p className="pv-caption pv-caption--warn">La Sala {overfull.join(', ')} tiene más de {ROOM_SIZE} equipos. Mueve equipos a otra sala para guardar.</p>}
      {hasResults && <p className="pv-caption pv-caption--warn">Ya hay resultados cargados: al mover un equipo de sala, sus puntos pasan a la tabla de su nueva sala.</p>}
      <div className="room-grid">
        {list.map((r) => (
          <div className="room-col" key={r}>
            <h4 className={inRoom(r).length > ROOM_SIZE ? 'room-over' : undefined}>Sala {r} · {inRoom(r).length} {inRoom(r).length === 1 ? 'equipo' : 'equipos'}</h4>
            {inRoom(r).map((t) => (
              <label className="room-team" key={t.id}>
                <span>{t.team_name}</span>
                <input className={`room-slot ${dupSlot(r, t.id) ? 'room-slot--dup' : ''}`} type="number" min="1" max={ROOM_SIZE} aria-label={`N.º de ${t.team_name} en la sala`} title="Número fijo en la sala"
                  value={slots[t.id] ?? ''} onChange={(e) => {
                    const raw = e.target.value
                    const val = raw === '' ? '' : Math.max(1, Math.min(ROOM_SIZE, Number(raw) || 1))
                    setSlots({ ...slots, [t.id]: val })
                  }} />
                <select value={assign[t.id]} aria-label={`Sala de ${t.team_name}`} onChange={(e) => { const next = { ...assign, [t.id]: Number(e.target.value) }; setAssign(next); const keep = { ...slots }; delete keep[t.id]; reslot(next, keep) }}>
                  {list.map((n) => <option key={n} value={n}>Sala {n}</option>)}
                </select>
              </label>
            ))}
          </div>
        ))}
      </div>
      {hasDup && <p className="pv-caption pv-caption--warn">Hay números repetidos en una sala (en rojo). Cada equipo necesita su propio número.</p>}
      <button className="btn btn--primary" type="button" disabled={busy || overfull.length > 0 || hasDup}
        onClick={() => onSave(rooms, rooms > 1 ? assign : {}, slots)}>
        {busy ? 'Guardando…' : 'Guardar salas'}
      </button>
    </Modal>
  )
}
