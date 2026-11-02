// Llave de eliminación con conexiones: cada cruce se une con una línea al de la ronda siguiente.
// Solo dibuja la estructura; el contenido de cada cruce lo pinta `renderMatch`.
//   rounds: [{ round, name, matches: [{ key, … }] }]
export default function BracketView({ rounds, renderMatch, renderHeaderExtra, compact = false }) {
  return (
    <div className={`brv ${compact ? 'brv--compact' : ''}`}>
      {rounds.map((round, ri) => {
        const hasNext = ri < rounds.length - 1
        return (
          <div className="brv-round" key={round.round}>
            <header className="brv-head">
              <h4>{round.name}</h4>
              {renderHeaderExtra?.(round)}
            </header>
            <div className="brv-list">
              {round.matches.map((m, i) => (
                <div className={`brv-slot ${i % 2 === 0 ? 'brv-slot--even' : 'brv-slot--odd'}`} key={m.key}>
                  {renderMatch(m, round)}
                  {ri > 0 && <i className="brv-c brv-c--in" aria-hidden="true" />}
                  {hasNext && <i className="brv-c brv-c--out" aria-hidden="true" />}
                  {hasNext && <i className="brv-c brv-c--join" aria-hidden="true" />}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
