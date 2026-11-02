import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { ErrorBox, PageHeader, Spinner } from '../components/ui'
import QuickAssignModal from '../components/QuickAssignModal'
import EventModal from '../components/EventModal'
import { GAME_LABEL, dateTime, toLocalInput } from '../lib/format'
import { isBye, isDead, numberMatches, pendingLabel } from '../lib/bracket'

const TYPE_LABEL = { groups: 'Fase de grupos', single_elim: 'Eliminación directa', battle_royale: 'Battle Royale' }

export default function Schedule() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [game, setGame] = useState('mlbb')
  const [stageId, setStageId] = useState(null)
  const [edits, setEdits] = useState({}) // id de partido -> valor de datetime-local ('' = quitar la hora)
  const [assigning, setAssigning] = useState(false)
  const [eventModal, setEventModal] = useState(null) // { event } (null = nuevo)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [stages, matches, regs, groups, events] = await Promise.all([
      supabase.from('stages').select('id, game_key, name, type, position, created_at').order('position'),
      supabase.from('matches').select('id, stage_id, group_id, round, position, team_a, team_b, status, winner_id, best_of, scheduled_at, score_a'),
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

  const gameStages = useMemo(() => (data?.stages ?? []).filter((s) => s.game_key === game), [data, game])
  const stage = gameStages.find((s) => s.id === stageId) ?? gameStages.at(-1) ?? null

  // Partidos de la fase que se pueden programar (sin byes ni cruces vacíos), con su etiqueta.
  const rows = useMemo(() => {
    if (!data || !stage) return []
    const all = data.matches.filter((m) => m.stage_id === stage.id)
    const numbers = numberMatches(all)
    const name = (id, m, side) => (id ? data.names.get(id) ?? '—' : pendingLabel(m, side, all, numbers))
    return all.filter((m) => !isBye(m) && !isDead(m)).sort((a, b) => a.round - b.round || a.position - b.position).map((m) => {
      let label
      let sub = ''
      if (stage.type === 'battle_royale') label = `Partida ${m.round}`
      else if (stage.type === 'groups') { label = `${name(m.team_a, m, 'a')} vs ${name(m.team_b, m, 'b')}`; sub = `${data.groups.get(m.group_id) ?? 'Grupo'} · Ronda ${m.round}` }
      else { label = `${name(m.team_a, m, 'a')} vs ${name(m.team_b, m, 'b')}`; sub = `M${numbers.get(m.id)} · BO${m.best_of}` }
      return { ...m, label, sub, done: m.status === 'completed' }
    })
  }, [data, stage])

  const valueOf = (m) => (m.id in edits ? edits[m.id] : m.scheduled_at ? toLocalInput(m.scheduled_at) : '')
  const dirty = rows.filter((m) => m.id in edits && edits[m.id] !== (m.scheduled_at ? toLocalInput(m.scheduled_at) : ''))

  const save = async () => {
    setBusy(true)
    const results = await Promise.all(dirty.map((m) => supabase.from('matches')
      .update({ scheduled_at: edits[m.id] ? new Date(edits[m.id]).toISOString() : null }).eq('id', m.id)))
    setBusy(false)
    const failed = results.find((r) => r.error)
    if (failed) return toast.error(failed.error.message)
    toast.success(`${dirty.length} ${dirty.length === 1 ? 'horario guardado' : 'horarios guardados'}.`)
    setEdits({})
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
  const quickItems = rows.filter((m) => !m.done).map((m) => ({ id: m.id, label: m.label, round: m.round, position: m.position, hasTime: Boolean(valueOf(m)) }))
  return (
    <>
      <PageHeader eyebrow="Torneo" title="Cronograma" subtitle="Pon la hora de cada partido y agrega eventos. Lo que guardes aquí se ve en la página Cronograma del sitio."
        actions={<button className="btn btn--primary" type="button" disabled={quickItems.length === 0} onClick={() => setAssigning(true)}>Asignación rápida</button>} />

      <div className="filter-bar">
        <div className="seg" role="group" aria-label="Juego">
          {['mlbb', 'ff'].map((key) => (
            <button key={key} type="button" className={`seg-btn ${game === key ? 'seg-btn--on' : ''}`} aria-pressed={game === key} onClick={() => { setGame(key); setStageId(null); setEdits({}) }}>{GAME_LABEL[key]}</button>
          ))}
        </div>
        {gameStages.length > 0 && (
          <select aria-label="Fase" value={stage?.id ?? ''} onChange={(e) => { setStageId(e.target.value); setEdits({}) }} style={{ height: 38, borderRadius: 10 }}>
            {gameStages.map((s) => <option key={s.id} value={s.id}>{s.name} · {TYPE_LABEL[s.type]}</option>)}
          </select>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2>Partidos{stage ? ` · ${stage.name}` : ''}
          {dirty.length > 0 && <button className="btn btn--primary btn--sm" type="button" disabled={busy} onClick={save} style={{ marginLeft: 'auto' }}>{busy ? 'Guardando…' : `Guardar ${dirty.length} ${dirty.length === 1 ? 'cambio' : 'cambios'}`}</button>}
        </h2>
        {rows.length === 0 ? <p className="empty">{stage ? 'Esta fase no tiene partidos por programar.' : 'Aún no hay fases para este juego.'}</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Partido</th><th>Estado</th><th>Fecha y hora</th><th /></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className={m.done ? 'row--waiting' : undefined}>
                    <td><b>{m.label}</b>{m.sub && <small style={{ display: 'block', color: 'var(--muted)' }}>{m.sub}</small>}</td>
                    <td>{m.done ? 'Terminado' : 'Pendiente'}</td>
                    <td><input type="datetime-local" value={valueOf(m)} disabled={m.done} aria-label={`Hora de ${m.label}`}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [m.id]: e.target.value }))} /></td>
                    <td>{valueOf(m) && !m.done && <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEdits((prev) => ({ ...prev, [m.id]: '' }))}>Quitar hora</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Eventos <button className="btn btn--sm" type="button" onClick={() => setEventModal({ event: null })} style={{ marginLeft: 'auto' }}>+ Agregar evento</button></h2>
        {data.eventsMissing && <p className="pv-caption pv-caption--warn">Falta ejecutar 01_schema.sql actualizado en Supabase para poder guardar eventos.</p>}
        {data.events.length === 0 ? <p className="empty">Sin eventos. Agrega la inauguración, los descansos o la premiación.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Evento</th><th>Juego</th><th>Inicio</th><th>Fin</th><th /></tr></thead>
              <tbody>
                {data.events.map((ev) => (
                  <tr key={ev.id}>
                    <td><b>{ev.title}</b>{ev.note && <small style={{ display: 'block', color: 'var(--muted)' }}>{ev.note}</small>}</td>
                    <td>{ev.game_key ? GAME_LABEL[ev.game_key] : 'Ambos'}</td>
                    <td>{dateTime(ev.starts_at)}</td><td>{ev.ends_at ? dateTime(ev.ends_at) : '—'}</td>
                    <td><div className="row-actions row-actions--end">
                      <button type="button" className="btn btn--sm" onClick={() => setEventModal({ event: ev })}>Editar</button>
                      <button type="button" className="btn btn--sm btn--bad" onClick={() => removeEvent(ev)}>Eliminar</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {assigning && <QuickAssignModal items={quickItems} onClose={() => setAssigning(false)} onApply={(map) => setEdits((prev) => ({ ...prev, ...map }))} />}
      {eventModal && <EventModal event={eventModal.event} onClose={() => setEventModal(null)} onSaved={load} />}
    </>
  )
}
