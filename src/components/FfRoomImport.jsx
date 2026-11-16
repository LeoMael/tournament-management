import { useState } from 'react'
import { Modal, ErrorBox } from './ui'
import { parseFfImport, ffImportedDraft, ffImportTemplate } from '../lib/ffRoomImport'
import { money } from '../lib/format'

export default function FfRoomImport({ kind, room, people, prizes, busy, hasDraft, onClose, onImport }) {
  const [text, setText] = useState(''), [rows, setRows] = useState(null), [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false), [pendingOnly, setPendingOnly] = useState(false), [order, setOrder] = useState('position')
  const [demo, setDemo] = useState(false)
  const visible = (rows ?? []).filter((r) => !pendingOnly || !r.ready).sort((a, b) => (order === 'position' ? (a.placement ?? Infinity) - (b.placement ?? Infinity) : 0) || a.slot - b.slot)
  return <Modal xwide title={`Importar resultados · ${room.name}`} onClose={() => !busy && onClose()}>
    <p className="hint">Copia el prompt, adjunta las capturas en la IA y pega aquí solo el JSON. Esto prepara un borrador; no guarda resultados ni genera pagos.</p>
    {room.status !== 'playing' && <p className="tm-notice">Solo vista previa. Los resultados de esta sala se conservan; únicamente puedes cargar borradores durante la partida.</p>}
    <label className="field">JSON de resultados<textarea className="solo-import-json" rows="8" maxLength="250000" spellCheck={false} value={text} disabled={busy} onChange={(e) => { setText(e.target.value); setRows(null); setError(''); setAccepted(false); setDemo(false) }} /></label>
    <button className="btn btn--primary" disabled={busy || !text.trim()} onClick={() => { try { setRows(parseFfImport(text, kind, room, people, prizes)); setError(''); setAccepted(false) } catch (problem) { setRows(null); setError(problem.message) } }}>Verificar y previsualizar</button>
    <button className="btn" disabled={busy} onClick={() => {
      const sample = ffImportTemplate(kind, room, people, prizes)
      sample.results = sample.results.map((r, i) => ({ ...r, nickname_1_read: r.nickname_1, nickname_2_read: r.nickname_2 ?? '', placement: i + 1, kills_1: i === 0 ? 2 : 0, kills_2: 0, booyah: i === 0, status: 'verified', source: 'Ejemplo ficticio, fila ' + (i + 1), notes: 'Simulación, no son resultados de una partida.' }))
      setText(JSON.stringify(sample, null, 2)); setRows(null); setError(''); setAccepted(false); setDemo(true)
    }}>Probar con esta nómina</button>
    {demo && <p className="tm-notice">DATOS FICTICIOS para probar la vista previa. No pueden cargarse como borrador desde este ejemplo.</p>}
    <ErrorBox error={error} />
    {rows && <>
      <p className="hint">{rows.filter((r) => r.ready).length} listos · {rows.filter((r) => !r.ready).length} por verificar · Total provisional: {money(rows.reduce((s, r) => s + (r.gain ?? 0), 0))}</p>
      <div className="row-actions"><label className="field">Ordenar<select value={order} onChange={(e) => setOrder(e.target.value)}><option value="position">Posición final del juego</option><option value="slot">Slot asignado</option></select></label><label className="check"><input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />Solo pendientes de revisión</label></div>
      <div className="table-wrap ff-room-scroll"><table><thead><tr><th>Posición</th><th>Slot / jugadores</th><th>Leído / fuente</th><th>Kills</th><th>Booyah</th><th>Ganancia</th><th>Observaciones</th></tr></thead><tbody>{visible.map((r) => <tr key={r.registration_id}>
        <td>{r.placement ?? '—'}</td><td><strong>#{r.slot} {r.nickname_1}</strong>{r.nickname_2 && <strong className="ff-pair-nickname">{r.nickname_2}</strong>}</td>
        <td>{[r.nickname_1_read, r.nickname_2_read].filter(Boolean).join(' / ') || 'No identificado'}<small className="tm-cell-note">{r.source}</small></td>
        <td>{r.ready ? `${r.kills_1 ?? '—'}${kind !== 'solo_top' ? ' + ' + (r.kills_2 ?? '—') : ''}` : 'Por verificar'}</td>
        <td>{r.ready ? r.booyah ? 'Sí' : 'No' : 'Por verificar'}</td><td>{r.ready ? money(r.gain) : '—'}</td>
        <td>{({ verified: 'Exacta', similarity: 'Por similitud', discard: 'Descarte: confirmar', unverified: 'Por verificar' })[r.status]}<small className="tm-cell-note">{r.notes}</small></td>
      </tr>)}</tbody></table></div>
      {kind !== 'duo_kills' && <p className="hint">En Top se usa la posición para el premio. Las kills de referencia no leídas se cargarán como 0 y no afectan el importe.</p>}
      {!demo && room.status === 'playing' && <>
        {hasDraft && <p className="tm-notice">Este lote reemplazará todo el borrador de la sala, incluidos los campos ya editados. No cambia los resultados guardados.</p>}
        <label className="check"><input type="checkbox" checked={accepted} disabled={busy} onChange={(e) => setAccepted(e.target.checked)} />Revisé la propuesta y resolveré manualmente los pendientes.</label>
        <button className="btn btn--primary" disabled={busy || !accepted} onClick={() => {
          try { const current = parseFfImport(text, kind, room, people, prizes); onImport(ffImportedDraft(current)) } catch (problem) { setRows(null); setError(problem.message) }
        }}>Cargar borrador</button>
      </>}
    </>}
  </Modal>
}
