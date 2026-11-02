import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Modal, PageHeader, Spinner } from '../components/ui'
import StagePreview from '../components/StagePreview'
import MatchCard from '../components/MatchCard'
import BracketView from '../components/BracketView'
import LobbyModal from '../components/LobbyModal'
import RoomsModal from '../components/RoomsModal'
import PointsEditor from '../components/PointsEditor'
import RoomSizesEditor from '../components/RoomSizesEditor'
import PointsModal from '../components/PointsModal'
import BrStageBody from '../components/BrStageBody'
import { lobbyState } from '../lib/rooms'
import { GAME_LABEL, dateTime, toLocalInput } from '../lib/format'
import { generateStage } from '../lib/generateStage'
import RoundFormat from '../components/RoundFormat'
import ContinueStageModal from '../components/ContinueStageModal'
import SlotCard from '../components/SlotCard'
import ContinueBrModal from '../components/ContinueBrModal'
import ChampionModal from '../components/ChampionModal'
import { battleRoyaleTotals } from '../lib/standings'
import { useRoundBo } from '../lib/useRoundBo'
import {
  DEFAULT_PLACEMENT_POINTS, draftBracket, groupStandings, isBye, isDead, maxQualify, settleBracket, numberMatches, pendingLabel,
  brPoints, distributeBySizes, equalSizes, resolveSlots, previewStage, qualifyText, roomsNeeded, roundName, totalRounds,
} from '../lib/bracket'

const STAGE_TYPES = {
  groups: 'Fase de grupos (round-robin)',
  single_elim: 'Llave de eliminación directa',
  battle_royale: 'Battle Royale (partidas por puntos)',
}
const TYPES_BY_GAME = { mlbb: ['groups', 'single_elim'], ff: ['battle_royale', 'groups'] }

/* ------------------------------ Crear fase ------------------------------ */
function NewStageModal({ gameKey, teams, nextPosition, onClose, onCreated }) {
  const toast = useToast()
  const types = TYPES_BY_GAME[gameKey]
  const [form, setForm] = useState({
    name: '', type: types[0], groups: 2, qualify_per_group: 2, best_of: 1, lobbies: 6,
    placement: DEFAULT_PLACEMENT_POINTS.map(String), kill_points: '1', qualify_count: '',
  })
  // Equipos de cada sala (se reparten al azar con estos tamaños); con más de 12 equipos hacen falta varias salas.
  const [roomSizes, setRoomSizes] = useState(() => equalSizes(teams.length, roomsNeeded(teams.length)))
  const bracketRounds = form.type === 'single_elim' ? (previewStage('single_elim', teams.length, {}).rounds ?? 0) : 0
  const [roundBo, setRoundBo] = useRoundBo(bracketRounds)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const create = async (e) => {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) return toast.error('Ponle un nombre a la fase.')
    if (teams.length < 2) return toast.error('Necesitas al menos 2 equipos aprobados.')
    const ids = teams.map((t) => t.id)
    const bestOf = Number(form.best_of)
    let config = { best_of: bestOf, groups: Number(form.groups), lobbies: Number(form.lobbies) }
    if (form.type === 'groups') config = { ...config, qualify_per_group: Math.min(Number(form.qualify_per_group) || 1, maxQualify(ids.length, Number(form.groups))) }
    if (form.type === 'single_elim') config = { ...config, best_of_by_round: roundBo }
    if (form.type === 'battle_royale') {
      const pts = form.placement.map((v) => (v === '' ? NaN : Number(v)))
      if (pts.some((v) => !Number.isFinite(v) || v < 0)) return toast.error('Revisa los puntos por puesto: cada casilla debe tener un número.')
      if (!Number.isFinite(Number(form.kill_points)) || Number(form.kill_points) < 0) return toast.error('Puntos por kill inválidos.')
      config = { ...config, placement_points: pts, kill_points: Number(form.kill_points) }
      if (roomSizes.reduce((a, b) => a + b, 0) !== ids.length) return toast.error('Los equipos de las salas no suman el total de equipos.')
      if (roomSizes.length > 1) { config.rooms = roomSizes.length; config.room_of = distributeBySizes(ids, roomSizes) }
      config.slot_of = resolveSlots(teams, (id) => config.room_of?.[id] ?? 1, {})
      const q = Math.floor(Number(form.qualify_count))
      if (form.qualify_count !== '' && q >= 1) config.qualify_count = q
    }
    if (form.type === 'groups' && (form.groups < 1 || form.groups > Math.floor(ids.length / 2))) {
      return toast.error(`Cantidad de grupos inválida (1–${Math.floor(ids.length / 2)}).`)
    }
    setBusy(true)
    let stageId = null
    try {
      const { data: stage, error } = await supabase.from('stages').insert({
        game_key: gameKey, name, type: form.type, position: nextPosition, config,
      }).select().single()
      if (error) throw new Error(error.message)
      stageId = stage.id

      await generateStage({ stageId, type: form.type, ids, config: stage.config })
      toast.success('Fase creada. Revísala y publícala cuando esté lista.')
      onCreated(stageId)
      onClose()
    } catch (err) {
      if (stageId) await supabase.from('stages').delete().eq('id', stageId)
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Nueva fase" onClose={onClose} wide={form.type === 'battle_royale'}>
      <form onSubmit={create} className="grid" style={{ gap: '.9rem' }}>
        <p className="hint">El sorteo es aleatorio entre los equipos aprobados de {GAME_LABEL[gameKey]}.</p>
        <div className="form-row">
          <label className="field"><span>Nombre</span>
            <input value={form.name} maxLength={60} placeholder="Ej.: Fase de grupos" onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="field"><span>Tipo</span>
            <select value={form.type} onChange={(e) => set('type', e.target.value)}>
              {types.map((t) => <option key={t} value={t}>{STAGE_TYPES[t]}</option>)}
            </select>
          </label>
          {form.type === 'battle_royale' && (
            <label className="field"><span>N.º de partidas</span>
              <input type="number" min="1" max="20" value={form.lobbies} onChange={(e) => set('lobbies', e.target.value)} />
            </label>
          )}
        </div>
        {form.type === 'groups' && (
          <div className="form-row">
            <label className="field"><span>N.º de grupos</span>
              <input type="number" min="1" value={form.groups} onChange={(e) => set('groups', e.target.value)} />
            </label>
            <label className="field"><span>Clasifican por grupo</span>
              <select value={Math.min(form.qualify_per_group, maxQualify(teams.length, form.groups))} onChange={(e) => set('qualify_per_group', Number(e.target.value))}>
                {Array.from({ length: maxQualify(teams.length, form.groups) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'El primero' : `Los ${n} primeros`}</option>)}
              </select>
            </label>
            <label className="field"><span>Formato de partida</span>
              <select value={form.best_of} onChange={(e) => set('best_of', e.target.value)}><option value="1">BO1</option><option value="3">BO3</option></select>
            </label>
          </div>
        )}
        {form.type === 'single_elim' && <RoundFormat values={roundBo} onChange={setRoundBo} />}
        {form.type === 'battle_royale' && (
          <div className="nf-cols">
            <div className="nf-col">
              <section className="nf-section">
                <h3>1 · Salas y equipos por sala</h3>
                <RoomSizesEditor total={teams.length} sizes={roomSizes} onChange={setRoomSizes} />
              </section>
              <section className="nf-section">
                <h3>3 · Clasificación (opcional)</h3>
                <label className="field" style={{ maxWidth: 260 }}><span>{roomSizes.length > 1 ? 'Pasan por sala' : 'Pasan a la siguiente fase'}</span>
                  <input type="number" min="1" max={Math.min(...roomSizes)} placeholder="Ej.: 6" value={form.qualify_count} onChange={(e) => set('qualify_count', e.target.value)} />
                </label>
                {Number(form.qualify_count) >= 1 && <p className="hint">Pasarán <b>{roomSizes.reduce((sum, size) => sum + Math.min(size, Number(form.qualify_count)), 0)}</b> equipos en total.</p>}
              </section>
            </div>
            <div className="nf-col">
              <section className="nf-section">
                <h3>2 · Puntos</h3>
                <PointsEditor placement={form.placement} kill={form.kill_points}
                  onPlacement={(i, v) => set('placement', form.placement.map((x, k) => (k === i ? v : x)))}
                  onKill={(v) => set('kill_points', v)}
                  onReset={() => setForm((f) => ({ ...f, placement: DEFAULT_PLACEMENT_POINTS.map(String), kill_points: '1' }))} />
              </section>
            </div>
          </div>
        )}
        <StagePreview type={form.type} total={teams.length} config={{ ...form, qualify_per_group: Math.min(form.qualify_per_group, maxQualify(teams.length, form.groups)) }} roundBo={roundBo} roomSizes={roomSizes} />
        <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Generando…' : 'Generar fase'}</button>
      </form>
    </Modal>
  )
}

/* ----------------------------- Fecha y hora ----------------------------- */
// La hora empieza vacía; el botón "Ahora" pone la fecha y hora actuales (redondeada a 5 min).
function nowLocalInput() {
  const d = new Date()
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  return toLocalInput(d.toISOString())
}

function ScheduleModal({ match, title, onClose, onSaved }) {
  const toast = useToast()
  const [when, setWhen] = useState(match.scheduled_at ? toLocalInput(match.scheduled_at) : '')
  const [busy, setBusy] = useState(false)

  const save = async (value) => {
    setBusy(true)
    const { error } = await supabase.from('matches').update({ scheduled_at: value ? new Date(value).toISOString() : null }).eq('id', match.id)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success(value ? 'Horario guardado.' : 'Horario quitado.')
    onSaved()
    onClose()
  }

  return (
    <Modal title={title} onClose={onClose}>
      <label className="field"><span>Fecha y hora</span>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} autoFocus />
      </label>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn--primary" disabled={busy || !when} onClick={() => save(when)} type="button">Guardar</button>
        <button className="btn" disabled={busy} onClick={() => setWhen(nowLocalInput())} type="button">Ahora</button>
        {match.scheduled_at && <button className="btn btn--ghost" disabled={busy} onClick={() => save(null)} type="button">Quitar hora</button>}
      </div>
    </Modal>
  )
}

/* ------------------------------ Vista de fase ------------------------------ */
function StageView({ stage, teamsById, nextPosition, onChanged, onDeleted, onContinued }) {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [openMatch, setOpenMatch] = useState(null)
  const [openRoom, setOpenRoom] = useState(1)
  const [schedulingMatch, setSchedulingMatch] = useState(null)
  const [busyMatch, setBusyMatch] = useState(null)
  const [drawing, setDrawing] = useState(false)
  const [continuing, setContinuing] = useState(false)
  const [continuingBr, setContinuingBr] = useState(false)
  const [choosingChampion, setChoosingChampion] = useState(false)
  const [editingRooms, setEditingRooms] = useState(false)
  const [editingPoints, setEditingPoints] = useState(false)
  const [draft, setDraft] = useState(null) // lugares de la ronda 1 mientras se editan los emparejamientos
  const [selSlot, setSelSlot] = useState(null)

  const load = useCallback(async () => {
    const [m, g, gt, mr] = await Promise.all([
      supabase.from('matches').select('*').eq('stage_id', stage.id).order('round').order('position'),
      supabase.from('groups').select('*').eq('stage_id', stage.id).order('name'),
      supabase.from('group_teams').select('group_id, registration_id'),
      supabase.from('match_results').select('*'),
    ])
    const err = m.error || g.error || gt.error || mr.error
    if (err) return setError(err.message)
    const matchIds = new Set(m.data.map((x) => x.id))
    const groupIds = new Set(g.data.map((x) => x.id))
    setData({
      matches: m.data, groups: g.data,
      groupTeams: gt.data.filter((x) => groupIds.has(x.group_id)),
      results: mr.data.filter((x) => matchIds.has(x.match_id)),
    })
  }, [stage.id])
  useEffect(() => { load() }, [load])

  const teamName = useCallback((id) => teamsById.get(id)?.team_name ?? '—', [teamsById])
  const allTeams = useMemo(() => {
    if (!data) return []
    if (stage.type === 'battle_royale') {
      const only = stage.config?.participants // fases creadas con "Continuar fase": solo los clasificados
      return [...teamsById.values()].filter((t) => t.game_key === stage.game_key && t.status === 'approved' && (!only || only.includes(t.id)))
    }
    return []
  }, [data, stage, teamsById])

  const togglePublish = async () => {
    const { error: err } = await supabase.from('stages').update({ published: !stage.published }).eq('id', stage.id)
    if (err) return toast.error(err.message)
    toast.success(stage.published ? 'Fase oculta del sitio.' : 'Fase publicada en el sitio.')
    onChanged()
  }
  const remove = async () => {
    if (!window.confirm(`¿Eliminar la fase "${stage.name}" con todos sus cruces y resultados?`)) return
    const { error: err } = await supabase.from('stages').delete().eq('id', stage.id)
    if (err) return toast.error(err.message)
    toast.success('Fase eliminada.')
    onDeleted()
  }
  const refresh = () => { load(); onChanged() }

  // Guarda en la base solo los cruces que cambiaron entre `before` y `after` (mismo orden).
  const persistBracket = async (before, after) => {
    const fields = ['team_a', 'team_b', 'status', 'winner_id', 'score_a', 'score_b']
    const writes = after
      .filter((m, i) => fields.some((f) => (m[f] ?? null) !== (before[i][f] ?? null)))
      .map((m) => supabase.from('matches').update(Object.fromEntries(fields.map((f) => [f, m[f] ?? null]))).eq('id', m.id))
    const failed = (await Promise.all(writes)).find((r) => r.error)
    if (failed) throw new Error(failed.error.message)
  }
  const played = (m) => m.score_a !== null && m.score_a !== undefined
  // ¿Algún cruce posterior de su camino ya tiene resultado? Entonces no se puede cambiar este.
  const downstreamPlayed = (match) => {
    let position = match.position
    for (let round = match.round + 1; round <= totalRounds(data.matches); round++) {
      position = Math.floor(position / 2)
      const next = data.matches.find((m) => m.round === round && m.position === position)
      if (next && played(next)) return true
    }
    return false
  }

  // Resultado de un cruce (un clic): guarda el marcador, avanza al ganador y resuelve los byes en cadena.
  const saveResult = async (match, sa, sb) => {
    const winner = sa > sb ? match.team_a : match.team_b
    if (stage.type !== 'single_elim') {
      setBusyMatch(match.id)
      const r = await supabase.from('matches').update({ score_a: sa, score_b: sb, winner_id: winner, status: 'completed' }).eq('id', match.id)
      setBusyMatch(null)
      if (r.error) return toast.error(r.error.message)
      return refresh()
    }
    if (downstreamPlayed(match)) return toast.error('Un cruce siguiente ya tiene resultado; deshazlo primero.')
    setBusyMatch(match.id)
    try {
      const next = data.matches.map((m) => (m.id === match.id ? { ...m, score_a: sa, score_b: sb, winner_id: winner, status: 'completed' } : m))
      await persistBracket(data.matches, settleBracket(next))
    } catch (err) {
      toast.error(err.message)
    }
    setBusyMatch(null)
    refresh()
  }

  const clearResult = async (match) => {
    setBusyMatch(match.id)
    try {
      if (stage.type === 'single_elim') {
        if (downstreamPlayed(match)) throw new Error('Un cruce siguiente ya tiene resultado; deshazlo primero.')
        const next = data.matches.map((m) => (m.id === match.id ? { ...m, score_a: null, score_b: null, winner_id: null, status: 'scheduled' } : m))
        await persistBracket(data.matches, settleBracket(next))
      } else {
        const r = await supabase.from('matches').update({ score_a: null, score_b: null, winner_id: null, status: 'scheduled' }).eq('id', match.id)
        if (r.error) throw new Error(r.error.message)
      }
    } catch (err) {
      toast.error(err.message)
    }
    setBusyMatch(null)
    refresh()
  }

  // Guarda los nuevos emparejamientos de la 1.ª ronda; byes y rondas siguientes se recalculan en cadena.
  const savePairings = async (slots) => {
    setBusyMatch('pairings')
    try {
      await persistBracket(data.matches, draftBracket(data.matches, slots))
      toast.success('Emparejamientos actualizados.')
      setDraft(null)
      setSelSlot(null)
      refresh()
    } catch (err) {
      toast.error(err.message)
    }
    setBusyMatch(null)
  }

  // Battle Royale: agregar una partida al final y borrar solo las pendientes (renumerando las siguientes).
  const addLobby = async () => {
    setBusyMatch('lobby')
    const next = Math.max(0, ...data.matches.map((m) => m.round)) + 1
    const { error: err } = await supabase.from('matches').insert({ stage_id: stage.id, round: next, position: 0 })
    setBusyMatch(null)
    if (err) return toast.error(err.message)
    toast.success(`Partida ${next} agregada.`)
    refresh()
  }
  const deleteLobby = async (match) => {
    if (match.status === 'completed') return toast.error('Solo se pueden borrar partidas pendientes.')
    if (!window.confirm(`¿Eliminar la Partida ${match.round}? Las siguientes se renumeran.`)) return
    setBusyMatch('lobby')
    const del = await supabase.from('matches').delete().eq('id', match.id)
    if (del.error) { setBusyMatch(null); return toast.error(del.error.message) }
    const later = data.matches.filter((m) => m.round > match.round)
    const moved = await Promise.all(later.map((m) => supabase.from('matches').update({ round: m.round - 1 }).eq('id', m.id)))
    setBusyMatch(null)
    const failed = moved.find((r) => r.error)
    if (failed) toast.error(failed.error.message)
    else toast.success('Partida eliminada.')
    refresh()
  }
  // Fija (o quita, con null) al campeón de la fase Battle Royale.
  const saveChampion = async (id) => {
    setBusyMatch('champion')
    const config = { ...stage.config }
    if (id) config.champion = id
    else delete config.champion
    const { error: err } = await supabase.from('stages').update({ config }).eq('id', stage.id)
    setBusyMatch(null)
    if (err) return toast.error(err.message)
    toast.success(id ? 'Campeón registrado.' : 'Campeón quitado.')
    setChoosingChampion(false)
    onChanged()
  }
  // Cambia los puntos de la fase y recalcula los resultados ya cargados.
  const savePoints = async (placement, kill) => {
    setBusyMatch('points')
    const config = { ...stage.config, placement_points: placement, kill_points: kill }
    const up = await supabase.from('stages').update({ config }).eq('id', stage.id)
    let failure = up.error
    if (!failure && data.results.length) {
      const rows = data.results.map((x) => ({
        match_id: x.match_id, registration_id: x.registration_id, placement: x.placement, kills: x.kills, points: brPoints(x.placement, x.kills, config),
      }))
      failure = (await supabase.from('match_results').upsert(rows, { onConflict: 'match_id,registration_id' })).error
    }
    setBusyMatch(null)
    if (failure) return toast.error(failure.message)
    toast.success('Puntos actualizados.')
    setEditingPoints(false)
    refresh()
  }
  // Guarda las salas de la fase (cuántas y en cuál juega cada equipo).
  const saveRooms = async (rooms, roomOf, slotOf) => {
    setBusyMatch('rooms')
    const config = { ...stage.config }
    if (rooms > 1) { config.rooms = rooms; config.room_of = roomOf } else { delete config.rooms; delete config.room_of }
    config.slot_of = slotOf
    const { error: err } = await supabase.from('stages').update({ config }).eq('id', stage.id)
    setBusyMatch(null)
    if (err) return toast.error(err.message)
    toast.success('Salas guardadas.')
    setEditingRooms(false)
    onChanged()
  }
  // Marca (o reabre) una sala como terminada a mano; la partida pasa a "terminada" cuando todas sus salas lo están.
  const setRoomFinished = async (match, room, finished) => {
    const marked = new Set(stage.config?.finished?.[match.id] ?? [])
    if (finished) marked.add(room)
    else marked.delete(room)
    const config = { ...stage.config, finished: { ...(stage.config?.finished ?? {}), [match.id]: [...marked] } }
    const { error: err } = await supabase.from('stages').update({ config }).eq('id', stage.id)
    if (err) return toast.error(err.message)
    const done = lobbyState({ ...stage, config }, match.id, data.results, allTeams) === 'done'
    if (done !== (match.status === 'completed')) {
      const r = await supabase.from('matches').update({ status: done ? 'completed' : 'scheduled' }).eq('id', match.id)
      if (r.error) return toast.error(r.error.message)
    }
    toast.success(finished ? 'Sala marcada como terminada.' : 'Sala reabierta.')
    refresh()
  }
  // Cuántos equipos pasan a la siguiente fase (se resalta en la tabla).
  const setQualifyCount = async (value) => {
    const n = Math.floor(Number(value))
    const config = { ...stage.config }
    if (n >= 1) config.qualify_count = n
    else delete config.qualify_count
    const { error: err } = await supabase.from('stages').update({ config }).eq('id', stage.id)
    if (err) return toast.error(err.message)
    onChanged()
  }

  // Cambia el formato (BO1/BO3/BO5) de una ronda de la llave; los cruces ya jugados no se tocan.
  const changeRoundBo = async (round, value) => {
    const bo = Number(value)
    const pending = data.matches.filter((m) => m.round === round && m.status !== 'completed').map((m) => m.id)
    const rounds = totalRounds(data.matches)
    const bestOfByRound = Array.from({ length: rounds }, (_, i) => (i + 1 === round ? bo : Number(stage.config?.best_of_by_round?.[i] ?? data.matches.find((m) => m.round === i + 1)?.best_of ?? 1)))
    if (pending.length) {
      const r = await supabase.from('matches').update({ best_of: bo }).in('id', pending)
      if (r.error) return toast.error(r.error.message)
    }
    const r2 = await supabase.from('stages').update({ config: { ...stage.config, best_of_by_round: bestOfByRound } }).eq('id', stage.id)
    if (r2.error) return toast.error(r2.error.message)
    toast.success(`${roundName(round, rounds)}: ahora es BO${bo}.`)
    refresh()
  }

  const redraw = async () => {
    const played = data.matches.some((m) => m.status === 'completed' && (m.team_a && m.team_b))
    const ids = [...teamsById.values()].filter((t) => t.game_key === stage.game_key && t.status === 'approved').map((t) => t.id)
    if (ids.length < 2) return toast.error('Necesitas al menos 2 equipos aprobados.')
    const warn = played ? ' Se borrarán también los resultados ya cargados.' : ''
    if (!window.confirm(`¿Repetir el sorteo de "${stage.name}" con los ${ids.length} equipos aprobados actuales?${warn}`)) return
    setDrawing(true)
    try {
      const del = await supabase.from('matches').delete().eq('stage_id', stage.id)
      if (del.error) throw new Error(del.error.message)
      const delG = await supabase.from('groups').delete().eq('stage_id', stage.id)
      if (delG.error) throw new Error(delG.error.message)
      await generateStage({ stageId: stage.id, type: stage.type, ids, config: stage.config })
      toast.success('Sorteo realizado.')
      refresh()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDrawing(false)
    }
  }

  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  const { groups, groupTeams, results } = data
  const editing = Boolean(draft)
  const matches = editing ? draftBracket(data.matches, draft) : data.matches

  const numbers = numberMatches(matches)
  const hasResults = data.matches.some(played)
  const startEditing = () => {
    setDraft(data.matches.filter((m) => m.round === 1).sort((a, b) => a.position - b.position).flatMap((m) => [m.team_a ?? null, m.team_b ?? null]))
    setSelSlot(null)
  }
  // Se toca un lugar y luego otro: se intercambian (un lugar vacío también se mueve).
  const touchSlot = (index) => {
    if (selSlot === null) return setSelSlot(index)
    if (selSlot !== index) {
      setDraft((d) => { const next = [...d]; [next[selSlot], next[index]] = [next[index], next[selSlot]]; return next })
    }
    setSelSlot(null)
  }
  const cardFor = (m, label) => (
    <MatchCard key={m.id} match={m} label={label} busy={busyMatch === m.id || editing}
      nameA={m.team_a ? teamName(m.team_a) : pendingLabel(m, 'a', matches, numbers)}
      nameB={m.team_b ? teamName(m.team_b) : pendingLabel(m, 'b', matches, numbers)}
      onResult={(sa, sb) => saveResult(m, sa, sb)} onClear={() => clearResult(m)} onSchedule={() => setSchedulingMatch(m)} />
  )

  const initialSlots = data.matches.filter((m) => m.round === 1).sort((a, b) => a.position - b.position).flatMap((m) => [m.team_a ?? null, m.team_b ?? null])
  const draftChanged = editing && draft.some((id, i) => id !== initialSlots[i])
  const qualify = stage.type === 'groups' ? Number(stage.config?.qualify_per_group) || 0 : 0

  let body
  if (stage.type === 'groups') {
    body = (
      <div className="grid grid--2">
        {groups.map((g) => {
          const ids = groupTeams.filter((x) => x.group_id === g.id).map((x) => x.registration_id)
          const gm = matches.filter((m) => m.group_id === g.id)
          return (
            <div className="card group-card" key={g.id}>
              <h3>{g.name}</h3>
              {qualify > 0 && <p className="hint" style={{ margin: '-4px 0 8px' }}>{qualifyText(qualify)}.</p>}
              <div className="table-wrap" style={{ marginBottom: '.8rem' }}>
                <table>
                  <thead><tr><th>#</th><th>Equipo</th><th className="num">PJ</th><th className="num">G</th><th className="num">P</th><th className="num">Dif</th><th className="num">Pts</th></tr></thead>
                  <tbody>
                    {groupStandings(ids, gm).map((r, i) => (
                      <tr key={r.id} className={i < qualify ? 'row--qualify' : undefined}><td>{i + 1}</td><td>{teamName(r.id)}</td><td className="num">{r.played}</td><td className="num">{r.wins}</td><td className="num">{r.losses}</td><td className="num">{r.diff}</td><td className="num"><strong>{r.points}</strong></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="round-matches">
                {gm.map((m) => cardFor(m, `Ronda ${m.round}`))}
              </div>
            </div>
          )
        })}
      </div>
    )
  } else if (stage.type === 'single_elim') {
    const total = totalRounds(matches)
    const rounds = Array.from({ length: total }, (_, i) => i + 1).map((r) => ({
      round: r, name: roundName(r, total), matches: matches.filter((m) => m.round === r).map((m) => ({ key: m.id, match: m })),
    }))
    body = (
      <BracketView rounds={rounds}
        renderHeaderExtra={(round) => {
          const current = round.matches[0]?.match.best_of ?? 1
          return (
            <select className="brv-bo" disabled={editing} aria-label={`Formato de ${round.name}`} value={current} onChange={(e) => changeRoundBo(round.round, e.target.value)}>
              <option value="1">BO1</option><option value="3">BO3</option><option value="5">BO5</option>
            </select>
          )
        }}
        renderMatch={({ match }) => (editing && match.round === 1 ? (
          <SlotCard label={`Cruce ${match.position + 1}`}
            a={match.team_a ? teamName(match.team_a) : null} b={match.team_b ? teamName(match.team_b) : null}
            selected={selSlot !== null && Math.floor(selSlot / 2) === match.position ? (selSlot % 2 === 0 ? 'a' : 'b') : null}
            onTouch={(side) => touchSlot(match.position * 2 + (side === 'a' ? 0 : 1))} />
        ) : isDead(match) ? (
          <div className="bm bm--bye">
            <div className="bm-head"><span className="bm-num">Sin equipos</span></div>
            <div className="bm-team bm-team--bye"><span className="bm-name">Vacío</span></div>
          </div>
        ) : isBye(match) ? (
          <div className="bm bm--bye">
            <div className="bm-head"><span className="bm-num">Bye</span></div>
            <div className="bm-team"><span className="bm-name">{teamName(match.team_a ?? match.team_b)}</span></div>
            <div className="bm-team bm-team--bye"><span className="bm-name">Pasa directo</span></div>
          </div>
        ) : cardFor(match, `M${numbers.get(match.id)}`))} />
    )
  } else {
    body = (
      <BrStageBody stage={stage} matches={matches} results={results} teams={allTeams} teamName={teamName} busy={busyMatch === 'lobby'}
        onAddLobby={addLobby} onDeleteLobby={deleteLobby} onSetQualify={setQualifyCount} onSetRoomFinished={setRoomFinished}
        onOpenLobby={(m, room) => { setOpenRoom(room); setOpenMatch(m) }} />
    )
  }

  return (
    <>
      <div className="stage-head">
        <div><h2 style={{ fontSize: '1.15rem' }}>{stage.name}</h2><p className="hint" style={{ margin: 0 }}>{STAGE_TYPES[stage.type]} · {stage.published ? 'Publicada en el sitio' : 'Borrador, no visible al público'}</p></div>
        <div className="page-actions">
          {stage.type === 'single_elim' && !draft && (
            <button className="btn" type="button" disabled={hasResults} onClick={startEditing}
              title={hasResults ? 'Hay resultados cargados: deshazlos para poder cambiar los emparejamientos.' : 'Cambiar quién se enfrenta a quién'}>
              Editar emparejamientos
            </button>
          )}
          {stage.type === 'battle_royale' && (
            <>
              <button className="btn" onClick={() => setEditingPoints(true)} type="button">Puntos</button>
              <button className="btn" onClick={() => setEditingRooms(true)} type="button">Salas ({Number(stage.config?.rooms) || 1})</button>
              <button className="btn btn--gold" onClick={() => setChoosingChampion(true)} type="button">{stage.config?.champion ? 'Cambiar campeón' : 'Seleccionar campeón'}</button>
              <button className="btn btn--cta" onClick={() => setContinuingBr(true)} type="button">Continuar fase <span aria-hidden="true">→</span></button>
            </>
          )}
          {stage.type === 'groups' && (
            <button className="btn btn--cta" onClick={() => setContinuing(true)} type="button">Continuar fase <span aria-hidden="true">→</span></button>
          )}
          {stage.type !== 'battle_royale' && !stage.config?.source_stage && (
            <button className="btn" onClick={redraw} disabled={drawing} type="button">{drawing ? 'Sorteando…' : 'Sortear de nuevo'}</button>
          )}
          <button className="btn btn--ok" onClick={togglePublish} type="button">{stage.published ? 'Ocultar del sitio' : 'Publicar en el sitio'}</button>
          <button className="btn btn--bad" onClick={remove} type="button">Eliminar fase</button>
        </div>
      </div>
      {stage.type === 'battle_royale' && stage.config?.champion && (
        <div className="champion-banner"><span>Campeón</span><b>{teamName(stage.config.champion)}</b></div>
      )}
      {editing && (
        <div className="edit-bar">
          <span className="hint">
            Toca un equipo y luego otro lugar de la llave para intercambiarlos. Un lugar «Vacío» puede quedar donde quieras: el equipo que queda solo pasa directo.
            {selSlot !== null && <b> Elige el segundo lugar…</b>}
          </span>
          <button className="btn" type="button" disabled={busyMatch === 'pairings'} onClick={() => { setDraft(null); setSelSlot(null) }}>Cancelar</button>
          <button className="btn btn--primary" type="button" disabled={busyMatch === 'pairings' || !draftChanged} onClick={() => savePairings(draft)}>
            {busyMatch === 'pairings' ? 'Guardando…' : 'Guardar emparejamientos'}
          </button>
        </div>
      )}
      {body}
      {editingPoints && (
        <PointsModal stage={stage} hasResults={results.length > 0} busy={busyMatch === 'points'} onClose={() => setEditingPoints(false)} onSave={savePoints} />
      )}
      {editingRooms && (
        <RoomsModal teams={allTeams} rooms={Number(stage.config?.rooms) || 1} roomOf={stage.config?.room_of} hasResults={results.length > 0} slotOf={stage.config?.slot_of}
          busy={busyMatch === 'rooms'} onClose={() => setEditingRooms(false)} onSave={saveRooms} />
      )}
      {choosingChampion && (
        <ChampionModal totals={battleRoyaleTotals(allTeams, results)} teamName={teamName} current={stage.config?.champion}
          pending={matches.filter((m) => m.status !== 'completed').length} busy={busyMatch === 'champion'}
          onClose={() => setChoosingChampion(false)} onSave={saveChampion} />
      )}
      {continuingBr && (
        <ContinueBrModal stage={stage} totals={battleRoyaleTotals(allTeams, results)} teamName={teamName}
          pending={matches.filter((m) => m.status !== 'completed').length} nextPosition={nextPosition}
          onClose={() => setContinuingBr(false)} onCreated={(id) => { setContinuingBr(false); onContinued(id) }} />
      )}
      {continuing && (
        <ContinueStageModal stage={stage} groups={groups} groupTeams={groupTeams} matches={matches} teamName={teamName}
          nextPosition={nextPosition} onClose={() => setContinuing(false)} onCreated={(id) => { setContinuing(false); onContinued(id) }} />
      )}
      {schedulingMatch && (
        <ScheduleModal match={schedulingMatch} title={`Horario · ${teamName(schedulingMatch.team_a)} vs ${teamName(schedulingMatch.team_b)}`} onClose={() => setSchedulingMatch(null)} onSaved={refresh} />
      )}
      {openMatch && stage.type === 'battle_royale' && (
        <LobbyModal match={openMatch} stage={stage} teams={allTeams} results={results} initialRoom={openRoom} onClose={() => setOpenMatch(null)} onSaved={refresh} />
      )}
      {stage.type !== 'battle_royale' && matches.some((m) => m.scheduled_at) && (
        <p className="hint">Próximo horario cargado: {dateTime(matches.filter((m) => m.scheduled_at && m.status !== 'completed').map((m) => m.scheduled_at).sort()[0])}</p>
      )}
    </>
  )
}

/* --------------------------------- Página --------------------------------- */
export default function Format() {
  const [game, setGame] = useState('mlbb')
  const [stages, setStages] = useState(null)
  const [teams, setTeams] = useState(null)
  const [error, setError] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      supabase.from('stages').select('*').order('position').order('created_at'),
      supabase.from('registrations').select('id, game_key, team_name, status'),
    ])
    if (s.error || t.error) return setError((s.error || t.error).message)
    setStages(s.data)
    setTeams(t.data)
  }, [])
  useEffect(() => { load() }, [load])

  const teamsById = useMemo(() => new Map((teams ?? []).map((t) => [t.id, t])), [teams])
  const gameStages = useMemo(() => (stages ?? []).filter((s) => s.game_key === game), [stages, game])
  const approved = useMemo(() => (teams ?? []).filter((t) => t.game_key === game && t.status === 'approved'), [teams, game])
  const active = gameStages.find((s) => s.id === activeId) ?? gameStages[0] ?? null

  if (error) return <ErrorBox error={error} />
  if (!stages || !teams) return <Spinner />
  return (
    <>
      <PageHeader eyebrow="Torneo" title="Grupos y llaves" subtitle="Genera grupos y llaves con los equipos aprobados, carga resultados y publícalos en el sitio."
        actions={<button className="btn btn--outline" onClick={() => setCreating(true)} type="button">+ Nueva fase</button>} />
      <div className="tabs">
        {['mlbb', 'ff'].map((g) => (
          <button key={g} type="button" className={`tab ${game === g ? 'tab--active' : ''}`} onClick={() => { setGame(g); setActiveId(null) }}>{GAME_LABEL[g]}</button>
        ))}
        <span className="hint" style={{ alignSelf: 'center' }}>{approved.length} equipos aprobados</span>
      </div>
      {gameStages.length > 0 && (
        <div className="tabs">
          {gameStages.map((s) => (
            <button key={s.id} type="button" className={`tab ${active?.id === s.id ? 'tab--active' : ''}`} onClick={() => setActiveId(s.id)}>
              <span className={`dot ${s.published ? 'dot--on' : ''}`} aria-hidden="true" />{s.name}
            </button>
          ))}
        </div>
      )}
      {active ? (
        <StageView key={active.id} stage={active} teamsById={teamsById} nextPosition={gameStages.length} onChanged={load}
          onContinued={(id) => { setActiveId(id); load() }} onDeleted={() => { setActiveId(null); load() }} />
      ) : (
        <p className="empty">Aún no hay fases para {GAME_LABEL[game]}. Crea la primera con “Nueva fase”.</p>
      )}
      {creating && (
        <NewStageModal gameKey={game} teams={approved} nextPosition={gameStages.length} onClose={() => setCreating(false)} onCreated={(id) => { setActiveId(id); load() }} />
      )}
    </>
  )
}
