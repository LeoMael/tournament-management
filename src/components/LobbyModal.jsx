import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { Modal } from './ui'
import LobbyBoard from './LobbyBoard'
import { ROOM_SIZE, brPoints, roomsNeeded, shuffle } from '../lib/bracket'

const MAX_ROOMS = 12

// Reparte los equipos al azar y por igual entre las salas.
function distribute(teams, rooms) {
  const out = {}
  shuffle(teams.map((t) => t.id)).forEach((id, i) => { out[id] = (i % rooms) + 1 })
  return out
}

// Resultado de una partida Battle Royale con salas: cada sala es una partida aparte, así que el puesto
// (1.º, 2.º…) se cuenta dentro de su sala. Con 1 sala funciona como siempre.
export default function LobbyModal({ match, stage, teams, results, assignments, onClose, onSaved }) {
  const toast = useToast()
  const mine = results.filter((x) => x.match_id === match.id)
  const minRooms = roomsNeeded(teams.length) // 12 escuadras por sala como máximo
  const [rooms, setRooms] = useState(Math.max(match.rooms ?? 1, minRooms))
  const [assign, setAssign] = useState(() => {
    const saved = Object.fromEntries(assignments.map((a) => [a.registration_id, a.room]))
    const total = Math.max(match.rooms ?? 1, minRooms)
    // Sin salas guardadas y con más de una sala (por ejemplo, más de 12 equipos): se reparten solas.
    if (!assignments.length && total > 1) return distribute(teams, total)
    return Object.fromEntries(teams.map((t) => [t.id, saved[t.id] ?? 1]))
  })
  const [orders, setOrders] = useState(() => {
    const out = {}
    ;[...mine].sort((a, b) => a.placement - b.placement).forEach((r) => { (out[assign[r.registration_id] ?? 1] ??= []).push(r.registration_id) })
    return out
  })
  const [kills, setKills] = useState(() => Object.fromEntries(mine.map((r) => [r.registration_id, r.kills])))
  const [tab, setTab] = useState(assignments.length ? 1 : rooms > 1 ? 'teams' : 1)
  const [busy, setBusy] = useState(false)
  const pointsOf = (place, k) => brPoints(place, k, stage.config)

  // Cambia las salas de los equipos y saca de los puestos a quien cambió de sala.
  const reassign = (next) => {
    setAssign(next)
    setOrders((prev) => Object.fromEntries(Object.entries(prev).map(([room, ids]) => [room, ids.filter((id) => next[id] === Number(room))])))
  }
  const changeRooms = (value) => {
    const n = Math.max(minRooms, Math.min(MAX_ROOMS, value))
    if (n === rooms) return
    const hadRooms = rooms > 1
    setRooms(n)
    if (n === 1) { reassign(Object.fromEntries(teams.map((t) => [t.id, 1]))); setTab(1); return }
    if (!hadRooms) { reassign(distribute(teams, n)); setTab('teams'); return }
    reassign(Object.fromEntries(teams.map((t) => [t.id, Math.min(assign[t.id], n)])))
    if (typeof tab === 'number' && tab > n) setTab('teams')
  }
  const draw = () => {
    if (Object.values(orders).some((ids) => ids.length) && !window.confirm('Sortear vuelve a repartir los equipos y borra los puestos ya cargados. ¿Continuar?')) return
    reassign(distribute(teams, rooms))
  }

  const roomTeams = (room) => teams.filter((t) => assign[t.id] === room)
  const overfull = Array.from({ length: rooms }, (_, i) => i + 1).filter((r) => roomTeams(r).length > ROOM_SIZE)

  const save = async () => {
    if (overfull.length) return toast.error(`Cada sala admite hasta ${ROOM_SIZE} equipos. Mueve equipos de la Sala ${overfull[0]}.`)
    setBusy(true)
    try {
      const run = async (query) => { const r = await query; if (r.error) throw new Error(r.error.message) }
      await run(supabase.from('matches').update({ rooms }).eq('id', match.id))
      await run(supabase.from('lobby_rooms').delete().eq('match_id', match.id))
      if (rooms > 1) {
        await run(supabase.from('lobby_rooms').insert(teams.map((t) => ({ match_id: match.id, registration_id: t.id, room: assign[t.id] }))))
      }
      await run(supabase.from('match_results').delete().eq('match_id', match.id))
      const rows = Object.entries(orders).flatMap(([room, ids]) => ids.filter((id) => assign[id] === Number(room)).map((id, i) => ({
        match_id: match.id, registration_id: id, placement: i + 1, kills: kills[id] ?? 0, points: pointsOf(i + 1, kills[id] ?? 0),
      })))
      if (rows.length) await run(supabase.from('match_results').insert(rows))
      await run(supabase.from('matches').update({ status: rows.length ? 'completed' : 'scheduled' }).eq('id', match.id))
      toast.success('Partida guardada.')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message.includes('rooms') || err.message.includes('lobby_rooms') ? 'Falta ejecutar 01_schema.sql actualizado en Supabase (salas).' : err.message)
      setBusy(false)
    }
  }

  const roomList = Array.from({ length: rooms }, (_, i) => i + 1)
  return (
    <Modal title={`Partida ${match.round}`} onClose={onClose} wide={rooms > 1}>
      <div className="room-bar">
        <span className="room-bar-label">Salas</span>
        <span className="lb-kills" role="group" aria-label="Cantidad de salas">
          <button type="button" aria-label="Menos salas" disabled={rooms <= minRooms} onClick={() => changeRooms(rooms - 1)}>−</button>
          <output>{rooms}</output>
          <button type="button" aria-label="Más salas" disabled={rooms >= MAX_ROOMS} onClick={() => changeRooms(rooms + 1)}>+</button>
        </span>
        {rooms > 1 && <button className="btn btn--sm" type="button" onClick={draw}>Sortear equipos</button>}
        {minRooms > 1 && <span className="hint">{teams.length} equipos: mínimo {minRooms} salas ({ROOM_SIZE} por sala).</span>}
      </div>
      {overfull.length > 0 && <p className="pv-caption pv-caption--warn">La Sala {overfull.join(', ')} tiene más de {ROOM_SIZE} equipos. Mueve equipos a otra sala para poder guardar.</p>}

      {rooms > 1 && (
        <div className="seg" role="tablist" aria-label="Salas">
          <button type="button" role="tab" aria-selected={tab === 'teams'} className={`seg-btn ${tab === 'teams' ? 'seg-btn--on' : ''}`} onClick={() => setTab('teams')}>Equipos</button>
          {roomList.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={tab === r} className={`seg-btn ${tab === r ? 'seg-btn--on' : ''}`} onClick={() => setTab(r)}>
              Sala {r}<span className="seg-count">{roomTeams(r).length}</span>
            </button>
          ))}
        </div>
      )}

      {rooms > 1 && tab === 'teams' ? (
        <div className="room-grid">
          {roomList.map((r) => (
            <div className="room-col" key={r}>
              <h4 className={roomTeams(r).length > ROOM_SIZE ? 'room-over' : undefined}>Sala {r} · {roomTeams(r).length} {roomTeams(r).length === 1 ? 'equipo' : 'equipos'}</h4>
              {roomTeams(r).map((t) => (
                <label className="room-team" key={t.id}>
                  <span>{t.team_name}</span>
                  <select value={assign[t.id]} aria-label={`Sala de ${t.team_name}`} onChange={(e) => reassign({ ...assign, [t.id]: Number(e.target.value) })}>
                    {roomList.map((n) => <option key={n} value={n}>Sala {n}</option>)}
                  </select>
                </label>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <LobbyBoard
          teams={roomTeams(rooms > 1 ? tab : 1).map((t) => ({ id: t.id, name: t.team_name }))}
          order={orders[rooms > 1 ? tab : 1] ?? []} kills={kills} pointsOf={pointsOf}
          onOrder={(o) => setOrders((prev) => ({ ...prev, [rooms > 1 ? tab : 1]: o }))}
          onKills={(id, value) => setKills((k) => ({ ...k, [id]: value }))} />
      )}
      <button className="btn btn--primary" disabled={busy} onClick={save} type="button">Guardar partida</button>
    </Modal>
  )
}
