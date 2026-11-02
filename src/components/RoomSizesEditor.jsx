import { ROOM_SIZE, equalSizes, roomsNeeded } from '../lib/bracket'

const MAX_ROOMS = 12

// Salas de la fase y cuántos equipos va en cada una. Los equipos se reparten al azar con esos tamaños.
//   sizes: [12, 10]; cada sala admite de 1 a 12 equipos y la suma debe dar el total.
export default function RoomSizesEditor({ total, sizes, onChange }) {
  const sum = sizes.reduce((a, b) => a + b, 0)
  const diff = total - sum
  const minRooms = roomsNeeded(total)
  const setSize = (i, value) => onChange(sizes.map((s, k) => (k === i ? Math.max(1, Math.min(ROOM_SIZE, value)) : s)))
  const setRooms = (n) => onChange(equalSizes(total, Math.max(minRooms, Math.min(MAX_ROOMS, Math.min(total, n)))))

  return (
    <div className="rs">
      <div className="room-bar">
        <span className="room-bar-label">Salas</span>
        <span className="lb-kills" role="group" aria-label="Cantidad de salas">
          <button type="button" aria-label="Menos salas" disabled={sizes.length <= minRooms} onClick={() => setRooms(sizes.length - 1)}>−</button>
          <output>{sizes.length}</output>
          <button type="button" aria-label="Más salas" disabled={sizes.length >= Math.min(MAX_ROOMS, total)} onClick={() => setRooms(sizes.length + 1)}>+</button>
        </span>
        <span className="hint">{total} equipos · máximo {ROOM_SIZE} por sala{minRooms > 1 ? ` · mínimo ${minRooms} salas` : ''}</span>
        <button type="button" className="btn btn--sm btn--ghost" style={{ marginLeft: 'auto' }} onClick={() => setRooms(sizes.length)}>Repartir parejo</button>
      </div>
      <div className="rs-grid">
        {sizes.map((size, i) => (
          <div className="rs-room" key={i}>
            <b>Sala {i + 1}</b>
            <span className="lb-kills" role="group" aria-label={`Equipos en la sala ${i + 1}`}>
              <button type="button" aria-label="Menos equipos" disabled={size <= 1} onClick={() => setSize(i, size - 1)}>−</button>
              <input type="number" min="1" max={ROOM_SIZE} value={size} onChange={(e) => setSize(i, Number(e.target.value) || 1)} aria-label={`Equipos en la sala ${i + 1}`} />
              <button type="button" aria-label="Más equipos" disabled={size >= ROOM_SIZE} onClick={() => setSize(i, size + 1)}>+</button>
            </span>
            <small>equipos</small>
          </div>
        ))}
      </div>
      <p className={`rs-sum ${diff === 0 ? 'rs-sum--ok' : 'rs-sum--bad'}`}>
        {diff === 0 ? `✓ Suman ${total} equipos.` : diff > 0 ? `Faltan ${diff} ${diff === 1 ? 'equipo' : 'equipos'} por ubicar (suman ${sum} de ${total}).` : `Sobran ${-diff} ${-diff === 1 ? 'equipo' : 'equipos'} (suman ${sum} de ${total}).`}
      </p>
    </div>
  )
}
