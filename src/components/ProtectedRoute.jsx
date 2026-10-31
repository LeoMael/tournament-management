import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute() {
  const { session, isAdmin, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="screen-center">Verificando acceso…</div>
  if (!session || !isAdmin) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
