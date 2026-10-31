import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Modal, PageHeader, Spinner } from '../components/ui'
import { GAME_LABEL, dateTime, toLocalInput } from '../lib/format'
import {
  DEFAULT_PLACEMENT_POINTS, brPoints, drawGroups, groupStandings, roundName, roundRobin, singleElimination, totalRounds,
} from '../lib/bracket'

const STAGE_TYPES = {
  groups: 'Fase de grupos (round-robin)',
  single_elim: 'Llave de eliminación directa',
  battle_royale: 'Battle Royale (partidas por puntos)',
}
const TYPES_BY_GAME = { mlbb: ['groups', 'single_elim'], ff: ['battle_royale', 'groups'] }

/* ------------------------- Generación y sorteo ------------------------- */
// Crea grupos/cruces/partidas de una fase con sorteo aleatorio. Se usa al crear y al re-sortear.
async function generateStage({ stageId, type, ids, config }) {
  const bestOf = Number(config.best_of) || 1
  if (type === 'groups') {
    const drawn = drawGroups(ids, Number(config.groups) || 1)
    const { data: groups, error: gErr } = await supabase.from('groups').insert(
      drawn.map((_, i) => ({ stage_id: stageId, name: `Grupo ${String.fromCharCode(65 + i)}` }))).select()
    if (gErr) throw new Error(gErr.message)
    groups.sort((a, b) => a.name.localeCompare(b.name))
    const links = []
    const matches = []
    drawn.forEach((teamIds, i) => {
      teamIds.forEach((rid) => links.push({ group_id: groups[i].id, registration_id: rid }))
      roundRobin(teamIds).forEach((m, idx) => matches.push({
        stage_id: stageId, group_id: groups[i].id, round: m.round, position: idx, team_a: m.a, team_b: m.b, best_of: bestOf,
      }))
    })
    const r1 = await supabase.from('group_teams').insert(links)
    if (r1.error) throw new Error(r1.error.message)
    if (matches.length) {
      const r2 = await supabase.from('matches').insert(matches)
      if (r2.error) throw new Error(r2.error.message)
    }
  } else if (type === 'single_elim') {
    const rows = singleElimination(ids).map((m) => ({
      stage_id: stageId, round: m.round, position: m.position, team_a: m.a, team_b: m.b, best_of: bestOf,
      winner_id: m.winner, status: m.winner ? 'completed' : 'scheduled',
    }))
    const r = await supabase.from('matches').insert(rows)
    if (r.error) throw new Error(r.error.message)
  } else {
    const lobbies = Number(config.lobbies)
    if (!Number.isInteger(lobbies) || lobbies < 1 || lobbies > 20) throw new Error('Cantidad de partidas inválida (1–20).')
    const r = await supabase.from('matches').insert(
      Array.from({ length: lobbies }, (_, i) => ({ stage_id: stageId, round: i + 1, position: 0 })))
    if (r.error) throw new Error(r.error.message)
  }
}

/* ------------------------------ Crear fase ------------------------------ */
function NewStageModal({ gameKey, teams, nextPosition, onClose, onCreated }) {
  const toast = useToast()
  const types = TYPES_BY_GAME[gameKey]
  const [form, setForm] = useState({
    name: '', type: types[0], groups: 2, best_of: 1, lobbies: 6,
    placement_points: DEFAULT_PLACEMENT_POINTS.join(','), kill_points: 1,
  })
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
    if (form.type === 'battle_royale') {
      const pts = form.placement_points.split(',').map((v) => Number(v.trim()))
      if (pts.some((v) => !Number.isFinite(v) || v < 0)) return toast.error('Tabla de puntos inválida.')
      config = { ...config, placement_points: pts, kill_points: Number(form.kill_points) || 0 }
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
    <Modal title="Nueva fase" onClose={onClose}>
      <form onSubmit={create} className="grid" style={{ gap: '.9rem' }}>
        <p className="hint">Participan los <strong>{teams.length}</strong> equipos aprobados de {GAME_LABEL[gameKey]}. El sorteo es aleatorio.</p>
        <div className="form-row">
          <label className="field"><span>Nombre</span>
            <input value={form.name} maxLength={60} placeholder="Ej.: Fase de grupos" onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="field"><span>Tipo</span>
            <select value={form.type} onChange={(e) => set('type', e.target.value)}>
              {types.map((t) => <option key={t} value={t}>{STAGE_TYPES[t]}</option>)}
            </select>
          </label>
        </div>
        {form.type === 'groups' && (
          <div className="form-row">
            <label className="field"><span>N.º de grupos</span>
              <input type="number" min="1" value={form.groups} onChange={(e) => set('groups', e.target.value)} />
            </label>
            <label className="field"><span>Formato de partida</span>
              <select value={form.best_of} onChange={(e) => set('best_of', e.target.value)}><option value="1">BO1</option><option value="3">BO3</option></select>
            </label>
          </div>
        )}
        {form.type === 'single_elim' && (
          <label className="field"><span>Formato de partida</span>
            <select value={form.best_of} onChange={(e) => set('best_of', e.target.value)}><option value="1">BO1</option><option value="3">BO3</option><option value="5">BO5</option></select>
          </label>
        )}
        {form.type === 'battle_royale' && (
          <>
            <div className="form-row">
              <label className="field"><span>N.º de partidas</span>
                <input type="number" min="1" max="20" value={form.lobbies} onChange={(e) => set('lobbies', e.target.value)} />
              </label>
              <label className="field"><span>Puntos por kill</span>
                <input type="number" min="0" step="0.5" value={form.kill_points} onChange={(e) => set('kill_points', e.target.value)} />
              </label>
            </div>
            <label className="field"><span>Puntos por puesto (1°, 2°, 3°… separados por coma)</span>
              <input value={form.placement_points} onChange={(e) => set('placement_points', e.target.value)} />
            </label>
          </>
        )}
        <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Generando…' : 'Generar fase'}</button>
      </form>
    </Modal>
  )
}

/* ------------------------- Resultado de un match ------------------------- */
function MatchModal({ match, stage, matches, teamName, onClose, onSaved }) {
  const toast = useToast()
  const [a, setA] = useState(String(match.score_a ?? 0))
  const [b, setB] = useState(String(match.score_b ?? 0))
  const [when, setWhen] = useState(toLocalInput(match.scheduled_at))
  const [busy, setBusy] = useState(false)
  const need = (match.best_of + 1) / 2

  const save = async () => {
    const sa = Number(a), sb = Number(b)
    if (!Number.isInteger(sa) || !Number.isInteger(sb) || sa < 0 || sb < 0) return toast.error('Marcador inválido.')
    const winnerScore = Math.max(sa, sb), loserScore = Math.min(sa, sb)
    if (winnerScore !== need || loserScore >= need) return toast.error(`En BO${match.best_of} el ganador debe llegar a ${need} y el rival a menos.`)
    const winner = sa > sb ? match.team_a : match.team_b
    const next = stage.type === 'single_elim'
      ? matches.find((m) => m.round === match.round + 1 && m.position === Math.floor(match.position / 2)) : null
    if (next && next.status === 'completed' && next.winner_id) return toast.error('El siguiente cruce ya tiene resultado; edítalo primero.')
    setBusy(true)
    const r1 = await supabase.from('matches').update({
      score_a: sa, score_b: sb, winner_id: winner, status: 'completed', scheduled_at: when ? new Date(when).toISOString() : null,
    }).eq('id', match.id)
    if (r1.error) { setBusy(false); return toast.error(r1.error.message) }
    if (next) {
      const slot = match.position % 2 === 0 ? { team_a: winner } : { team_b: winner }
      const r2 = await supabase.from('matches').update(slot).eq('id', next.id)
      if (r2.error) { setBusy(false); return toast.error(r2.error.message) }
    }
    setBusy(false)
    toast.success('Resultado guardado.')
    onSaved()
    onClose()
  }

  const saveSchedule = async () => {
    setBusy(true)
    const { error } = await supabase.from('matches').update({ scheduled_at: when ? new Date(when).toISOString() : null }).eq('id', match.id)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Horario guardado.')
    onSaved()
    onClose()
  }

  return (
    <Modal title={`${teamName(match.team_a)} vs ${teamName(match.team_b)}`} onClose={onClose}>
      <div className="form-row">
        <label className="field"><span>{teamName(match.team_a)}</span><input type="number" min="0" max="5" value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label className="field"><span>{teamName(match.team_b)}</span><input type="number" min="0" max="5" value={b} onChange={(e) => setB(e.target.value)} /></label>
      </div>
      <label className="field"><span>Fecha y hora (opcional)</span><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
      <p className="hint">Formato BO{match.best_of}: el ganador necesita {need} {need === 1 ? 'victoria' : 'victorias'}.</p>
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <button className="btn btn--primary" disabled={busy} onClick={save} type="button">Guardar resultado</button>
        <button className="btn" disabled={busy} onClick={saveSchedule} type="button">Solo horario</button>
      </div>
    </Modal>
  )
}

/* --------------------- Resultado de una partida (BR) --------------------- */
function LobbyModal({ match, stage, teams, results, onClose, onSaved }) {
  const toast = useToast()
  const [rows, setRows] = useState(() => teams.map((t) => {
    const r = results.find((x) => x.match_id === match.id && x.registration_id === t.id)
    return { id: t.id, name: t.team_name, placement: r ? String(r.placement) : '', kills: r ? String(r.kills) : '0' }
  }))
  const [busy, setBusy] = useState(false)
  const setRow = (id, k, v) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r)))

  const save = async () => {
    const filled = rows.filter((r) => r.placement !== '')
    const places = filled.map((r) => Number(r.placement))
    if (places.some((p) => !Number.isInteger(p) || p < 1 || p > 30)) return toast.error('Puestos inválidos (1–30).')
    if (new Set(places).size !== places.length) return toast.error('Hay puestos repetidos.')
    if (filled.some((r) => !Number.isInteger(Number(r.kills)) || Number(r.kills) < 0)) return toast.error('Kills inválidos.')
    setBusy(true)
    const del = await supabase.from('match_results').delete().eq('match_id', match.id)
    if (del.error) { setBusy(false); return toast.error(del.error.message) }
    if (filled.length) {
      const ins = await supabase.from('match_results').insert(filled.map((r) => ({
        match_id: match.id, registration_id: r.id, placement: Number(r.placement), kills: Number(r.kills),
        points: brPoints(Number(r.placement), Number(r.kills), stage.config),
      })))
      if (ins.error) { setBusy(false); return toast.error(ins.error.message) }
    }
    await supabase.from('matches').update({ status: filled.length ? 'completed' : 'scheduled' }).eq('id', match.id)
    setBusy(false)
    toast.success('Partida guardada.')
    onSaved()
    onClose()
  }

  return (
    <Modal title={`Partida ${match.round}`} onClose={onClose}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Equipo</th><th>Puesto</th><th>Kills</th><th className="num">Pts</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td><input type="number" min="1" max="30" value={r.placement} onChange={(e) => setRow(r.id, 'placement', e.target.value)} style={{ width: 80 }} /></td>
                <td><input type="number" min="0" value={r.kills} onChange={(e) => setRow(r.id, 'kills', e.target.value)} style={{ width: 80 }} /></td>
                <td className="num">{r.placement ? brPoints(Number(r.placement), Number(r.kills) || 0, stage.config) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn--primary" disabled={busy} onClick={save} type="button">Guardar partida</button>
    </Modal>
  )
}

/* ------------------------------ Vista de fase ------------------------------ */
function MatchBox({ m, teamName, onClick }) {
  const done = m.status === 'completed'
  const row = (id, score) => (
    <div className={`match-team ${done && m.winner_id === id ? 'match-team--win' : ''} ${id ? '' : 'match-team--empty'}`}>
      <span>{id ? teamName(id) : 'Por definir'}</span><span>{done ? score : ''}</span>
    </div>
  )
  const playable = m.team_a && m.team_b
  return (
    <div className="match" onClick={playable ? onClick : undefined} style={{ cursor: playable ? 'pointer' : 'default' }}
      role={playable ? 'button' : undefined} tabIndex={playable ? 0 : undefined}
      onKeyDown={(e) => playable && e.key === 'Enter' && onClick()}>
      {row(m.team_a, m.score_a)}{row(m.team_b, m.score_b)}
    </div>
  )
}

function StageView({ stage, teamsById, onChanged, onDeleted }) {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [openMatch, setOpenMatch] = useState(null)
  const [drawing, setDrawing] = useState(false)

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
    if (stage.type === 'battle_royale') return [...teamsById.values()].filter((t) => t.game_key === stage.game_key && t.status === 'approved')
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
  const { matches, groups, groupTeams, results } = data

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
              <div className="table-wrap" style={{ marginBottom: '.8rem' }}>
                <table>
                  <thead><tr><th>#</th><th>Equipo</th><th className="num">PJ</th><th className="num">G</th><th className="num">P</th><th className="num">Dif</th><th className="num">Pts</th></tr></thead>
                  <tbody>
                    {groupStandings(ids, gm).map((r, i) => (
                      <tr key={r.id}><td>{i + 1}</td><td>{teamName(r.id)}</td><td className="num">{r.played}</td><td className="num">{r.wins}</td><td className="num">{r.losses}</td><td className="num">{r.diff}</td><td className="num"><strong>{r.points}</strong></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid" style={{ gap: '.5rem' }}>
                {gm.map((m) => <MatchBox key={m.id} m={m} teamName={teamName} onClick={() => setOpenMatch(m)} />)}
              </div>
            </div>
          )
        })}
      </div>
    )
  } else if (stage.type === 'single_elim') {
    const total = totalRounds(matches)
    body = (
      <div className="bracket">
        {Array.from({ length: total }, (_, i) => i + 1).map((r) => (
          <div className="bracket-round" key={r}>
            <h4>{roundName(r, total)}</h4>
            {matches.filter((m) => m.round === r).map((m) => <MatchBox key={m.id} m={m} teamName={teamName} onClick={() => setOpenMatch(m)} />)}
          </div>
        ))}
      </div>
    )
  } else {
    const totals = allTeams.map((t) => {
      const mine = results.filter((x) => x.registration_id === t.id)
      return { id: t.id, points: mine.reduce((s, x) => s + Number(x.points), 0), kills: mine.reduce((s, x) => s + x.kills, 0), played: mine.length }
    }).sort((x, y) => y.points - x.points || y.kills - x.kills)
    body = (
      <div className="grid grid--2">
        <div className="card"><h2>Partidas</h2>
          <div className="grid" style={{ gap: '.5rem' }}>
            {matches.map((m) => (
              <button key={m.id} className="btn" type="button" onClick={() => setOpenMatch(m)}>
                Partida {m.round} {m.status === 'completed' ? '(jugada)' : '(pendiente)'}
              </button>
            ))}
          </div>
        </div>
        <div className="card"><h2>Tabla general</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Equipo</th><th className="num">PJ</th><th className="num">Kills</th><th className="num">Pts</th></tr></thead>
            <tbody>{totals.map((r, i) => (
              <tr key={r.id}><td>{i + 1}</td><td>{teamName(r.id)}</td><td className="num">{r.played}</td><td className="num">{r.kills}</td><td className="num"><strong>{r.points}</strong></td></tr>
            ))}</tbody>
          </table></div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="stage-head">
        <div><h2 style={{ fontSize: '1.15rem' }}>{stage.name}</h2><p className="hint" style={{ margin: 0 }}>{STAGE_TYPES[stage.type]} · {stage.published ? 'Publicada en el sitio' : 'Borrador, no visible al público'}</p></div>
        <div className="page-actions">
          {stage.type !== 'battle_royale' && (
            <button className="btn" onClick={redraw} disabled={drawing} type="button">{drawing ? 'Sorteando…' : 'Sortear de nuevo'}</button>
          )}
          <button className="btn btn--ok" onClick={togglePublish} type="button">{stage.published ? 'Ocultar del sitio' : 'Publicar en el sitio'}</button>
          <button className="btn btn--bad" onClick={remove} type="button">Eliminar fase</button>
        </div>
      </div>
      {body}
      {openMatch && stage.type !== 'battle_royale' && (
        <MatchModal match={openMatch} stage={stage} matches={matches} teamName={teamName} onClose={() => setOpenMatch(null)} onSaved={refresh} />
      )}
      {openMatch && stage.type === 'battle_royale' && (
        <LobbyModal match={openMatch} stage={stage} teams={allTeams} results={results} onClose={() => setOpenMatch(null)} onSaved={refresh} />
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
        actions={<button className="btn btn--primary" onClick={() => setCreating(true)} type="button">+ Nueva fase</button>} />
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
        <StageView key={active.id} stage={active} teamsById={teamsById} onChanged={load} onDeleted={() => { setActiveId(null); load() }} />
      ) : (
        <p className="empty">Aún no hay fases para {GAME_LABEL[game]}. Crea la primera con “Nueva fase”.</p>
      )}
      {creating && (
        <NewStageModal gameKey={game} teams={approved} nextPosition={gameStages.length} onClose={() => setCreating(false)} onCreated={(id) => { setActiveId(id); load() }} />
      )}
    </>
  )
}
