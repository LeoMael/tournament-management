import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { soloWhatsAppAction } from '../lib/soloWhatsApp'
import './SoloRoomAccess.css'

export default function SoloRoomAccess({ room, editionId, onSaved }) {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const editable = ['open', 'closed', 'playing'].includes(room.status)
  useEffect(() => {
    let active = true
    supabase.from('solo_room_access').select('room_id,game_room_id,room_password')
      .eq('room_id', room.id).maybeSingle().then(({ data, error: problem }) => {
        if (!active) return
        setLoading(false)
        if (problem) {
          setError('No se pudo cargar el acceso. Comprueba la conexión y que la migración 016 esté aplicada.')
          onSaved(null)
          return
        }
        setId(data?.game_room_id || '')
        setPassword(data?.room_password || '')
        onSaved(data)
      }).catch(() => {
        if (active) { setLoading(false); setError('No se pudo cargar el acceso. Vuelve a abrir esta sala para reintentar.'); onSaved(null) }
      })
    return () => { active = false }
  }, [room.id, onSaved])

  const change = (setter, value) => {
    setter(value)
    onSaved(null)
    setMessage('Cambios pendientes: guarda el acceso para enviarlo. Mientras tanto, puedes confirmar la inscripción sin incluir credenciales.')
  }
  const save = async (event) => {
    event.preventDefault()
    if (loading || saving || !editable || !id.trim() || !password.trim()) return
    setSaving(true); setError(''); setMessage('')
    try {
      const { data, error: problem } = await supabase.rpc('save_solo_room_access', {
        p_edition_id: editionId, p_room_id: room.id,
        p_game_room_id: id.trim(), p_room_password: password.trim(),
      })
      if (problem) throw new Error(problem.message)
      if (data?.room_id !== room.id) throw new Error('No se pudo confirmar el acceso guardado.')
      setId(data.game_room_id); setPassword(data.room_password); onSaved(data)
      setMessage('Acceso guardado. Ya puedes abrir el WhatsApp de cada jugador aprobado.')
    } catch (problem) { onSaved(null); setError(problem.message) }
    finally { setSaving(false) }
  }
  return <form className="solo-room-access" onSubmit={save}>
    <div className="solo-room-access__head"><strong>Acceso a la sala</strong><span>Solo organización</span></div>
    <div className="solo-room-access__fields">
      <label className="field">ID de la sala<input value={id} onChange={(e) => change(setId, e.target.value)} maxLength={100} required autoComplete="off" disabled={loading || saving || !editable} /></label>
      <label className="field">Contraseña<div className="solo-access-password"><input value={password} onChange={(e) => change(setPassword, e.target.value)} type={visible ? 'text' : 'password'} maxLength={100} required autoComplete="off" disabled={loading || saving || !editable} /><button type="button" className="btn btn--sm" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Ocultar' : 'Mostrar'}</button></div></label>
      <button type="submit" className="btn btn--primary btn--sm" disabled={loading || saving || !editable || !id.trim() || !password.trim()}>{saving ? 'Guardando…' : 'Guardar acceso'}</button>
    </div>
    <p className="hint">Sin acceso guardado, «Confirmar inscripción» prepara la confirmación con sala, hora y slot. Al guardar el ID y la contraseña, cambia a «Enviar acceso». Revisa el mensaje y pulsa Enviar en WhatsApp.</p>
    {!editable && <p className="hint">El acceso se prepara cuando las inscripciones están abiertas o cerradas, o la partida está en juego.</p>}
    {loading && <p className="hint" role="status">Cargando acceso…</p>}
    {error && <p className="solo-access-error" role="alert">{error}</p>}
    {message && <p className="hint" role="status">{message}</p>}
  </form>
}

export function SoloWhatsAppButton({ room, person, access }) {
  if (person.status !== 'approved' || !['open', 'closed', 'playing'].includes(room.status)) return null
  const { href, label } = soloWhatsAppAction(room, person, access)
  return href
    ? <a className="btn btn--sm solo-send-access" href={href} target="_blank" rel="noopener noreferrer" aria-label={label + ' por WhatsApp a ' + person.nickname}>{label}</a>
    : <button type="button" className="btn btn--sm solo-send-access" disabled title="Comprueba que el jugador tenga teléfono válido y slot asignado.">{label}</button>
}
