import { previewStage, qualifyText, roundName } from '../lib/bracket'
import BracketView from './BracketView'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function Tile({ label, value }) {
  return (
    <div className="pv-tile">
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  )
}

function Groups({ sizes, qualify, label = 'Grupo' }) {
  return (
    <div className="pv-groups">
      {sizes.map((size, i) => (
        <div className="pv-group" key={i}>
          <header><b>{label} {label === 'Sala' ? i + 1 : String.fromCharCode(65 + i)}</b><span>{plural(size, 'equipo', 'equipos')}</span></header>
          <div className="pv-slots" aria-hidden="true">{Array.from({ length: size }, (_, k) => <i key={k} className={k < qualify ? 'pv-slot--q' : 'pv-slot--out'} />)}</div>
        </div>
      ))}
    </div>
  )
}

// Llave de ejemplo con las mismas conexiones que la real: Equipo 1…N, Bye y "Ganador Mx".
function PreviewBracket({ p, roundBo }) {
  const rounds = p.columns.map((c) => ({ round: c.round, name: roundName(c.round, p.rounds), matches: c.boxes }))
  const slot = (name) => `bm-team bm-team--static ${name === 'Bye' ? 'bm-team--bye' : name.startsWith('Ganador') ? 'bm-team--empty' : ''}`
  return (
    <div className="pv-bracket-box">
      <BracketView compact rounds={rounds}
        renderHeaderExtra={(round) => <span className="bm-bo">BO{roundBo?.[round.round - 1] ?? 1}</span>}
        renderMatch={(m) => (
          <div className={`bm bm--static ${m.bye ? 'bm--bye' : ''}`}>
            <div className="bm-head"><span className="bm-num">{m.bye ? 'Bye' : `M${m.number}`}</span></div>
            <div className={slot(m.a)}><span className="bm-name">{m.a}</span></div>
            <div className={slot(m.b)}><span className="bm-name">{m.b}</span></div>
          </div>
        )} />
    </div>
  )
}

// Resumen visual de lo que se va a generar: cifras clave + un esquema (grupos, llave o salas).
export default function StagePreview({ type, total, config, roundBo, names = null, roomSizes = null }) {
  const p = previewStage(type, total, config, names)
  let tiles
  let caption
  if (p.kind === 'groups') {
    tiles = [['Equipos', total], ['Grupos', p.sizes.length], ['Partidos', p.matches], ['Pasan a la siguiente', p.advancing]]
    caption = p.valid ? `${qualifyText(p.qualify)} (cuadros de color). Todos juegan contra todos en su grupo.` : total < 2 ? 'Necesitas al menos 2 equipos aprobados.' : `Con ${total} equipos puedes hacer de 1 a ${Math.floor(total / 2)} grupos.`
  } else if (p.kind === 'single_elim') {
    tiles = [['Equipos', total], ['Rondas', p.valid ? p.rounds : '—'], ['Partidos', p.valid ? p.matches : '—']]
    if (!p.valid) caption = 'Necesitas al menos 2 equipos aprobados.'
    else if (p.byes) caption = `${plural(p.byes, 'equipo pasa', 'equipos pasan')} directo a la 2.ª ronda (Bye). Cada línea une un cruce con el siguiente.`
    else caption = 'Cada línea une un cruce con el siguiente.'
  } else {
    tiles = [['Equipos', total], ['Salas', roomSizes?.length ?? 1], ['Partidas', p.lobbies || '—']]
    caption = p.valid ? (roomSizes?.length > 1 ? 'Cada sala juega por separado y tiene su propia tabla.' : 'Todos los equipos juegan todas las partidas.') : total < 2 ? 'Necesitas al menos 2 equipos aprobados.' : 'Cantidad de partidas inválida (1–20).'
  }
  return (
    <section className={`pv ${p.valid ? '' : 'pv--invalid'} ${p.kind === 'battle_royale' ? 'pv--br' : ''}`} aria-label="Vista previa de la fase" aria-live="polite">
      <div className="pv-tiles">{tiles.map(([label, value]) => <Tile key={label} label={label} value={value} />)}</div>
      {p.valid && p.kind === 'groups' && <Groups sizes={p.sizes} qualify={p.qualify} />}
      {p.valid && p.kind === 'single_elim' && <PreviewBracket p={p} roundBo={roundBo} />}
      {p.valid && p.kind === 'battle_royale' && (
        <div className="pv-lobbies" aria-hidden="true">{Array.from({ length: p.lobbies }, (_, i) => <span key={i} title={`Partida ${i + 1}`}>P{i + 1}</span>)}</div>
      )}
      {caption && <p className={`pv-caption ${p.valid ? '' : 'pv-caption--warn'}`}>{caption}</p>}
    </section>
  )
}
