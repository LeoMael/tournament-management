import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { Modal } from './ui'
import LobbyBoard from './LobbyBoard'
import SquadResultImport from './SquadResultImport'
import SquadRoomAccess from './SquadRoomAccess'
import { squadAiPrompt } from '../lib/squadResultImport'
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
  const [playersLoading, setPlayersLoading] = useState(true)
  const [playersError, setPlayersError] = useState('')
  useEffect(() => {
    const ids = teams.map((t) => t.id)
    if (!ids.length) { setPlayersLoading(false); return }
    let active = true
    setPlayersLoading(true); setPlayersError('')
    supabase
      .from('players')
      .select('registration_id, slot, is_substitute, nickname, game_player_id')
      .in('registration_id', ids)
      .order('slot')
      .then(({ data, error }) => {
        if (!active) return
        setPlayersLoading(false)
        if (error || !data) { setPlayersError('No se pudieron cargar los integrantes. Cierra y vuelve a abrir esta partida.'); return }
        const map = new Map()
        data.forEach((p) => {
          map.set(p.registration_id, [...(map.get(p.registration_id) ?? []), p])
        })
        setPlayersByTeam(map)
      }).catch(() => { if (active) { setPlayersLoading(false); setPlayersError('No se pudieron cargar los integrantes. Vuelve a abrir la partida.') } })
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
  const [importOpen, setImportOpen] = useState(false)
  const [importSort, setImportSort] = useState(false)
  const [reviewPending, setReviewPending] = useState({})
  const slots = resolveSlots(teams, roomOf, stage.config?.slot_of)

  const pointsOf = (place, k) => brPoints(place, k, stage.config)
  const inRoom = (room) => teams.filter((t) => roomOf(t.id) === room)
  const list = Array.from({ length: rooms }, (_, i) => i + 1)
  const ff = stage.game_key === 'ff' && stage.type === 'battle_royale'
  const importContext = { stage, match, room: tab, teams: inRoom(tab).map((t) => ({ id: t.id, name: t.team_name, slot: slots[t.id], players: playersByTeam.get(t.id) ?? [] })) }
  const roomDone = roomState(stage, match.id, tab, results, teams).state === 'done'
  const copyForAi = async () => {
    if (playersLoading || playersError) { toast.error(playersError || 'Espera a que carguen los integrantes.'); return false }
    try {
      const prompt = squadAiPrompt(importContext)
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(prompt)
      else {
        const field = document.createElement('textarea')
        field.value = prompt; field.style.position = 'fixed'; field.style.opacity = '0'
        document.body.appendChild(field)
        try { field.focus(); field.select(); if (!document.execCommand('copy')) throw new Error('No se pudo copiar el prompt.') }
        finally { field.remove() }
      }
      return true
    } catch (error) { toast.error(error.message || 'No se pudo copiar el prompt.'); return false }
  }
  const applyImport = (draft) => {
    if (busy || !ff || roomDone) return 'Esta sala ya está terminada o no admite cargar el borrador.'
    setPlacements((prev) => ({ ...prev, ...draft.placements }))
    setKills((prev) => ({ ...prev, ...draft.kills }))
    setReviewPending((prev) => ({ ...prev, ...draft.pending }))
    setImportSort(true)
    setImportOpen(false)
    toast.success('Borrador cargado. Corrige los pendientes antes de guardar la partida.')
    return null
  }

  // Estado de cada sala con lo que hay cargado ahora (antes de guardar).
  const draftResults = teams
    .filter((t) => placements[t.id] !== '' && placements[t.id] !== null && placements[t.id] !== undefined && Number(placements[t.id]) >= 1)
    .map((t) => ({ match_id: match.id, registration_id: t.id }))

  const save = async () => {
    if (busy || importOpen) return
    if (teams.some((t) => reviewPending[t.id])) return toast.error('Resuelve y confirma los equipos importados pendientes, también en las otras salas.')
    for (const t of teams) {
      const p = placements[t.id]
      if (p === '' || p == null) continue
      const k = Number(kills[t.id] ?? 0)
      if (!Number.isInteger(Number(p)) || Number(p) < 1 || Number(p) > 12 || kills[t.id] === '' || !Number.isInteger(k) || k < 0 || k > 99) return toast.error('Revisa puestos (1 a 12) y kills enteras (0 a 99) antes de guardar.')
    }
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
    setReviewPending((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !roomTeams.some((t) => t.id === id))))
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
        <button className="btn btn--primary" disabled={busy || importOpen} onClick={save} type="button">
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
                onClick={() => { setTab(r); setImportOpen(false) }}
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

      {ff && !importOpen && <SquadRoomAccess key={`${match.id}-${tab}`} stage={stage} match={match} room={tab} teams={inRoom(tab)} slots={slots} closed={roomDone} busy={busy} />}
      {ff && playersLoading && <p className="hint">Cargando integrantes para preparar la nómina de IA…</p>}
      {ff && playersError && <p className="error-box" role="alert">{playersError}</p>}
      {importOpen ? <SquadResultImport key={tab} context={importContext} readOnly={roomDone} onBack={() => setImportOpen(false)} onApply={applyImport} /> : <LobbyBoard
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
        onKills={(id, val) => setKills((prev) => ({ ...prev, [id]: val === '' ? '' : Math.max(0, Math.min(99, Number(val) || 0)) }))}
        onClearRoom={handleClearRoom}
        onCopyForAi={ff ? copyForAi : undefined}
        onImport={ff ? () => setImportOpen(true) : undefined}
        aiLoading={playersLoading || Boolean(playersError) || busy || !inRoom(tab).length}
        reviewPending={reviewPending}
        onReview={(id) => setReviewPending((prev) => ({ ...prev, [id]: false }))}
        initialSort={importSort ? 'place' : 'slot'}
      />}
    </Modal>
  )
}
