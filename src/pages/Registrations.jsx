import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui'
import { dateTime, GAME_LABEL, money, STATUS_LABEL, whatsappUrl } from '../lib/format'
import { downloadCsv } from '../lib/csv'
import { publicUrl, removeFile, signedReceiptUrl } from '../lib/storage'

const institutionLabel = (r) => [r.institution === 'UNAP' ? 'UNAP' : r.other_institution ?? 'Otra', r.professional_school].filter(Boolean).join(' · ')

const OBS_PRESETS = ['No adjuntó comprobante', 'Comprobante ilegible', 'Monto incorrecto', 'Pago no figura en Yape', 'Datos del roster incompletos']

const shortDate = (iso) => {
  const d = new Date(iso)
  return (
    <span className="date-cell">
      <span>{d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }).replace(/\./g, '')}</span>
      <small>{d.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' })}</small>
    </span>
  )
}

function useReview(onChanged) {
  const { user } = useAuth()
  const toast = useToast()
  return useCallback(async (reg, status, rejectionReason = null) => {
    const { error } = await supabase.from('registrations').update({
      status, rejection_reason: rejectionReason,
      reviewed_by: status === 'pending' ? null : user.id,
      reviewed_at: status === 'pending' ? null : new Date().toISOString(),
      withdrawn_at: null, withdrawal_reason: null,
    }).eq('id', reg.id)
    if (error) { toast.error(error.message); return false }
    toast.success(`${reg.team_name}: ${STATUS_LABEL[status].toLowerCase()}.`)
    onChanged()
    return true
  }, [user, toast, onChanged])
}

function Detail({ reg, startRejecting = false, onReview, onClose, onChanged }) {
  const toast = useToast()
  const { isAdmin } = useAuth()
  const [players, setPlayers] = useState(null)
  const [receipt, setReceipt] = useState({ url: null, error: null })
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(startRejecting)
  const [reason, setReason] = useState('')
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(reg.observation ?? '')
  const [savedNote, setSavedNote] = useState(reg.observation ?? '')
  const [imgBroken, setImgBroken] = useState(false)
  const [edit, setEdit] = useState({ team_name: reg.team_name, captain_name: reg.captain_name, captain_whatsapp: reg.captain_whatsapp })
  const isPdf = reg.receipt_path.endsWith('.pdf')
  const logo = publicUrl('team-logos', reg.logo_path)

  useEffect(() => {
    let active = true
    supabase.from('players').select('*').eq('registration_id', reg.id).order('slot')
      .then(({ data }) => active && setPlayers(data ?? []))
    signedReceiptUrl(reg.receipt_path)
      .then((url) => active && setReceipt({ url, error: null }))
      .catch((e) => active && setReceipt({ url: null, error: e.message }))
    return () => { active = false }
  }, [reg.id, reg.receipt_path])

  const setStatus = async (status, rejection_reason = null) => {
    setBusy(true)
    const ok = await onReview(reg, status, rejection_reason)
    setBusy(false)
    if (ok) onClose()
  }

  const saveNote = async () => {
    setBusy(true)
    const value = note.trim() || null
    const { error } = await supabase.from('registrations').update({ observation: value }).eq('id', reg.id)
    setBusy(false)
    if (error) {
      return toast.error(error.message.includes('observation') ? 'Falta ejecutar la migración 004_observations.sql en Supabase.' : error.message)
    }
    setSavedNote(value ?? '')
    setNote(value ?? '')
    toast.success(value ? 'Observación guardada.' : 'Observación eliminada.')
    onChanged()
  }

  const saveEdit = async () => {
    const wa = edit.captain_whatsapp.replace(/\D/g, '')
    if (edit.team_name.trim().length < 3 || edit.captain_name.trim().length < 3 || !/^\d{8,15}$/.test(wa)) {
      return toast.error('Datos inválidos.')
    }
    setBusy(true)
    const { error } = await supabase.from('registrations').update({
      team_name: edit.team_name.trim(), captain_name: edit.captain_name.trim(), captain_whatsapp: wa,
    }).eq('id', reg.id)
    setBusy(false)
    if (error) return toast.error(error.code === '23505' ? 'Ya existe un equipo con ese nombre.' : error.message)
    toast.success('Datos actualizados.')
    onChanged()
    onClose()
  }

  const remove = async () => {
    if (!window.confirm(`¿Eliminar definitivamente la inscripción de "${reg.team_name}"? Esta acción no se puede deshacer.`)) return
    setBusy(true)
    const { error } = await supabase.from('registrations').delete().eq('id', reg.id)
    if (error) { setBusy(false); return toast.error(error.message) }
    await Promise.all([removeFile('receipts', reg.receipt_path), removeFile('team-logos', reg.logo_path)])
    setBusy(false)
    toast.success('Inscripción eliminada.')
    onChanged()
    onClose()
  }


  const footer = (
    <>
      {rejecting && (
        <label className="field" style={{ width: '100%' }}><span>Motivo del rechazo (solo lo ve la organización)</span>
          <textarea rows={2} maxLength={300} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      <div className="foot-actions">
        {reg.status !== 'approved' && !rejecting && <button className="btn btn--ok" disabled={busy} onClick={() => setStatus('approved')} type="button">Aprobar</button>}
        {reg.status !== 'rejected' && !rejecting && <button className="btn btn--bad" disabled={busy} onClick={() => setRejecting(true)} type="button">Rechazar</button>}
        {rejecting && <button className="btn btn--bad" disabled={busy || reason.trim().length < 3} onClick={() => setStatus('rejected', reason.trim())} type="button">Confirmar rechazo</button>}
        {rejecting && <button className="btn" onClick={() => setRejecting(false)} type="button">Cancelar</button>}
        {reg.status !== 'pending' && !rejecting && <button className="btn" disabled={busy} onClick={() => setStatus('pending')} type="button">Volver a pendiente</button>}
        {!editing && !rejecting && <button className="btn" onClick={() => setEditing(true)} type="button">Editar datos</button>}
        {isAdmin && <button className="btn btn--ghost" disabled={busy} onClick={remove} type="button" style={{ marginLeft: 'auto' }}>Eliminar</button>}
      </div>
    </>
  )

  return (
    <Modal title={reg.team_name} onClose={onClose} footer={footer} wide>
      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {logo && <img src={logo} alt="" className="logo-thumb" />}
        <span className={`tag tag--${reg.game_key}`}>{GAME_LABEL[reg.game_key]}</span>
        <StatusBadge status={reg.status} />
        <strong>{money(reg.amount_due)}</strong>
      </div>

      {editing ? (
        <div className="form-row">
          <label className="field"><span>Equipo</span><input value={edit.team_name} maxLength={40} onChange={(e) => setEdit({ ...edit, team_name: e.target.value })} /></label>
          <label className="field"><span>Capitán</span><input value={edit.captain_name} maxLength={80} onChange={(e) => setEdit({ ...edit, captain_name: e.target.value })} /></label>
          <label className="field"><span>WhatsApp</span><input value={edit.captain_whatsapp} maxLength={15} onChange={(e) => setEdit({ ...edit, captain_whatsapp: e.target.value })} /></label>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'end' }}>
            <button className="btn btn--primary" disabled={busy} onClick={saveEdit} type="button">Guardar</button>
            <button className="btn" onClick={() => setEditing(false)} type="button">Cancelar</button>
          </div>
        </div>
      ) : (
        <dl className="kv">
          <dt>Capitán</dt><dd>{reg.captain_name}</dd>
          <dt>WhatsApp</dt><dd>{reg.captain_whatsapp} · <a href={whatsappUrl(reg.captain_whatsapp)} target="_blank" rel="noopener noreferrer">Abrir chat ↗</a></dd>
          <dt>Institución</dt><dd>{institutionLabel(reg)}</dd>
          <dt>Registrado</dt><dd>{dateTime(reg.created_at)}</dd>
          {reg.rejection_reason && (<><dt>Motivo rechazo</dt><dd>{reg.rejection_reason}</dd></>)}
        </dl>
      )}

      <div>
        <h3 style={{ fontSize: '.9rem', marginBottom: '.5rem' }}>Roster</h3>
        {!players ? <Spinner /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Rol</th><th>Nickname</th><th>ID</th>{players.some((p) => p.server_id) && <th>Server</th>}</tr></thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id}><td>{p.slot}</td><td>{p.is_substitute ? 'Suplente' : p.slot === 1 ? 'Capitán' : 'Titular'}</td>
                    <td>{p.nickname}</td><td>{p.game_player_id}</td>{players.some((x) => x.server_id) && <td>{p.server_id}</td>}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3>Comprobante de pago</h3>
        {!receipt.url && !receipt.error && <Spinner />}
        {receipt.url && !imgBroken && (isPdf
          ? <iframe className="receipt-frame" title="Comprobante PDF" src={receipt.url} sandbox="" />
          : <img className="receipt" src={receipt.url} alt="Comprobante de pago" onError={() => setImgBroken(true)} />)}
        {receipt.url && !imgBroken && <p className="hint"><a href={receipt.url} target="_blank" rel="noopener noreferrer">Abrir en pestaña nueva ↗</a> (enlace válido 60 s)</p>}
        {(receipt.error || imgBroken) && (
          <div className="no-image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-8 8M3 3l18 18" /></svg>
            <strong>Este equipo no trae imagen de comprobante</strong>
            {savedNote
              ? <p className="no-image-note"><span>Lo observado</span>{savedNote}</p>
              : <p className="hint">No hay observaciones. Anota qué ocurrió abajo.</p>}
          </div>
        )}
      </div>

      <div>
        <h3>Observaciones</h3>
        <div className="chips" role="group" aria-label="Observaciones frecuentes">
          {OBS_PRESETS.map((text) => (
            <button key={text} type="button" className="chip" onClick={() => setNote((n) => (n.includes(text) ? n : (n ? `${n}. ` : '') + text))}>{text}</button>
          ))}
        </div>
        <textarea rows={3} maxLength={500} placeholder="Escribe lo observado en esta inscripción…" aria-label="Observaciones" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="note-actions">
          <span className="hint">{note.length}/500</span>
          <button type="button" className="btn btn--sm" disabled={busy || note.trim() === savedNote} onClick={saveNote}>Guardar observación</button>
        </div>
      </div>

    </Modal>
  )
}

export default function Registrations() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({ game: '', status: '', q: '' })
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('registrations').select('*').order('created_at', { ascending: false })
    if (err) setError(err.message)
    else { setRows(data); setError(null) }
  }, [])
  useEffect(() => { load() }, [load])

  const review = useReview(load)

  const quickApprove = async (r) => {
    if (!window.confirm(`¿Aprobar a "${r.team_name}"? Confirma que ya verificaste el comprobante de pago.`)) return
    setBusyId(r.id)
    await review(r, 'approved')
    setBusyId(null)
  }

  const counts = useMemo(() => {
    const all = rows ?? []
    const byGame = (g) => all.filter((r) => !g || r.game_key === g)
    const inGame = byGame(filters.game)
    return {
      game: { '': all.length, mlbb: byGame('mlbb').length, ff: byGame('ff').length },
      status: { '': inGame.length, pending: inGame.filter((r) => r.status === 'pending').length, approved: inGame.filter((r) => r.status === 'approved').length, rejected: inGame.filter((r) => r.status === 'rejected').length, withdrawn: inGame.filter((r) => r.status === 'withdrawn').length },
    }
  }, [rows, filters.game])

  const visible = useMemo(() => {
    if (!rows) return []
    const q = filters.q.trim().toLowerCase()
    return rows.filter((r) =>
      (!filters.game || r.game_key === filters.game) &&
      (!filters.status || r.status === filters.status) &&
      (!q || r.team_name.toLowerCase().includes(q) || r.captain_name.toLowerCase().includes(q) || r.captain_whatsapp.includes(q)))
  }, [rows, filters])

  const exportCsv = async () => {
    const ids = visible.map((r) => r.id)
    const { data: players } = await supabase.from('players').select('*').in('registration_id', ids).order('slot')
    const byReg = new Map()
    ;(players ?? []).forEach((p) => byReg.set(p.registration_id, [...(byReg.get(p.registration_id) ?? []), p]))
    downloadCsv(`inscripciones-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Equipo', 'Juego', 'Estado', 'Monto', 'Capitán', 'WhatsApp', 'Institución', 'Fecha', 'Roster'],
      visible.map((r) => [
        r.team_name, GAME_LABEL[r.game_key], STATUS_LABEL[r.status], r.amount_due, r.captain_name, r.captain_whatsapp,
        institutionLabel(r), dateTime(r.created_at),
        (byReg.get(r.id) ?? []).map((p) => `${p.nickname} (${p.game_player_id}${p.server_id ? `/${p.server_id}` : ''})`).join(' | '),
      ]))
  }

  if (error) return <ErrorBox error={error} />
  if (!rows) return <Spinner />
  return (
    <>
      <PageHeader eyebrow="Operación" title="Inscripciones" subtitle={`${visible.length} de ${rows.length} equipos`}
        actions={<button className="btn" onClick={exportCsv} type="button" disabled={!visible.length}>Exportar CSV</button>} />
      <div className="filter-bar">
        <input aria-label="Buscar" placeholder="Buscar equipo, capitán o WhatsApp…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <div className="seg" role="group" aria-label="Juego">
          {[['', 'Todos'], ['mlbb', 'MLBB'], ['ff', 'Free Fire']].map(([value, label]) => (
            <button key={value} type="button" className={`seg-btn ${filters.game === value ? 'seg-btn--on' : ''}`} aria-pressed={filters.game === value} onClick={() => setFilters({ ...filters, game: value })}>
              {label}<span className="seg-count">{counts.game[value]}</span>
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Estado">
          {[['', 'Todos'], ['pending', 'Pendientes'], ['approved', 'Aprobados'], ['rejected', 'Rechazados'], ['withdrawn', 'Retirados']].map(([value, label]) => (
            <button key={value} type="button" className={`seg-btn seg-btn--${value || 'all'} ${filters.status === value ? 'seg-btn--on' : ''}`} aria-pressed={filters.status === value} onClick={() => setFilters({ ...filters, status: value })}>
              {label}<span className="seg-count">{counts.status[value]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table-nowrap table-lg">
          <thead><tr><th></th><th>Equipo</th><th>Juego</th><th className="col-captain">Capitán</th><th>Estado</th><th className="num">Monto</th><th>Fecha</th><th className="th-actions">Acciones</th></tr></thead>
          <tbody>
            {visible.map((r) => {
              const logo = publicUrl('team-logos', r.logo_path)
              return (
                <tr key={r.id}>
                  <td>{logo ? <img src={logo} alt="" className="logo-thumb" loading="lazy" /> : <div className="logo-thumb logo-thumb--empty" aria-hidden="true">{r.team_name[0]}</div>}</td>
                  <td>
                    <div className="team-cell">
                      <span>{r.team_name}</span>
                      {r.observation && <span className="obs-line" title={r.observation}>{r.observation}</span>}
                    </div>
                  </td>
                  <td><span className={`tag tag--${r.game_key}`}>{GAME_LABEL[r.game_key]}</span></td>
                  <td className="col-captain">{r.captain_name}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="num">{money(r.amount_due)}</td>
                  <td>{shortDate(r.created_at)}</td>
                  <td>
                    <div className="row-actions row-actions--end">
                      <button className="btn btn--sm" onClick={() => setSelected({ reg: r })} type="button">Ver</button>
                      {r.status !== 'approved' && <button className="btn btn--sm btn--ok" disabled={busyId === r.id} onClick={() => quickApprove(r)} type="button">Aprobar</button>}
                      {r.status !== 'rejected' && r.status !== 'withdrawn' && <button className="btn btn--sm btn--bad" onClick={() => setSelected({ reg: r, reject: true })} type="button">Rechazar</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className="empty">No hay inscripciones con esos filtros.</p>}
      </div>
      {selected && <Detail key={`${selected.reg.id}-${selected.reject ? 'r' : 'v'}`} reg={selected.reg} startRejecting={Boolean(selected.reject)} onReview={review} onClose={() => setSelected(null)} onChanged={load} />}
    </>
  )
}
