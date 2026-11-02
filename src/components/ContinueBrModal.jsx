import { useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { Modal } from './ui'
import { generateStage } from '../lib/generateStage'

// Continuar desde una fase Battle Royale: se tocan los equipos que pasan a una nueva fase Battle Royale con
// sus propias partidas. Si la fase ya tenía definido cuántos pasan, vienen preseleccionados los mejores de la
// tabla general. Los puntos de la nueva fase empiezan en cero.
export default function ContinueBrModal({ stage, totals, teamName, pending, nextPosition, onClose, onCreated }) {
  const toast = useToast()
  const preset = Math.min(Number(stage.config?.qualify_count) || 0, totals.length) // 0 = no se definió antes
  const [manual, setManual] = useState({})
  const [name, setName] = useState('Gran final')
  const [lobbies, setLobbies] = useState(3)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => totals.map((t, i) => ({
    ...t,
    rank: i + 1,
    auto: i < preset,
    // Empata con el equipo de al lado en el corte (mismos puntos, Booyahs y kills).
    tie: preset > 0 && [i - 1, i + 1].some((j) => j >= 0 && j < totals.length && (i < preset) !== (j < preset)
      && totals[j].points === t.points && totals[j].wins === t.wins && totals[j].kills === t.kills),
  })), [totals, preset])
  const selected = rows.filter((r) => manual[r.id] ?? r.auto)
  const toggle = (r) => setManual((m) => ({ ...m, [r.id]: !(m[r.id] ?? r.auto) }))

  const create = async () => {
    const n = Math.floor(Number(lobbies))
    if (!name.trim()) return toast.error('Ponle un nombre a la fase.')
    if (selected.length < 2) return toast.error('Necesitas al menos 2 clasificados.')
    if (!(n >= 1 && n <= 20)) return toast.error('Cantidad de partidas inválida (1–20).')
    setBusy(true)
    let stageId = null
    try {
      const config = {
        lobbies: n, placement_points: stage.config?.placement_points, kill_points: stage.config?.kill_points,
        participants: selected.map((r) => r.id), source_stage: stage.id,
      }
      const { data, error } = await supabase.from('stages').insert({
        game_key: stage.game_key, name: name.trim(), type: 'battle_royale', position: nextPosition, config,
      }).select().single()
      if (error) throw new Error(error.message)
      stageId = data.id
      // Si pasaron exactamente los N primeros de la tabla, se recuerda N para resaltarlos en la fase de origen.
      if (selected.every((r) => r.rank <= selected.length)) {
        await supabase.from('stages').update({ config: { ...stage.config, qualify_count: selected.length } }).eq('id', stage.id)
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

  return (
    <Modal title={`Continuar desde ${stage.name}`} onClose={onClose}>
      <div className="form-row">
        <label className="field"><span>Nombre de la nueva fase</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field"><span>N.º de partidas</span>
          <input type="number" min="1" max="20" value={lobbies} onChange={(e) => setLobbies(e.target.value)} />
        </label>
      </div>
      <p className="hint">{preset > 0 ? `Vienen marcados los ${preset} primeros de la tabla.` : 'Toca a los equipos que pasan a la siguiente fase.'} Seleccionados: <b>{selected.length}</b>.</p>
      {pending > 0 && <p className="pv-caption pv-caption--warn">Aún hay {pending} {pending === 1 ? 'partida pendiente' : 'partidas pendientes'}: la tabla puede cambiar.</p>}
      {rows.some((r) => r.tie && manual[r.id] === undefined) && <p className="pv-caption pv-caption--warn">Hay empates en el corte (⚠). Toca a un equipo para incluirlo o quitarlo.</p>}
      <div className="qual-group">
        {rows.map((r) => {
          const on = manual[r.id] ?? r.auto
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
      <button className="btn btn--primary" disabled={busy || selected.length < 2} onClick={create} type="button">
        {busy ? 'Creando…' : `Crear fase con ${selected.length} clasificados`}
      </button>
    </Modal>
  )
}
