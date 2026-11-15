import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { teamConfirmationLink } from '../lib/teamWhatsApp'

function ConfirmationButton({ reg, busy = false }) {
  const toast = useToast()
  const [count, setCount] = useState(reg.ff_confirmation_click_count ?? 0)
  const tracked = reg.game_key === 'ff' && reg.status === 'approved'
  useEffect(() => {
    if (!tracked) return undefined
    let active = true
    const refresh = async () => {
      if (document.hidden) return
      const { data, error } = await supabase.from('registrations').select('ff_confirmation_click_count').eq('id', reg.id).maybeSingle()
      if (active && !error && data) setCount((old) => Math.max(old, data.ff_confirmation_click_count))
    }
    const run = () => { void refresh().catch(() => {}) }
    run(); const timer = window.setInterval(run, 15000); window.addEventListener('focus', run)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', run) }
  }, [tracked, reg.id])
  if (reg.status !== 'approved' || !['mlbb', 'ff'].includes(reg.game_key)) return null
  const href = teamConfirmationLink(reg)
  const clicked = async () => {
    if (!tracked) return
    const { data, error } = await supabase.rpc('count_ff_squad_confirmation_click', { p_edition_id: reg.edition_id, p_registration_id: reg.id })
    if (error) toast.error('No se guardó el contador de confirmación. Comprueba la conexión y la migración 024.')
    else setCount((old) => Math.max(old, data.ff_confirmation_click_count))
  }
  return <>
    {href && !busy ? <a className="btn btn--sm btn--ok" href={href} target="_blank" rel="noopener noreferrer" onClick={() => { void clicked().catch(() => toast.error('No se pudo guardar el contador.')) }} aria-label={`Confirmar inscripción de ${reg.team_name} por WhatsApp al capitán`}>Confirmar inscripción</a>
      : <button type="button" className="btn btn--sm btn--ok" disabled title={busy ? 'Hay una operación en curso.' : 'Comprueba el nombre y el WhatsApp del capitán.'}>Confirmar inscripción</button>}
    {tracked && <span className="hint" style={{ marginLeft: 6 }} title="Clics en Confirmar inscripción" aria-label={`${count} clics en Confirmar inscripción`}>{count}</span>}
  </>
}

export default function TeamConfirmationButton(props) {
  return <ConfirmationButton key={props.reg.id} {...props} />
}
