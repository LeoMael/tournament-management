import { GAME_LABEL } from '../lib/format'
import { limaDayLabel, limaTime } from '../lib/schedule'

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// Agenda tipo horario: un bloque por día y, dentro, cada actividad en su hora con una línea de tiempo.
// Se toca una actividad para cambiar su hora (partido) o editarla (evento).
export default function ScheduleAgenda({ days, onPick }) {
  if (days.length === 0) return <p className="empty">Aún no hay horarios. Programa partidos desde la lista de la derecha o agrega un evento.</p>
  return (
    <div className="ag">
      {days.map((day) => (
        <section className={`ag-day ${day.isToday ? 'ag-day--today' : ''}`} key={day.key}>
          <header className="ag-day-head">
            <h3>{cap(limaDayLabel(day.key))}</h3>
            {day.isToday && <span className="ag-today">HOY</span>}
            <span className="ag-count">{day.items.length} {day.items.length === 1 ? 'actividad' : 'actividades'}</span>
          </header>
          <ol className="ag-line">
            {day.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <time className="ag-time">{limaTime(item.at)}{item.end && <small>{limaTime(item.end)}</small>}</time>
                <span className={`ag-dot ag-dot--${item.kind === 'event' ? 'event' : item.game}`} aria-hidden="true" />
                <button type="button" className={`ag-block ag-block--${item.kind === 'event' ? 'event' : item.game} ${item.done ? 'ag-block--done' : ''}`} onClick={() => onPick(item)}>
                  <span className="ag-title">{item.title}</span>
                  <span className="ag-meta">
                    {item.kind === 'event' ? <b>Evento</b> : <b>{GAME_LABEL[item.game]}</b>}
                    {item.kind === 'event' && item.game && <b>{GAME_LABEL[item.game]}</b>}
                    {item.sub && <span>{item.sub}</span>}
                  </span>
                  {item.done && <span className="ag-chip">Terminado</span>}
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
