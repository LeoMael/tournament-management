// Asignación rápida de horas a los partidos de una fase. Solo lógica pura.

// Reparte horas por orden de ronda y posición: `perSlot` partidos comparten cada franja y entre franjas
// pasan `gapMin` minutos. Devuelve [{ id, at: Date }].
export function autoSchedule(matches, { start, gapMin, perSlot = 1 }) {
  const slots = Math.max(1, Math.floor(perSlot))
  return [...matches]
    .sort((a, b) => a.round - b.round || a.position - b.position)
    .map((m, i) => ({ id: m.id, at: new Date(start.getTime() + Math.floor(i / slots) * gapMin * 60000) }))
}
