import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'

const MAX_ATTEMPTS = 5
const LOCK_MS = 60_000

export default function Login() {
  const { session, isAdmin, loading, denied } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)

  if (!loading && session && isAdmin) return <Navigate to="/" replace />

  const submit = async (event) => {
    event.preventDefault()
    if (Date.now() < lockedUntil) {
      setError('Demasiados intentos. Espera un minuto.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (authError) {
      const next = attempts + 1
      setAttempts(next)
      if (next >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCK_MS)
        setAttempts(0)
      }
      // Mensaje genérico: no revelar si el correo existe.
      setError('Credenciales inválidas o sin permiso de acceso.')
      return
    }
    setPassword('')
    navigate('/', { replace: true })
  }

  return (
    <div className="login-wrap">
      <div className="login-top"><ThemeToggle /></div>
      <form className="login-card" onSubmit={submit}>
        <div className="brand brand--lg" style={{ padding: 0 }}><span className="brand-mark">R//</span><div><strong>RAGNAROK</strong><small>Consola de administración</small></div></div>
        <div><span className="eyebrow">Acceso restringido</span><h1 style={{ marginTop: 6 }}>Inicia sesión</h1></div>
        <label className="field"><span>Correo</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field"><span>Contraseña</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error-box">{error}</p>}
        {!error && denied && (
          <p className="error-box">Iniciaste sesión, pero tu usuario no está registrado como administrador. Agrégalo a la tabla <code>admins</code> (ver supabase/README.md, paso 5).</p>
        )}
        <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  )
}
