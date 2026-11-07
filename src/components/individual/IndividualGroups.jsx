import { useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useToast } from '../../context/ToastContext'
import { Modal } from '../ui'
import { groupReady, validGroupUrl, validTeamName, INDIVIDUAL_STATUS } from '../../lib/individuals'
import { dateTime, GAME_LABEL, whatsappUrl } from '../../lib/format'

function GroupDetail({ group, members, starters, onChanged, onClose }) {
  const toast = useToast()
  const [form, setForm] = useState({ team_name: group.team_name || '', captain_id: group.captain_id || '', whatsapp_group_url: group.whatsapp_group_url || '' })
  const [saved, setSaved] = useState(group)
  const [busy, setBusy] = useState(false)
  const dirty = form.team_name.trim() !== (saved.team_name || '') || form.captain_id !== (saved.captain_id || '') || form.whatsapp_group_url.trim() !== (saved.whatsapp_group_url || '')
  const set = (key, value) => setForm((v) => ({ ...v, [key]: value }))
  const save = async (e) => {
    e.preventDefault()
    if (!validTeamName(form.team_name)) return toast.error('El nombre debe tener de 3 a 40 caracteres válidos, o quedar vacío para usar el provisional.')
    if (form.whatsapp_group_url.trim() && !validGroupUrl(form.whatsapp_group_url.trim())) return toast.error('El enlace del grupo de WhatsApp no es válido.')
    setBusy(true)
    try {
      const payload = { p_group_id: group.id, p_team_name: form.team_name.trim() || null, p_captain_id: form.captain_id || null, p_whatsapp_group_url: form.whatsapp_group_url.trim() || null, p_naming_deadline: group.naming_deadline }
      const { error } = await supabase.rpc('update_individual_group', payload)
      if (error) throw error
      setSaved((current) => ({ ...current, team_name: payload.p_team_name, captain_id: payload.p_captain_id, whatsapp_group_url: payload.p_whatsapp_group_url }))
      toast.success('Grupo actualizado.')
      onChanged()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  const register = async () => {
    if (!window.confirm(`¿Inscribir el equipo ${saved.team_name || saved.default_name}? Esta acción registra el equipo en el torneo.`)) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('register_individual_group', { p_group_id: group.id })
      if (error) throw error
      toast.success('Equipo inscrito.')
      onClose()
      onChanged()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  const draft = saved.status === 'draft'
  return (
    <Modal title={saved.team_name || saved.default_name} onClose={onClose} wide footer={draft && <div className="foot-actions"><button className="btn" type="submit" form="individual-group-form" disabled={busy || !dirty}>Guardar cambios</button><button className="btn btn--primary" type="button" disabled={busy || dirty || !groupReady(saved, members, starters)} onClick={register}>Inscribir equipo</button></div>}>
      <div><span className={`tag tag--${saved.game_key}`}>{GAME_LABEL[saved.game_key]}</span> <span className={`badge badge--${draft ? 'pending' : 'approved'}`}>{INDIVIDUAL_STATUS[saved.status]}</span> <span className="hint">Nombre provisional: {saved.default_name}</span></div>
      <div><h3>Integrantes · {members.length}/{starters || '—'}</h3><div className="table-wrap"><table><thead><tr><th>Jugador</th><th>Rol</th><th>Contacto</th></tr></thead><tbody>{members.map((m) => <tr key={m.id}><td>{m.nickname} · {m.full_name} {m.id === saved.captain_id && <span className="badge badge--approved">Capitán</span>}</td><td>{m.assigned_role || (saved.game_key === 'ff' ? 'Integrante' : 'Sin rol')}</td><td>{m.whatsapp && <a href={whatsappUrl(m.whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>}</td></tr>)}</tbody></table></div></div>
      {draft ? <form id="individual-group-form" onSubmit={save}>
        <h3>Datos del equipo</h3><p className="hint">Roster cerrado. Crea el grupo de WhatsApp manualmente. Si no proponen nombre se usará el provisional.</p>
        <div className="form-row"><label className="field"><span>Nombre propuesto</span><input maxLength={40} value={form.team_name} onChange={(e) => set('team_name', e.target.value)} /></label><label className="field"><span>Capitán</span><select value={form.captain_id} onChange={(e) => set('captain_id', e.target.value)}><option value="">Seleccionar integrante</option>{members.map((m) => <option key={m.id} value={m.id}>{m.nickname} · {m.full_name}</option>)}</select></label></div>
        <label className="field"><span>Enlace del grupo de WhatsApp</span><input type="url" value={form.whatsapp_group_url} onChange={(e) => set('whatsapp_group_url', e.target.value)} /></label><p className="hint">Plazo para nombre: {dateTime(saved.naming_deadline)}</p>
        <p className="hint">{dirty ? 'Guarda los cambios pendientes antes de inscribir.' : 'Para inscribir se requiere roster completo, capitán, enlace válido y roles completos en MLBB.'}</p>
      </form> : <div><h3>Equipo inscrito</h3><p>Capitán: {members.find((m) => m.id === saved.captain_id)?.nickname || '—'} · Plazo: {dateTime(saved.naming_deadline)}</p>{saved.whatsapp_group_url && <a href={saved.whatsapp_group_url} target="_blank" rel="noopener noreferrer">Abrir grupo de WhatsApp ↗</a>}</div>}
    </Modal>
  )
}
export default function IndividualGroups({ groups, people, games, onChanged }) {
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState(null)
  const [gameKey, setGameKey] = useState('')
  const [selected, setSelected] = useState(null)
  const requests = useRef({})
  const toast = useToast()
  const generate = async () => {
    const game = games.find((g) => g.key === gameKey)
    if (!game) return toast.error('Selecciona un juego.')
    const count = people.filter((p) => p.game_key === game.key && p.status === 'approved' && !p.group_id).length
    const starters = game.starters
    if (!starters) return toast.error('No se conoce el tamaño del equipo.')
    if (!window.confirm(`¿Sortear ${count} personas aprobadas en hasta ${Math.floor(count / starters)} grupos provisionales? La cantidad real depende de roles y cupos; quienes sobren esperarán. No se inscribirá ningún equipo.`)) return
    requests.current[game.key] ||= crypto.randomUUID()
    setBusy(game.key)
    try {
      const { data, error } = await supabase.rpc('generate_individual_groups', { p_game_key: game.key, p_request_id: requests.current[game.key] })
      if (error) throw error
      delete requests.current[game.key]
      setResult(data)
      toast.success('Sorteo provisional realizado.')
      onChanged()
    } catch (err) { toast.error(`No se pudo confirmar el sorteo. Reintenta con la misma solicitud: ${err.message}`) } finally { setBusy(null) }
  }
  return (
    <section>
      <div className="filter-bar"><select aria-label="Juego para sorteo" value={gameKey} onChange={(e) => setGameKey(e.target.value)}><option value="">Seleccionar juego</option>{games.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}</select><button className="btn btn--primary" type="button" disabled={Boolean(busy) || !gameKey} onClick={generate}>Sortear grupos</button><span className="hint">Los grupos son provisionales hasta inscribirlos.</span></div>
      {result && <p className="hint">Sorteo: {result.groups_created} grupos · {result.players_grouped} personas agrupadas · {result.players_waiting} en espera.</p>}
      <div className="table-wrap"><table className="table-nowrap table-lg"><thead><tr><th>Grupo</th><th>Juego</th><th>Integrantes</th><th>Capitán</th><th>Estado</th><th>Plazo</th><th className="th-actions">Acciones</th></tr></thead><tbody>
        {groups.map((group) => {
          const members = people.filter((p) => p.group_id === group.id)
          const starters = games.find((g) => g.key === group.game_key)?.starters
          const captain = members.find((m) => m.id === group.captain_id)
          return <tr key={group.id}><td><strong>{group.team_name || group.default_name}</strong></td><td><span className={`tag tag--${group.game_key}`}>{GAME_LABEL[group.game_key]}</span></td><td>{members.length}/{starters || '—'}</td><td>{captain?.nickname || 'Pendiente'}</td><td><span className={`badge badge--${group.status === 'draft' ? 'pending' : 'approved'}`}>{INDIVIDUAL_STATUS[group.status]}</span></td><td>{dateTime(group.naming_deadline)}</td><td><div className="row-actions row-actions--end"><button className="btn btn--sm" type="button" onClick={() => setSelected(group.id)}>{group.status === 'draft' ? 'Gestionar' : 'Ver'}</button></div></td></tr>
        })}
      </tbody></table>{!groups.length && <p className="empty">Aún no hay grupos provisionales.</p>}</div>
      {selected && (() => { const group = groups.find((g) => g.id === selected); return group && <GroupDetail key={group.id} group={group} members={people.filter((p) => p.group_id === group.id)} starters={games.find((g) => g.key === group.game_key)?.starters} onChanged={onChanged} onClose={() => setSelected(null)} /> })()}
    </section>
  )
}
