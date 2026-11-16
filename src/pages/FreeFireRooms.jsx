import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { PageHeader, Modal, ErrorBox } from '../components/ui'
import { rpc } from '../lib/tournamentModules'
import { FF_ROOM_KINDS } from '../lib/ffRooms'
import Solo, { RoomForm } from './Solo'
import FfRoomForm from '../components/FfRoomForm'
import FfRoomWorkspace from '../components/FfRoomWorkspace'
import '../ff-rooms.css'

export default function FreeFireRooms() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [kind, setKind] = useState('solo_kills')
  const [visitedKinds, setVisitedKinds] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState('')
  const [choosing, setChoosing] = useState(false)
  const [creationKind, setCreationKind] = useState('solo_kills')
  const [formKind, setFormKind] = useState('')
  const [focus, setFocus] = useState(null)
  const [busy, setBusy] = useState(false)
  const selectKind = (mode) => {
    setKind(mode)
    if (mode !== 'solo_kills') setVisitedKinds((current) => current.includes(mode) ? current : [...current, mode])
  }
  useEffect(() => {
    let active = true
    supabase.from('tournament_settings').select('edition_id,registration_deadline,registration_open').eq('id', 1).single().then((result) => {
      if (!active) return
      if (result.error) setError(result.error.message)
      else { setSettings(result.data); setError('') }
    })
    return () => { active = false }
  }, [refreshKey])
  const create = async (values) => {
    setBusy(true)
    try {
      const target = FF_ROOM_KINDS[formKind]
      const saved = formKind === 'solo_kills'
        ? await rpc('manage_solo', { p_action: 'create', p_data: { ...values, edition_id: settings.edition_id } })
        : await rpc(target.draftRpc, { p_action: 'create', p_data: { ...values, edition_id: settings.edition_id } })
      selectKind(formKind)
      setFocus({ kind: formKind, id: saved.id })
      setFormKind('')
      setRefreshKey((value) => value + 1)
      toast.success('Borrador creado.')
      return null
    } catch (problem) {
      const message = /manage_(duo|solo_top)_room_draft/.test(problem.message) ? 'Aplica las migraciones 029 y 030 para crear esta modalidad.' : problem.message
      if (formKind === 'solo_kills') toast.error(message)
      return message
    } finally { setBusy(false) }
  }
  const chooseNew = () => { setCreationKind(kind); setChoosing(true) }
  return <>
    <PageHeader eyebrow="Competición / Free Fire" title="Salas Free Fire" actions={<>
      <button type="button" className="btn" disabled={busy} onClick={() => setRefreshKey((value) => value + 1)}>Actualizar</button>
      {isAdmin && <button type="button" className="btn btn--primary" disabled={busy || !settings || !!error} onClick={chooseNew}>+ Nueva sala</button>}
    </>} />
    <ErrorBox error={error} />
    <div className="filter-bar ff-mode-filters">
      <label className="field">Modalidad<select value={kind} disabled={busy} onChange={(e) => selectKind(e.target.value)}>{Object.entries(FF_ROOM_KINDS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
    </div>
    <div hidden={kind !== 'solo_kills'}><Solo embedded refreshKey={refreshKey} focusRoomId={focus?.kind === 'solo_kills' ? focus.id : ''} /></div>
    {settings && visitedKinds.map((mode) => <div key={`${settings.edition_id}-${mode}`} hidden={kind !== mode}><FfRoomWorkspace active={kind === mode} kind={mode} settings={settings} refreshKey={refreshKey} focusRoomId={focus?.kind === mode ? focus.id : ''} onCreate={chooseNew} /></div>)}
    {choosing && <Modal title="Nueva sala Free Fire" onClose={() => setChoosing(false)}><form onSubmit={(e) => { e.preventDefault(); setChoosing(false); setFormKind(creationKind) }}>
      <label className="field">Modalidad<select value={creationKind} onChange={(e) => setCreationKind(e.target.value)}>{Object.entries(FF_ROOM_KINDS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      <button className="btn btn--primary">Continuar</button>
    </form></Modal>}
    {formKind === 'solo_kills' && <RoomForm busy={busy} onClose={() => !busy && setFormKind('')} onSave={create} />}
    {formKind && formKind !== 'solo_kills' && <FfRoomForm kind={formKind} busy={busy} onClose={() => !busy && setFormKind('')} onSave={create} />}
  </>
}
