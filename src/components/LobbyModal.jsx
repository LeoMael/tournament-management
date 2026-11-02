import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { Modal } from './ui'
import LobbyBoard from './LobbyBoard'
import { brPoints, resolveSlots } from '../lib/bracket'
import { lobbyState, roomState, STATE_LABEL } from '../lib/rooms'

// Resultado de una partida Battle Royale. Si la fase tiene varias salas, cada sala es una pestaña y el
// puesto (1.º, 2.º…) se cuenta dentro de su sala.
export default function LobbyModal({ match, stage, teams, results, initialRoom = 1, onClose, onSaved }) {
  const toast = useToast()
  const rooms = Number(stage.config?.rooms) || 1
  const roomOf = (id) => (rooms > 1 ? Math.min(stage.config?.room_of?.[id] ?? 1, rooms) : 1)
  const mine = results.filter((x) => x.match_id === match.id)
  const [tab, setTab] = useState(Math.min(initialRoom, rooms))
  const [orders, setOrders] = useState(() => {
    const out = {}
    ;[...mine].sort((a, b) => a.placement - b.placement).forEach((r) => { (out[roomOf(r.registration_id)] ??= []).push(r.registration_id) })
    return out
  })
  const [kills, setKills] = useState(() => Object.fromEntries(mine.map((r) => [r.registration_id, r.kills])))
  const [busy, setBusy] = useState(false)
  const slots = resolveSlots(teams, roomOf, stage.config?.slot_of)
  // Estado de cada sala con lo que hay cargado ahora (antes de guardar).
  const draftResults = Object.entries(orders).flatMap(([room, ids]) => ids.filter((id) => roomOf(id) === Number(room)).map((id) => ({ match_id: match.id, registration_id: id })))
  const pointsOf = (place, k) => brPoints(place, k, stage.config)
  const inRoom = (room) => teams.filter((t) => roomOf(t.id) === room)
  const list = Array.from({ length: rooms }, (_, i) => i + 1)

  const save = async () => {
    setBusy(true)
    try {
      const run = async (query) => { const r = await query; if (r.error) throw new Error(r.error.message) }
      await run(supabase.from('match_results').delete().eq('match_id', match.id))
      const rows = Object.entries(orders).flatMap(([room, ids]) => ids.filter((id) => roomOf(id) === Number(room)).map((id, i) => ({
        match_id: match.id, registration_id: id, placement: i + 1, kills: kills[id] ?? 0, points: pointsOf(i + 1, kills[id] ?? 0),
      })))
      if (rows.length) await run(supabase.from('match_results').insert(rows))
      // La partida queda terminada solo cuando TODAS sus salas terminaron.
      const saved = rows.map((r) => ({ match_id: match.id, registration_id: r.registration_id }))
      await run(supabase.from('matches').update({ status: lobbyState(stage, match.id, saved, teams) === 'done' ? 'completed' : 'scheduled' }).eq('id', match.id))
      toast.success('Partida guardada.')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Partida ${match.round}`} onClose={onClose} wide>
      {rooms > 1 && (
        <div className="seg" role="tablist" aria-label="Salas">
          {list.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={tab === r} className={`seg-btn ${tab === r ? 'seg-btn--on' : ''}`} onClick={() => setTab(r)}>
              Sala {r}<span className="seg-count">{(orders[r] ?? []).length}/{inRoom(r).length}</span>
              <i className={`state-dot state-dot--${roomState(stage, match.id, r, draftResults, teams).state}`} title={STATE_LABEL[roomState(stage, match.id, r, draftResults, teams).state]} />
            </button>
          ))}
        </div>
      )}
      <LobbyBoard
        teams={inRoom(tab).map((t) => ({ id: t.id, name: t.team_name, slot: slots[t.id] }))}
        order={orders[tab] ?? []} kills={kills} pointsOf={pointsOf}
        onOrder={(o) => setOrders((prev) => ({ ...prev, [tab]: o }))}
        onKills={(id, value) => setKills((k) => ({ ...k, [id]: value }))} />
      <button className="btn btn--primary" disabled={busy} onClick={save} type="button">Guardar partida</button>
    </Modal>
  )
}
