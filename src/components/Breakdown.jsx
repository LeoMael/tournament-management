import { useMemo, useState } from 'react'
import RankBars from './RankBars'
import { careerOf, tally, universityOf } from '../lib/demographics'
import { downloadCsv } from '../lib/csv'
import { GAME_LABEL } from '../lib/format'

// Equipos y jugadores por universidad y por carrera. Tocar una universidad filtra las carreras.
export default function Breakdown({ regs, playersByReg }) {
  const [game, setGame] = useState('')
  const [onlyApproved, setOnlyApproved] = useState(false)
  const [university, setUniversity] = useState(null)

  const rows = useMemo(() => regs.filter((r) =>
    (!game || r.game_key === game) && (onlyApproved ? r.status === 'approved' : r.status === 'approved' || r.status === 'pending')), [regs, game, onlyApproved])

  const universities = useMemo(() => tally(rows, universityOf, universityOf, null, playersByReg), [rows, playersByReg])
  const careerRows = university ? rows.filter((r) => universityOf(r) === university) : rows
  const careers = useMemo(
    () => tally(careerRows, (r) => `${careerOf(r)}|${universityOf(r)}`, careerOf, university ? null : universityOf, playersByReg),
    [careerRows, university, playersByReg])

  const players = rows.reduce((sum, r) => sum + (playersByReg.get(r.id) ?? 0), 0)
  const count = (key) => regs.filter((r) => (!key || r.game_key === key) && (onlyApproved ? r.status === 'approved' : r.status === 'approved' || r.status === 'pending')).length

  const exportCsv = () => downloadCsv(`universidades-carreras-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Universidad', 'Carrera', 'Equipos', 'Jugadores'],
    tally(rows, (r) => `${careerOf(r)}|${universityOf(r)}`, careerOf, universityOf, playersByReg).map((r) => [r.sub, r.label, r.teams, r.players]))

  return (
    <>
      <div className="filter-bar">
        <div className="seg" role="group" aria-label="Juego">
          {[['', 'Todos'], ['mlbb', GAME_LABEL.mlbb], ['ff', GAME_LABEL.ff]].map(([value, label]) => (
            <button key={value} type="button" className={`seg-btn ${game === value ? 'seg-btn--on' : ''}`} aria-pressed={game === value} onClick={() => { setGame(value); setUniversity(null) }}>
              {label}<span className="seg-count">{count(value)}</span>
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Estado">
          {[[false, 'Aprobados y pendientes'], [true, 'Solo aprobados']].map(([value, label]) => (
            <button key={label} type="button" className={`seg-btn ${onlyApproved === value ? 'seg-btn--on' : ''}`} aria-pressed={onlyApproved === value} onClick={() => setOnlyApproved(value)}>{label}</button>
          ))}
        </div>
        <button className="btn" type="button" disabled={!rows.length} onClick={exportCsv} style={{ marginLeft: 'auto' }}>Exportar CSV</button>
      </div>

      <div className="grid grid--4" style={{ marginBottom: '1rem' }}>
        <div className="stat stat--accent"><small>Equipos</small><strong>{rows.length}</strong><em>en este filtro</em></div>
        <div className="stat"><small>Jugadores</small><strong>{players}</strong><em>titulares y suplentes</em></div>
        <div className="stat"><small>Universidades</small><strong>{universities.length}</strong><em>distintas</em></div>
        <div className="stat"><small>Carreras</small><strong>{new Set(rows.map(careerOf)).size}</strong><em>distintas</em></div>
      </div>

      <div className="grid grid--2">
        <div className="card">
          <h2>Por universidad</h2>
          <p className="card-sub">Toca una para ver solo sus carreras.</p>
          <RankBars rows={universities} selected={university} onSelect={setUniversity} emptyText="Aún no hay inscripciones con este filtro." />
        </div>
        <div className="card">
          <h2>Por carrera{university ? <span className="tag" style={{ marginLeft: 8 }}>{university}</span> : null}</h2>
          <p className="card-sub">{university ? <button type="button" className="btn btn--sm btn--ghost" onClick={() => setUniversity(null)}>Quitar filtro</button> : 'Escuela profesional del equipo.'}</p>
          <RankBars rows={careers} limit={12} emptyText="Aún no hay inscripciones con este filtro." />
        </div>
      </div>
    </>
  )
}
