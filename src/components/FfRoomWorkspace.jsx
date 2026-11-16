import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Spinner, Modal } from './ui'
import { FF_ROOM_KINDS } from '../lib/ffRooms'
import { rpc, SOLO_STATUS } from '../lib/tournamentModules'
import { dateTime, money } from '../lib/format'
import FfRoomForm from './FfRoomForm'
import SoloScheduleForm from './SoloScheduleForm'
import FfRoomParticipantDetail from './FfRoomParticipantDetail'
import FfRoomResults from './FfRoomResults'
import FfRoomPayments from './FfRoomPayments'
import FfRoomAccess from './FfRoomAccess'
import { ffAiPrompt, ffContactPhones } from '../lib/ffRoomImport'
import { downloadSoloPhones } from '../lib/soloExports'
import { ffPreparedWhatsAppLink } from '../lib/ffRoomWhatsApp'
import { FfRoomCard, FfRoomTabs } from './FfRoomNavigation'

async function scopedRows(table, filters, order = 'id') {
  const rows = []
  for (let start = 0; ; start += 500) {
    let request = supabase.from(table).select('*').match(filters).order(order)
    if (order === 'place') request = request.order('room_id')
    const result = await request.range(start, start + 499)
    if (result.error) throw new Error(result.error.message)
    rows.push(...result.data)
    if (result.data.length < 500) return rows
  }
}

function badge(room) {
  const status = room.status === 'open' && room.is_paused ? 'paused' : room.status
  return <span className={`tm-status tm-status--${status}`}>{SOLO_STATUS[status]}</span>
}

export default function FfRoomWorkspace({ kind, settings, refreshKey, focusRoomId, onCreate, active = true }) {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const config = FF_ROOM_KINDS[kind]
  const isDuo = config.participation === 'duo'
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(focusRoomId || '')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [details, setDetails] = useState(false)
  const [personId, setPersonId] = useState('')
  const [dialog, setDialog] = useState(null)
  const [confirmation, setConfirmation] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [view, setView] = useState('registrations')
  const [resultsDirty, setResultsDirty] = useState(false)
  const [accessEditingRoom, setAccessEditingRoom] = useState('')
  const [sendingId, setSendingId] = useState('')
  const requestVersion = useRef(0)
  const load = useCallback(async (focusId) => {
    const request = ++requestVersion.current
    try {
      const roomFilters = { edition_id: settings.edition_id }
      if (isDuo) roomFilters.mode = config.mode
      const [rooms, prizes, registrations, results, payments, access] = await Promise.all([
        scopedRows(config.table, roomFilters),
        scopedRows(config.prizes, { edition_id: settings.edition_id }, 'place'),
        scopedRows('ff_room_registrations', { edition_id: settings.edition_id, room_kind: kind }),
        scopedRows('ff_room_results', { edition_id: settings.edition_id, room_kind: kind }),
        scopedRows('ff_room_payments', { edition_id: settings.edition_id, room_kind: kind }),
        scopedRows('ff_room_access', { edition_id: settings.edition_id, room_kind: kind }, 'room_id'),
      ])
      if (request !== requestVersion.current) return
      setData((current) => ({ rooms: rooms.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)), prizes, registrations: registrations.map((row) => {
        const previous = current?.registrations.find((p) => p.id === row.id)
        return { ...row, confirmation_click_count: Math.max(row.confirmation_click_count ?? 0, previous?.confirmation_click_count ?? 0), access_click_count: Math.max(row.access_click_count ?? 0, previous?.access_click_count ?? 0) }
      }), results, payments, access }))
      if (typeof focusId === 'string' && focusId) { setSelected(focusId); setFilter('all'); setQuery('') }
      setError('')
    } catch (problem) { if (request === requestVersion.current) setError(/does not exist|schema cache|Could not find/.test(problem.message) ? 'Aplica las migraciones 029 a 033 para gestionar esta modalidad.' : problem.message) }
  }, [settings.edition_id, config.table, config.prizes, config.mode, isDuo, kind])
  useEffect(() => { if (active) void load() }, [load, refreshKey, active])
  useEffect(() => { if (focusRoomId) void load(focusRoomId) }, [load, focusRoomId])
  useEffect(() => {
    if (!active) return
    const refresh = () => { if (!document.hidden) void load() }
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [load, active])
  const run = async (operation) => {
    if (busy) return 'Hay otra operación en curso.'
    setBusy(true)
    try {
      await operation()
      await load()
      toast.success('Cambios guardados.')
      return null
    } catch (problem) { return problem.message }
    finally { setBusy(false) }
  }
  const roomAction = (action, extra = {}) => rpc('manage_ff_room', { p_action: action, p_data: { edition_id: settings.edition_id, room_kind: kind, room_id: room?.id, ...extra } })
  const openDialog = (action, title, text, needsName = false, extra = {}, target = room) => { setConfirmation(''); setDialogError(''); setDialog({ action, title, text, needsName, extra, roomId: target.id, roomName: target.name }) }
  const review = async (person, status, reason) => run(() => rpc('review_ff_room_registration', { p_edition_id: settings.edition_id, p_kind: kind, p_room_id: person.room_id, p_registration_id: person.id, p_status: status, p_reason: reason }))
  const removePerson = async (person, name) => {
    const problem = await run(() => rpc('delete_ff_room_registration', { p_edition_id: settings.edition_id, p_kind: kind, p_room_id: person.room_id, p_registration_id: person.id, p_confirmation: name }))
    if (!problem) setPersonId('')
    return problem
  }
  const sendWhatsApp = async (person, action) => {
    if (sendingId || busy) return
    const popup = window.open('about:blank', '_blank')
    if (!popup) { toast.error('Permite ventanas emergentes para abrir WhatsApp.'); return }
    popup.opener = null
    setSendingId(person.id)
    try {
      const expected = { edition_id: settings.edition_id, room_kind: kind, room_id: person.room_id, registration_id: person.id, action }
      const saved = await rpc('prepare_ff_room_whatsapp', { p_edition_id: expected.edition_id, p_kind: kind, p_room_id: person.room_id, p_registration_id: person.id, p_action: action })
      const href = ffPreparedWhatsAppLink(saved, expected)
      if (!href) throw new Error('No se pudo preparar un mensaje válido. Revisa teléfono, sala y slot.')
      setData((current) => ({ ...current, registrations: current.registrations.map((p) => p.id === person.id ? { ...p, confirmation_click_count: Math.max(p.confirmation_click_count, saved.confirmation_click_count), access_click_count: Math.max(p.access_click_count, saved.access_click_count) } : p) }))
      popup.location.replace(href)
    } catch (problem) { popup.close(); toast.error(problem.message) }
    finally { setSendingId('') }
  }
  if (!data) return <><ErrorBox error={error} />{!error && <Spinner />}</>
  const rooms = data.rooms.filter((room) => filter === 'all' || (filter === 'paused' ? room.status === 'open' && room.is_paused : room.status === filter && !(filter === 'open' && room.is_paused)))
  const room = rooms.find((row) => row.id === selected) || rooms[0]
  const people = data.registrations.filter((person) => person.room_id === room?.id)
  const term = query.trim().toLowerCase()
  const visible = people.filter((person) => [person.nickname_1, person.nickname_2, person.full_name, person.whatsapp, person.prize_yape_phone].some((value) => value?.toLowerCase().includes(term)))
    .sort((a, b) => (a.slot ?? 101) - (b.slot ?? 101) || new Date(a.created_at) - new Date(b.created_at))
  const prizes = data.prizes.filter((prize) => prize.room_id === room?.id).sort((a, b) => a.place - b.place)
  const person = people.find((row) => row.id === personId)
  const results = data.results.filter((row) => row.room_id === room?.id)
  const payments = data.payments.filter((row) => row.room_id === room?.id)
  const visibleIds = new Set(visible.map((row) => row.id))
  const access = data.access.find((row) => row.room_id === room?.id)
  const hasAccess = !!access && accessEditingRoom !== room?.id
  const count = (id) => data.registrations.filter((row) => row.room_id === id && ['pending', 'approved'].includes(row.status)).length
  const canDeleteEmptyRoom = (target) => isAdmin && !data.registrations.some((p) => p.room_id === target.id)
    && (['draft', 'closed', 'cancelled'].includes(target.status) || (target.status === 'open' && target.is_paused))
  const tabs = [['registrations', 'Inscripciones', people.length], ['results', 'Resultados', people.filter((p) => p.status === 'approved').length], ['payments', 'Pagos', payments.filter((p) => !p.paid_at && Number(p.amount) > 0).length]]
  const exportActions = <>
    <button className="btn btn--sm" disabled={busy || !people.some((p) => p.status === 'approved')} title="WhatsApp de contacto de toda la nómina aprobada; columna phone" onClick={() => downloadSoloPhones(room, ffContactPhones(people))}>Exportar Excel</button>
    <button className="btn btn--sm" disabled={busy || !people.some((p) => p.status === 'approved')} onClick={async () => { try { await navigator.clipboard.writeText(ffAiPrompt(kind, room, people, prizes)); toast.success('Prompt de esta modalidad y nómina completa copiados.') } catch (problem) { toast.error(problem.message || 'No se pudo copiar el prompt.') } }}>Copiar para IA</button>
  </>
  return <div className="tournament-admin solo-admin">
    <ErrorBox error={error} />
    <div className="solo-summary"><span><strong>{data.rooms.length}</strong> salas · {config.label}</span><span><strong>{data.registrations.filter((row) => row.status === 'pending').length}</strong> por revisar</span><span><strong>{data.registrations.filter((row) => row.status === 'approved').length}</strong> {isDuo ? 'dúos aprobados' : 'aprobados'}</span></div>
    <div className="solo-workspace">
      <aside className="solo-room-list" aria-label="Tus salas">
        <div className="tm-section-head"><h2>Tus salas</h2><span className="tm-count">{data.rooms.length}</span></div>
        <label className="field">Estado<select value={filter} disabled={busy} onChange={(e) => setFilter(e.target.value)}><option value="all">Todas las salas</option>{['draft', 'open', 'paused', 'closed', 'playing', 'finished', 'cancelled'].map((status) => <option key={status} value={status}>{SOLO_STATUS[status]}</option>)}</select></label>
        {rooms.map((row) => <FfRoomCard key={row.id} room={row} isDuo={isDuo} selected={row.id === room?.id} status={badge(row)} participants={count(row.id)} busy={busy}
          onSelect={() => { setSelected(row.id); setQuery(''); setPersonId('') }}
          onDelete={canDeleteEmptyRoom(row) ? () => openDialog('delete', 'Eliminar sala permanentemente', 'Se eliminará esta sala vacía y su configuración de premios.', true, {}, row) : undefined} />)}
        {!rooms.length && <p className="hint">Sin salas con este filtro.</p>}
      </aside>
      <div className="tm-room-detail">{room ? <>
        <section className="card solo-overview">
          <div className="solo-room-heading"><h2>{room.name}</h2>{badge(room)}<span className="solo-occupancy">{count(room.id)} / {room.capacity} {isDuo ? 'dúos' : 'jugadores'}</span></div>
          <div className="ff-room-prizes">{config.mode === 'top' ? prizes.map((prize) => <span key={prize.place}>{prize.place}.º <strong>{money(prize.amount)}</strong></span>) : <span>{money(room.kill_reward)} por kill del dúo · {money(room.booyah_reward)} Booyah</span>}</div>
          <details className="solo-details"><summary>Detalles de la sala</summary><div className="solo-detail-values"><span>Partida <strong>{dateTime(room.scheduled_at)}</strong></span><span>Cierre <strong>{dateTime(room.closes_at)}</strong></span><span>Entrada {isDuo ? 'por dúo' : 'individual'} <strong>{money(room.entry_price)}</strong></span></div></details>
          <div className="tm-actions">
            {isAdmin && room.status === 'draft' && <>
              <button type="button" className="btn" disabled={busy} onClick={() => setEditing(true)}>Editar sala</button>
              <button type="button" className="btn" disabled={busy} onClick={() => openDialog('announce', room.is_announced ? 'Ocultar anuncio' : 'Anunciar sala', 'Guarda la visibilidad de esta sala para la web pública.', false, { is_announced: !room.is_announced })}>{room.is_announced ? 'Ocultar anuncio' : 'Anunciar sala'}</button>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => openDialog('open', 'Abrir inscripciones', 'El cupo, la entrada y los premios quedarán fijados para esta sala.')}>Abrir inscripciones</button>
            </>}
            {isAdmin && room.status === 'open' && <button type="button" className="btn" disabled={busy} onClick={() => openDialog('pause', room.is_paused ? 'Abrir inscripciones' : 'Pausar inscripciones', 'Se conservarán los participantes y sus slots.', false, { is_paused: !room.is_paused })}>{room.is_paused ? 'Abrir inscripciones' : 'Pausar inscripciones'}</button>}
            {room.status === 'open' && !room.is_paused && <button type="button" className="btn" disabled={busy} onClick={() => openDialog('close', 'Cerrar inscripciones', 'La sala dejará de recibir inscripciones. Podrás revisar las solicitudes pendientes.')}>Cerrar inscripciones</button>}
            {isAdmin && ['open', 'closed'].includes(room.status) && <button type="button" className="btn" disabled={busy} onClick={() => setDetails(true)}>Editar sala</button>}
            {room.status === 'closed' && <button className="btn btn--primary" disabled={busy} onClick={() => openDialog('start', 'Iniciar partida', 'Comprueba que todos los participantes estén revisados y ubicados en sus slots.')}>Iniciar partida</button>}
            {isAdmin && room.status === 'playing' && <button className="btn btn--primary" disabled={busy || resultsDirty} onClick={() => openDialog('finish', 'Finalizar partida', 'Los resultados quedarán fijados y se generarán los pagos. Guarda antes todos los resultados.')}>Finalizar partida</button>}
            {isAdmin && people.length > 0 && ['open', 'closed', 'playing'].includes(room.status) && <button className="btn btn--ghost tm-cancel" disabled={busy} onClick={() => openDialog('cancel', 'Cancelar sala', 'Se conservarán las inscripciones y se generarán devoluciones para las aprobadas. Esta acción no transfiere dinero.', true)}>Cancelar sala</button>}
            {isAdmin && !people.length && ['draft', 'open', 'closed', 'cancelled'].includes(room.status) && <>
              {room.status !== 'cancelled' && <button type="button" className="btn btn--ghost tm-cancel" disabled={busy} onClick={() => openDialog('cancel', 'Cancelar sala vacía', 'La sala quedará cancelada.', true)}>Cancelar sala</button>}
            </>}
          </div>
        </section>
        <section className="card tm-participants">
          <FfRoomTabs tabs={tabs} view={view} onChange={setView} />
          <div className="solo-table-tools"><label className="field tm-search"><span className="sr-only">Buscar participante</span><input aria-label="Buscar participante" type="search" value={query} placeholder="Buscar nickname, nombre o número…" onChange={(e) => setQuery(e.target.value)} /></label>
            <div className="solo-export-actions">{exportActions}</div>
          </div>
          <div hidden={view !== 'registrations'}>
          {['open', 'closed', 'playing'].includes(room.status) && <FfRoomAccess key={room.id} access={access} busy={busy || !!sendingId} onEditing={(editing) => setAccessEditingRoom(editing ? room.id : '')} onSave={(values) => run(() => rpc('save_ff_room_access', { p_edition_id: settings.edition_id, p_kind: kind, p_room_id: room.id, p_game_room_id: values.game_room_id.trim(), p_room_password: values.room_password.trim() }))} />}
          <div className="table-wrap ff-room-scroll"><table><thead><tr><th>Slot</th><th>{isDuo ? 'Jugadores del dúo' : 'Jugador'}</th><th>WhatsApp de contacto</th><th>Inscripción</th><th>Revisión</th></tr></thead><tbody>
            {visible.map((row) => <tr key={row.id}>
              <td><strong className="solo-slot">{row.slot ? `#${row.slot}` : '—'}</strong></td>
              <td><strong>{row.nickname_1}</strong>{row.nickname_2 && <strong className="ff-pair-nickname">{row.nickname_2}</strong>}<small className="tm-cell-note">{row.full_name}</small></td>
              <td><div className={isDuo ? 'solo-contact-access' : undefined}><span className="ff-room-contact">{row.whatsapp}</span>{row.status === 'approved' && ['open', 'closed', 'playing'].includes(room.status) && <span className="row-actions"><button className="btn btn--sm solo-send-access" disabled={busy || !!sendingId} onClick={() => sendWhatsApp(row, hasAccess ? 'access' : 'confirmation')}>{hasAccess ? 'Enviar acceso' : 'Confirmar inscripción'}</button><span className="solo-confirmation-count" title={`Clics en ${hasAccess ? 'Enviar acceso' : 'Confirmar inscripción'}`}>{hasAccess ? row.access_click_count : row.confirmation_click_count}</span></span>}</div><small className="tm-cell-note">Yape para premios · {row.prize_yape_phone}</small></td>
              <td><span className={`tm-status tm-status--${row.status}`}>{SOLO_STATUS[row.status]}</span><small className="tm-cell-note">{money(row.amount_due)}</small></td>
              <td><button type="button" className="btn btn--sm" disabled={busy} onClick={() => setPersonId(row.id)}>Ver detalle</button>{row.status === 'pending' && ['open', 'closed'].includes(room.status) && <div className="row-actions"><button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={async () => { const problem = await review(row, 'approved', ''); if (problem) toast.error(problem) }}>Aprobar</button></div>}</td>
            </tr>)}
          </tbody></table></div>
          {!visible.length && <div className="tm-empty"><h3>{people.length ? 'Sin coincidencias' : 'Aún no hay inscripciones'}</h3><p>{isDuo ? 'Cada solicitud incluirá los dos nicknames y recibirá un slot al aprobarla.' : 'Los jugadores recibirán su slot al aprobar la inscripción.'}</p></div>}
          {!!visible.length && <p className="hint">{visible.length} {isDuo ? 'dúos' : 'jugadores'}</p>}
          </div>
          <div hidden={view !== 'results'}><FfRoomResults kind={kind} room={room} people={people} visibleIds={visibleIds} results={results} prizes={prizes} busy={busy} onDirty={setResultsDirty} onSave={(payload, baseline) => run(() => rpc('save_ff_room_results', { p_edition_id: settings.edition_id, p_kind: kind, p_room_id: room.id, p_results: payload, p_expected_updated_at: baseline ?? null, p_expect_empty: baseline == null }))} /></div>
          <div hidden={view !== 'payments'}><FfRoomPayments kind={kind} room={room} people={people} payments={payments} results={results} visibleIds={visibleIds} admin={isAdmin} busy={busy} onPay={(payment, phone, reference) => run(() => rpc('pay_ff_room_payment', { p_edition_id: settings.edition_id, p_payment_id: payment.id, p_amount: Number(payment.amount), p_phone: phone, p_reference: reference }))} /></div>
        </section>
      </> : <section className="card tm-empty"><h2>{config.label}</h2><p>Crea una sala para configurar la partida y sus premios.</p>{isAdmin && <button type="button" className="btn btn--primary" onClick={onCreate}>+ Nueva sala</button>}</section>}</div>
    </div>
    {editing && room && <FfRoomForm kind={kind} room={room} prizes={prizes} busy={busy} onClose={() => !busy && setEditing(false)} onSave={async (values) => {
      const problem = await run(() => rpc(config.draftRpc, { p_action: 'edit', p_data: { ...values, edition_id: settings.edition_id, room_id: room.id } }))
      if (!problem) setEditing(false)
      return problem
    }} />}
    {details && room && <SoloScheduleForm room={room} deadline={settings.registration_deadline} busy={busy} onClose={() => !busy && setDetails(false)} onSave={async (values) => {
      const problem = await run(() => roomAction('details', values))
      if (!problem) setDetails(false)
      return problem
    }} />}
    {person && room && <FfRoomParticipantDetail key={person.id} person={person} room={room} admin={isAdmin} busy={busy} onClose={() => !busy && setPersonId('')} onReview={review} onDelete={removePerson} onPhones={(whatsapp, yape) => run(() => rpc('update_ff_room_phones', { p_edition_id: settings.edition_id, p_registration_id: person.id, p_whatsapp: whatsapp, p_prize_yape_phone: yape }))} />}
    {dialog && <Modal title={dialog.title} onClose={() => !busy && setDialog(null)}><form onSubmit={async (event) => {
      event.preventDefault()
      const problem = await run(() => roomAction(dialog.action, { ...dialog.extra, room_id: dialog.roomId, confirmation }))
      if (problem) setDialogError(problem)
      else setDialog(null)
    }}>
      <p>{dialog.text}</p>
      {dialog.needsName && <label className="field">Escribe el nombre exacto · {dialog.roomName}<input required value={confirmation} disabled={busy} onChange={(e) => setConfirmation(e.target.value)} /></label>}
      <ErrorBox error={dialogError} />
      <button className={`btn ${dialog.action === 'delete' ? 'tm-delete-confirm' : 'btn--primary'}`} disabled={busy || (dialog.needsName && confirmation !== dialog.roomName)}>{dialog.action === 'delete' ? 'Eliminar sala' : 'Confirmar'}</button>
    </form></Modal>}
  </div>
}
