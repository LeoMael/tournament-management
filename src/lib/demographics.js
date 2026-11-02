// Estadísticas de universidad y carrera a partir de las inscripciones. Solo lógica pura.

export const universityOf = (r) => (r.institution === 'UNAP' ? 'UNAP' : r.other_institution || 'Otra institución')
export const careerOf = (r) => r.professional_school || 'Sin especificar'

// Agrupa inscripciones por una clave y cuenta equipos y jugadores. `playersByReg` = Map(registration_id -> n).
// Orden: más equipos, luego más jugadores, luego alfabético.
export function tally(regs, keyOf, labelOf, subOf, playersByReg) {
  const map = new Map()
  for (const r of regs) {
    const key = keyOf(r)
    const row = map.get(key) ?? { key, label: labelOf(r), sub: subOf?.(r) ?? '', teams: 0, players: 0 }
    row.teams += 1
    row.players += playersByReg.get(r.id) ?? 0
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.teams - a.teams || b.players - a.players || a.label.localeCompare(b.label))
}
