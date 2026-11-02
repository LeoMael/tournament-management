import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { isConfigured } from './supabaseClient'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRoute from './components/RoleRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Registrations from './pages/Registrations'
import Format from './pages/Format'
import Audit from './pages/Audit'
import Content from './pages/Content'
import Team from './pages/Team'
import Teams from './pages/Teams'
import Universities from './pages/Universities'
import Live from './pages/Live'
import Schedule from './pages/Schedule'

export default function App() {
  if (!isConfigured) {
    return (
      <div className="screen-center">
        <div className="card" style={{ maxWidth: 480 }}>
          <h2>Supabase no configurado</h2>
          <p>Crea un archivo <code>.env</code> con <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (ver <code>.env.example</code>) y reinicia el servidor.</p>
        </div>
      </div>
    )
  }
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route element={<RoleRoute />}>
                  <Route index element={<Dashboard />} />
                  <Route path="inscripciones" element={<Registrations />} />
                  <Route path="formato" element={<Format />} />
                  <Route path="equipos" element={<Teams />} />
                  <Route path="universidades" element={<Universities />} />
                  <Route path="envivo" element={<Live />} />
                  <Route path="cronograma" element={<Schedule />} />
                  <Route path="contenido" element={<Content />} />
                  <Route path="configuracion" element={<Settings />} />
                  <Route path="equipo" element={<Team />} />
                  <Route path="auditoria" element={<Audit />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
