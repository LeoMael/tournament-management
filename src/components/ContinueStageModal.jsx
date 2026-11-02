import { useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { Modal } from './ui'
import StagePreview from './StagePreview'
import RoundFormat from './RoundFormat'
import { crossSeed, groupQualifiers, previewStage } from '../lib/bracket'
import { generateStage } from '../lib/generateStage'
import { useRoundBo } from '../lib/useRoundBo'

// Continuar desde una fase de grupos: elige a los clasificados (los mejores de cada grupo,
// ajustables a mano) y crea la llave de eliminación directa con ellos, cruzando grupos.
export default function ContinueStageModal({ stage, groups, groupTeams, matches, teamName, nextPosition, onClose, onCreated }) {
  const toast = useToast()
  const maxGroupSize = Math.max(1, ...groups.map((g) => groupTeams.filter((x) => x.group_id === g.id).length))
  const [perGroup, setPerGroup] = useState(Math.min(Number(stage.config?.qualify_per_group) || 2, Math.max(1, maxGroupSize - 1)))
  const [manual, setManual] = useState({}) // id -> true/false (anula la selección automática)
  const [name, setName] = useState('Llaves')
  const [busy, setBusy] = useState(false)

  const entries = useMemo(() => groupQualifiers(groups, groupTeams, matches, perGroup), [groups, groupTeams, matches, perGroup])
  const selected = entries.filter((e) => manual[e.id] ?? e.qualified)
  const orderedIds = useMemo(() => crossSeed(selected), [selected])
  const rounds = previewStage('single_elim', selected.length, {}).rounds ?? 0
  const [roundBo, setRoundBo] = useRoundBo(rounds)
  const pending = matches.filter((m) => m.group_id && m.status !== 'completed').length
  const ties = entries.some((e) => e.tie && (manual[e.id] === undefined))

  const changePerGroup = (value) => { setPerGroup(Number(value)); setManual({}) }
  const toggle = (e) => setManual((m) => ({ ...m, [e.id]: !(m[e.id] ?? e.qualified) }))

  const create = async () => {
    if (!name.trim()) return toast.error('Ponle un nombre a la fase.')
    if (selected.length < 2) return toast.error('Necesitas al menos 2 clasificados.')
    setBusy(true)
    let stageId = null
    try {
      const config = { best_of: roundBo[0], best_of_by_round: roundBo, source_stage: stage.id, qualify_per_group: perGroup }
      const { data, error } = await supabase.from('stages').insert({
        game_key: stage.game_key, name: name.trim(), type: 'single_elim', position: nextPosition, config,
      }).select().single()
      if (error) throw new Error(error.message)
      stageId = data.id
      // Se recuerda cuántos clasificaron por grupo para mostrarlo en la fase de origen.
      await supabase.from('stages').update({ config: { ...stage.config, qualify_per_group: perGroup } }).eq('id', stage.id)
      await generateStage({ stageId, type: 'single_elim', ids: orderedIds, config: data.config, ordered: true })
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
    <Modal title={`Continuar desde ${stage.name}`} onClose={onClose} wide>
      <div className="form-row">
        <label className="field"><span>Nombre de la nueva fase</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field"><span>Clasifican por grupo</span>
          <select value={perGroup} onChange={(e) => changePerGroup(e.target.value)}>
            {Array.from({ length: maxGroupSize }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'El primero' : `Los ${n} primeros`}</option>)}
          </select>
        </label>
      </div>

      {pending > 0 && <p className="pv-caption pv-caption--warn">Aún hay {pending} {pending === 1 ? 'partido' : 'partidos'} de grupos sin resultado: la clasificación puede cambiar.</p>}
      {ties && <p className="pv-caption pv-caption--warn">Hay empates en el corte (marcados con ⚠). Toca a un equipo para incluirlo o quitarlo.</p>}

      <div className="qual-groups">
        {groups.map((g) => (
          <div className="qual-group" key={g.id}>
            <h4>{g.name}</h4>
            {entries.filter((e) => e.group === g.name).map((e) => {
              const on = manual[e.id] ?? e.qualified
              return (
                <button key={e.id} type="button" className={`qual-row ${on ? 'qual-row--on' : ''}`} aria-pressed={on} onClick={() => toggle(e)}>
                  <span className="qual-rank">{e.rank}</span>
                  <span className="qual-name">{teamName(e.id)}</span>
                  {e.tie && <span title="Empate en el corte">⚠</span>}
                  <span className="qual-pts">{e.points} pts</span>
                  <span className="qual-mark" aria-hidden="true">{on ? '✓' : ''}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {selected.length >= 2 && (
        <>
          <RoundFormat values={roundBo} onChange={setRoundBo} />
          <StagePreview type="single_elim" total={selected.length} config={{}} roundBo={roundBo} names={orderedIds.map(teamName)} />
        </>
      )}
      <button className="btn btn--primary" disabled={busy || selected.length < 2} onClick={create} type="button">
        {busy ? 'Creando…' : `Crear fase con ${selected.length} clasificados`}
      </button>
    </Modal>
  )
}
