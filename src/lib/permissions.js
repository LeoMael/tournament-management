// Roles del panel. Deben coincidir con la columna admins.role y las políticas RLS (supabase/01_schema.sql).
// La seguridad real la da la base de datos; esto solo oculta lo que cada rol no puede usar.
export const ROLE_LABEL = {
  admin: 'Administrador',
  editor: 'Editor',
  revisor_arbitro: 'Revisor / Árbitro',
}

// Qué roles pueden entrar a cada sección.
export const ACCESS = {
  '/': ['admin', 'revisor_arbitro'],
  '/individuales': ['admin', 'revisor_arbitro'],
  '/inscripciones': ['admin', 'revisor_arbitro'],
  '/formato': ['admin', 'revisor_arbitro'],
  '/equipos': ['admin', 'revisor_arbitro'],
  '/universidades': ['admin', 'revisor_arbitro'],
  '/envivo': ['admin', 'revisor_arbitro'],
  '/cronograma': ['admin', 'revisor_arbitro'],
  '/contenido': ['admin', 'editor'],
  '/configuracion': ['admin'],
  '/equipo': ['admin'],
  '/auditoria': ['admin'],
}

export const canAccess = (role, path) => Boolean(role && ACCESS[path]?.includes(role))

// Primera sección a la que cada rol puede entrar.
export const homeFor = (role) => Object.keys(ACCESS).find((path) => canAccess(role, path)) ?? '/login'
