import { money } from '../lib/format'

export default function SoloResults({ room, people, results, busy, onChange }) {
  const playing = room.status === 'playing'
  return <>
    <p className="tm-tab-description">{playing ? 'Tab para avanzar · Un único Booyah · El botón guarda toda la sala.' : room.status === 'finished' ? 'Resultados confirmados. Las ganancias están disponibles en Pagos.' : 'Podrás cargar resultados cuando la sala esté en juego.'}</p>
    <div className="table-wrap"><table><thead><tr><th>Slot</th><th>Jugador</th><th>Kills y Booyah</th><th>Ganancia</th></tr></thead><tbody>
      {people.map((person) => {
        const result = results[person.id]
        const validKills = result && String(result.kills).trim() !== '' && Number.isInteger(Number(result.kills)) && Number(result.kills) >= 0 && Number(result.kills) <= 1000
        return <tr key={person.id}>
          <td><span className="solo-slot">{person.slot != null ? `#${person.slot}` : '—'}</span></td>
          <td><strong>{person.nickname}</strong></td>
          <td>{playing ? <div className="tm-result-fields">
            <input aria-label={`Kills de ${person.nickname}`} type="number" min="0" max="1000" step="1" required disabled={busy} value={result.kills} onChange={(e) => onChange(person.id, { kills: e.target.value })} />
            <label className="check"><input aria-label={`Booyah de ${person.nickname}`} type="checkbox" disabled={busy} checked={result.booyah} onChange={(e) => onChange(person.id, { booyah: e.target.checked })} />Booyah</label>
          </div> : result ? <><strong>{result.kills} kills</strong> {result.booyah && <span className="tm-status tm-status--booyah">BOOYAH</span>}</> : <span className="tm-cell-note">Sin resultado</span>}</td>
          <td><strong>{validKills ? money(Number(result.kills) * Number(room.kill_reward) + (result.booyah ? Number(room.booyah_reward) : 0)) : '—'}</strong>{playing && <small className="tm-cell-note">Provisional</small>}</td>
        </tr>
      })}
    </tbody></table></div>
    {!people.length && <p className="tm-tab-description">No hay jugadores que coincidan con la búsqueda.</p>}
  </>
}
