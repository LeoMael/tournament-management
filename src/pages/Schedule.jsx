import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Modal, PageHeader, Spinner } from '../components/ui'
import QuickAssignModal from '../components/QuickAssignModal'
import EventModal from '../components/EventModal'
import ScheduleAgenda from '../components/ScheduleAgenda'
import { GAME_LABEL, toLocalInput } from '../lib/format'
import { isBye, isDead, numberMatches, pendingLabel } from '../lib/bracket'
import { groupByDay } from '../lib/schedule'

const TYPE_LABEL = { groups: 'Fase de grupos', single_elim: 'Eliminación directa', battle_royale: 'Battle Royale' }

// Cambiar o quitar la hora de un partido.
function TimeModal({ match, onClose, onSaved }) {
  const toast = useToast()
  const [value, setValue] = useState(match.scheduled_at ? toLocalInput(match.scheduled_at) : '')
  const [busy, setBusy] = useState(false)
  const save = async (next) => {
    setBusy(true)
    const { error } = await supabase.from('matches').update({ scheduled_at: next ? new Date(next).toISOString() : null }).eq('id', match.id)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success(next ? 'Horario guardado.' : 'Horario quitado.')
    onSaved()
    onClose()
  }
  return (
    <Modal title={match.title} onClose={onClose}>
      <p className="hint">{match.sub}</p>
      <label className="field"><span>Fecha y hora</span><input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} autoFocus /></label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn--primary" type="button" disabled={busy || !value} onClick={() => save(value)}>Guardar</button>
        {match.scheduled_at && <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => save(null)}>Quitar hora</button>}
      </div>
    </Modal>
  )
}

export default function Schedule() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [game, setGame] = useState('all')
  const [stageId, setStageId] = useState(null)
  const [assigning, setAssigning] = useState(false)
  const [timeFor, setTimeFor] = useState(null)
  const [eventModal, setEventModal] = useState(null) // { event } (null = nuevo)

  const load = useCallback(async () => {
    const [stages, matches, regs, groups, events] = await Promise.all([
      supabase.from('stages').select('id, game_key, name, type, position').order('position'),
      supabase.from('matches').select('id, stage_id, group_id, round, position, team_a, team_b, status, winner_id, best_of, scheduled_at'),
      supabase.from('registrations').select('id, team_name'),
      supabase.from('groups').select('id, name'),
      supabase.from('schedule_events').select('*').order('starts_at'),
    ])
    const err = stages.error || matches.error || regs.error || groups.error
    if (err) return setError(err.message)
    // schedule_events solo existe tras ejecutar el SQL con cronograma; si falta, se trabaja sin eventos.
    setData({
      stages: stages.data, matches: matches.data, names: new Map(regs.data.map((r) => [r.id, r.team_name])),
      groups: new Map(groups.data.map((g) => [g.id, g.name])), events: events.error ? [] : events.data, eventsMissing: Boolean(events.error),
    })
    setError(null)
  }, [])
  useEffect(() => { load() }, [load])

  // Todos los partidos programables (sin byes ni cruces vacíos) de todas las fases, con su etiqueta.
  const rows = useMemo(() => {
    if (!data) return []
    return data.stages.flatMap((stage) => {
      const all = data.matches.filter((m) => m.stage_id === stage.id)
      const numbers = numberMatches(all)
      const name = (id, m, side) => (id ? data.names.get(id) ?? '—' : pendingLabel(m, side, all, numbers))
      return all.filter((m) => !isBye(m) && !isDead(m)).sort((a, b) => a.round - b.round || a.position - b.position).map((m) => {
        let title
        let detail = ''
        if (stage.type === 'battle_royale') title = `Partida ${m.round}`
        else {
          title = `${name(m.team_a, m, 'a')} vs ${name(m.team_b, m, 'b')}`
          detail = stage.type === 'groups' ? `${data.groups.get(m.group_id) ?? 'Grupo'} · Ronda ${m.round}` : `M${numbers.get(m.id)} · BO${m.best_of}`
        }
        return { ...m, kind: 'match', game: stage.game_key, title, stage: stage.name, stageId: stage.id, sub: `${stage.name}${detail ? ` · ${detail}` : ''}`, done: m.status === 'completed' }
      })
    })
  }, [data])

  const inGame = (g) => game === 'all' || !g || g === game
  const scheduled = rows.filter((m) => m.scheduled_at && inGame(m.game))
  const agendaItems = [
    ...scheduled.map((m) => ({ ...m, id: m.id, at: m.scheduled_at })),
    ...(data?.events ?? []).filter((e) => inGame(e.game_key)).map((e) => ({ kind: 'event', id: e.id, at: e.starts_at, end: e.ends_at, game: e.game_key, title: e.title, sub: e.note, raw: e })),
  ]
  const days = useMemo(() => groupByDay(agendaItems), [data, game]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fases con partidos por programar (pendientes y sin hora), según el filtro de juego.
  const pendingByStage = useMemo(() => {
    const map = new Map()
    rows.filter((m) => !m.scheduled_at && !m.done && inGame(m.game)).forEach((m) => map.set(m.stageId, [...(map.get(m.stageId) ?? []), m]))
    return map
  }, [rows, game]) // eslint-disable-line react-hooks/exhaustive-deps
  const stagesWithPending = (data?.stages ?? []).filter((s) => pendingByStage.has(s.id))
  const stage = stagesWithPending.find((s) => s.id === stageId) ?? stagesWithPending[0] ?? null
  const pending = stage ? pendingByStage.get(stage.id) : []

  const applyAuto = async (map) => {
    const results = await Promise.all(Object.entries(map).map(([id, local]) => supabase.from('matches').update({ scheduled_at: new Date(local).toISOString() }).eq('id', id)))
    const failed = results.find((r) => r.error)
    if (failed) return toast.error(failed.error.message)
    toast.success(`${results.length} horarios guardados.`)
    load()
  }

  const removeEvent = async (event) => {
    if (!window.confirm(`¿Eliminar el evento "${event.title}"?`)) return
    const { error: err } = await supabase.from('schedule_events').delete().eq('id', event.id)
    if (err) return toast.error(err.message)
    toast.success('Evento eliminado.')
    load()
  }

  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  const totalPending = [...pendingByStage.values()].reduce((sum, list) => sum + list.length, 0)
  return (
    <>
      <PageHeader eyebrow="Torneo" title="Cronograma" subtitle="El horario del torneo como agenda. Lo que programes aquí se ve en la página Cronograma del sitio."
        actions={<button className="btn" type="button" onClick={() => setEventModal({ event: null })}>+ Agregar evento</button>} />

      <div className="filter-bar">
        <div className="seg" role="group" aria-label="Juego">
          {[['all', 'Todos'], ['mlbb', GAME_LABEL.mlbb], ['ff', GAME_LABEL.ff]].map(([key, label]) => (
            <button key={key} type="button" className={`seg-btn ${game === key ? 'seg-btn--on' : ''}`} aria-pressed={game === key} onClick={() => { setGame(key); setStageId(null) }}>{label}</button>
          ))}
        </div>
        <span className="hint">{scheduled.length} programados · {totalPending} por programar</span>
      </div>

      {data.eventsMissing && <p className="pv-caption pv-caption--warn" style={{ marginBottom: 12 }}>Falta ejecutar 01_schema.sql actualizado en Supabase para poder guardar eventos.</p>}

      <div className="sch-layout">
        <div>
          <ScheduleAgenda days={days} onPick={(item) => (item.kind === 'event' ? setEventModal({ event: item.raw }) : setTimeFor(item))} />
        </div>

        <aside className="card sch-pending">
          <h2>Por programar</h2>
          {stagesWithPending.length === 0 ? <p className="empty">Todos los partidos pendientes ya tienen hora.</p> : (
            <>
              <select aria-label="Fase" value={stage?.id ?? ''} onChange={(e) => setStageId(e.target.value)}>
                {stagesWithPending.map((s) => <option key={s.id} value={s.id}>{GAME_LABEL[s.game_key]} · {s.name} ({pendingByStage.get(s.id).length})</option>)}
              </select>
              <p className="hint">{TYPE_LABEL[stage.type]}</p>
              <button className="btn btn--primary" type="button" onClick={() => setAssigning(true)}>Asignación rápida</button>
              <ul className="sch-list">
                {pending.map((m) => (
                  <li key={m.id}>
                    <span><b>{m.title}</b><small>{m.sub.replace(`${m.stage} · `, '')}</small></span>
                    <button type="button" className="btn btn--sm" onClick={() => setTimeFor(m)}>Hora</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>

      {assigning && stage && (
        <QuickAssignModal items={pending.map((m) => ({ id: m.id, label: m.title, round: m.round, position: m.position, hasTime: false }))}
          onClose={() => setAssigning(false)} onApply={applyAuto} />
      )}
      {timeFor && <TimeModal match={timeFor} onClose={() => setTimeFor(null)} onSaved={load} />}
      {eventModal && (
        <EventModal event={eventModal.event} onClose={() => setEventModal(null)} onSaved={load}
          onDelete={eventModal.event ? () => { removeEvent(eventModal.event); setEventModal(null) } : null} />
      )}
    </>
  )
}
