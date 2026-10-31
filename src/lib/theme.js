const KEY = 'ragnarok-admin-theme'

const systemTheme = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

// Tema efectivo actual: lo elegido por el usuario o, si no eligió, el del sistema.
export const getTheme = () => localStorage.getItem(KEY) || systemTheme()

export function setTheme(theme) {
  localStorage.setItem(KEY, theme)
  document.documentElement.setAttribute('data-theme', theme)
}

export function initTheme() {
  const saved = localStorage.getItem(KEY)
  if (saved) document.documentElement.setAttribute('data-theme', saved)
}
