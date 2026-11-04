import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { ErrorBox, PageHeader, Spinner } from '../components/ui'
import { GAME_LABEL } from '../lib/format'
import { roomOfStage } from '../lib/rooms'
import { resolveSlots } from '../lib/bracket'

const PLATFORMS = ['YouTube', 'Facebook', 'TikTok', 'Twitch', 'Instagram', 'Kick', 'X (Twitter)']
const OTHER = 'Otro'
const MAX_LINKS = 8

const isHttps = (value) => {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}
// Un enlace nuevo en blanco. `custom` = el nombre de la red se escribe a mano ("Otro").
const blank = () => ({ platform: PLATFORMS[0], custom: '', url: '' })
const fromSaved = (link) => (PLATFORMS.includes(link.platform) ? { platform: link.platform, custom: '', url: link.url } : { platform: OTHER, custom: link.platform, url: link.url })
const toSaved = (row) => ({ platform: row.platform === OTHER ? row.custom.trim() : row.platform, url: row.url.trim() })

function LiveCard({ game, onSaved }) {
  const toast = useToast()
  const [rows, setRows] = useState(() => (game.live_links?.length ? game.live_links.map(fromSaved) : [blank()]))
  const [busy, setBusy] = useState(false)
  const savedLinks = game.live_links ?? []
  const setRow = (i, patch) => setRows((r) => r.map((row, k) => (k === i ? { ...row, ...patch } : row)))

  const write = async (patch, okText) => {
    setBusy(true)
    const { error } = await supabase.from('games').update({ ...patch, updated_at: new Date().toISOString() }).eq('key', game.key)
    setBusy(false)
    if (error) {
      toast.error(error.message.includes('live') ? 'Falta ejecutar 01_schema.sql actualizado en Supabase (en vivo).' : error.message)
      return false
    }
    toast.success(okText)
    onSaved()
    return true
  }

  const saveLinks = async () => {
    const links = rows.filter((r) => r.url.trim() || (r.platform === OTHER && r.custom.trim())).map(toSaved)
    if (links.some((l) => !l.platform)) return toast.error('Escribe el nombre de la red en los enlaces "Otro".')
    if (links.some((l) => !isHttps(l.url))) return toast.error('Cada enlace debe empezar con https://')
    if (game.live && links.length === 0) return toast.error('Mientras estés en vivo debe quedar al menos un enlace.')
    if (await write({ live_links: links }, 'Enlaces guardados.')) setRows(links.length ? links.map(fromSaved) : [blank()])
  }

  const toggleLive = async () => {
    if (!game.live && savedLinks.length === 0) return toast.error('Guarda primero al menos un enlace de transmisión.')
    await write({ live: !game.live }, game.live ? 'Transmisión terminada.' : `${GAME_LABEL[game.key]} está en vivo.`)
  }

  const dirty = JSON.stringify(rows.filter((r) => r.url.trim()).map(toSaved)) !== JSON.stringify(savedLinks.map((l) => ({ platform: l.platform, url: l.url })))

  return (
    <div className={`card live-card ${game.live ? 'live-card--on' : ''}`}>
      <div className="live-head">
        <h2><span className={`tag tag--${game.key}`}>{GAME_LABEL[game.key]}</span> {game.name}</h2>
        <button type="button" className={`live-switch ${game.live ? 'live-switch--on' : ''}`} role="switch" aria-checked={game.live} disabled={busy} onClick={toggleLive}>
          <i aria-hidden="true" />{game.live ? 'EN VIVO · Terminar' : 'Poner en vivo'}
        </button>
      </div>
      <p className="card-sub">{game.live ? 'El sitio muestra el aviso "EN VIVO" con estos enlaces.' : 'Agrega dónde se transmite y pon el juego en vivo cuando empiece.'}</p>

      <div className="live-links">
        {rows.map((row, i) => (
          <div className="live-row" key={i}>
            <select value={row.platform} aria-label="Red social" onChange={(e) => setRow(i, { platform: e.target.value })}>
              {[...PLATFORMS, OTHER].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {row.platform === OTHER && <input className="live-custom" placeholder="Nombre" maxLength={30} value={row.custom} onChange={(e) => setRow(i, { custom: e.target.value })} />}
            <input className="live-url" type="url" inputMode="url" placeholder="https://…" maxLength={300} value={row.url} onChange={(e) => setRow(i, { url: e.target.value })}
              aria-invalid={row.url.trim() !== '' && !isHttps(row.url.trim())} />
            <button type="button" className="btn btn--sm btn--ghost" aria-label="Quitar enlace" onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, k) => k !== i) : [blank()]))}>×</button>
          </div>
        ))}
      </div>
      <div className="live-actions">
        <button type="button" className="btn btn--sm" disabled={rows.length >= MAX_LINKS} onClick={() => setRows((r) => [...r, blank()])}>+ Agregar enlace</button>
        <button type="button" className="btn btn--primary" disabled={busy || !dirty} onClick={saveLinks}>{busy ? 'Guardando…' : 'Guardar enlaces'}</button>
      </div>
    </div>
  )
}

function LiveTransmissionGuide({ regs, stages, matches }) {
  const toast = useToast()
  const [activeGame, setActiveGame] = useState('ff')
  const [selectedFfStageId, setSelectedFfStageId] = useState(null)
  const [selectedMlbbStageId, setSelectedMlbbStageId] = useState(null)
  const [selectedRoom, setSelectedRoom] = useState(1)
  const [search, setSearch] = useState('')

  // Map rápido de registros por ID
  const regsMap = useMemo(() => new Map(regs.map((r) => [r.id, r])), [regs])

  // --- FREE FIRE (Salas y Slots) ---
  const ffStages = useMemo(() => {
    return stages
      .filter((s) => s.game_key === 'ff' && s.type === 'battle_royale')
      .sort((a, b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)))
  }, [stages])

  const currentFfStage = useMemo(() => {
    if (selectedFfStageId) {
      const found = ffStages.find((s) => s.id === selectedFfStageId)
      if (found) return found
    }
    return ffStages.at(-1) || null
  }, [ffStages, selectedFfStageId])

  const { participants, roomsCount, roomOf, slots, teamsInRoom, sortedTeams } = useMemo(() => {
    if (!currentFfStage) {
      return { participants: [], roomsCount: 1, roomOf: () => 1, slots: {}, teamsInRoom: [], sortedTeams: [] }
    }
    const parts = regs.filter((t) => t.game_key === 'ff' && (!currentFfStage.config?.participants || currentFfStage.config.participants.includes(t.id)))
    const rCount = Number(currentFfStage.config?.rooms) || 1
    const rOf = roomOfStage(currentFfStage)
    const sls = resolveSlots(parts, rOf, currentFfStage.config?.slot_of)
    const inRoom = parts.filter((t) => rOf(t.id) === selectedRoom)
    const sorted = [...inRoom].sort((a, b) => (sls[a.id] ?? 999) - (sls[b.id] ?? 999) || a.team_name.localeCompare(b.team_name))
    return { participants: parts, roomsCount: rCount, roomOf: rOf, slots: sls, teamsInRoom: inRoom, sortedTeams: sorted }
  }, [currentFfStage, regs, selectedRoom])

  // Resumen de instituciones y carreras en la sala actual
  const { institutionSummary, careerSummary } = useMemo(() => {
    const instMap = new Map()
    const carMap = new Map()
    teamsInRoom.forEach((t) => {
      const inst = t.institution === 'UNAP' ? 'UNAP' : (t.other_institution?.trim() || 'Otra')
      instMap.set(inst, (instMap.get(inst) || 0) + 1)
      const car = t.professional_school?.trim() || 'Sin carrera'
      carMap.set(car, (carMap.get(car) || 0) + 1)
    })
    const instList = Array.from(instMap.entries()).sort((a, b) => b[1] - a[1])
    const carList = Array.from(carMap.entries()).sort((a, b) => b[1] - a[1])
    return { institutionSummary: instList, careerSummary: carList }
  }, [teamsInRoom])

  // Filtrado por buscador
  const filteredFfTeams = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return sortedTeams
    return sortedTeams.filter((t) => {
      const inst = (t.institution === 'UNAP' ? 'UNAP' : (t.other_institution || 'Otra')).toLowerCase()
      const car = (t.professional_school || '').toLowerCase()
      const name = (t.team_name || '').toLowerCase()
      const slotStr = `slot ${slots[t.id] ?? ''}`.toLowerCase()
      return name.includes(q) || inst.includes(q) || car.includes(q) || slotStr.includes(q)
    })
  }, [sortedTeams, search, slots])

  const copyFfList = () => {
    if (sortedTeams.length === 0) return toast.error('No hay equipos en esta sala.')
    const lines = [
      `RAGNAROK U-SERIES — FREE FIRE`,
      `Fase: ${currentFfStage.name} | Sala ${selectedRoom} (${sortedTeams.length} equipos)`,
      `--------------------------------------------------`,
      ...sortedTeams.map((t) => {
        const slot = slots[t.id] ? `Slot ${slots[t.id]}` : 'Slot --'
        const inst = t.institution === 'UNAP' ? 'UNAP' : (t.other_institution?.trim() || 'Otra')
        const car = t.professional_school?.trim() || 'No especificada'
        return `${slot}: ${t.team_name} | ${inst} — ${car}`
      })
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    toast.success('Lista de slots copiada al portapapeles.')
  }

  // --- MOBILE LEGENDS (Cruces) ---
  const mlbbStages = useMemo(() => {
    return stages.filter((s) => s.game_key === 'mlbb').sort((a, b) => a.position - b.position)
  }, [stages])

  const currentMlbbStage = useMemo(() => {
    if (selectedMlbbStageId) {
      const found = mlbbStages.find((s) => s.id === selectedMlbbStageId)
      if (found) return found
    }
    return mlbbStages.at(-1) || null
  }, [mlbbStages, selectedMlbbStageId])

  const stageMatches = useMemo(() => {
    if (!currentMlbbStage) return []
    return matches
      .filter((m) => m.stage_id === currentMlbbStage.id)
      .sort((a, b) => a.round - b.round || a.position - b.position)
  }, [matches, currentMlbbStage])

  const filteredMlbbMatches = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return stageMatches
    return stageMatches.filter((m) => {
      const tA = regsMap.get(m.team_a)
      const tB = regsMap.get(m.team_b)
      const textA = tA ? `${tA.team_name} ${tA.institution} ${tA.other_institution ?? ''} ${tA.professional_school ?? ''}`.toLowerCase() : ''
      const textB = tB ? `${tB.team_name} ${tB.institution} ${tB.other_institution ?? ''} ${tB.professional_school ?? ''}`.toLowerCase() : ''
      return textA.includes(q) || textB.includes(q)
    })
  }, [stageMatches, regsMap, search])

  const copyMlbbMatches = () => {
    if (stageMatches.length === 0) return toast.error('No hay cruces disponibles.')
    const lines = [
      `RAGNAROK U-SERIES — MOBILE LEGENDS`,
      `Fase: ${currentMlbbStage.name} (${stageMatches.length} enfrentamientos)`,
      `--------------------------------------------------`,
      ...stageMatches.map((m, i) => {
        const tA = regsMap.get(m.team_a)
        const tB = regsMap.get(m.team_b)
        const nameA = tA ? `${tA.team_name} (${tA.institution === 'UNAP' ? 'UNAP' : (tA.other_institution || 'Otra')} — ${tA.professional_school || 'Sin carrera'})` : 'Por definir'
        const nameB = tB ? `${tB.team_name} (${tB.institution === 'UNAP' ? 'UNAP' : (tB.other_institution || 'Otra')} — ${tB.professional_school || 'Sin carrera'})` : 'Por definir'
        return `Cruce ${i + 1} (Ronda ${m.round}): ${nameA} VS ${nameB}`
      })
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    toast.success('Cruces de transmisión copiados al portapapeles.')
  }

  const ffCount = regs.filter((r) => r.game_key === 'ff').length
  const mlbbCount = regs.filter((r) => r.game_key === 'mlbb').length

  return (
    <section className="card live-guide">
      <div className="live-guide-top">
        <h2 className="live-guide-title">
          Guía de transmisión y enfrentamientos
        </h2>

        <div className="live-guide-controls">
          <div className="seg" role="group" aria-label="Juego para guía de transmisión">
            <button
              type="button"
              className={`seg-btn ${activeGame === 'ff' ? 'seg-btn--on' : ''}`}
              onClick={() => { setActiveGame('ff'); setSearch('') }}
            >
              Free Fire
              <span className="seg-count">{ffCount}</span>
            </button>
            <button
              type="button"
              className={`seg-btn ${activeGame === 'mlbb' ? 'seg-btn--on' : ''}`}
              onClick={() => { setActiveGame('mlbb'); setSearch('') }}
            >
              Mobile Legends
              <span className="seg-count">{mlbbCount}</span>
            </button>
          </div>

          {activeGame === 'ff' && (
            <button type="button" className="btn btn--sm" onClick={copyFfList}>
              Copiar lista de slots
            </button>
          )}

          {activeGame === 'mlbb' && (
            <button type="button" className="btn btn--sm" onClick={copyMlbbMatches}>
              Copiar cruces
            </button>
          )}
        </div>
      </div>

      <p className="card-sub">
        {activeGame === 'ff'
          ? 'Lista de equipos ordenada por número de slot para identificar rivalidades entre instituciones y carreras en la transmisión.'
          : 'Lista de cruces y enfrentamientos directos entre equipos de distintas carreras e instituciones.'}
      </p>

      {/* --- VISTA FREE FIRE --- */}
      {activeGame === 'ff' && (
        <>
          <div className="live-guide-top">
            <div className="live-guide-filter">
              {ffStages.length > 1 && (
                <select
                  value={currentFfStage?.id ?? ''}
                  onChange={(e) => setSelectedFfStageId(e.target.value)}
                  aria-label="Fase de Free Fire"
                >
                  {ffStages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}

              {roomsCount > 1 && (
                <div className="seg" role="group" aria-label="Salas">
                  {Array.from({ length: roomsCount }, (_, i) => i + 1).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`seg-btn ${selectedRoom === r ? 'seg-btn--on' : ''}`}
                      onClick={() => setSelectedRoom(r)}
                    >
                      Sala {r}
                      <span className="seg-count">
                        {participants.filter((t) => roomOf(t.id) === r).length}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              type="search"
              className="live-guide-search"
              placeholder="Buscar por equipo, carrera o institución…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar en la sala"
            />
          </div>

          {!currentFfStage ? (
            <p className="hint">Aún no hay fases de Free Fire configuradas en Grupos y llaves.</p>
          ) : teamsInRoom.length === 0 ? (
            <p className="hint">No hay equipos asignados a la Sala {selectedRoom}.</p>
          ) : (
            <>
              {/* Barra de métricas y duelo de carreras/universidades */}
              <div className="live-guide-meta">
                <div>
                  <strong>{teamsInRoom.length}</strong> equipos en Sala {selectedRoom}
                </div>
                <span className="dot-sep">|</span>
                <div className="live-meta-group">
                  <span>Instituciones:</span>
                  {institutionSummary.map(([inst, count]) => (
                    <span key={inst} className={`live-inst-tag ${inst === 'UNAP' ? 'live-inst-tag--unap' : ''}`}>
                      {inst}: {count}
                    </span>
                  ))}
                </div>
                <span className="dot-sep">|</span>
                <div className="live-meta-group">
                  <span>Carreras:</span>
                  {careerSummary.slice(0, 6).map(([car, count]) => (
                    <span key={car} style={{ color: 'var(--text)', fontWeight: 600 }}>
                      {car} ({count})
                    </span>
                  ))}
                  {careerSummary.length > 6 && (
                    <span style={{ opacity: 0.65 }}>
                      +{careerSummary.length - 6} más
                    </span>
                  )}
                </div>
              </div>

              {/* Tabla de Slots */}
              <div className="table-wrap">
                <table className="live-table">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Slot</th>
                      <th>Equipo</th>
                      <th style={{ width: 150 }}>Institución</th>
                      <th>Carrera / Escuela profesional</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFfTeams.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                          No se encontraron equipos que coincidan con &quot;{search}&quot;.
                        </td>
                      </tr>
                    ) : (
                      filteredFfTeams.map((team) => {
                        const slotNum = slots[team.id]
                        const isUnap = team.institution === 'UNAP'
                        const instLabel = isUnap ? 'UNAP' : (team.other_institution?.trim() || 'Otra')
                        const schoolLabel = team.professional_school?.trim() || 'No especificada'

                        return (
                          <tr key={team.id}>
                            <td>
                              <span className="live-slot-badge">
                                Slot {slotNum ?? '—'}
                              </span>
                            </td>
                            <td>
                              <span className="live-team-name">{team.team_name}</span>
                            </td>
                            <td>
                              <span className={`live-inst-tag ${isUnap ? 'live-inst-tag--unap' : ''}`}>
                                {instLabel}
                              </span>
                            </td>
                            <td>
                              <span className="live-career">{schoolLabel}</span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* --- VISTA MOBILE LEGENDS --- */}
      {activeGame === 'mlbb' && (
        <>
          <div className="live-guide-top">
            <div className="live-guide-filter">
              {mlbbStages.length > 1 && (
                <select
                  value={currentMlbbStage?.id ?? ''}
                  onChange={(e) => setSelectedMlbbStageId(e.target.value)}
                  aria-label="Fase de Mobile Legends"
                >
                  {mlbbStages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>

            <input
              type="search"
              className="live-guide-search"
              placeholder="Buscar por equipo, carrera o institución…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar cruce"
            />
          </div>

          {!currentMlbbStage ? (
            <p className="hint">Aún no hay fases de Mobile Legends configuradas en Grupos y llaves.</p>
          ) : stageMatches.length === 0 ? (
            <p className="hint">Aún no se han generado cruces o partidas para esta fase.</p>
          ) : (
            <div className="table-wrap">
              <table className="live-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Ronda</th>
                    <th>Equipo A</th>
                    <th style={{ width: 50, textAlign: 'center' }}>VS</th>
                    <th>Equipo B</th>
                    <th style={{ width: 120 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMlbbMatches.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                        No se encontraron cruces que coincidan con &quot;{search}&quot;.
                      </td>
                    </tr>
                  ) : (
                    filteredMlbbMatches.map((m) => {
                      const tA = regsMap.get(m.team_a)
                      const tB = regsMap.get(m.team_b)
                      const isUnapA = tA?.institution === 'UNAP'
                      const isUnapB = tB?.institution === 'UNAP'

                      return (
                        <tr key={m.id}>
                          <td>
                            <span className="live-slot-badge">R{m.round} · #{m.position + 1}</span>
                          </td>
                          <td>
                            {tA ? (
                              <div className="live-match-team">
                                <span className="live-team-name">{tA.team_name}</span>
                                <span className="live-match-sub">
                                  <span className={`live-inst-tag ${isUnapA ? 'live-inst-tag--unap' : ''}`}>
                                    {isUnapA ? 'UNAP' : (tA.other_institution || 'Otra')}
                                  </span>
                                  {' '}{tA.professional_school || 'Sin carrera'}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Por definir</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="live-vs-badge">VS</span>
                          </td>
                          <td>
                            {tB ? (
                              <div className="live-match-team">
                                <span className="live-team-name">{tB.team_name}</span>
                                <span className="live-match-sub">
                                  <span className={`live-inst-tag ${isUnapB ? 'live-inst-tag--unap' : ''}`}>
                                    {isUnapB ? 'UNAP' : (tB.other_institution || 'Otra')}
                                  </span>
                                  {' '}{tB.professional_school || 'Sin carrera'}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Por definir</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge badge--${m.status === 'finished' ? 'approved' : m.status === 'live' ? 'rejected' : 'pending'}`}>
                              {m.status === 'finished' ? 'Finalizado' : m.status === 'live' ? 'En curso' : 'Pendiente'}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default function Live() {
  const [games, setGames] = useState(null)
  const [regs, setRegs] = useState([])
  const [stages, setStages] = useState([])
  const [matches, setMatches] = useState([])
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [gamesRes, regsRes, stagesRes, matchesRes] = await Promise.all([
      supabase.from('games').select('key, name, live, live_links').order('key'),
      supabase.from('registrations').select('id, game_key, team_name, status, institution, other_institution, professional_school').eq('status', 'approved'),
      supabase.from('stages').select('id, game_key, type, name, position, created_at, config').order('position'),
      supabase.from('matches').select('id, stage_id, round, position, team_a, team_b, status, winner_id')
    ])

    if (gamesRes.error) {
      setError(gamesRes.error.message.includes('live') ? 'Falta ejecutar 01_schema.sql actualizado en Supabase (columnas de en vivo).' : gamesRes.error.message)
      return
    }

    setGames(gamesRes.data)
    setRegs(regsRes.data ?? [])
    setStages(stagesRes.data ?? [])
    setMatches(matchesRes.data ?? [])
    setError(null)
  }, [])

  useEffect(() => { load() }, [load])

  if (error) return <ErrorBox error={error} />
  if (!games) return <Spinner />

  return (
    <>
      <PageHeader
        eyebrow="Torneo"
        title="En vivo"
        subtitle="Cada juego tiene su propia transmisión: pon los enlaces de las redes, márcalo en vivo y consulta los slots y enfrentamientos para casteo."
      />

      <div className="grid grid--2">
        {games.map((g) => <LiveCard key={g.key} game={g} onSaved={load} />)}
      </div>

      <LiveTransmissionGuide
        regs={regs}
        stages={stages}
        matches={matches}
      />
    </>
  )
}
