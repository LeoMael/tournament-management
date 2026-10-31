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
export const STATUS_LABEL = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' }

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
