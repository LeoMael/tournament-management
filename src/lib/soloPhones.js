// El destino del premio nunca se deduce del contacto al leer o editar un registro.
export function prizeYapePhone(person) {
  const value = String(person?.prize_yape_phone ?? '')
  return /^[0-9]{8,15}$/.test(value) ? value : null
}
