import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { battleRoyaleTotals } from '../lib/standings'
import { resolveSlots } from '../lib/bracket'
import { lobbyState, roomOfStage, roomState, STATE_LABEL } from '../lib/rooms'
import { shortDateTime } from '../lib/format'

// Fase Battle Royale: un árbol a la izquierda (tabla acumulada por sala y, por cada partida, sus salas)
// y a la derecha lo que se elige. Así cada sala se ve por separado.
export default function BrStageBody({ stage, matches, results, teams, teamName, busy, onAddLobby, onDeleteLobby, onSetQualify, onOpenLobby, onSetRoomFinished }) {
  const rooms = Number(stage.config?.rooms) || 1
  const roomOf = roomOfStage(stage)
  const roomList = Array.from({ length: rooms }, (_, i) => i + 1)
  const qualifyCount = Number(stage.config?.qualify_count) || 0
  const champion = stage.config?.champion
  const podium = stage.config?.podium || (champion ? [champion] : [])
  const totals = battleRoyaleTotals(teams, results)
  const slots = resolveSlots(teams, roomOf, stage.config?.slot_of) // número fijo de cada equipo en su sala

  const toast = useToast()
  const [copiedAi, setCopiedAi] = useState(false)

  const copyRoomForAi = async (room) => {
    const roomTeams = teams.filter((t) => roomOf(t.id) === room)
    if (!roomTeams.length) return toast.error('No hay equipos en esta sala.')

    const teamIds = roomTeams.map((t) => t.id)
    const { data: players, error } = await supabase
      .from('players')
      .select('registration_id, slot, is_substitute, nickname, game_player_id')
      .in('registration_id', teamIds)
      .order('slot')

    if (error) return toast.error('Error al cargar integrantes de la sala.')

    const playersByTeam = new Map()
    ;(players || []).forEach((p) => {
      playersByTeam.set(p.registration_id, [...(playersByTeam.get(p.registration_id) ?? []), p])
    })

    const sorted = [...roomTeams].sort((a, b) => (slots[a.id] ?? 99) - (slots[b.id] ?? 99) || teamName(a.id).localeCompare(teamName(b.id)))

    const listLines = sorted.map((t) => {
      const slotNum = slots[t.id] ? `Slot #${slots[t.id]}` : 'Slot s/n'
      const pList = playersByTeam.get(t.id)
      const playerStr = (pList && pList.length > 0)
        ? pList.map((p) => `${p.nickname}${p.is_substitute ? ' (Suplente)' : ''}`).join(', ')
        : 'Sin jugadores registrados'
      return `${slotNum} · ${teamName(t.id)}: ${playerStr}`
    }).join('\n')

    const promptText = `Actúa como árbitro asistente de torneos de Free Fire.
Te adjunto la captura de la pantalla final de la partida.
A continuación tienes la lista oficial de escuadras inscritas en esta sala con sus integrantes y suplentes registrados:

${listLines}

Instrucciones:
1. Analiza la imagen adjunta con la tabla o resumen final de la partida.
2. Identifica a qué escuadra corresponde cada puesto según los nicknames de sus integrantes (respetando símbolos especiales o tags).
3. Suma las bajas (kills) totales de cada escuadra.
4. Devuélveme el resultado únicamente en esta tabla de texto para transcribirlo rápidamente al panel:

Slot | Equipo | Puesto | Kills`

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(promptText)
      } else {
        const ta = document.createElement('textarea')
        ta.value = promptText
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopiedAi(true)
      toast.success('Lista de sala y prompt copiados al portapapeles.')
      setTimeout(() => setCopiedAi(false), 3000)
    } catch {
      toast.error('No se pudo copiar automáticamente al portapapeles.')
    }
  }

  const [view, setView] = useState({ kind: 'table', room: 1 })
  const [open, setOpen] = useState(() => new Set())
  const toggle = (id) => setOpen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const isSel = (kind, room, matchId) => view.kind === kind && view.room === room && (kind === 'table' || view.matchId === matchId)

  const label = (room) => (rooms > 1 ? `Sala ${room}` : 'General')
  const roomInfo = (m, room) => roomState(stage, m.id, room, results, teams)

  // --- panel derecho
  let panel
  if (view.kind === 'table') {
    const rows = totals.filter((r) => roomOf(r.id) === view.room)
    panel = (
      <div className="card">
        <h2>{rooms > 1 ? `Sala ${view.room} · tabla acumulada` : 'Tabla general'}
          <label className="qualify-field">{rooms > 1 ? 'Pasan por sala' : 'Pasan a la siguiente fase'}
            <input type="number" min="0" max={rows.length || undefined} placeholder="—" defaultValue={qualifyCount || ''} key={qualifyCount}
              onBlur={(e) => { if (Number(e.target.value || 0) !== qualifyCount) onSetQualify(e.target.value) }} />
          </label>
        </h2>
        <div className="table-wrap"><table>
          <thead><tr><th title="Posición en la tabla">Pos.</th><th title="Número fijo en la sala">N.º</th><th>Equipo</th><th className="num">PJ</th><th className="num" title="Booyahs">Booyah</th><th className="num">Kills</th><th className="num">Pts</th></tr></thead>
          <tbody>{rows.map((r, i) => {
            const pIdx = podium.indexOf(r.id)
            const isChamp = pIdx === 0
            const isSilver = pIdx === 1
            const isBronze = pIdx === 2
            const rowCls = isChamp ? 'row--champion' : isSilver ? 'row--silver' : isBronze ? 'row--bronze' : qualifyCount && i < qualifyCount ? 'row--qualify' : undefined
            return (
              <tr key={r.id} className={rowCls}>
              <td>{i + 1}</td><td><span className="slot-chip">{slots[r.id]}</span></td><td>{teamName(r.id)}{isChamp && <span className="badge badge--phase-champion" style={{ marginLeft: 8 }}>Campeón</span>}{isSilver && <span className="badge badge--phase-silver" style={{ marginLeft: 8 }}>Subcampeón</span>}{isBronze && <span className="badge badge--phase-bronze" style={{ marginLeft: 8 }}>3.º Puesto</span>}</td>
              <td className="num">{r.played}</td><td className="num">{r.wins}</td><td className="num">{r.kills}</td><td className="num"><strong>{r.points}</strong></td>
            </tr>
          )
          })}</tbody>
        </table></div>
        {rows.length === 0 && <p className="empty">Sin equipos en esta sala.</p>}
        {qualifyCount > 0 && <p className="hint" style={{ marginTop: 8 }}>{rooms > 1 ? `Pasan los ${qualifyCount} primeros de cada sala` : `Pasan los ${qualifyCount} primeros`} (en verde). Desempate: Booyahs y luego kills.</p>}
      </div>
    )
  } else {
    const match = matches.find((m) => m.id === view.matchId)
    const room = view.room
    const placed = match ? results.filter((r) => r.match_id === match.id && roomOf(r.registration_id) === room).sort((a, b) => a.placement - b.placement) : []
    const placedIds = new Set(placed.map((r) => r.registration_id))
    const info = match ? roomInfo(match, room) : null
    const waiting = teams.filter((t) => roomOf(t.id) === room && !placedIds.has(t.id)).sort((a, b) => slots[a.id] - slots[b.id])
    panel = match && (
      <div className="card">
        <h2>Partida {match.round}{rooms > 1 ? ` · Sala ${room}` : ''}
          <span className={`room-state room-state--${info.state}`}><i className={`state-dot state-dot--${info.state}`} />{STATE_LABEL[info.state]}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {info.state === 'done'
              ? info.marked && <button className="btn btn--sm" type="button" onClick={() => onSetRoomFinished(match, room, false)}>Reabrir sala</button>
              : info.state === 'live' && <button className="btn btn--sm btn--ok" type="button" onClick={() => onSetRoomFinished(match, room, true)} title="Termina aunque falten equipos por colocar">Marcar terminada</button>}
            <button
              className={`btn btn--sm ${copiedAi ? 'btn--ai-done' : 'btn--ai'}`}
              type="button"
              onClick={() => copyRoomForAi(room)}
              title="Copiar lista de jugadores (titulares y suplentes) y prompt para consultar a la IA"
            >
              {copiedAi ? 'Copiado para IA' : 'Copiar para IA'}
            </button>
            <button className="btn btn--sm btn--primary" type="button" onClick={() => onOpenLobby(match, room)}>
              {placed.length ? 'Editar resultado' : 'Cargar resultado'}
            </button>
          </span>
        </h2>
        {info.total > 0 && <p className="hint" style={{ margin: '-6px 0 10px' }}>{info.placed} de {info.total} equipos con puesto.</p>}
        <div className="table-wrap"><table>
          <thead><tr><th>Puesto</th><th>N.º</th><th>Equipo</th><th className="num">Kills</th><th className="num">Pts</th></tr></thead>
          <tbody>
            {placed.map((r) => (
              <tr key={r.registration_id}><td><strong>{r.placement}</strong></td><td><span className="slot-chip">{slots[r.registration_id]}</span></td><td>{teamName(r.registration_id)}</td><td className="num">{r.kills}</td><td className="num"><strong>{Number(r.points)}</strong></td></tr>
            ))}
            {waiting.map((t) => (
              <tr key={t.id} className="row--waiting"><td>—</td><td><span className="slot-chip">{slots[t.id]}</span></td><td>{teamName(t.id)}</td><td className="num">—</td><td className="num">—</td></tr>
            ))}
          </tbody>
        </table></div>
        {placed.length === 0 && <p className="hint" style={{ marginTop: 8 }}>Aún sin resultado en esta sala.</p>}
      </div>
    )
  }

  return (
    <div className="br-layout">
      <nav className="card tree" aria-label="Partidas y salas">
        <div className="tree-group">
          <span className="tree-title">Tabla acumulada</span>
          {roomList.map((room) => (
            <button key={room} type="button" className={`tree-leaf ${isSel('table', room) ? 'tree-leaf--on' : ''}`} onClick={() => setView({ kind: 'table', room })}>{label(room)}</button>
          ))}
        </div>
        <div className="tree-group">
          <span className="tree-title">Partidas
            <button className="btn btn--sm" type="button" disabled={busy} onClick={onAddLobby}>+ Agregar</button>
          </span>
          {matches.map((m) => {
            const expanded = rooms > 1 && open.has(m.id)
            const state = lobbyState(stage, m.id, results, teams)
            const done = state === 'done'
            return (
              <div className="tree-node" key={m.id}>
                <div className="tree-row">
                  <button type="button" className={`tree-parent ${done ? 'tree-parent--done' : ''}`} aria-expanded={rooms > 1 ? expanded : undefined}
                    onClick={() => (rooms > 1 ? toggle(m.id) : setView({ kind: 'match', room: 1, matchId: m.id }))}>
                    {rooms > 1 && <span className="tree-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>}
                    <b>P{m.round}</b><span>{STATE_LABEL[state]}{m.scheduled_at ? ` · ${shortDateTime(m.scheduled_at)}` : ''}</span>
                  </button>
                  {state === 'idle' && <button type="button" className="lobby-del" aria-label={`Eliminar partida ${m.round}`} title="Eliminar (solo pendientes)" disabled={busy} onClick={() => onDeleteLobby(m)}>×</button>}
                </div>
                {expanded && (
                  <div className="tree-children">
                    {roomList.map((room) => (
                      <button key={room} type="button" className={`tree-leaf ${isSel('match', room, m.id) ? 'tree-leaf--on' : ''}`} onClick={() => setView({ kind: 'match', room, matchId: m.id })}>
                        <span className="tree-leaf-name"><i className={`state-dot state-dot--${roomInfo(m, room).state}`} />Sala {room}</span><small>{STATE_LABEL[roomInfo(m, room).state]} · {roomInfo(m, room).placed}/{roomInfo(m, room).total}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {matches.length === 0 && <p className="hint">Sin partidas. Agrega la primera.</p>}
        </div>
      </nav>
      <div className="br-tables">{panel}</div>
    </div>
  )
}
