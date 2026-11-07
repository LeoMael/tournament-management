import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { Modal } from './ui'
import LobbyBoard from './LobbyBoard'
import { brPoints, resolveSlots } from '../lib/bracket'
import { lobbyState, roomOfStage, roomState, STATE_LABEL } from '../lib/rooms'

// Resultado de una partida Battle Royale. Si la fase tiene varias salas, cada sala es una pestaña y el
// puesto (1.º, 2.º…) se cuenta dentro de su sala.
export default function LobbyModal({ match, stage, teams, results, initialRoom = 1, onClose, onSaved }) {
  const toast = useToast()
  const rooms = Number(stage.config?.rooms) || 1
  const roomOf = roomOfStage(stage)
  const mine = results.filter((x) => x.match_id === match.id)
  const [tab, setTab] = useState(Math.min(initialRoom, rooms))

  // Cargar jugadores para todos los equipos de la fase
  const [playersByTeam, setPlayersByTeam] = useState(new Map())
  useEffect(() => {
    const ids = teams.map((t) => t.id)
    if (!ids.length) return
    let active = true
    supabase
      .from('players')
      .select('registration_id, slot, is_substitute, nickname, game_player_id')
      .in('registration_id', ids)
      .order('slot')
      .then(({ data, error }) => {
        if (!active || error || !data) return
        const map = new Map()
        data.forEach((p) => {
          map.set(p.registration_id, [...(map.get(p.registration_id) ?? []), p])
        })
        setPlayersByTeam(map)
      })
    return () => { active = false }
  }, [teams])

  // Placements y kills por equipo (inicializados con los resultados existentes)
  const [placements, setPlacements] = useState(() => {
    const out = {}
    mine.forEach((r) => {
      out[r.registration_id] = r.placement
    })
    return out
  })
  const [kills, setKills] = useState(() => Object.fromEntries(mine.map((r) => [r.registration_id, r.kills])))
  const [busy, setBusy] = useState(false)
  const slots = resolveSlots(teams, roomOf, stage.config?.slot_of)

  const pointsOf = (place, k) => brPoints(place, k, stage.config)
  const inRoom = (room) => teams.filter((t) => roomOf(t.id) === room)
  const list = Array.from({ length: rooms }, (_, i) => i + 1)

  // Estado de cada sala con lo que hay cargado ahora (antes de guardar).
  const draftResults = teams
    .filter((t) => placements[t.id] !== '' && placements[t.id] !== null && placements[t.id] !== undefined && Number(placements[t.id]) >= 1)
    .map((t) => ({ match_id: match.id, registration_id: t.id }))

  const save = async () => {
    // Validar puestos duplicados en todas las salas
    for (const r of list) {
      const roomTeams = inRoom(r)
      const roomPlaces = roomTeams
        .map((t) => placements[t.id])
        .filter((p) => p !== '' && p !== null && p !== undefined && Number(p) >= 1)
        .map(Number)
      const dupes = roomPlaces.filter((p, i, arr) => arr.indexOf(p) !== i)
      if (dupes.length) {
        return toast.error(`En la Sala ${r} hay puestos repetidos (${[...new Set(dupes)].sort((a, b) => a - b).join('°, ')}°). Corrige los números antes de guardar.`)
      }
    }

    setBusy(true)
    try {
      const run = async (query) => { const res = await query; if (res.error) throw new Error(res.error.message) }
      await run(supabase.from('match_results').delete().eq('match_id', match.id))

      const rows = teams
        .filter((t) => {
          const p = placements[t.id]
          return p !== '' && p !== null && p !== undefined && Number(p) >= 1 && Number(p) <= 12
        })
        .map((t) => {
          const place = Number(placements[t.id])
          const k = Number(kills[t.id]) || 0
          return {
            match_id: match.id,
            registration_id: t.id,
            placement: place,
            kills: k,
            points: pointsOf(place, k),
          }
        })

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

  const handleClearRoom = () => {
    const roomTeams = inRoom(tab)
    if (!window.confirm(`¿Limpiar los puestos y kills de la Sala ${tab}?`)) return
    setPlacements((prev) => {
      const next = { ...prev }
      roomTeams.forEach((t) => { delete next[t.id] })
      return next
    })
    setKills((prev) => {
      const next = { ...prev }
      roomTeams.forEach((t) => { delete next[t.id] })
      return next
    })
  }

  return (
    <Modal
      title={`Partida ${match.round}`}
      onClose={onClose}
      wide
      actions={
        <button className="btn btn--primary" disabled={busy} onClick={save} type="button">
          Guardar partida
        </button>
      }
    >
      {rooms > 1 && (
        <div className="seg" role="tablist" aria-label="Salas" style={{ marginBottom: 12 }}>
          {list.map((r) => {
            const count = inRoom(r).filter((t) => placements[t.id] !== '' && placements[t.id] !== null && placements[t.id] !== undefined && Number(placements[t.id]) >= 1).length
            const total = inRoom(r).length
            return (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={tab === r}
                className={`seg-btn ${tab === r ? 'seg-btn--on' : ''}`}
                onClick={() => setTab(r)}
              >
                Sala {r}
                <span className="seg-count">{count}/{total}</span>
                <i
                  className={`state-dot state-dot--${roomState(stage, match.id, r, draftResults, teams).state}`}
                  title={STATE_LABEL[roomState(stage, match.id, r, draftResults, teams).state]}
                />
              </button>
            )
          })}
        </div>
      )}

      <LobbyBoard
        teams={inRoom(tab).map((t) => ({
          id: t.id,
          name: t.team_name,
          slot: slots[t.id],
          players: playersByTeam.get(t.id) ?? [],
        }))}
        placements={placements}
        kills={kills}
        pointsOf={pointsOf}
        config={stage.config}
        onPlacement={(id, val) => setPlacements((prev) => ({ ...prev, [id]: val === '' ? '' : Number(val) }))}
        onKills={(id, val) => setKills((prev) => ({ ...prev, [id]: Math.max(0, Math.min(99, Number(val) || 0)) }))}
        onClearRoom={handleClearRoom}
      />
    </Modal>
  )
}
