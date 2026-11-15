import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import TeamConfirmationButton from './TeamConfirmationButton'
import { squadAccessLink } from '../lib/squadWhatsApp'
import './SquadRoomAccess.css'

export default function SquadRoomAccess({ stage, match, room, teams, slots, closed, busy }) {
  const toast = useToast()
  const [access, setAccess] = useState(null), [counts, setCounts] = useState({}), [captains, setCaptains] = useState([])
  const [gameId, setGameId] = useState(''), [password, setPassword] = useState(''), [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false), version = useRef(0)
  const idsKey = JSON.stringify(teams.map((t) => t.id).sort())
  useEffect(() => {
    let active = true, refreshing = false
    const refresh = async () => {
      if (refreshing || document.hidden) return
      refreshing = true
      const currentVersion = version.current
      try {
        const ids = JSON.parse(idsKey)
        const [a, c, r] = await Promise.all([
          supabase.from('ff_squad_room_access').select('match_id,room_no,game_room_id,room_password').eq('match_id', match.id).eq('room_no', room).maybeSingle(),
          supabase.from('ff_squad_access_clicks').select('registration_id,click_count').eq('match_id', match.id).eq('room_no', room),
          ids.length ? supabase.from('registrations').select('id,edition_id,game_key,status,team_name,captain_name,captain_whatsapp,ff_confirmation_click_count').in('id', ids) : Promise.resolve({ data: [] }),
        ])
        if (!active || currentVersion !== version.current) return
        if (a.error || c.error || r.error) throw new Error('No se pudo cargar el acceso. Comprueba la conexión y que la migración 024 esté aplicada.')
        setAccess(a.data); setCaptains(r.data)
        setCounts((previous) => ({ ...previous, ...Object.fromEntries((c.data ?? []).map((row) => [row.registration_id, Math.max(previous[row.registration_id] ?? 0, row.click_count)])) }))
        if (!dirtyRef.current) { setGameId(a.data?.game_room_id || ''); setPassword(a.data?.room_password || '') }
        setError('')
      } catch (problem) { if (active) { setAccess(null); setError(problem.message) } }
      finally { refreshing = false; if (active) setLoading(false) }
    }
    const run = () => { void refresh() }
    run(); const timer = window.setInterval(run, 15000); window.addEventListener('focus', run)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', run) }
  }, [match.id, room, idsKey])
  const change = (setter, value) => { setter(value); dirtyRef.current = true; setDirty(true) }
  const save = async (event) => {
    event.preventDefault()
    if (busy || saving || closed || loading) return
    setSaving(true); setError('')
    try {
      const { data, error: problem } = await supabase.rpc('save_ff_squad_room_access', { p_edition_id: stage.edition_id, p_match_id: match.id, p_room: room, p_game_room_id: gameId.trim(), p_room_password: password.trim() })
      if (problem) throw new Error(problem.message)
      version.current++; setAccess(data); setGameId(data.game_room_id); setPassword(data.room_password); dirtyRef.current = false; setDirty(false)
      toast.success('Acceso guardado para esta partida y sala.')
    } catch (problem) { setError(problem.message) } finally { setSaving(false) }
  }
  const clicked = async (team) => {
    const { data, error: problem } = await supabase.rpc('count_ff_squad_access_click', { p_edition_id: stage.edition_id, p_match_id: match.id, p_room: room, p_registration_id: team.id })
    if (problem) toast.error('No se guardó el contador de acceso: ' + problem.message)
    else setCounts((previous) => ({ ...previous, [team.id]: Math.max(previous[team.id] ?? 0, data.click_count) }))
  }
  return <details className="ff-room-access">
    <summary>Acceso por WhatsApp · Partida {match.round} · Sala {room}</summary>
    <form onSubmit={save} className="ff-room-access-fields">
      <label className="field">ID de la sala<input maxLength={100} required autoComplete="off" value={gameId} disabled={busy || saving || loading || closed} onChange={(e) => change(setGameId, e.target.value)} /></label>
      <label className="field">Contraseña<div className="ff-password"><input maxLength={100} required autoComplete="off" type={visible ? 'text' : 'password'} value={password} disabled={busy || saving || loading || closed} onChange={(e) => change(setPassword, e.target.value)} /><button type="button" className="btn btn--sm" onClick={() => setVisible(!visible)}>{visible ? 'Ocultar' : 'Mostrar'}</button></div></label>
      <button type="submit" className="btn btn--sm btn--primary" disabled={busy || saving || loading || closed || !gameId.trim() || !password.trim()}>Guardar acceso</button>
    </form>
    <p className="hint">Datos privados de esta partida y sala. El acceso se envía al capitán con el slot de su equipo. Los números cuentan clics, no verifican envíos.</p>
    {dirty && <p className="hint">Guarda los cambios de ID y contraseña antes de enviar acceso.</p>}
    {closed && <p className="hint">Sala terminada: el acceso se conserva para consulta, sin nuevos envíos.</p>}
    {loading && <p className="hint">Cargando acceso y capitanes…</p>}
    {error && <p role="alert" className="error-box">{error}</p>}
    <div className="table-wrap ff-access-table"><table><thead><tr><th>Slot / equipo</th><th>Capitán</th><th>Confirmación</th><th>Acceso</th></tr></thead><tbody>{[...captains].sort((a, b) => slots[a.id] - slots[b.id]).map((team) => {
      const href = !dirty && !error ? squadAccessLink({ stage, match, room, team, slot: slots[team.id], access, closed }) : null
      return <tr key={team.id}><td><span className="slot-chip">#{slots[team.id]}</span> {team.team_name}</td><td>{team.captain_name}<small>{team.captain_whatsapp}</small></td><td><TeamConfirmationButton reg={team} busy={busy || saving} /></td><td>{href && !busy && !saving ? <a className="btn btn--sm btn--ok" href={href} target="_blank" rel="noopener noreferrer" onClick={() => { void clicked(team).catch(() => toast.error('No se pudo guardar el contador de acceso.')) }}>Enviar acceso</a> : <button type="button" className="btn btn--sm" disabled title="Revisa el acceso guardado, la distribución de salas, el teléfono y el estado de la partida.">Enviar acceso</button>} <span className="hint" title="Clics en Enviar acceso">{counts[team.id] ?? 0}</span></td></tr>
    })}</tbody></table></div>
  </details>
}
