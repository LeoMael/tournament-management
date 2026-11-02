import { useState } from 'react'
import { defaultRoundBo } from './bracket'

// Formato (BO1/BO3/BO5) de cada ronda de una llave. Lo que el usuario no toca sale del sugerido
// (primeras rondas BO1, semifinal y final BO3). Devuelve [valores, cambiar(indice, valor)].
export function useRoundBo(rounds) {
  const [overrides, setOverrides] = useState({})
  const values = Array.from({ length: rounds }, (_, i) => Number(overrides[i] ?? defaultRoundBo(i, rounds)))
  return [values, (index, value) => setOverrides((o) => ({ ...o, [index]: value }))]
}
