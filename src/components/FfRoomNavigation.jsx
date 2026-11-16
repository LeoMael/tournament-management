export function FfRoomCard({ room, selected, status, participants, busy, onSelect, onDelete, isDuo = false }) {
  const unit = isDuo ? participants === 1 ? 'dúo' : 'dúos' : participants === 1 ? 'jugador' : 'jugadores'
  return <div className="tm-room-item">
    <button type="button" className={`tm-room-option ${selected ? 'tm-room-option--active' : ''} ${onDelete ? 'tm-room-option--deletable' : ''}`} disabled={busy} onClick={onSelect} aria-pressed={selected}>
      <span className="tm-room-option__top"><strong>{room.name}</strong>{status}{room.status === 'draft' && room.is_announced && <span className="tm-status tm-status--published">Anunciada</span>}</span>
      <small>{participants > 0 ? `${participants} ${unit}` : isDuo ? 'Sin dúos' : 'Sin jugadores'}</small>
    </button>
    {onDelete && <button type="button" className="tm-room-delete" disabled={busy} aria-label={`Eliminar sala ${room.name}`} title="Eliminar sala" onClick={onDelete}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
    </button>}
  </div>
}

export function FfRoomTabs({ tabs, view, onChange }) {
  return <div className="tm-tabs" role="tablist" aria-label="Gestión de la sala">
    {tabs.map(([key, label, count]) => <button type="button" role="tab" aria-selected={view === key} className={view === key ? 'tm-tab tm-tab--active' : 'tm-tab'} key={key} onClick={() => onChange(key)}>{label}<span>{count}</span></button>)}
  </div>
}
