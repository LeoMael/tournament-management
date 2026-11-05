import { useState, useMemo, useCallback } from 'react'
import { DEFAULT_PLACEMENT_POINTS } from '../lib/bracket'

// Función de normalización solo para comparar en la búsqueda:
// Descompone caracteres unicode (ej. fuentes fullwidth, acentos) y remueve marcas para comparar texto plano.
// NUNCA modifica el nickname real en pantalla ni en la base de datos.
function normalizeForSearch(str) {
  if (!str) return ''
  return String(str)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Carga de resultados de una sala Battle Royale (Opción 2: Tabla de Slots con Nicknames visibles).
// teams: [{ id, name, slot, players: [{ nickname, game_player_id, slot }] }]
export default function LobbyBoard({
  teams,
  placements,
  kills,
  pointsOf,
  config,
  onPlacement,
  onKills,
  onClearRoom,
}) {
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('slot') // 'slot' | 'place'

  const posTable = config?.placement_points ?? DEFAULT_PLACEMENT_POINTS
  const killPts = config?.kill_points ?? 1

  // Detección de puestos duplicados en esta sala
  const duplicatePlaces = useMemo(() => {
    const counts = {}
    teams.forEach((t) => {
      const p = placements[t.id]
      if (p !== '' && p !== null && p !== undefined && Number(p) >= 1) {
        const num = Number(p)
        counts[num] = (counts[num] ?? 0) + 1
      }
    })
    return new Set(Object.keys(counts).filter((p) => counts[p] > 1).map(Number))
  }, [teams, placements])

  // Función de coincidencia para el buscador
  const isMatch = useCallback((team, rawQ) => {
    if (!rawQ) return true
    const q = rawQ.trim().toLowerCase()
    const normQ = normalizeForSearch(rawQ)

    // Coincidencia por nombre de equipo
    if (team.name.toLowerCase().includes(q)) return true
    if (normQ && normalizeForSearch(team.name).includes(normQ)) return true

    // Coincidencia por número de slot (ej. "1", "slot 1", "#1")
    if (String(team.slot) === q || `slot ${team.slot}`.includes(q) || `#${team.slot}`.includes(q)) return true

    // Coincidencia por nicknames de los integrantes
    for (const p of team.players || []) {
      if (!p.nickname) continue
      // Coincidencia exacta con símbolos
      if (p.nickname.toLowerCase().includes(q)) return true
      // Coincidencia ignorando símbolos y fuentes raras
      if (normQ && normalizeForSearch(p.nickname).includes(normQ)) return true
    }

    return false
  }, [])

  // Lista ordenada de equipos según el criterio seleccionado
  const displayTeams = useMemo(() => {
    const list = [...teams]
    if (sortBy === 'place') {
      return list.sort((a, b) => {
        const pa = placements[a.id] ? Number(placements[a.id]) : 99
        const pb = placements[b.id] ? Number(placements[b.id]) : 99
        return pa - pb || (a.slot ?? 99) - (b.slot ?? 99)
      })
    }
    // Por defecto por Slot
    return list.sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99) || a.name.localeCompare(b.name))
  }, [teams, placements, sortBy])

  const placedCount = teams.filter((t) => placements[t.id] !== '' && placements[t.id] !== null && placements[t.id] !== undefined && Number(placements[t.id]) >= 1).length

  return (
    <div className="tb-v2">
      {/* Barra superior de herramientas y búsqueda */}
      <div className="tb-toolbar">
        <div className="tb-search-box">
          <input
            type="text"
            className="tb-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nickname, equipo o slot (#1..#12)..."
          />
          {query && (
            <button
              type="button"
              className="tb-search-clear"
              onClick={() => setQuery('')}
              title="Borrar búsqueda"
            >
              ×
            </button>
          )}
        </div>

        <div className="tb-tools">
          <span className="tb-badge-count">
            {placedCount}/{teams.length} asignados
          </span>

          <div className="seg" role="group" aria-label="Ordenar">
            <button
              type="button"
              className={`seg-btn ${sortBy === 'slot' ? 'seg-btn--on' : ''}`}
              onClick={() => setSortBy('slot')}
            >
              Por Slot
            </button>
            <button
              type="button"
              className={`seg-btn ${sortBy === 'place' ? 'seg-btn--on' : ''}`}
              onClick={() => setSortBy('place')}
            >
              Por Puesto
            </button>
          </div>

          <button
            type="button"
            className="btn btn--sm btn--ghost text-danger"
            onClick={onClearRoom}
            title="Borrar puestos y kills de esta sala"
          >
            Limpiar sala
          </button>
        </div>
      </div>

      {duplicatePlaces.size > 0 && (
        <div className="tb-warn-banner">
          <b>Atención:</b> Hay puestos repetidos en esta sala ({[...duplicatePlaces].sort((a, b) => a - b).map((p) => `${p}°`).join(', ')}). Corrige los números antes de guardar.
        </div>
      )}

      {/* Tabla de equipos con sus integrantes y casillas de entrada */}
      <div className="table-wrap">
        <table className="tb-table-v2">
          <thead>
            <tr>
              <th style={{ width: 64 }}>Slot</th>
              <th>Equipo e Integrantes (Nicknames de la sala)</th>
              <th style={{ width: 110, textAlign: 'center' }} title="Puesto de supervivencia en el mapa (1.º al 12.º)">
                Puesto
              </th>
              <th style={{ width: 100, textAlign: 'center' }} title="Bajas conseguidas por la escuadra">
                Kills
              </th>
              <th style={{ width: 110, textAlign: 'right' }} title="Puntos totales calculados automáticamente">
                Pts
              </th>
            </tr>
          </thead>
          <tbody>
            {displayTeams.map((t) => {
              const matched = isMatch(t, query)
              const rawPlace = placements[t.id]
              const place = rawPlace !== '' && rawPlace !== null && rawPlace !== undefined ? Number(rawPlace) : null
              const k = Number(kills[t.id]) || 0
              const isDupe = place && duplicatePlaces.has(place)
              const isBooyah = place === 1

              const hasValidPlace = place && place >= 1 && place <= 12
              const posPts = hasValidPlace ? (posTable[place - 1] ?? 0) : 0
              const totalPts = hasValidPlace ? pointsOf(place, k) : null

              return (
                <tr
                  key={t.id}
                  className={`tb-row ${query && matched ? 'tb-row--highlight' : ''} ${query && !matched ? 'tb-row--dim' : ''} ${isBooyah ? 'tb-row--booyah' : ''}`}
                >
                  <td>
                    <span className={`slot-chip ${isBooyah ? 'slot-chip--gold' : ''}`}>
                      #{t.slot ?? '·'}
                    </span>
                  </td>
                  <td>
                    <div className="tb-team-info">
                      <strong className="tb-team-name">{t.name}</strong>
                      <div className="tb-nicks" title="Integrantes registrados de la escuadra">
                        {t.players && t.players.length > 0 ? (
                          t.players.map((p, idx) => (
                            <span
                              key={p.game_player_id || idx}
                              className="nick-chip"
                              title={p.game_player_id ? `ID: ${p.game_player_id}` : undefined}
                            >
                              {p.nickname}
                            </span>
                          ))
                        ) : (
                          <span className="nick-chip nick-chip--empty">Sin jugadores registrados</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="tb-input-wrap">
                      <input
                        type="number"
                        min="1"
                        max="12"
                        step="1"
                        inputMode="numeric"
                        className={`tb-input tb-input--place ${isDupe ? 'tb-input--dupe' : ''} ${isBooyah ? 'tb-input--booyah' : ''}`}
                        value={rawPlace ?? ''}
                        placeholder="—"
                        onChange={(e) => onPlacement(t.id, e.target.value)}
                        title={isDupe ? '¡Puesto repetido con otro equipo!' : 'Puesto del 1 al 12'}
                      />
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="tb-input-wrap">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        step="1"
                        inputMode="numeric"
                        className="tb-input tb-input--kills"
                        value={kills[t.id] ?? 0}
                        onChange={(e) => onKills(t.id, e.target.value)}
                        title="Kills (bajas de la escuadra)"
                      />
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {hasValidPlace ? (
                      <div className="tb-pts-box">
                        <strong className={`tb-pts-total ${isBooyah ? 'tb-pts-total--gold' : ''}`}>
                          {totalPts}
                        </strong>
                        <small className="tb-pts-split" title={`${posPts} pts de posición + ${k * killPts} por kills`}>
                          {posPts} + {k * killPts}
                        </small>
                      </div>
                    ) : (
                      <span className="tb-pts-empty">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
