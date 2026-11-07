import { useEffect } from 'react'
import { STATUS_LABEL } from '../lib/format'

export function StatusBadge({ status }) {
  return <span className={`badge badge--${status}`}>{STATUS_LABEL[status] ?? status}</span>
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function Modal({ title, onClose, children, footer, actions, wide = false, xwide = false, closeOnBackdrop = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={closeOnBackdrop ? (e) => e.target === e.currentTarget && onClose() : undefined}>
      <div className={`modal ${wide ? 'modal--wide' : ''} ${xwide ? 'modal--xwide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {actions}
            <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Cerrar">Cerrar</button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <p className="error-box" role="alert">{error}</p>
}

export function Spinner({ label = 'Cargando…' }) {
  return <div className="spinner">{label}</div>
}
