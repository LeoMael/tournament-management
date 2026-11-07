import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { Modal, PageHeader, Spinner } from '../components/ui'
import IndividualSettings from '../components/individual/IndividualSettings'
import IndividualCandidates from '../components/individual/IndividualCandidates'
import IndividualGroups from '../components/individual/IndividualGroups'

export default function Individuals() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('requests')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const load = useCallback(async () => {
    try {
      const [settings, people, groups, games] = await Promise.all([
        supabase.from('individual_settings').select('*').order('game_key'),
        supabase.from('individual_registrations').select('*').order('created_at', { ascending: false }),
        supabase.from('individual_groups').select('*').order('created_at', { ascending: false }),
        supabase.from('games').select('key,name,starters').order('key'),
      ])
      const failure = settings.error || people.error || groups.error || games.error
      if (failure) setError(failure)
      else {
        setError(null)
        setData({ settings: settings.data, people: people.data, groups: groups.data, games: games.data })
      }
    } catch (err) { setError(err) }
  }, [])
  useEffect(() => { load() }, [load])

  if (error) return (
    <div className="card">
      <h2>Inscripciones individuales no disponibles</h2>
      <p>{['42P01', '42703', 'PGRST205', 'PGRST204'].includes(error.code) ? 'Falta aplicar la migración 003 de inscripciones individuales.' : `No se pudieron cargar los datos: ${error.message}`}</p>
      <button className="btn" onClick={load}>Reintentar</button>
    </div>
  )
  if (!data) return <Spinner />
  const count = (status) => data.people.filter((p) => p.status === status).length
  const stats = [
    ['Pendientes', count('pending'), 'stat--warn'],
    ['Esperando grupo', count('approved'), 'stat--accent'],
    ['Grupos provisionales', data.groups.filter((g) => g.status === 'draft').length, ''],
    ['Inscritos', count('registered'), 'stat--ok'],
    ['Devoluciones pendientes', count('refund_pending'), ''],
  ]
  return (
    <>
      <PageHeader eyebrow="Operación" title="Inscripciones individuales" subtitle="Revisa solicitudes y forma equipos para el torneo."
        actions={<><button type="button" className="btn" onClick={load}>Actualizar</button>{isAdmin && <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>Configuración</button>}</>} />
      <div className="individual-stats">
        {stats.map(([label, value, style]) => <div className={`stat ${style}`} key={label}><small>{label}</small><strong>{value}</strong></div>)}
      </div>
      <div className="section-tabs" role="tablist" aria-label="Inscripciones individuales">
        {[['requests', 'Solicitudes'], ['groups', 'Grupos']].map(([key, label]) => (
          <button key={key} role="tab" type="button" aria-selected={tab === key} className={`section-tab ${tab === key ? 'section-tab--active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      <div hidden={tab !== 'requests'}><IndividualCandidates people={data.people} onChanged={load} /></div>
      <div hidden={tab !== 'groups'}><IndividualGroups groups={data.groups} people={data.people} games={data.games} onChanged={load} /></div>
      {settingsOpen && <Modal title="Configuración individual" onClose={() => setSettingsOpen(false)} wide><IndividualSettings settings={data.settings} onChanged={load} /></Modal>}
    </>
  )
}
