import { roundName } from '../lib/bracket'

// Un selector BO1/BO3/BO5 por cada ronda de la llave.
export default function RoundFormat({ values, onChange }) {
  if (!values.length) return null
  return (
    <div>
      <p className="hint" style={{ marginBottom: 8 }}>Formato de cada ronda (puedes cambiarlo después sin rehacer la llave).</p>
      <div className="rbo">
        {values.map((value, i) => (
          <label className="field" key={i}><span>{roundName(i + 1, values.length)}</span>
            <select value={value} onChange={(e) => onChange(i, e.target.value)}>
              <option value="1">BO1</option><option value="3">BO3</option><option value="5">BO5</option>
            </select>
          </label>
        ))}
      </div>
    </div>
  )
}
