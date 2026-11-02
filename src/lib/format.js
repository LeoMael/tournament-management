export const money = (n) =>
  `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

// ISO -> valor para <input type="datetime-local"> (hora local)
export const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const GAME_LABEL = { mlbb: 'MLBB', ff: 'Free Fire' }
export const STATUS_LABEL = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', withdrawn: 'Retirado' }

export const whatsappUrl = (number) => {
  let digits = String(number || '').replace(/\D/g, '')
  if (digits.length === 9) digits = `51${digits}`
  return `https://wa.me/${digits}`
}

export const uuid = () => crypto.randomUUID()

export const extFromFile = (file) => {
  const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac' }
  return map[file.type] || null
}

// Hora compacta para chips: "Hoy 20:00", "Mañana 18:30" o "3 nov 20:00".
export const shortDateTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const time = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000)
  if (days === 0) return `Hoy ${time}`
  if (days === 1) return `Mañana ${time}`
  return `${d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }).replace('.', '')} ${time}`
}
