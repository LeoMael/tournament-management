import { useState } from 'react'
import PrizePoolCard from './PrizePoolCard'
import PrizesCard from './PrizesCard'
import './prize-config.css'

export default function PrizeSettings({ games, prizes, pools }) {
  const [selected, setSelected] = useState(games[0]?.key ?? '')
  return (
    <section className="card prize-config">
      <h2>Bolsa y premios</h2>
      <div className="seg" role="group" aria-label="Juego">
        {games.map((game) => (
          <button key={game.key} type="button" className={`seg-btn ${selected === game.key ? 'seg-btn--on' : ''}`} aria-pressed={selected === game.key} onClick={() => setSelected(game.key)}>
            {game.key === 'mlbb' ? 'MLBB' : game.key === 'ff' ? 'Free Fire' : game.name}
          </button>
        ))}
      </div>
      {games.map((game) => (
        <div key={game.key} hidden={selected !== game.key} className="prize-config__game">
          <PrizePoolCard game={game} pool={pools.find((pool) => pool.game_key === game.key)} />
          <PrizesCard game={game} prizes={prizes.filter((prize) => prize.game_key === game.key)} />
        </div>
      ))}
    </section>
  )
}
