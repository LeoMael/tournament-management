import { useState } from 'react'
import { Modal } from './ui'

// Confirmar podio de ganadores (Top 3) de una fase Battle Royale.
// Viene preseleccionado el top 3 según los puntos de la tabla; el admin puede confirmar o ajustar.
export default function ChampionModal({ totals, teamName, current, currentPodium, pending, busy, onClose, onSave }) {
  const defaultTop1 = currentPodium?.[0] ?? current ?? totals[0]?.id ?? null
  const defaultTop2 = currentPodium?.[1] ?? totals[1]?.id ?? null
  const defaultTop3 = currentPodium?.[2] ?? totals[2]?.id ?? null

  const [top1, setTop1] = useState(defaultTop1)
  const [top2, setTop2] = useState(defaultTop2)
  const [top3, setTop3] = useState(defaultTop3)

  const handleSave = () => {
    if (!top1) return
    const podium = [top1, top2, top3].filter(Boolean)
    onSave(top1, podium)
  }

  const findTeamStats = (id) => {
    const t = totals.find((x) => x.id === id)
    if (!t) return null
    return `${t.points} pts · ${t.wins} Booyah · ${t.kills} kills`
  }

  return (
    <Modal title="Confirmar podio de ganadores (Top 3)" onClose={onClose}>
      {pending > 0 && (
        <p className="pv-caption pv-caption--warn">
          Aviso: Aún hay {pending} {pending === 1 ? 'partida pendiente' : 'partidas pendientes'} en esta fase.
        </p>
      )}
      <p className="hint">
        Verifica los tres puestos premiados del torneo. Vienen sugeridos automáticamente según la tabla acumulada.
      </p>

      <div style={{ display: 'grid', gap: 12, margin: '14px 0' }}>
        {/* 1er Lugar */}
        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(245, 158, 11, 0.08)', border: '1.5px solid rgba(245, 158, 11, 0.4)', display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              1.º Lugar · Campeón (Oro)
            </span>
            <small style={{ color: 'var(--muted)', fontSize: 11 }}>{findTeamStats(top1)}</small>
          </div>
          <select
            value={top1 || ''}
            onChange={(e) => setTop1(e.target.value || null)}
            style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontWeight: 700, padding: '0 10px' }}
          >
            <option value="">-- Seleccionar campeón --</option>
            {totals.map((r, i) => (
              <option key={r.id} value={r.id}>
                #{i + 1} {teamName(r.id)} ({r.points} pts)
              </option>
            ))}
          </select>
        </div>

        {/* 2do Lugar */}
        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(148, 163, 184, 0.08)', border: '1.5px solid rgba(148, 163, 184, 0.4)', display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 800, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              2.º Lugar · Subcampeón (Plata)
            </span>
            <small style={{ color: 'var(--muted)', fontSize: 11 }}>{findTeamStats(top2)}</small>
          </div>
          <select
            value={top2 || ''}
            onChange={(e) => setTop2(e.target.value || null)}
            style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontWeight: 700, padding: '0 10px' }}
          >
            <option value="">-- Seleccionar subcampeón --</option>
            {totals.map((r, i) => (
              <option key={r.id} value={r.id}>
                #{i + 1} {teamName(r.id)} ({r.points} pts)
              </option>
            ))}
          </select>
        </div>

        {/* 3er Lugar */}
        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(217, 119, 6, 0.08)', border: '1.5px solid rgba(217, 119, 6, 0.4)', display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              3.º Lugar · Tercer Puesto (Bronce)
            </span>
            <small style={{ color: 'var(--muted)', fontSize: 11 }}>{findTeamStats(top3)}</small>
          </div>
          <select
            value={top3 || ''}
            onChange={(e) => setTop3(e.target.value || null)}
            style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontWeight: 700, padding: '0 10px' }}
          >
            <option value="">-- Seleccionar tercer puesto --</option>
            {totals.map((r, i) => (
              <option key={r.id} value={r.id}>
                #{i + 1} {teamName(r.id)} ({r.points} pts)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn--primary" type="button" disabled={busy || !top1} onClick={handleSave}>
          Confirmar podio oficial
        </button>
        {current && (
          <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => onSave(null, null)}>
            Quitar podio
          </button>
        )}
      </div>
    </Modal>
  )
}
