// Cruce de la primera ronda en modo edición: cada lugar es un botón. Se toca un lugar y luego otro
// para intercambiarlos (un lugar "Vacío" también se puede mover).
export default function SlotCard({ label, a, b, selected, onTouch }) {
  const slot = (side, name) => (
    <button type="button" aria-pressed={selected === side}
      className={`bm-team bm-team--slot ${name ? '' : 'bm-team--vacant'} ${selected === side ? 'bm-team--sel' : ''}`} onClick={() => onTouch(side)}>
      <span className="bm-name">{name || 'Vacío (Bye)'}</span>
    </button>
  )
  return (
    <div className="bm bm--edit">
      <div className="bm-head"><span className="bm-num">{label}</span></div>
      {slot('a', a)}
      {slot('b', b)}
    </div>
  )
}
