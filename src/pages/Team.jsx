import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Modal, PageHeader, Spinner } from '../components/ui'
import { dateTime } from '../lib/format'
import { ROLE_LABEL } from '../lib/permissions'

const ROLE_HELP = {
  admin: 'Todo: configuración, premios, auditoría, equipo y eliminar inscripciones.',
  editor: 'Solo Contenido del sitio (reglamento, pasos, textos, PDF y música).',
  revisor_arbitro: 'Inscripciones (aprobar, rechazar, editar) y grupos, llaves y resultados.',
}

// Las altas, cambios y bajas pasan por la Edge Function 'manage-team' (necesita permisos de servidor).
async function manageTeam(body) {
  const { data, error } = await supabase.functions.invoke('manage-team', { body })
  if (error) {
    let message = 'No se pudo completar la acción.'
    try { message = (await error.context.json()).error ?? message } catch { /* respuesta sin JSON */ }
    if (error.name === 'FunctionsFetchError') message = 'No se pudo contactar la función "manage-team". ¿Está desplegada en Supabase?'
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

function RoleSelect({ value, onChange, disabled }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(ROLE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  )
}

function NewMemberModal({ onClose, onCreated }) {
  const toast = useToast()
  const [form, setForm] = useState({ email: '', password: '', role: 'revisor_arbitro' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 10) return toast.error('La contraseña debe tener al menos 10 caracteres.')
    setBusy(true)
    try {
      await manageTeam({ action: 'create', ...form })
      toast.success(`${form.email} ya puede entrar al panel.`)
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Nuevo miembro del equipo" onClose={onClose}>
      <form onSubmit={submit} autoComplete="off">
        <div className="form-row">
          <label className="field"><span>Correo</span>
            <input type="email" required maxLength={120} value={form.email} onChange={(e) => set('email', e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label className="field"><span>Contraseña inicial (mín. 10)</span>
            <input type="text" required minLength={10} maxLength={72} autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </label>
          <label className="field"><span>Rol</span>
            <RoleSelect value={form.role} onChange={(v) => set('role', v)} />
          </label>
        </div>
        <p className="card-sub">{ROLE_HELP[form.role]}</p>
        <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Creando…' : 'Crear usuario'}</button>
      </form>
    </Modal>
  )
}

function PasswordModal({ member, onClose }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await manageTeam({ action: 'set_password', user_id: member.user_id, password })
      toast.success('Contraseña actualizada.')
      onClose()
    } catch (err) {
      toast.error(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Nueva contraseña · ${member.email}`} onClose={onClose}>
      <form onSubmit={submit} autoComplete="off">
        <div className="form-row">
          <label className="field"><span>Contraseña (mín. 10)</span>
            <input type="text" required minLength={10} maxLength={72} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        </div>
        <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      </form>
    </Modal>
  )
}

export default function Team() {
  const { user } = useAuth()
  const toast = useToast()
  const [members, setMembers] = useState(null)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [passwordFor, setPasswordFor] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('admins').select('*').order('created_at')
    if (err) setError(err.message)
    else setMembers(data)
  }, [])

  useEffect(() => { load() }, [load])

  const run = async (userId, body, okText) => {
    setBusyId(userId)
    try {
      await manageTeam(body)
      toast.success(okText)
      await load()
    } catch (err) {
      toast.error(err.message)
    }
    setBusyId(null)
  }

  const changeRole = (m, role) => run(m.user_id, { action: 'set_role', user_id: m.user_id, role }, `${m.email}: ahora es ${ROLE_LABEL[role]}.`)
  const remove = (m) => {
    if (!window.confirm(`¿Quitar el acceso de ${m.email}? Su cuenta se eliminará y ya no podrá entrar al panel.`)) return
    run(m.user_id, { action: 'remove', user_id: m.user_id }, `${m.email} ya no tiene acceso.`)
  }

  if (error) return <ErrorBox error={error} />
  if (!members) return <Spinner />
  return (
    <>
      <PageHeader
        eyebrow="Sistema"
        title="Equipo"
        subtitle="Quién entra al panel y qué puede hacer."
        actions={<button className="btn btn--primary" type="button" onClick={() => setCreating(true)}>Nuevo miembro</button>}
      />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Correo</th><th>Rol</th><th>Desde</th><th /></tr></thead>
          <tbody>
            {members.map((m) => {
              const me = m.user_id === user.id
              return (
                <tr key={m.user_id}>
                  <td>{m.email}{me && <span className="badge badge--approved" style={{ marginLeft: 10 }}>Tú</span>}</td>
                  <td><RoleSelect value={m.role} disabled={busyId === m.user_id} onChange={(role) => changeRole(m, role)} /></td>
                  <td>{dateTime(m.created_at)}</td>
                  <td>
                    <div className="row-actions row-actions--end">
                      <button className="btn btn--sm" type="button" disabled={busyId === m.user_id} onClick={() => setPasswordFor(m)}>Contraseña</button>
                      {!me && <button className="btn btn--sm btn--bad" type="button" disabled={busyId === m.user_id} onClick={() => remove(m)}>Quitar</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Qué puede hacer cada rol</h2>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          {Object.entries(ROLE_LABEL).map(([key, label]) => <li key={key}><b>{label}:</b> {ROLE_HELP[key]}</li>)}
        </ul>
      </div>
      {creating && <NewMemberModal onClose={() => setCreating(false)} onCreated={load} />}
      {passwordFor && <PasswordModal member={passwordFor} onClose={() => setPasswordFor(null)} />}
    </>
  )
}
