import { useState } from 'react'
import { ErrorBox } from './ui'
import './SoloRoomAccess.css'

export default function FfRoomAccess({ access, busy, onSave, onEditing }) {
  const [draft, setDraft] = useState(null), [visible, setVisible] = useState(false), [error, setError] = useState('')
  const values = draft ?? { game_room_id: access?.game_room_id ?? '', room_password: access?.room_password ?? '' }
  const change = (key, value) => { setDraft({ ...values, [key]: value }); onEditing(true) }
  return <details className="solo-details"><summary>Acceso privado de la sala</summary><form className="solo-room-access" onSubmit={async (e) => {
    e.preventDefault()
    const problem = await onSave(values)
    setError(problem || '')
    if (!problem) { setDraft(null); onEditing(false) }
  }}>
    <div className="solo-room-access__fields">
      <label className="field">ID de la sala<input required maxLength="100" autoComplete="off" disabled={busy} value={values.game_room_id} onChange={(e) => change('game_room_id', e.target.value)} /></label>
      <label className="field">Contraseña<input required maxLength="100" autoComplete="off" type={visible ? 'text' : 'password'} disabled={busy} value={values.room_password} onChange={(e) => change('room_password', e.target.value)} /></label>
      <button type="button" className="btn btn--sm" onClick={() => setVisible(!visible)}>{visible ? 'Ocultar' : 'Mostrar'}</button><button className="btn btn--primary btn--sm" disabled={busy}>Guardar acceso</button>
      {draft && <button type="button" className="btn btn--sm" disabled={busy} onClick={() => { setDraft(null); onEditing(false); setError('') }}>Descartar cambios</button>}
    </div>
    <p className="hint">Sin acceso guardado, el botón confirma la inscripción. Con ID y contraseña guardados, cambia a «Enviar acceso». Revisa y pulsa Enviar en WhatsApp.</p>
    {draft && <p className="hint">Guarda estos cambios antes de enviar el acceso. Puedes seguir confirmando inscripciones.</p>}
    <ErrorBox error={error} />
  </form></details>
}
