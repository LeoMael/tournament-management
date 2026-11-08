import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Modal, PageHeader, Spinner } from '../components/ui'
import { money, dateTime, toLocalInput } from '../lib/format'
import { signedReceiptUrl } from '../lib/storage'
import { allRows, rpc, SOLO_STATUS, MIGRATION_MESSAGE } from '../lib/tournamentModules'
import SoloResults from '../components/SoloResults'
import SoloPayments from '../components/SoloPayments'
import PaymentRecipient from '../components/PaymentRecipient'
import '../tournament-modules.css'
import '../solo-layout.css'

function RoomForm({ room, onSave, onClose, busy }) {
  return <Modal title={room ? 'Editar borrador' : 'Nueva sala Solo'} onClose={onClose}>
    <form onSubmit={(e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); onSave({ ...data, scheduled_at: new Date(data.scheduled_at).toISOString(), closes_at: new Date(data.closes_at).toISOString() }) }}>
      <label className="field">Nombre<input name="name" minLength={3} maxLength={100} required defaultValue={room?.name} /></label>
      <div className="form-row">{[['scheduled_at', 'Fecha de partida'], ['closes_at', 'Cierre de inscripción']].map(([key, label]) => <label className="field" key={key}>{label}<input name={key} type="datetime-local" required defaultValue={toLocalInput(room?.[key])} /></label>)}</div>
      <div className="form-row">{[['capacity', 'Cupo de jugadores', 50, 2, 100, 1], ['entry_price', 'Entrada S/', 0, 0, 10000, .01], ['kill_reward', 'Por kill S/', 0, 0, 10000, .01], ['booyah_reward', 'Bono Booyah S/', 0, 0, 1000000, .01]].map(([key, label, fallback, min, max, step]) => <label className="field" key={key}>{label}<input name={key} type="number" min={min} max={max} step={step} required defaultValue={room?.[key] ?? fallback} /></label>)}</div>
      <p className="hint">Una inscripción cubre una partida. El ganador recibe sus kills más Booyah. Las condiciones quedan fijas al abrir la sala.</p>
      <button className="btn btn--primary" disabled={busy}>Guardar borrador</button>
    </form>
  </Modal>
}

export default function Solo() {
  const { role } = useAuth(), admin = role === 'admin'
  const toast = useToast()
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(''), [editing, setEditing] = useState(null), [dialog, setDialog] = useState(null)
  const [view, setView] = useState('registrations'), [query, setQuery] = useState(''), [roomFilter, setRoomFilter] = useState('all')
  const [resultDrafts, setResultDrafts] = useState({})
  const [pagination, setPagination] = useState({ key: '', index: 0, size: 12 })
  useEffect(() => {
    if (!Object.keys(resultDrafts).length) return undefined
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [resultDrafts])
  const load = useCallback(async () => {
    try {
      const [rooms, registrations, results, payments, settings] = await Promise.all([allRows('solo_rooms'), allRows('solo_registrations'), allRows('solo_results', 'registration_id'), allRows('solo_payments'), supabase.from('tournament_settings').select('edition_id,solo_enabled').eq('id', 1).single()])
      if (settings.error) throw settings.error
      setData({ rooms: rooms.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)), registrations, results, payments, settings: settings.data }); setError('')
    } catch (err) { setError(`${err.message}. ${MIGRATION_MESSAGE}`) }
  }, [])
  useEffect(() => { void load() }, [load])
  const roomOptions = data?.rooms.filter((r) => roomFilter === 'all' || r.status === roomFilter) ?? []
  const room = roomOptions.find((r) => r.id === selected) || roomOptions[0]
  const act = async (action, extra = {}) => {
    if (busy) return
    setBusy(true)
    try {
      const saved = action === 'delete'
        ? await rpc('delete_empty_solo_room', { p_edition_id: data.settings.edition_id, p_room_id: extra.room_id })
        : await rpc('manage_solo', { p_action: action, p_data: { edition_id: data.settings.edition_id, room_id: room?.id, ...extra } })
      if (action === 'create') { setSelected(saved.id); setView('registrations'); setRoomFilter('all') }
      if (action === 'delete' && room?.id === extra.room_id) { setSelected(''); setQuery(''); setView('registrations') }
      toast.success(action === 'delete' ? 'Sala eliminada.' : 'Cambios guardados.'); setEditing(null); setDialog(null); await load()
    } catch (err) {
      toast.error(action === 'delete' && err.message.includes('delete_empty_solo_room')
        ? 'Para eliminar salas, aplica la migración 011 en Supabase y actualiza la página.'
        : err.message)
    } finally { setBusy(false) }
  }
  const receipt = async (path) => {
    try { const url = await signedReceiptUrl(path); window.open(url, '_blank', 'noopener,noreferrer') } catch (err) { toast.error(err.message) }
  }
  if (!data) return error ? <ErrorBox error={error} /> : <Spinner />
  const people = data.registrations.filter((p) => p.room_id === room?.id)
    .sort((a, b) => (a.slot ?? Infinity) - (b.slot ?? Infinity)
      || String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id))
  const resultById = Object.fromEntries(data.results.map((r) => [r.registration_id, r]))
  const approved = people.filter((p) => p.status === 'approved')
  const initialResults = Object.fromEntries(approved.map((p) => [p.id, { kills: resultById[p.id]?.kills ?? 0, booyah: resultById[p.id]?.booyah ?? false }]))
  const roomResults = { ...initialResults, ...resultDrafts[room?.id] }
  const resultsDirty = approved.some((p) => !resultById[p.id]
    || String(roomResults[p.id].kills) !== String(resultById[p.id].kills)
    || roomResults[p.id].booyah !== resultById[p.id].booyah)
  const changeResult = (id, patch) => {
    const next = { ...roomResults, [id]: { ...roomResults[id], ...patch } }
    if (patch.booyah) Object.keys(next).forEach((key) => { next[key] = { ...next[key], booyah: key === id } })
    setResultDrafts((drafts) => ({ ...drafts, [room.id]: next }))
  }
  const saveResults = async () => {
    if (busy || !resultsDirty) return
    const rows = approved.map((p) => ({ registration_id: p.id, kills: roomResults[p.id].kills, booyah: roomResults[p.id].booyah }))
    if (!rows.length) return
    if (rows.some((r) => String(r.kills).trim() === '' || !Number.isInteger(Number(r.kills)) || Number(r.kills) < 0 || Number(r.kills) > 1000)) {
      toast.error('Revisa las kills de todos los jugadores: deben ser enteros entre 0 y 1000.'); return
    }
    setBusy(true)
    try {
      const saved = await rpc('save_solo_results', { p_edition_id: data.settings.edition_id, p_room_id: room.id, p_results: rows.map((r) => ({ ...r, kills: Number(r.kills) })) })
      setData((current) => ({ ...current, results: [...current.results.filter((r) => r.room_id !== room.id), ...saved] }))
      setResultDrafts((drafts) => { const next = { ...drafts }; delete next[room.id]; return next })
      toast.success('Todos los resultados de la sala guardados.')
    } catch (err) {
      toast.error(err.message.includes('save_solo_results') ? 'Para guardar toda la sala, aplica la migración 012 en Supabase.' : err.message)
    } finally { setBusy(false) }
  }
  const payments = data.payments.filter((p) => people.some((a) => a.id === p.registration_id))
  const dialogPayment = dialog?.action === 'pay' ? data.payments.find((p) => p.id === dialog.extra.payment_id) : null
  const dialogRecipient = dialogPayment ? data.registrations.find((p) => p.id === dialogPayment.registration_id) : null
  const filteredPeople = people.filter((p) => `${p.slot != null ? `slot ${p.slot} #${p.slot}` : ''} ${p.nickname} ${p.full_name} ${p.whatsapp} ${p.institution}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const due = data.payments.filter((p) => !p.paid_at).reduce((sum, p) => sum + Number(p.amount), 0)
  const filteredPayments = payments.filter((payment) => filteredPeople.some((person) => person.id === payment.registration_id))
  const pagePeople = view === 'results' ? filteredPeople.filter((p) => p.status === 'approved') : filteredPeople
  const pageKey = `${room?.id}-${view}-${query}`
  const rowCount = view === 'payments' ? filteredPayments.length : pagePeople.length
  const lastPage = Math.max(0, Math.ceil(rowCount / pagination.size) - 1)
  const page = Math.min(pagination.key === pageKey ? pagination.index : 0, lastPage)
  const pageStart = page * pagination.size
  const visiblePeople = pagePeople.slice(pageStart, pageStart + pagination.size)
  const visiblePayments = filteredPayments.slice(pageStart, pageStart + pagination.size)
  const badge = (status) => <span className={`tm-status tm-status--${status}`}>{SOLO_STATUS[status]}</span>
  return <div className="tournament-admin solo-admin">
    <PageHeader eyebrow="Competición / Free Fire" title="Solo por kills" actions={<><button className="btn" disabled={busy} onClick={load}>Actualizar</button>{admin && <button className="btn btn--primary" disabled={busy} onClick={() => setEditing({})}>+ Nueva sala</button>}</>} />
    <ErrorBox error={error} />
    {data.registrations.some((p) => !Object.hasOwn(p, 'slot')) && <p className="tm-notice">Para asignar slots al aprobar jugadores, aplica la migración 013 en Supabase.</p>}
    {!data.settings.solo_enabled && <div className="tm-notice"><span className="tm-notice-dot" /><div><strong>Inscripciones Solo desactivadas</strong><p>Los resultados y pagos siguen disponibles. Activa la modalidad desde Configuración cuando quieras recibir jugadores.</p></div></div>}
    <div className="solo-summary" aria-label="Resumen de Free Fire Solo">
      <span><strong>{data.rooms.length}</strong> salas</span>
      <span><strong>{data.registrations.filter((r) => r.status === 'pending').length}</strong> por revisar</span>
      <span><strong>{data.registrations.filter((r) => r.status === 'approved').length}</strong> aprobados</span>
      <span><strong>{money(due)}</strong> por pagar</span>
    </div>
    <div className="solo-workspace">
      <aside className="solo-room-list" aria-label="Tus salas">
        <div className="tm-section-head"><h2>Tus salas</h2><span className="tm-count">{data.rooms.length}</span></div>
        <label className="field"><span>Estado</span><select disabled={busy} value={roomFilter} onChange={(e) => { setRoomFilter(e.target.value); setQuery('') }}><option value="all">Todas las salas</option>{['draft', 'open', 'closed', 'playing', 'finished', 'cancelled'].map((status) => <option key={status} value={status}>{SOLO_STATUS[status]}</option>)}</select></label>
        {roomOptions.map((r) => {
          const count = data.registrations.filter((p) => p.room_id === r.id && ['pending', 'approved'].includes(p.status)).length
          const canDelete = admin && ['draft', 'cancelled'].includes(r.status)
            && !data.registrations.some((p) => p.room_id === r.id)
            && !data.results.some((result) => result.room_id === r.id)
          return <div className="tm-room-item" key={r.id}>
            <button type="button" disabled={busy} className={`tm-room-option ${canDelete ? 'tm-room-option--deletable' : ''} ${r.id === room?.id ? 'tm-room-option--active' : ''}`} aria-pressed={r.id === room?.id} onClick={() => { setSelected(r.id); setQuery('') }}><span className="tm-room-option__top"><strong>{r.name}</strong>{badge(r.status)}</span><small>{count ? `${count} jugadores` : 'Sin jugadores'}</small></button>
            {canDelete && <button type="button" className="tm-room-delete" disabled={busy} aria-label={`Eliminar sala ${r.name}`} title="Eliminar sala" onClick={() => setDialog({ action: 'delete', title: 'Eliminar sala', text: `Eliminar sala: ${r.name}. Esta sala no tiene inscripciones. La eliminacion es permanente.`, extra: { room_id: r.id } })}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg></button>}
          </div>
        })}
        {!roomOptions.length && <p className="hint">{data.rooms.length ? 'Sin salas con este estado.' : 'Crea tu primera sala para empezar.'}</p>}
      </aside>
      <div className="tm-room-detail">
        {room ? <>
          <section className="card tm-room-overview solo-overview">
            <div className="solo-room-heading"><h2>{room.name}</h2>{badge(room.status)}<span className="solo-occupancy">{people.filter((p) => ['pending', 'approved'].includes(p.status)).length} / {room.capacity} participantes</span><span className="solo-rates">{money(room.kill_reward)} / kill · + {money(room.booyah_reward)} Booyah</span></div>
            <details className="solo-details" key={room.id}><summary>Detalles de la sala</summary><div className="solo-detail-values"><span>Partida <strong>{dateTime(room.scheduled_at)}</strong></span><span>Cierre <strong>{dateTime(room.closes_at)}</strong></span><span>Entrada <strong>{money(room.entry_price)}</strong></span><span>Por kill <strong>{money(room.kill_reward)}</strong></span><span>Bono Booyah <strong>{money(room.booyah_reward)}</strong></span></div>{room.cancellation_reason && <p className="hint">Motivo de cancelación: {room.cancellation_reason}</p>}</details>
            <div className="tm-actions">
              {admin && room.status === 'draft' && <><button className="btn" disabled={busy} onClick={() => setEditing(room)}>Editar sala</button><button className="btn btn--primary" disabled={busy} onClick={() => setDialog({ action: 'open', title: 'Abrir inscripciones', text: 'El precio, el cupo y los premios quedarán fijados para esta sala.' })}>Abrir inscripciones</button></>}
              {room.status === 'open' && <button className="btn" disabled={busy} onClick={() => act('close')}>Cerrar inscripciones</button>}
              {room.status === 'closed' && <button className="btn btn--primary" disabled={busy} onClick={() => setDialog({ action: 'start', title: 'Iniciar partida' })}>Iniciar partida</button>}
              {room.status === 'playing' && <button className="btn btn--primary" disabled={busy} onClick={() => { if (resultsDirty) { setView('results'); toast.error('Guarda todos los resultados antes de finalizar.'); return } setDialog({ action: 'finish', title: 'Finalizar y fijar ganancias', text: 'Los resultados quedarán bloqueados y se generarán las ganancias pendientes.' }) }}>Finalizar partida</button>}
              {!['finished', 'cancelled'].includes(room.status) && <button className="btn btn--ghost tm-cancel" disabled={busy} onClick={() => setDialog({ action: 'cancel', title: 'Cancelar sala', reason: true, text: 'Se devolverán las inscripciones aprobadas. Esta sala ya no podrá jugarse.' })}>Cancelar sala</button>}
            </div>
          </section>
          <section className="card tm-participants"><div className="tm-tabs" role="tablist" aria-label="Gestión de la sala">{[['registrations', 'Inscripciones', people.length], ['results', 'Resultados', people.filter((p) => p.status === 'approved').length], ['payments', 'Pagos', payments.filter((p) => !p.paid_at).length]].map(([key, label, count]) => <button type="button" role="tab" aria-selected={view === key} className={view === key ? 'tm-tab tm-tab--active' : 'tm-tab'} key={key} onClick={() => setView(key)}>{label}<span>{count}</span></button>)}</div>
            <div className="solo-table-tools"><label className="field tm-search"><span className="sr-only">Buscar participante</span><input aria-label="Buscar participante" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nickname, nombre o número…" /></label>
              {view === 'results' && room.status === 'playing' && <div className="solo-save-actions"><span role="status">{resultsDirty ? 'Cambios sin guardar' : 'Resultados guardados'}</span><button type="button" className="btn btn--primary" disabled={busy || !resultsDirty} onClick={saveResults}>{busy ? 'Guardando...' : 'Guardar todos los resultados'}</button></div>}
            </div>
            {view === 'registrations' && <><div className="table-wrap"><table><thead><tr><th>Slot</th><th>Jugador</th><th>Contacto e institución</th><th>Inscripción</th><th>Revisión</th></tr></thead><tbody>{visiblePeople.map((p) => <tr key={p.id}><td><span className="solo-slot">{p.slot != null ? `#${p.slot}` : "\u2014"}</span></td><td><div className="tm-player"><span className="tm-player-avatar">{p.nickname.slice(0, 2).toUpperCase()}</span><div><strong>{p.nickname}</strong><small>{p.full_name}</small></div></div></td><td><strong>{p.whatsapp}</strong><small className="tm-cell-note">{p.institution || 'Sin institución'}{p.professional_school ? ` · ${p.professional_school}` : ''}</small>{p.game_player_id && <small className="tm-cell-note">ID anterior: {p.game_player_id}</small>}</td><td>{badge(p.status)}<small className="tm-cell-note">{money(p.amount_due)}</small>{p.reason && <small className="tm-cell-note">{p.reason}</small>}</td><td><button type="button" className="btn btn--sm" onClick={() => receipt(p.receipt_path)}>Ver comprobante ↗</button>{p.status === 'pending' && ['open', 'closed'].includes(room.status) && <div className="tm-row-actions"><button className="btn btn--sm btn--primary" disabled={busy} onClick={() => act('review', { registration_id: p.id, status: 'approved' })}>Aprobar</button>{[['rejected', 'Rechazar'], ['refund_pending', 'Devolver']].map(([status, label]) => <button key={status} className="btn btn--sm" disabled={busy} onClick={() => setDialog({ action: 'review', title: label, reason: true, extra: { registration_id: p.id, status } })}>{label}</button>)}</div>}</td></tr>)}</tbody></table></div>{visiblePeople.length === 0 && <div className="tm-empty"><h3>{people.length ? 'No encontramos ese jugador' : 'Aún no hay inscripciones'}</h3><p>{people.length ? 'Prueba otro nombre o nickname.' : 'Las solicitudes aparecerán aquí cuando los jugadores se inscriban.'}</p></div>}</>}
            {view === 'results' && <SoloResults room={room} people={visiblePeople} results={room.status === 'playing' ? roomResults : resultById} busy={busy} onChange={changeResult} />}
            {view === 'payments' && <SoloPayments payments={visiblePayments} totalDue={payments.filter((p) => !p.paid_at).reduce((sum, p) => sum + Number(p.amount), 0)} hasPayments={payments.length > 0} people={people} admin={admin} busy={busy} onPay={(payment) => setDialog({ action: 'pay', title: 'Registrar pago realizado', reference: true, extra: { payment_id: payment.id, room_id: room.id } })} />}
            {rowCount > 0 && <div className="solo-pagination"><span>{pageStart + 1}–{Math.min(pageStart + pagination.size, rowCount)} de {rowCount} {view === 'payments' ? 'pagos' : 'participantes'}</span><div><label>Por página <select aria-label="Registros por página" value={pagination.size} onChange={(e) => setPagination({ key: pageKey, index: 0, size: Number(e.target.value) })}>{[12, 24, 48, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><button type="button" className="btn btn--sm" disabled={page === 0} onClick={() => setPagination({ ...pagination, key: pageKey, index: page - 1 })}>Anterior</button><button type="button" className="btn btn--sm" disabled={page >= lastPage} onClick={() => setPagination({ ...pagination, key: pageKey, index: page + 1 })}>Siguiente</button></div></div>}
          </section>
        </> : <section className="card tm-empty tm-room-placeholder"><span className="tm-empty-mark">FF</span><h2>{data.rooms.length ? 'Sin salas con este estado' : 'Prepara tu primera sala Solo'}</h2><p>Una entrada por jugador. Ganancias por kills y un bono para el Booyah.</p></section>}
      </div>
    </div>
    {editing && <RoomForm room={editing.id ? editing : null} busy={busy} onClose={() => !busy && setEditing(null)} onSave={(values) => act(editing.id ? 'edit' : 'create', { ...values, ...(editing.id ? { room_id: editing.id } : {}) })} />}
    {dialog && <Modal title={dialog.title} onClose={() => !busy && setDialog(null)}><form onSubmit={(e) => { e.preventDefault(); act(dialog.action, { ...dialog.extra, ...Object.fromEntries(new FormData(e.currentTarget)) }) }}><p>{dialog.text || 'Confirma la operación para esta sala.'}</p>{dialogPayment && <div className="tm-payment-confirm"><PaymentRecipient person={dialogRecipient} /><p>Importe: <strong>{money(dialogPayment.amount)}</strong></p><p className="hint">Confirma el destinatario en Yape. Registra este pago solo cuando hayas realizado la transferencia.</p></div>}{dialog.reason && <label className="field">Motivo<input name="reason" required minLength={3} maxLength={500} /></label>}{dialog.reference && <label className="field">Referencia (opcional)<input name="reference" maxLength={300} /></label>}<div className="tm-actions">{dialog.action === 'delete' && <button type="button" className="btn" disabled={busy} onClick={() => setDialog(null)}>Volver</button>}<button className={`btn ${dialog.action === 'delete' ? 'tm-delete-confirm' : 'btn--primary'}`} disabled={busy}>{dialog.action === 'delete' ? (busy ? 'Eliminando…' : 'Eliminar sala') : 'Confirmar'}</button></div></form></Modal>}
  </div>
}
