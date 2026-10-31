import { supabase } from '../supabaseClient'
import { extFromFile, uuid } from './format'

const LIMITS = { 'public-assets': 20 * 1024 * 1024, 'team-logos': 5 * 1024 * 1024, receipts: 5 * 1024 * 1024 }

// Sube un archivo a un bucket con nombre aleatorio. Valida tipo y tamaño en cliente
// (el bucket vuelve a validarlos en servidor).
export async function uploadFile(bucket, file, { allowPdf = false, allowAudio = false } = {}) {
  const ext = extFromFile(file)
  const isAudio = file.type.startsWith('audio/')
  if (!ext || (ext === 'pdf' && !allowPdf) || (isAudio && !allowAudio)) {
    throw new Error(allowAudio ? 'Formato no permitido (MP3, OGG, M4A o AAC).' : 'Formato no permitido (PNG, JPG, WEBP' + (allowPdf ? ' o PDF' : '') + ').')
  }
  if (file.size > LIMITS[bucket]) throw new Error(`El archivo supera el máximo de ${LIMITS[bucket] / 1024 / 1024} MB.`)
  const path = `${uuid()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message)
  return path
}

export const publicUrl = (bucket, path) =>
  path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : null

export async function signedReceiptUrl(path) {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function removeFile(bucket, path) {
  if (!path) return
  await supabase.storage.from(bucket).remove([path])
}
