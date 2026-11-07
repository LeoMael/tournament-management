import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui'
import { GAME_LABEL, money } from '../lib/format'
import { publicUrl } from '../lib/storage'
import { computeStandings, teamPhases } from '../lib/standings'
import { resolveSlots } from '../lib/bracket'
import { roomOfStage } from '../lib/rooms'

async function downloadTeamLogo(url, teamName) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    const safeName = teamName.toLowerCase().replace(/[^a-z0-9_-]/gi, '_')
    const ext = url.split('.').pop().split('?')[0] || 'png'
    a.download = `logo_${safeName}.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  }
}

function WithdrawModal({ team, onClose, onDone }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('registrations').update({
      status: 'withdrawn', withdrawn_at: new Date().toISOString(), withdrawal_reason: reason.trim() || null,
    }).eq('id', team.id)
    if (error) {
      setBusy(false)
      return toast.error(error.message.includes('registrations_status_check') ? 'Falta ejecutar 01_schema.sql actualizado en Supabase (estado "retirado").' : error.message)
    }
    toast.success(`${team.team_name} se retiró del torneo.`)
    onDone()
    onClose()
  }

  return (
    <Modal title={`Retirar a ${team.team_name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="card-sub">
          El equipo pasa al final de la tabla como «Retirado», libera su cupo y conserva su historial en grupos y llaves.
          Los partidos que tenga pendientes los resuelves tú en Grupos y llaves (por ejemplo, W.O.).
        </p>
        <label className="field"><span>Motivo (opcional)</span>
          <textarea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="note-actions" style={{ marginTop: 16 }}>
          <span className="hint">{reason.length}/300</span>
          <button className="btn btn--bad" disabled={busy} type="submit">{busy ? 'Retirando…' : 'Confirmar retiro'}</button>
        </div>
      </form>
    </Modal>
  )
}

function PodioSection({ top3, prizes, game }) {
  if (!top3 || top3.length === 0) return null
  const hasResults = top3.some((r) => r.points > 0 || r.wins > 0 || r.played > 0)
  if (!hasResults) return null

  const prizesMap = new Map((prizes || []).map((p) => [p.place, p]))
  const rankLabels = {
    1: { title: '1.º Lugar · Campeón', cls: 'podio-card--1' },
    2: { title: '2.º Lugar · Subcampeón', cls: 'podio-card--2' },
    3: { title: '3.º Lugar · Tercer Puesto', cls: 'podio-card--3' },
  }

  return (
    <section className="card podio-box">
      <div className="podio-head">
        <h2>Podio de Ganadores — Top 3</h2>
        <p className="card-sub">Equipos en puestos premiados con opción de descargar sus logos en alta resolución para publicaciones.</p>
      </div>
      <div className="podio-grid">
        {top3.map(({ team, rank, points, wins, kills }) => {
          const badge = rankLabels[rank] || { title: `${rank}.º Lugar`, cls: '' }
          const prize = prizesMap.get(rank)
          const logoUrl = publicUrl('team-logos', team.logo_path)
          const isUnap = team.institution === 'UNAP'
          const instLabel = isUnap ? 'UNAP' : (team.other_institution?.trim() || 'Otra')

          return (
            <div key={team.id} className={`podio-card ${badge.cls}`}>
              <div className="podio-card-head">
                <span className="podio-rank-tag">{badge.title}</span>
                {prize && <span className="podio-prize-tag">{money(prize.amount)}</span>}
              </div>

              <div className="podio-card-body">
                <div className="podio-avatar-wrap">
                  {logoUrl ? (
                    <img src={logoUrl} alt={team.team_name} className="podio-logo" />
                  ) : (
                    <span className="podio-logo-placeholder">
                      {team.team_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="podio-info">
                  <h3 className="podio-team-name">{team.team_name}</h3>
                  <p className="podio-inst">
                    <span className={`live-inst-tag ${isUnap ? 'live-inst-tag--unap' : ''}`}>{instLabel}</span>
                    {team.professional_school ? ` · ${team.professional_school}` : ''}
                  </p>
                  <p className="podio-stats">
                    <strong>{points} pts</strong> · {wins} {game === 'ff' ? 'Booyahs' : 'Victorias'}{game === 'ff' ? ` · ${kills} kills` : ''}
                  </p>
                </div>
              </div>

              <div className="podio-card-actions">
                {logoUrl ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--primary podio-btn"
                    onClick={() => downloadTeamLogo(logoUrl, team.team_name)}
                  >
                    Descargar logo
                  </button>
                ) : (
                  <span className="podio-no-logo">Sin logo subido</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function Teams() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [game, setGame] = useState('mlbb')
  const [withdrawing, setWithdrawing] = useState(null)
  const [onlyPlaying, setOnlyPlaying] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [openId, setOpenId] = useState(null) // equipo con los integrantes desplegados

  const load = useCallback(async () => {
    const [regs, stages, matches, results, players, prizes] = await Promise.all([
      supabase.from('registrations').select('id, game_key, team_name, logo_path, status, withdrawal_reason, institution, other_institution, professional_school').in('status', ['approved', 'withdrawn']),
      supabase.from('stages').select('id, game_key, type, name, position, created_at, config'),
      supabase.from('matches').select('id, stage_id, team_a, team_b, score_a, score_b, status, winner_id'),
      supabase.from('match_results').select('match_id, registration_id, placement, kills, points'),
      supabase.from('players').select('registration_id, slot, is_substitute, nickname, game_player_id, server_id').order('slot'),
      supabase.from('prizes').select('place, label, amount, description').order('place'),
    ])
    const err = regs.error || stages.error || matches.error || results.error || players.error
    if (err) setError(err.message)
    else {
      setData({
        regs: regs.data,
        stages: stages.data,
        matches: matches.data,
        results: results.data,
        players: players.data,
        prizes: prizes.data ?? [],
      })
      setError(null)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const { rows, phases, stageCount } = useMemo(() => {
    if (!data) return { rows: [], phases: new Map(), stageCount: 0 }
    const teams = data.regs.filter((t) => t.game_key === game)
    const stages = data.stages.filter((s) => s.game_key === game)
    return {
      rows: computeStandings(teams, stages, data.matches, data.results),
      phases: teamPhases(teams, stages, data.matches, data.results),
      stageCount: stages.length,
    }
  }, [data, game])

  // Integrantes de cada equipo.
  const playersByTeam = useMemo(() => {
    const map = new Map()
    ;(data?.players ?? []).forEach((p) => map.set(p.registration_id, [...(map.get(p.registration_id) ?? []), p]))
    return map
  }, [data])

  // Sala y lugar fijo de cada equipo, según la última fase Battle Royale del juego.
  const placing = useMemo(() => {
    const stage = (data?.stages ?? []).filter((s) => s.game_key === game && s.type === 'battle_royale')
      .sort((a, b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at))).at(-1)
    if (!stage) return null
    const participants = (data.regs ?? []).filter((t) => t.game_key === game && t.status === 'approved' && (!stage.config?.participants || stage.config.participants.includes(t.id)))
    const roomOf = roomOfStage(stage)
    return { rooms: Number(stage.config?.rooms) || 1, roomOf, slots: resolveSlots(participants, roomOf, stage.config?.slot_of), ids: new Set(participants.map((t) => t.id)) }
  }, [data, game])

  const counts = useMemo(() => {
    const count = (key) => (data?.regs ?? []).filter((t) => t.game_key === key && t.status === 'approved').length
    return { mlbb: count('mlbb'), ff: count('ff') }
  }, [data])

  const top3 = useMemo(() => {
    return rows.filter((r) => r.rank && r.rank <= 3 && r.team.status !== 'withdrawn')
  }, [rows])

  const reinstate = async (team) => {
    if (!window.confirm(`¿Reincorporar a "${team.team_name}" al torneo?`)) return
    setBusyId(team.id)
    const { error: err } = await supabase.from('registrations').update({ status: 'approved', withdrawn_at: null, withdrawal_reason: null }).eq('id', team.id)
    setBusyId(null)
    if (err) return toast.error(err.message)
    toast.success(`${team.team_name} volvió al torneo.`)
    load()
  }

  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  const active = rows.filter((r) => r.rank).length
  const isPlaying = (id) => ['playing', 'champion'].includes(phases.get(id)?.tone)
  const shown = onlyPlaying && stageCount > 1 ? rows.filter((r) => r.team.status !== 'withdrawn' && isPlaying(r.team.id)) : rows
  const leader = rows[0]?.rank && rows[0].points > 0 ? rows[0] : null
  const isBr = data.stages.some((s) => s.game_key === game && s.type === 'battle_royale')
  const slotCols = placing ? (placing.rooms > 1 ? 2 : 1) : 0
  const colCount = 3 + slotCols + (stageCount > 0 ? 1 : 0) + 2 + (isBr ? 1 : 2) + 3

  return (
    <>
      <PageHeader eyebrow="Torneo" title="Equipos y puntos" subtitle={`${active} equipos aprobados en competencia${rows.length > active ? ` · ${rows.length - active} retirados` : ''}.`} />
      <div className="grid grid--4" style={{ marginBottom: '1rem' }}>
        <div className="stat stat--accent"><small>En competencia</small><strong>{active}</strong><em>equipos aprobados</em></div>
        <div className="stat"><small>Retirados</small><strong>{rows.length - active}</strong><em>fuera del torneo</em></div>
        <div className="stat stat--ok"><small>Líder</small><strong style={{ fontSize: 20 }}>{leader ? leader.team.team_name : '—'}</strong><em>{leader ? `${leader.points} puntos` : 'Aún sin resultados'}</em></div>
      </div>

      <PodioSection top3={top3} prizes={data.prizes} game={game} />

      <div className="filter-bar">
        <div className="seg" role="group" aria-label="Juego">
          {['mlbb', 'ff'].map((key) => (
            <button key={key} type="button" className={`seg-btn ${game === key ? 'seg-btn--on' : ''}`} aria-pressed={game === key} onClick={() => setGame(key)}>
              {GAME_LABEL[key]}<span className="seg-count">{counts[key]}</span>
            </button>
          ))}
        </div>
        {stageCount > 1 && (
          <div className="seg" role="group" aria-label="Fase">
            {[[false, 'Todos'], [true, 'Siguen en competencia']].map(([value, label]) => (
              <button key={label} type="button" className={`seg-btn ${onlyPlaying === value ? 'seg-btn--on' : ''}`} aria-pressed={onlyPlaying === value} onClick={() => setOnlyPlaying(value)}>{label}</button>
            ))}
          </div>
        )}
      </div>
      <div className="table-wrap">
        <table className="table-nowrap table-lg">
          <thead>
            <tr>
              <th className="num">#</th><th></th><th>Equipo</th>
              {placing?.rooms > 1 && <th>Sala</th>}{placing && <th title="Lugar del equipo en la sala">Lugar en la sala</th>}
              {stageCount > 0 && <th>Fase</th>}<th className="num" title="Partidos jugados">PJ</th><th className="num" title={isBr ? 'Booyahs' : 'Victorias'}>{isBr ? 'Booyah' : 'G'}</th>
              {!isBr && <th className="num" title="Derrotas">P</th>}
              {!isBr && <th className="num" title="Diferencia de marcador">Dif</th>}
              {isBr && <th className="num">Kills</th>}
              <th className="num">Puntos</th><th>Estado</th><th className="th-actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ team, rank, played, wins, losses, diff, kills, points }) => {
              const logo = publicUrl('team-logos', team.logo_path)
              const out = team.status === 'withdrawn'
              const members = playersByTeam.get(team.id) ?? []
              const open = openId === team.id
              const inRoom = placing?.ids.has(team.id)
              return (
                <Fragment key={team.id}>
                <tr className={out ? 'row--withdrawn' : undefined}>
                  <td className="num">{rank ? <b>{rank}</b> : '—'}</td>
                  <td><span className={`dot ${open ? 'dot--on' : ''}`} /></td>
                  <td>
                    <div className="team-cell team-cell--inline">
                      {logo && <img src={logo} alt="" className="table-logo" loading="lazy" />}
                      <strong className="team-name">{team.team_name}</strong>
                      {team.status === 'withdrawn' && <span className="badge badge--withdrawn">Retirado</span>}
                    </div>
                  </td>
                  {placing?.rooms > 1 && <td>{inRoom ? <span className="slot-chip">Sala {placing.roomOf(team.id)}</span> : '—'}</td>}
                  {placing && <td>{inRoom ? <span className="slot-chip" title="Lugar fijo en la sala">{placing.slots[team.id]}</span> : '—'}</td>}
                  {stageCount > 0 && <td><StatusBadge status={phases.get(team.id)?.tone ?? 'pending'}>{phases.get(team.id)?.label ?? '—'}</StatusBadge></td>}
                  <td className="num">{played}</td>
                  <td className="num"><b>{wins}</b></td>
                  {!isBr && <td className="num">{losses}</td>}
                  {!isBr && <td className="num">{diff > 0 ? `+${diff}` : diff}</td>}
                  {isBr && <td className="num">{kills}</td>}
                  <td className="num"><strong>{points}</strong></td>
                  <td><StatusBadge status={team.status} /></td>
                  <td>
                    <div className="row-actions">
                      <button className="members-toggle" onClick={() => setOpenId(open ? null : team.id)} type="button">{open ? 'Ocultar' : `Integrantes (${members.length})`}</button>
                      {out ? (
                        <button className="btn btn--sm" disabled={busyId === team.id} onClick={() => reinstate(team)} type="button">Reincorporar</button>
                      ) : (
                        <button className="btn btn--sm btn--ghost" onClick={() => setWithdrawing(team)} type="button">Retirar</button>
                      )}
                    </div>
                  </td>
                </tr>
                {open && (
                  <tr className="row-detail">
                    <td colSpan={colCount}>
                      <div className="roster">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <p className="roster-meta" style={{ margin: 0 }}>
                            {team.institution === 'UNAP' ? 'UNAP' : team.other_institution || 'Otra institución'}
                            {team.professional_school ? ` · ${team.professional_school}` : ''}
                            {placing?.rooms > 1 && inRoom ? ` · Sala ${placing.roomOf(team.id)}` : ''}
                            {placing && inRoom ? ` · Lugar en la sala: ${placing.slots[team.id]}` : ''}
                          </p>
                          {logo && (
                            <button
                              type="button"
                              className="btn btn--sm btn--ghost"
                              onClick={() => downloadTeamLogo(logo, team.team_name)}
                              title="Descargar archivo original del logo"
                            >
                              Descargar logo
                            </button>
                          )}
                        </div>
                        {members.length === 0 ? <p className="hint">Sin integrantes registrados.</p> : (
                          <ul className="roster-list">
                            {members.map((p) => (
                              <li key={p.slot}>
                                <b>{p.nickname}</b>
                                {p.slot === 1 && <em>CAP</em>}{p.is_substitute && <em className="roster-sub">SUP</em>}
                                <small>ID {p.game_player_id}{p.server_id ? ` · Server ${p.server_id}` : ''}</small>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="empty">{rows.length === 0 ? 'Aún no hay equipos aprobados en este juego.' : 'Ningún equipo sigue en competencia.'}</p>}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Puntos: 3 por victoria en fase de grupos; en Battle Royale, la suma de puntos por posición y kills de cada sala.
        En llaves de eliminación directa no se otorgan puntos: solo cuentan partidos y victorias. Desempate: victorias, diferencia y kills.
      </p>
      {withdrawing && <WithdrawModal team={withdrawing} onClose={() => setWithdrawing(null)} onDone={load} />}
    </>
  )
}
