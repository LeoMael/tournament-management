import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ErrorBox, PageHeader, Spinner } from '../components/ui'
import Breakdown from '../components/Breakdown'

export default function Universities() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [regs, players] = await Promise.all([
        supabase.from('registrations').select('id, game_key, status, institution, other_institution, professional_school'),
        supabase.from('players').select('registration_id'),
      ])
      if (!active) return
      const err = regs.error || players.error
      if (err) setError(err.message)
      else setData({ regs: regs.data, players: players.data })
    })()
    return () => { active = false }
  }, [])

  const playersByReg = useMemo(() => {
    const map = new Map()
    ;(data?.players ?? []).forEach((p) => map.set(p.registration_id, (map.get(p.registration_id) ?? 0) + 1))
    return map
  }, [data])

  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  return (
    <>
      <PageHeader eyebrow="Torneo" title="Universidades y carreras" subtitle="De qué universidades y carreras vienen los equipos inscritos." />
      <Breakdown regs={data.regs} playersByReg={playersByReg} />
    </>
  )
}
