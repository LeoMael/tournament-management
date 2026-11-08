import { supabase } from '../supabaseClient'

export async function allRows(table, order = 'id') {
  const rows = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from(table).select('*').order(order).range(from, from + 499)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < 500) return rows
  }
}

export async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}

export const SOLO_STATUS = { draft: 'Borrador', open: 'Inscripciones abiertas', closed: 'Inscripciones cerradas', playing: 'En juego', finished: 'Finalizada', cancelled: 'Cancelada', pending: 'Por revisar', approved: 'Aprobada', rejected: 'Rechazada', refund_pending: 'Devolución pendiente', refunded: 'Devuelta' }
export const MIGRATION_MESSAGE = 'Esta función requiere las migraciones 007 a 010. Revisa el historial en Configuración.'
