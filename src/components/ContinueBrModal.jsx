import { useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { Modal } from './ui'
import { generateStage } from '../lib/generateStage'
import { distributeRooms, resolveSlots, roomsNeeded } from '../lib/bracket'

// Continuar desde una fase Battle Royale: se tocan los equipos que pasan a una nueva fase Battle Royale con
// sus propias partidas. Si la fase tiene varias salas, cada una tiene su tabla y pasan los mejores de cada sala.
// Si ya estaba definido cuántos pasan, vienen preseleccionados; si no, se elige tocando. Los puntos empiezan en cero.
export default function ContinueBrModal({ stage, totals, teamName, pending, nextPosition, onClose, onCreated }) {
  const toast = useToast()
  const rooms = Number(stage.config?.rooms) || 1
  const roomOf = (id) => (rooms > 1 ? Math.min(stage.config?.room_of?.[id] ?? 1, rooms) : 1)
  const preset = Number(stage.config?.qualify_count) || 0 // 0 = no se definió antes (por sala si hay varias)
  const [manual, setManual] = useState({})
  const [name, setName] = useState('Gran final')
  const [lobbies, setLobbies] = useState(3)
  const [busy, setBusy] = useState(false)

  // Tabla de cada sala (el orden de `totals` ya es el de la tabla), con la posición dentro de su sala.
  const byRoom = useMemo(() => Array.from({ length: rooms }, (_, i) => i + 1).map((room) => {
    const list = totals.filter((t) => roomOf(t.id) === room)
    return {
      room,
      rows: list.map((t, i) => ({
        ...t, rank: i + 1, auto: i < preset,
        tie: preset > 0 && [i - 1, i + 1].some((j) => j >= 0 && j < list.length && (i < preset) !== (j < preset)
          && list[j].points === t.points && list[j].wins === t.wins && list[j].kills === t.kills),
      })),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [totals, rooms, preset])
  const all = byRoom.flatMap((r) => r.rows)
  const isOn = (r) => manual[r.id] ?? r.auto
  const selected = all.filter(isOn)
  const toggle = (r) => setManual((m) => ({ ...m, [r.id]: !isOn(r) }))

  const create = async () => {
    const n = Math.floor(Number(lobbies))
    if (!name.trim()) return toast.error('Ponle un nombre a la fase.')
    if (selected.length < 2) return toast.error('Necesitas al menos 2 clasificados.')
    if (!(n >= 1 && n <= 20)) return toast.error('Cantidad de partidas inválida (1–20).')
    setBusy(true)
    let stageId = null
    try {
      const ids = selected.map((r) => r.id)
      const newRooms = roomsNeeded(ids.length) // más de 12 clasificados: varias salas
      const roomOfNew = newRooms > 1 ? distributeRooms(ids, newRooms) : {}
      const config = {
        lobbies: n, placement_points: stage.config?.placement_points, kill_points: stage.config?.kill_points,
        participants: ids, source_stage: stage.id,
        ...(newRooms > 1 ? { rooms: newRooms, room_of: roomOfNew } : {}),
        slot_of: resolveSlots(ids.map((id) => ({ id, team_name: teamName(id) })), (id) => roomOfNew[id] ?? 1, {}),
      }
      const { data, error } = await supabase.from('stages').insert({
        game_key: stage.game_key, name: name.trim(), type: 'battle_royale', position: nextPosition, config,
      }).select().single()
      if (error) throw new Error(error.message)
      stageId = data.id
      // Si pasaron exactamente los K primeros de cada sala, se recuerda K para resaltarlos en la fase de origen.
      const k = Math.max(...selected.map((r) => r.rank))
      if (all.every((r) => isOn(r) === (r.rank <= k))) {
        await supabase.from('stages').update({ config: { ...stage.config, qualify_count: k } }).eq('id', stage.id)
      }
      await generateStage({ stageId, type: 'battle_royale', ids: [], config: data.config })
      toast.success('Fase creada con los clasificados. Revísala y publícala cuando esté lista.')
      onCreated(stageId)
      onClose()
    } catch (err) {
      if (stageId) await supabase.from('stages').delete().eq('id', stageId)
      toast.error(err.message)
      setBusy(false)
    }
  }

  const hint = preset > 0
    ? `Vienen marcados los ${preset} primeros${rooms > 1 ? ' de cada sala' : ' de la tabla'}.`
    : `Toca a los equipos que pasan a la siguiente fase${rooms > 1 ? ' (de cada sala)' : ''}.`
  return (
    <Modal title={`Continuar desde ${stage.name}`} onClose={onClose} wide={rooms > 1}>
      <div className="form-row">
        <label className="field"><span>Nombre de la nueva fase</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field"><span>N.º de partidas</span>
          <input type="number" min="1" max="20" value={lobbies} onChange={(e) => setLobbies(e.target.value)} />
        </label>
      </div>
      <p className="hint">{hint} Seleccionados: <b>{selected.length}</b>.</p>
      {pending > 0 && <p className="pv-caption pv-caption--warn">Aún hay {pending} {pending === 1 ? 'partida pendiente' : 'partidas pendientes'}: la tabla puede cambiar.</p>}
      {all.some((r) => r.tie && manual[r.id] === undefined) && <p className="pv-caption pv-caption--warn">Hay empates en el corte (⚠). Toca a un equipo para incluirlo o quitarlo.</p>}
      <div className="qual-groups">
        {byRoom.map(({ room, rows }) => (
          <div className="qual-group" key={room}>
            {rooms > 1 && <h4>Sala {room}</h4>}
            {rows.map((r) => {
              const on = isOn(r)
              return (
                <button key={r.id} type="button" className={`qual-row ${on ? 'qual-row--on' : ''}`} aria-pressed={on} onClick={() => toggle(r)}>
                  <span className="qual-rank">{r.rank}</span>
                  <span className="qual-name">{teamName(r.id)}</span>
                  {r.tie ? <span title="Empate en el corte">⚠</span> : <span />}
                  <span className="qual-pts">{r.points} pts · {r.kills} kills</span>
                  <span className="qual-mark" aria-hidden="true">{on ? '✓' : ''}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <button className="btn btn--primary" disabled={busy || selected.length < 2} onClick={create} type="button">
        {busy ? 'Creando…' : `Crear fase con ${selected.length} clasificados`}
      </button>
    </Modal>
  )
}
