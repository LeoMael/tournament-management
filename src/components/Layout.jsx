import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from './ThemeToggle'
import { ROLE_LABEL, canAccess } from '../lib/permissions'

const icon = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)

const GROUPS = [
  {
    label: 'Operación',
    items: [
      { to: '/', label: 'Resumen', end: true, icon: icon(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>) },
      { to: '/solo', label: 'Free Fire Solo', icon: icon(<><circle cx="12" cy="8" r="3" /><path d="M5 20c0-4 3-7 7-7s7 3 7 7" /></>) },
      { to: '/individuales', label: 'Inscripciones individuales', icon: icon(<><circle cx="12" cy="8" r="3" /><path d="M5 20c0-4 3-7 7-7s7 3 7 7" /></>) },
      { to: '/inscripciones', label: 'Inscripciones', icon: icon(<><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" /><rect x="5" y="6" width="14" height="15" rx="2" /><path d="m9 14 2 2 4-4" /></>) },
    ],
  },
  {
    label: 'Torneo',
    items: [
      { to: '/formato', label: 'Grupos y llaves', icon: icon(<><path d="M4 5h5v4H4zM4 15h5v4H4zM15 10h5v4h-5z" /><path d="M9 7h3v10H9M12 12h3" /></>) },
      { to: '/equipos', label: 'Equipos y puntos', icon: icon(<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></>) },
      { to: '/universidades', label: 'Universidades y carreras', icon: icon(<><path d="M3 9l9-5 9 5-9 5z" /><path d="M7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5M21 9v6" /></>) },
      { to: '/cronograma', label: 'Cronograma', icon: icon(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M8 14h3M8 17h6" /></>) },
      { to: '/envivo', label: 'En vivo', icon: icon(<><circle cx="12" cy="12" r="2.2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></>) },
      { to: '/contenido', label: 'Contenido del sitio', icon: icon(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>) },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/torneos', label: 'Torneos anteriores', icon: icon(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>) },
      { to: '/configuracion', label: 'Configuración', icon: icon(<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>) },
      { to: '/equipo', label: 'Equipo', icon: icon(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.2c2.6.2 4.5 2.3 4.5 4.8" /></>) },
      { to: '/auditoria', label: 'Auditoría', icon: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
    ],
  },
]

const TITLES = Object.fromEntries(GROUPS.flatMap((g) => g.items.map((i) => [i.to, i.label])))

export default function Layout() {
  const { user, role, signOut } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(null)

  useEffect(() => {
    supabase.from('tournament_settings').select('registration_open').eq('id', 1).maybeSingle()
      .then(({ data }) => setOpen(data ? data.registration_open : null))
  }, [pathname])

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R//</span>
          <div><strong>RAGNAROK</strong><small>Admin · U-Series</small></div>
        </div>
        <nav aria-label="Principal" style={{ display: 'grid', gap: 18 }}>
          {GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => canAccess(role, item.to)) }))
            .filter((group) => group.items.length > 0)
            .map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map(({ to, label, end, icon: ic }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}>
                  {ic}{label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">{user?.email?.[0] ?? '?'}</span>
            <span title={user?.email}>{user?.email}<small style={{ display: 'block', opacity: 0.7 }}>{ROLE_LABEL[role]}</small></span>
          </div>
          <button type="button" className="btn btn--sm" onClick={signOut}>Cerrar sesión</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="crumbs">RAGNAROK <span aria-hidden="true">/</span> <b>{TITLES[pathname] ?? ''}</b></div>
          <div className="topbar-right">
            {open !== null && (
              <span className="live-chip" style={open ? undefined : { color: 'var(--bad)', background: 'var(--bad-soft)' }}>
                <i />{open ? 'INSCRIPCIONES ABIERTAS' : 'INSCRIPCIONES CERRADAS'}
              </span>
            )}
            <ThemeToggle />
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  )
}
