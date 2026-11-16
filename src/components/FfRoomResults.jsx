import { useEffect, useState } from 'react'
import { ErrorBox } from './ui'
import { ffResultPayload, ffEarnings } from '../lib/ffRoomResults'
import { money } from '../lib/format'
import FfRoomImport from './FfRoomImport'

export default function FfRoomResults({ kind, room, people, visibleIds, results, prizes, busy, onSave, onDirty }) {
  const [drafts, setDrafts] = useState({})
  const [order, setOrder] = useState('slot')
  const [error, setError] = useState('')
  const [baselines, setBaselines] = useState({})
  const [importing, setImporting] = useState(false)
  const [readHints, setReadHints] = useState({})
  const approved = people.filter((p) => p.status === 'approved')
  const dirty = approved.some((p) => !!drafts[p.id])
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  const editable = room.status === 'playing'
  const isDuo = kind !== 'solo_top'
  const resultFor = (p) => drafts[p.id] ?? results.find((s) => s.registration_id === p.id)
  const edit = (p, key, value) => {
    setBaselines((current) => Object.hasOwn(current, room.id) ? current : { ...current, [room.id]: results.map((s) => s.updated_at).sort().at(-1) ?? null })
    setDrafts((current) => ({ ...current, [p.id]: { ...(current[p.id] ?? results.find((s) => s.registration_id === p.id) ?? { placement: '', kills_1: kind === 'duo_kills' ? '' : 0, kills_2: kind === 'duo_kills' ? '' : 0, booyah: false }), [key]: value } }))
  }
  const discard = (preserveHints = false) => {
    setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !approved.some((p) => p.id === id))))
    setBaselines((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== room.id)))
    if (!preserveHints) setReadHints((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !approved.some((p) => p.id === id))))
    setError('')
  }
  const rows = approved.filter((p) => visibleIds.has(p.id)).sort((a, b) => order === 'position'
    ? (Number(resultFor(a)?.placement) || 999) - (Number(resultFor(b)?.placement) || 999) || a.slot - b.slot : a.slot - b.slot)
  return <>
    <div className={isDuo ? 'solo-table-tools' : 'row-actions'}>
      <button className="btn" disabled={busy || !approved.length} onClick={() => setImporting(true)}>Importar resultados de IA</button>
      <label className={isDuo ? 'solo-payment-filter' : 'field'}>Ordenar<select value={order} onChange={(e) => setOrder(e.target.value)}><option value="slot">Slot asignado</option><option value="position">Posición final del juego</option></select></label>
      {editable && <button className="btn btn--primary" disabled={busy || !dirty} onClick={async () => {
        try {
          const payload = ffResultPayload(kind, people, drafts, results)
          const problem = await onSave(payload, baselines[room.id])
          setError(problem || '')
          if (!problem) discard(true)
        } catch (problem) { setError(problem.message) }
      }}>Guardar todos los resultados</button>}
      {dirty && <span className="hint">Borrador sin guardar</span>}
      {dirty && <button className="btn" disabled={busy} onClick={() => discard()}>Descartar borrador</button>}
    </div>
    <p className="hint">{editable ? 'Completa todos los aprobados, aunque el buscador los oculte. La posición es el puesto final del juego, no el slot.' : room.status === 'finished' ? 'Resultados confirmados. Las ganancias están en Pagos.' : 'Los resultados se cargan al iniciar la partida.'}</p>
    <ErrorBox error={error} />
    <div className="table-wrap ff-room-scroll"><table><thead><tr><th>Posición</th><th>Slot</th><th>{kind === 'solo_top' ? 'Jugador' : 'Dúo'}</th><th>Kills{kind === 'duo_kills' ? ' y Booyah' : ' (referencia)'}</th><th>Ganancia</th></tr></thead><tbody>
      {rows.map((p) => {
        const r = resultFor(p)
        const estimate = ffEarnings(kind, room, prizes, r && { ...r, booyah: r.placement ? Number(r.placement) === 1 : r.booyah })
        return <tr key={p.id}>
          <td>{editable ? <input className="ff-result-number" aria-label={`Posición slot ${p.slot}`} type="number" min="1" max={room.capacity} value={r?.placement ?? ''} onChange={(e) => edit(p, 'placement', e.target.value)} disabled={busy} /> : r?.placement ?? '—'}</td>
          <td><strong className="solo-slot">#{p.slot}</strong></td>
          <td><strong>{p.nickname_1}</strong>{p.nickname_2 && <strong className="ff-pair-nickname">{p.nickname_2}</strong>}{readHints[p.id] && <small className="tm-cell-note">Leído: {readHints[p.id]}</small>}{r?.reviewRequired && <span className="tm-cell-note">Por verificar</span>}{editable && r?.reviewRequired && <button className="btn btn--sm" disabled={busy} onClick={() => edit(p, 'reviewRequired', false)}>Confirmar revisión manual</button>}</td>
          <td>{editable ? <div className={`row-actions ${isDuo ? 'ff-duo-kills' : ''}`}>
            {isDuo ? <label className="ff-duo-kill-field"><span title={p.nickname_1}>{p.nickname_1}</span><input className="ff-result-number" aria-label={`Kills ${p.nickname_1}`} type="number" min="0" max="1000" value={r?.kills_1 ?? ''} onChange={(e) => edit(p, 'kills_1', e.target.value)} disabled={busy} /></label> : <input className="ff-result-number" aria-label={`Kills ${p.nickname_1}`} type="number" min="0" max="1000" value={r?.kills_1 ?? ''} onChange={(e) => edit(p, 'kills_1', e.target.value)} disabled={busy} />}
            {p.nickname_2 && <label className="ff-duo-kill-field"><span title={p.nickname_2}>{p.nickname_2}</span><input className="ff-result-number" aria-label={`Kills ${p.nickname_2}`} type="number" min="0" max="1000" value={r?.kills_2 ?? ''} onChange={(e) => edit(p, 'kills_2', e.target.value)} disabled={busy} /></label>}
            {kind === 'duo_kills' && <label className="check"><input type="checkbox" disabled={busy || !!r?.placement} checked={r?.placement ? Number(r.placement) === 1 : !!r?.booyah} onChange={(e) => edit(p, 'booyah', e.target.checked)} />Booyah</label>}
            {isDuo && <small className="ff-duo-total">Total: {r && ['kills_1', 'kills_2'].every((key) => r[key] !== '' && r[key] != null) ? Number(r.kills_1) + Number(r.kills_2) : '—'} kills</small>}
          </div> : r ? <>{r.kills_1}{p.nickname_2 ? ` + ${r.kills_2} = ${r.kills_1 + r.kills_2}` : ''} kills {r.booyah && <strong> · Booyah</strong>}</> : '—'}</td>
          <td>{estimate == null ? '—' : money(estimate)}{editable && <small className="tm-cell-note">Provisional</small>}</td>
        </tr>
      })}
    </tbody></table></div>
    {!approved.length && <p className="hint">Sin participantes aprobados.</p>}
    {importing && <FfRoomImport kind={kind} room={room} people={people} prizes={prizes} busy={busy} hasDraft={dirty} onClose={() => setImporting(false)} onImport={(incoming) => {
      if (room.status !== 'playing' || busy) return
      setDrafts((current) => ({ ...current, ...incoming }))
      setBaselines((current) => ({ ...current, [room.id]: results.map((s) => s.updated_at).sort().at(-1) ?? null }))
      setReadHints((current) => ({ ...current, ...Object.fromEntries(approved.map((p) => {
        const r = incoming[p.id]
        const names = [r.importRead1 !== p.nickname_1 ? r.importRead1 : '', r.importRead2 !== (p.nickname_2 ?? '') ? r.importRead2 : ''].filter(Boolean).join(' / ')
        return [p.id, names]
      })) }))
      setOrder('position'); setImporting(false); setError('')
    }} />}
  </>
}
