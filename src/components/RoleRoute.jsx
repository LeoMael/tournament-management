import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAccess, homeFor } from '../lib/permissions'

// Deja pasar solo si el rol del usuario tiene acceso a la ruta; si no, lo manda a su sección.
export default function RoleRoute() {
  const { role } = useAuth()
  const { pathname } = useLocation()
  if (!canAccess(role, pathname)) return <Navigate to={homeFor(role)} replace />
  return <Outlet />
}
