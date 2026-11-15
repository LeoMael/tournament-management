import { useState } from 'react'
import { ErrorBox } from './ui'
import { parseSquadResultImport, squadImportedDraft } from '../lib/squadResultImport'
import './SquadResultImport.css'

export default function SquadResultImport({ context, readOnly, onBack, onApply }) {
  const [text, setText] = useState(''), [error, setError] = useState('')
  const [rows, setRows] = useState(null), [accepted, setAccepted] = useState(false)
  const [pendingOnly, setPendingOnly] = useState(false)
  const analyze = () => {
    setError(''); setRows(null); setAccepted(false)
    try { setRows(parseSquadResultImport(text, context)) } catch (problem) { setError(problem.message) }
  }
  const apply = () => {
    if (!accepted || readOnly) return
    try {
      const current = parseSquadResultImport(text, context)
      const problem = onApply(squadImportedDraft(current))
      if (problem) setError(problem)
    } catch (problem) { setRows(null); setError(problem.message) }
  }
  return <div className="ff-import-content">
    <div className="foot-actions"><strong>Importar · Partida {context.match.round} · Sala {context.room}</strong><button type="button" className="btn btn--sm" onClick={onBack}>Volver a resultados</button></div>
    <p className="hint">Pega el JSON de la IA. Los puntos se calculan con las reglas de esta fase. Cargar el borrador no publica resultados: después debes revisar y pulsar «Guardar partida».</p>
    {readOnly && <p className="hint">Esta sala ya está terminada: la importación permite solo vista previa.</p>}
    <label className="field">JSON de escuadras<textarea rows={8} maxLength={150000} value={text} spellCheck={false} onChange={(e) => { setText(e.target.value); setRows(null); setAccepted(false); setError('') }} /></label>
    <button type="button" className="btn btn--primary" disabled={!text.trim()} onClick={analyze}>Verificar y previsualizar</button>
    <ErrorBox error={error} />
    {rows && <>
      <p className="hint">{rows.filter((r) => r.ready).length} equipos listos · {rows.filter((r) => !r.ready).length} por verificar. Booyah corresponde al puesto 1.</p>
      <label className="check"><input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />Solo pendientes de revisar</label>
      <div className="table-wrap ff-import-table"><table><thead><tr><th>Slot / equipo</th><th>Nombres leídos</th><th>Puesto</th><th>Kills escuadra</th><th>Puntos</th><th>Observaciones</th></tr></thead><tbody>{rows.filter((r) => !pendingOnly || !r.ready).map((r) => <tr key={r.registration_id}>
        <td><span className="slot-chip">#{r.slot}</span> {r.team_name}</td><td>{r.names_read.join(' · ') || 'No identificado'}</td>
        <td>{r.ready ? r.placement : 'Por verificar'}</td><td>{r.ready ? r.kills : 'Por verificar'}</td><td>{r.ready ? r.points : '—'}</td>
        <td>{({ verified: 'Identificado', similarity: 'Por similitud', unverified: 'Por verificar' })[r.status]}<small>{r.source}</small><small>{r.notes}</small></td>
      </tr>)}</tbody></table></div>
      {!readOnly && <><p className="hint">Reemplazará únicamente el borrador de esta sala. Las demás salas se conservan. No podrás guardar mientras queden equipos importados pendientes.</p><label className="check"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />Revisé la propuesta y acepto reemplazar este borrador.</label><button type="button" className="btn btn--primary" disabled={!accepted} onClick={apply}>Cargar borrador</button></>}
    </>}
  </div>
}
