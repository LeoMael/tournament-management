import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { money, dateTime, GAME_LABEL } from '../lib/format'
import { ErrorBox, PageHeader, Spinner, StatusBadge } from '../components/ui'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [games, regs] = await Promise.all([
        supabase.from('games').select('*').order('key'),
        supabase.from('registrations').select('id, game_key, team_name, status, amount_due, created_at').order('created_at', { ascending: false }),
      ])
      if (!active) return
      const err = games.error || regs.error
      if (err) setError(err.message)
      else setData({ games: games.data, regs: regs.data })
    })()
    return () => { active = false }
  }, [])

  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />

  const { games, regs } = data
  const sum = (list) => list.reduce((acc, r) => acc + Number(r.amount_due), 0)
  const approved = regs.filter((r) => r.status === 'approved')
  const pending = regs.filter((r) => r.status === 'pending')

  return (
    <>
      <PageHeader eyebrow="Operación" title="Resumen" subtitle="Estado actual de inscripciones, recaudación y cupos." />
      <div className="grid grid--4" style={{ marginBottom: '1rem' }}>
        <div className="stat stat--ok"><small>Recaudación confirmada</small><strong>{money(sum(approved))}</strong><em>{approved.length} equipos aprobados</em></div>
        <div className="stat stat--warn"><small>Por verificar</small><strong>{money(sum(pending))}</strong><em>{pending.length} equipos pendientes</em></div>
        <div className="stat stat--accent"><small>Total inscripciones</small><strong>{regs.length}</strong><em>{regs.filter((r) => r.status === 'rejected').length} rechazadas</em></div>
      </div>

      <div className="grid grid--2" style={{ marginBottom: '1rem' }}>
        {games.map((g) => {
          const mine = regs.filter((r) => r.game_key === g.key)
          const used = mine.filter((r) => r.status !== 'rejected').length
          return (
            <div key={g.key} className="card game-card">
              <div className="game-card-head">
                <h2><span className={`tag tag--${g.key}`}>{GAME_LABEL[g.key]}</span> {g.name}</h2>
                <span>{money(g.price)} por equipo {!g.is_open && <span className="badge badge--rejected">Cerrado</span>}</span>
              </div>
              <div><span className="big-fig">{used}</span> <span className="hint" style={{ display: 'inline' }}>de {g.max_teams} cupos ocupados, quedan {g.max_teams - used}</span></div>
              <div className="bar" role="img" aria-label={`${used} de ${g.max_teams} cupos`}><i style={{ width: `${Math.min(100, (used / g.max_teams) * 100)}%` }} /></div>
              <p className="hint">
                Aprobados {mine.filter((r) => r.status === 'approved').length} · Pendientes {mine.filter((r) => r.status === 'pending').length} · Rechazados {mine.filter((r) => r.status === 'rejected').length}
              </p>
            </div>
          )
        })}
      </div>

      <div className="card">
        <h2>Últimas inscripciones</h2>
        {regs.length === 0 ? <p className="empty">Aún no hay inscripciones.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Equipo</th><th>Juego</th><th>Estado</th><th className="num">Monto</th><th>Fecha</th></tr></thead>
              <tbody>
                {regs.slice(0, 8).map((r) => (
                  <tr key={r.id}>
                    <td>{r.team_name}</td>
                    <td><span className={`tag tag--${r.game_key}`}>{GAME_LABEL[r.game_key]}</span></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="num">{money(r.amount_due)}</td>
                    <td>{dateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
