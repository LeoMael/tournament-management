import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Modal, PageHeader, Spinner } from '../components/ui'
import { money, dateTime, toLocalInput } from '../lib/format'
import { signedReceiptUrl } from '../lib/storage'
import { allRows, rpc, SOLO_STATUS, MIGRATION_MESSAGE } from '../lib/tournamentModules'
import '../tournament-modules.css'

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

function ResultForm({ person, result, busy, save }) {
  return <form style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save({ registration_id: person.id, kills: Number(f.get('kills')), booyah: f.get('booyah') === 'on' }) }}>
    <input aria-label={`Kills de ${person.nickname}`} type="number" name="kills" min="0" max="1000" required defaultValue={result?.kills ?? 0} style={{ width: 80 }} />
    <label className="check"><input type="checkbox" name="booyah" defaultChecked={result?.booyah} />Booyah</label>
    <button className="btn btn--sm" disabled={busy}>Guardar resultado</button>
  </form>
}

export default function Solo() {
  const { role } = useAuth(), admin = role === 'admin'
  const toast = useToast()
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(''), [editing, setEditing] = useState(null), [dialog, setDialog] = useState(null)
  const [view, setView] = useState('registrations'), [query, setQuery] = useState(''), [roomFilter, setRoomFilter] = useState('all')
  const load = useCallback(async () => {
    try {
      const [rooms, registrations, results, payments, settings] = await Promise.all([allRows('solo_rooms'), allRows('solo_registrations'), allRows('solo_results', 'registration_id'), allRows('solo_payments'), supabase.from('tournament_settings').select('edition_id,solo_enabled').eq('id', 1).single()])
      if (settings.error) throw settings.error
      setData({ rooms: rooms.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)), registrations, results, payments, settings: settings.data }); setError('')
    } catch (err) { setError(`${err.message}. ${MIGRATION_MESSAGE}`) }
  }, [])
  useEffect(() => { void load() }, [load])
  const room = data?.rooms.find((r) => r.id === selected) || data?.rooms[0]
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
  const resultById = Object.fromEntries(data.results.map((r) => [r.registration_id, r]))
  const payments = data.payments.filter((p) => people.some((a) => a.id === p.registration_id))
  const visiblePeople = people.filter((p) => `${p.nickname} ${p.full_name} ${p.whatsapp} ${p.institution}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const due = data.payments.filter((p) => !p.paid_at).reduce((sum, p) => sum + Number(p.amount), 0)
  const shownRooms = data.rooms.filter((r) => roomFilter === 'all' || r.status === roomFilter)
  const badge = (status) => <span className={`tm-status tm-status--${status}`}>{SOLO_STATUS[status]}</span>
  return <div className="tournament-admin">
    <PageHeader eyebrow="Competición / Free Fire" title="Solo por kills" subtitle="Gestiona tus salas, confirma jugadores y liquida los premios de cada partida." actions={<><button className="btn" disabled={busy} onClick={load}>Actualizar</button>{admin && <button className="btn btn--primary" disabled={busy} onClick={() => setEditing({})}>+ Nueva sala</button>}</>} />
    <ErrorBox error={error} />
    {!data.settings.solo_enabled && <div className="tm-notice"><span className="tm-notice-dot" /><div><strong>Inscripciones Solo desactivadas</strong><p>Los resultados y pagos siguen disponibles. Activa la modalidad desde Configuración cuando quieras recibir jugadores.</p></div></div>}
    <div className="tm-stats">{[
      ['Salas de esta edición', data.rooms.length, `${data.rooms.filter((r) => ['open', 'closed', 'playing'].includes(r.status)).length} en preparación o en juego`],
      ['Por revisar', data.registrations.filter((r) => r.status === 'pending').length, 'Comprobantes pendientes'],
      ['Jugadores aprobados', data.registrations.filter((r) => r.status === 'approved').length, 'Participaciones confirmadas'],
      ['Pendiente de pago', money(due), 'Ganancias y devoluciones'],
    ].map(([label, value, note]) => <div className="tm-stat" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
    <div className="tm-workspace">
      <aside className="card tm-room-list"><div className="tm-section-head"><h2>Tus salas</h2><span className="tm-count">{data.rooms.length}</span></div><label className="field"><span>Estado de la sala</span><select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}><option value="all">Todas las salas</option>{['draft', 'open', 'closed', 'playing', 'finished', 'cancelled'].map((status) => <option key={status} value={status}>{SOLO_STATUS[status]}</option>)}</select></label>
        {shownRooms.map((r) => {
          const canDelete = admin && ['draft', 'cancelled'].includes(r.status)
            && !data.registrations.some((p) => p.room_id === r.id)
            && !data.results.some((result) => result.room_id === r.id)
          return <div className="tm-room-item" key={r.id}>
            <button type="button" className={`tm-room-option ${canDelete ? 'tm-room-option--deletable' : ''} ${r.id === room?.id ? 'tm-room-option--active' : ''}`} aria-pressed={r.id === room?.id} onClick={() => { setSelected(r.id); setQuery(''); setView('registrations') }}><span className="tm-room-option__top"><strong>{r.name}</strong>{!canDelete && <span aria-hidden="true">↗</span>}</span>{badge(r.status)}<small>{dateTime(r.scheduled_at)}</small><span className="tm-room-option__foot"><span>{money(r.entry_price)} entrada</span><span>{data.registrations.filter((p) => p.room_id === r.id && ['pending', 'approved'].includes(p.status)).length}/{r.capacity} cupos</span></span></button>
            {canDelete && <button type="button" className="tm-room-delete" disabled={busy} aria-label={`Eliminar sala ${r.name}`} title="Eliminar sala vacía" onClick={() => setDialog({ action: 'delete', title: 'Eliminar sala', text: `¿Eliminar «${r.name}»? Esta sala está vacía. La eliminación es permanente.`, extra: { room_id: r.id } })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
            </button>}
          </div>
        })}
        {shownRooms.length === 0 && <div className="tm-empty"><span className="tm-empty-mark">FF</span><h3>{data.rooms.length ? 'Sin salas con este estado' : 'Tu próxima partida empieza aquí'}</h3><p>{data.rooms.length ? 'Prueba otro filtro para ver tus salas.' : 'Crea una sala y define el precio, las kills y el bono Booyah.'}</p>{admin && !data.rooms.length && <button className="btn btn--primary" onClick={() => setEditing({})}>Crear primera sala</button>}</div>}
      </aside>
      <div className="tm-room-detail">
        {room ? <>
          <section className="card tm-room-overview"><div className="tm-section-head"><div><span className="eyebrow">FREE FIRE / UNA PARTIDA</span><h2>{room.name}</h2></div>{badge(room.status)}</div><div className="tm-room-schedule"><span>Partida <strong>{dateTime(room.scheduled_at)}</strong></span><span>Cierre <strong>{dateTime(room.closes_at)}</strong></span></div><div className="tm-prices"><div><small>ENTRADA</small><strong>{money(room.entry_price)}</strong></div><div><small>POR KILL</small><strong>{money(room.kill_reward)}</strong></div><div><small>BONO BOOYAH</small><strong>+ {money(room.booyah_reward)}</strong></div></div>
            <div className="tm-capacity"><div><span>Participantes</span><strong>{people.filter((p) => ['pending', 'approved'].includes(p.status)).length} / {room.capacity}</strong></div><div className="bar"><i style={{ width: `${Math.min(100, people.filter((p) => ['pending', 'approved'].includes(p.status)).length / room.capacity * 100)}%` }} /></div></div>
            {room.cancellation_reason && <p className="tm-notice">Cancelación: {room.cancellation_reason}</p>}
            <div className="tm-actions">
              {admin && room.status === 'draft' && <><button className="btn" disabled={busy} onClick={() => setEditing(room)}>Editar sala</button><button className="btn btn--primary" disabled={busy} onClick={() => setDialog({ action: 'open', title: 'Abrir inscripciones', text: 'El precio, el cupo y los premios quedarán fijados para esta sala.' })}>Abrir inscripciones</button></>}
              {room.status === 'open' && <button className="btn" disabled={busy} onClick={() => act('close')}>Cerrar inscripciones</button>}
              {room.status === 'closed' && <button className="btn btn--primary" disabled={busy} onClick={() => setDialog({ action: 'start', title: 'Iniciar partida' })}>Iniciar partida</button>}
              {room.status === 'playing' && <button className="btn btn--primary" disabled={busy} onClick={() => setDialog({ action: 'finish', title: 'Finalizar y fijar ganancias', text: 'Los resultados quedarán bloqueados y se generarán las ganancias pendientes.' })}>Finalizar partida</button>}
              {!['finished', 'cancelled'].includes(room.status) && <button className="btn btn--ghost tm-cancel" disabled={busy} onClick={() => setDialog({ action: 'cancel', title: 'Cancelar sala', reason: true, text: 'Se devolverán las inscripciones aprobadas. Esta sala ya no podrá jugarse.' })}>Cancelar sala</button>}
            </div>
          </section>
          <section className="card tm-participants"><div className="tm-tabs" role="tablist" aria-label="Gestión de la sala">{[['registrations', 'Inscripciones', people.length], ['results', 'Resultados', people.filter((p) => p.status === 'approved').length], ['payments', 'Pagos', payments.filter((p) => !p.paid_at).length]].map(([key, label, count]) => <button type="button" role="tab" aria-selected={view === key} className={view === key ? 'tm-tab tm-tab--active' : 'tm-tab'} key={key} onClick={() => setView(key)}>{label}<span>{count}</span></button>)}</div>
            {view !== 'payments' && <label className="field tm-search"><span>Buscar participante</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nickname, nombre, WhatsApp o institución…" /></label>}
            {view === 'registrations' && <><div className="table-wrap"><table><thead><tr><th>Jugador</th><th>Contacto e institución</th><th>Inscripción</th><th>Revisión</th></tr></thead><tbody>{visiblePeople.map((p) => <tr key={p.id}><td><div className="tm-player"><span className="tm-player-avatar">{p.nickname.slice(0, 2).toUpperCase()}</span><div><strong>{p.nickname}</strong><small>{p.full_name}</small></div></div></td><td><strong>{p.whatsapp}</strong><small className="tm-cell-note">{p.institution || 'Sin institución'}{p.professional_school ? ` · ${p.professional_school}` : ''}</small>{p.game_player_id && <small className="tm-cell-note">ID anterior: {p.game_player_id}</small>}</td><td>{badge(p.status)}<small className="tm-cell-note">{money(p.amount_due)}</small>{p.reason && <small className="tm-cell-note">{p.reason}</small>}</td><td><button type="button" className="btn btn--sm" onClick={() => receipt(p.receipt_path)}>Ver comprobante ↗</button>{p.status === 'pending' && ['open', 'closed'].includes(room.status) && <div className="tm-row-actions"><button className="btn btn--sm btn--primary" disabled={busy} onClick={() => act('review', { registration_id: p.id, status: 'approved' })}>Aprobar</button>{[['rejected', 'Rechazar'], ['refund_pending', 'Devolver']].map(([status, label]) => <button key={status} className="btn btn--sm" disabled={busy} onClick={() => setDialog({ action: 'review', title: label, reason: true, extra: { registration_id: p.id, status } })}>{label}</button>)}</div>}</td></tr>)}</tbody></table></div>{visiblePeople.length === 0 && <div className="tm-empty"><h3>{people.length ? 'No encontramos ese jugador' : 'Aún no hay inscripciones'}</h3><p>{people.length ? 'Prueba otro nombre o nickname.' : 'Las solicitudes aparecerán aquí cuando los jugadores se inscriban.'}</p></div>}</>}
            {view === 'results' && <><p className="tm-tab-description">{room.status === 'playing' ? 'Carga las kills de cada jugador y marca el Booyah. Finaliza la partida para fijar y publicar las ganancias.' : room.status === 'finished' ? 'Resultados confirmados. Las ganancias ya están disponibles en la pestaña Pagos.' : 'Podrás cargar resultados cuando la sala esté en juego.'}</p><div className="table-wrap"><table><thead><tr><th>Jugador</th><th>Kills y Booyah</th><th>Ganancia</th></tr></thead><tbody>{visiblePeople.filter((p) => p.status === 'approved').map((p) => { const result = resultById[p.id]; return <tr key={p.id}><td><strong>{p.nickname}</strong></td><td>{room.status === 'playing' ? <ResultForm key={`${p.id}-${JSON.stringify(result)}`} person={p} result={result} busy={busy} save={(values) => act('result', values)} /> : result ? <><strong>{result.kills} kills</strong> {result.booyah && <span className="tm-status tm-status--booyah">BOOYAH</span>}</> : <span className="tm-cell-note">Sin resultado</span>}</td><td><strong>{result ? money(result.kills * Number(room.kill_reward) + (result.booyah ? Number(room.booyah_reward) : 0)) : '—'}</strong>{room.status === 'playing' && <small className="tm-cell-note">Provisional</small>}</td></tr> })}</tbody></table></div></>}
            {view === 'payments' && <><div className="tm-payment-summary"><span>Pendiente de esta sala</span><strong>{money(payments.filter((p) => !p.paid_at).reduce((sum, p) => sum + Number(p.amount), 0))}</strong></div><div className="table-wrap"><table><thead><tr><th>Jugador / concepto</th><th>Importe</th><th>Estado</th><th>Pago</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id}><td><strong>{people.find((a) => a.id === p.registration_id)?.nickname}</strong><small className="tm-cell-note">{p.kind === 'reward' ? 'Premio por kills y Booyah' : 'Devolución de inscripción'}</small></td><td><strong>{money(p.amount)}</strong></td><td><span className={`tm-status tm-status--${p.paid_at ? 'finished' : 'pending'}`}>{p.paid_at ? 'Pagado' : 'Por pagar'}</span></td><td>{p.paid_at ? <><span>{dateTime(p.paid_at)}</span>{p.reference && <small className="tm-cell-note">{p.reference}</small>}</> : admin ? <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => setDialog({ action: 'pay', title: 'Registrar pago realizado', reference: true, extra: { payment_id: p.id } })}>Registrar pago</button> : <span className="tm-cell-note">Lo registra un administrador</span>}</td></tr>)}</tbody></table></div>{payments.length === 0 && <div className="tm-empty"><h3>Todavía no hay liquidaciones</h3><p>Los premios se generan al finalizar la partida. Las devoluciones aparecen al cancelar o devolver una inscripción.</p></div>}</>}
          </section>
        </> : <section className="card tm-empty tm-room-placeholder"><span className="tm-empty-mark">FF</span><h2>Prepara tu primera sala Solo</h2><p>Una entrada por jugador. Ganancias por kills y un bono para el Booyah.</p></section>}
      </div>
    </div>
    {editing && <RoomForm room={editing.id ? editing : null} busy={busy} onClose={() => !busy && setEditing(null)} onSave={(values) => act(editing.id ? 'edit' : 'create', { ...values, ...(editing.id ? { room_id: editing.id } : {}) })} />}
    {dialog && <Modal title={dialog.title} onClose={() => !busy && setDialog(null)}><form onSubmit={(e) => { e.preventDefault(); act(dialog.action, { ...dialog.extra, ...Object.fromEntries(new FormData(e.currentTarget)) }) }}><p>{dialog.text || 'Confirma la operación para esta sala.'}</p>{dialog.reason && <label className="field">Motivo<input name="reason" required minLength={3} maxLength={500} /></label>}{dialog.reference && <label className="field">Referencia (opcional)<input name="reference" maxLength={300} /></label>}<div className="tm-actions">{dialog.action === 'delete' && <button type="button" className="btn" disabled={busy} onClick={() => setDialog(null)}>Volver</button>}<button className={`btn ${dialog.action === 'delete' ? 'tm-delete-confirm' : 'btn--primary'}`} disabled={busy}>{dialog.action === 'delete' ? (busy ? 'Eliminando…' : 'Eliminar sala') : 'Confirmar'}</button></div></form></Modal>}
  </div>
}
