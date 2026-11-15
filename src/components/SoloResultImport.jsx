import { useState } from 'react'
import { ErrorBox, Modal } from './ui'
import { parseSoloResultImport, soloImportedDraft, soloImportPreviewRows } from '../lib/soloResultImport'
import { soloImportTemplate } from '../lib/soloExports'
import { money } from '../lib/format'

export default function SoloResultImport({ room, people, hasDraft, busy, onClose, onImport }) {
  const [text, setText] = useState(''), [error, setError] = useState('')
  const [rows, setRows] = useState(null), [demo, setDemo] = useState(false), [accepted, setAccepted] = useState(false)
  const [order, setOrder] = useState('position'), [pendingOnly, setPendingOnly] = useState(false)
  const visibleRows = soloImportPreviewRows(rows ?? [], order, pendingOnly)
  const analyze = () => {
    setError(''); setRows(null); setAccepted(false)
    try { setRows(parseSoloResultImport(text, room, people)) } catch (problem) { setError(problem.message) }
  }
  const sample = () => {
    const payload = soloImportTemplate(room, people)
    payload.results = payload.results.map((r, i) => {
      const pending = i > 0 && i >= payload.results.length - 2
      return { ...r, nickname_read: pending ? '' : r.nickname, position: pending ? null : i === 0 ? 1 : payload.results.length - i + 1, kills: pending ? null : i === 0 ? 2 : 0, booyah: pending ? null : i === 0, status: pending ? 'unverified' : 'verified', source: 'Ejemplo ficticio', notes: 'Simulación, no son resultados de una partida.' }
    })
    setText(JSON.stringify(payload, null, 2)); setRows(null); setError(''); setAccepted(false); setDemo(true)
  }
  const load = () => {
    if (!rows || !accepted || demo || busy || room.status !== 'playing') return
    try {
      // Revalida la sala y la nómina actuales antes de modificar el borrador.
      const current = parseSoloResultImport(text, room, people)
      const problem = onImport(soloImportedDraft(current))
      if (problem) setError(problem)
    } catch (problem) { setRows(null); setError(problem.message) }
  }
  return <Modal title={`Importar resultados · ${room.name}`} xwide onClose={onClose}>
    <div className="solo-import-content">
    <p className="hint">Copia el prompt actualizado, adjunta tus capturas en la IA y pega aquí solo el bloque JSON que devuelva. Esto prepara un borrador; no guarda resultados ni genera pagos.</p>
    {room.status !== 'playing' && <p className="tm-notice">Esta sala admite vista previa. Solo se cargan borradores cuando está en juego; los resultados finalizados se conservan.</p>}
    <label className="field">JSON de resultados<textarea className="solo-import-json" rows={8} value={text} maxLength={200000} spellCheck={false} disabled={busy} onChange={(e) => { setText(e.target.value); setRows(null); setError(''); setAccepted(false); setDemo(false) }} /></label>
    <div className="foot-actions"><button type="button" className="btn btn--primary" disabled={busy || !text.trim()} onClick={analyze}>Verificar y previsualizar</button><button type="button" className="btn" disabled={busy} onClick={sample}>Probar con esta nómina</button></div>
    {demo && <p className="tm-notice">DATOS FICTICIOS para probar la vista previa. No se pueden cargar como resultados desde este ejemplo.</p>}
    <ErrorBox error={error} />
    {rows && <>
      <p className="hint">{rows.filter((r) => r.ready).length} listos · {rows.filter((r) => !r.ready).length} por verificar · Total provisional: {money(rows.reduce((sum, r) => sum + (r.gain ?? 0), 0))}</p>
      <div className="solo-import-tools"><label className="solo-payment-filter">Ordenar<select value={order} onChange={(e) => setOrder(e.target.value)}><option value="position">Posición final del juego</option><option value="slot">Slot asignado</option></select></label><label className="check"><input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />Solo pendientes de revisar</label><span className="hint">{visibleRows.length} de {rows.length} jugadores</span></div>
      {rows.some((r) => r.position === null) && <p className="hint">Las posiciones no indicadas aparecen al final. Si pegaste un JSON anterior, vuelve a pedirlo con el prompt actualizado; no se deducen posiciones del slot.</p>}
      <div className="table-wrap solo-import-preview"><table><thead><tr><th>Posición</th><th>Slot / jugador</th><th>Leído / fuente</th><th>Kills</th><th>Booyah</th><th>Ganancia</th><th>Observaciones</th></tr></thead><tbody>{visibleRows.map((r) => <tr key={r.registration_id}>
        <td><strong>{r.position ?? '—'}</strong></td>
        <td><span className="solo-slot">#{r.slot}</span> <strong>{r.nickname}</strong></td>
        <td>{r.nickname_read || 'No identificado'}<small className="tm-cell-note">{r.source}</small></td>
        <td>{r.ready ? r.kills : 'Por verificar'}</td><td>{r.ready ? (r.booyah ? 'Sí' : 'No') : 'Por verificar'}</td><td>{r.ready ? money(r.gain) : '—'}</td>
        <td>{({ verified: 'Exacta', similarity: 'Por similitud', unverified: 'Por verificar', discard: 'Descarte: confirmar' })[r.status]}<small className="tm-cell-note">{r.notes}</small></td>
      </tr>)}</tbody></table></div>
      {!visibleRows.length && <p className="hint">No hay jugadores pendientes de revisar.</p>}
      {hasDraft && !demo && room.status === 'playing' && <p className="tm-notice">Cargar este lote reemplazará todo el borrador de esta sala, incluidos los campos que ya editaste. Los datos guardados no cambian hasta pulsar «Guardar todos los resultados».</p>}
      {!demo && room.status === 'playing' && <><label className="check solo-import-accept"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={busy} />Revisé la vista previa y acepto reemplazar el borrador. Resolveré manualmente los pendientes.</label><button type="button" className="btn btn--primary" disabled={busy || !accepted} onClick={load}>Cargar borrador</button></>}
    </>}
    </div>
  </Modal>
}
