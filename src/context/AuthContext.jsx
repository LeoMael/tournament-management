import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)
const IDLE_MS = 30 * 60 * 1000

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  // Devuelve el rol del usuario (admin, editor, revisor_arbitro) o null si no pertenece al panel.
  const fetchRole = useCallback(async (nextSession) => {
    if (!nextSession) return null
    const { data, error } = await supabase
      .from('admins')
      .select('role')
      .eq('user_id', nextSession.user.id)
      .maybeSingle()
    return error ? null : data?.role ?? null
  }, [])

  useEffect(() => {
    let active = true
    const apply = async (nextSession) => {
      const nextRole = await fetchRole(nextSession)
      if (!active) return
      if (nextSession && !nextRole) {
        // Autenticado pero no pertenece al panel: cerrar sesión de inmediato.
        await supabase.auth.signOut()
        setSession(null)
        setRole(null)
        setDenied(true)
      } else {
        if (nextRole) setDenied(false)
        setSession(nextSession)
        setRole(nextRole)
      }
      setLoading(false)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Diferido para no bloquear el callback interno de supabase-js.
      setTimeout(() => apply(nextSession), 0)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [fetchRole])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // Cierre de sesión por inactividad.
  useEffect(() => {
    if (!session) return undefined
    let timer
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => supabase.auth.signOut(), IDLE_MS)
    }
    const events = ['pointerdown', 'keydown', 'scroll']
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [session])

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, role, isStaff: Boolean(role), isAdmin: role === 'admin', loading, denied, signOut }),
    [session, role, loading, denied, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
