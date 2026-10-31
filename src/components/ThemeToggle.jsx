import { useState } from 'react'
import { getTheme, setTheme } from '../lib/theme'

export default function ThemeToggle() {
  const [theme, setCurrent] = useState(getTheme)
  const next = theme === 'dark' ? 'light' : 'dark'
  const toggle = () => {
    setTheme(next)
    setCurrent(next)
  }
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={`Cambiar a tema ${next === 'dark' ? 'oscuro' : 'claro'}`} title={next === 'dark' ? 'Tema oscuro' : 'Tema claro'}>
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
