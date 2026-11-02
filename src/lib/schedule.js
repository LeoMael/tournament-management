// Asignación rápida de horas a los partidos de una fase. Solo lógica pura.

// Reparte horas por orden de ronda y posición: `perSlot` partidos comparten cada franja y entre franjas
// pasan `gapMin` minutos. Devuelve [{ id, at: Date }].
export function autoSchedule(matches, { start, gapMin, perSlot = 1 }) {
  const slots = Math.max(1, Math.floor(perSlot))
  return [...matches]
    .sort((a, b) => a.round - b.round || a.position - b.position)
    .map((m, i) => ({ id: m.id, at: new Date(start.getTime() + Math.floor(i / slots) * gapMin * 60000) }))
}

// ---- Vista de agenda (se muestra en hora de Lima, igual que el sitio) ----
const TZ = 'America/Lima'
export const limaDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso))
export const limaTime = (iso) => new Date(iso).toLocaleTimeString('es-PE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
export const limaDayLabel = (key) => new Date(`${key}T12:00:00-05:00`).toLocaleDateString('es-PE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })

// Agrupa por día (en orden) los partidos con hora y los eventos. items: [{ at, ... }]
export function groupByDay(items, now = new Date()) {
  const sorted = [...items].sort((a, b) => new Date(a.at) - new Date(b.at))
  const today = limaDay(now)
  const days = []
  for (const item of sorted) {
    const key = limaDay(item.at)
    let day = days.at(-1)
    if (!day || day.key !== key) { day = { key, isToday: key === today, items: [] }; days.push(day) }
    day.items.push(item)
  }
  return days
}
