import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Modal, Spinner } from './ui'
import { dateTime, GAME_LABEL, money } from '../lib/format'
import { teamPrizeNoticeLink, teamPrizeTotals } from '../lib/teamPrizePayments'
import './TeamPrizePayments.css'

function ConfirmPrizes({ context, busy, onClose, onConfirm }) {
  const [third, setThird] = useState(context.third_candidates.length === 1 ? context.third_candidates[0] : '')
  const [items, setItems] = useState(['', '', ''])
  const [accepted, setAccepted] = useState(false)
  const podium = context.game_key === 'ff' ? context.podium : [...context.podium, third]
  return <Modal wide title={`Confirmar premios · ${GAME_LABEL[context.game_key]}`} onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); onConfirm(podium, items) }}>
      <p>Fase final: <strong>{context.stage_name}</strong>. Revisa los puestos, importes y números antes de confirmar.</p>
      {context.game_key === 'mlbb' && <p className="hint">El 3.º lugar debe resolverse según las bases del torneo. No se deduce de las victorias acumuladas; selecciona al semifinalista que corresponda.</p>}
      {[1, 2, 3].map((place) => {
        const team = context.teams.find((row) => row.id === podium[place - 1])
        const prize = context.prizes.find((row) => row.place === place)
        return <div key={place} className="team-prizes__entry">
          <h3>{place}.º lugar · {money(prize?.amount)}</h3>
          {place === 3 && context.game_key === 'mlbb' ? <label className="field"><span>Equipo que obtuvo el 3.º lugar</span><select required value={third} onChange={(e) => setThird(e.target.value)}><option value="">Seleccionar equipo</option>{context.teams.filter((row) => context.third_candidates.includes(row.id)).map((row) => <option key={row.id} value={row.id}>{row.team_name}</option>)}</select></label> : <strong>{team?.team_name || 'Equipo no disponible'}</strong>}
          <p>{team?.captain_name || '—'}<br />Yape para premios: <strong>{team?.prize_yape_phone || 'No indicado'}</strong></p>
          <p className="hint">Premio configurado: {prize?.reward_text || 'Sin descripción'}</p>
          <label className="field"><span>Objeto o entrega adicional (opcional)</span><input maxLength={240} placeholder="Ej.: medallas. Déjalo vacío si solo hay dinero." value={items[place - 1]} onChange={(e) => setItems((current) => current.map((value, i) => i === place - 1 ? e.target.value : value))} /></label>
        </div>
      })}
      <p className="hint">El importe monetario se configura en Configuración → Premios por puesto → Detalles. El texto del premio no se convierte automáticamente en dinero. Los destinos se conservan como referencia del pago; el nombre mostrado es el registrado, no un titular de Yape verificado.</p>
      <label className="check"><input required type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />Confirmo que los puestos y desempates están resueltos y revisé los premios y destinos.</label>
      <div className="row-actions" style={{ marginTop: 16 }}><button className="btn btn--primary" disabled={busy || !accepted || podium.length !== 3 || podium.some((id) => !context.teams.some((row) => row.id === id))}>Confirmar premios</button></div>
    </form>
  </Modal>
}

export default function TeamPrizePayments({ game, editionId }) {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [reference, setReference] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const load = useCallback(async () => {
    try {
      const [ctx, batch, payments] = await Promise.all([
        supabase.rpc('team_prize_context', { p_edition_id: editionId, p_game_key: game }),
        supabase.from('team_prize_settlements').select('*').eq('edition_id', editionId).eq('game_key', game).maybeSingle(),
        supabase.from('team_prize_payments').select('*').eq('edition_id', editionId).order('place'),
      ])
      const problem = ctx.error || batch.error || payments.error
      if (problem) throw new Error(problem.code === 'PGRST202' || problem.code === 'PGRST205' || problem.code === '42P01' ? 'Aplica la migración 026 para activar Premios y pagos de equipos.' : problem.message)
      setData({ context: ctx.data, settlement: batch.data, payments: payments.data.filter((row) => row.settlement_id === batch.data?.id) })
      setError('')
    } catch (problem) { setError(problem.message) }
  }, [editionId, game])
  useEffect(() => {
    let active = true, refreshing = false
    const refresh = async () => {
      if (!active || refreshing || document.hidden) return
      refreshing = true
      await load()
      refreshing = false
    }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [load])
  const run = async (action) => {
    setBusy(true)
    try {
      const result = await action()
      if (result.error) throw new Error(result.error.message)
      setDialog(null)
      toast.success('Operación registrada.')
      await load()
    } catch (problem) { toast.error(problem.message) }
    finally { setBusy(false) }
  }
  const copy = async (phone) => {
    try { await navigator.clipboard.writeText(phone); toast.success('Yape para premios copiado.') }
    catch { toast.error('No se pudo copiar. Puedes seleccionar el número.') }
  }
  const totals = teamPrizeTotals(data?.payments ?? [])
  const openAction = (payment, action) => { setReference(action === 'refresh_yape' ? data.context.teams.find((team) => team.id === payment.registration_id)?.prize_yape_phone || '' : ''); setDialog({ payment, action }) }
  return <section className="card team-prizes">
    <div className="team-prizes__head"><h2>Premios y pagos · {GAME_LABEL[game]}</h2><button type="button" className="btn btn--sm" disabled={busy} onClick={load}>Actualizar</button></div>
    <ErrorBox error={error} />
    {!data && !error && <Spinner />}
    {data && <>
      {!data.settlement ? <>
        <p className="hint">Se pagan los puestos finales del torneo, independientemente de las partidas individuales.</p>
        {data.context.blocker ? <p className="hint">{data.context.blocker}</p> : isAdmin ? <button type="button" className="btn btn--primary" disabled={busy || !!error} onClick={() => setDialog({ action: 'confirm', context: data.context })}>Revisar y confirmar premios</button> : <p className="hint">Un administrador debe confirmar los premios.</p>}
      </> : <>
        <p className="hint">{data.settlement.edition_name} · {data.settlement.stage_name} · Confirmados {dateTime(data.settlement.created_at)}</p>
        <div className="team-prizes__totals"><div><span>Total de premios en dinero</span><strong>{money(totals.total)}</strong></div><div><span>Total pagado</span><strong>{money(totals.paid)}</strong></div><div><span>Pendiente de pago</span><strong>{money(totals.due)}</strong></div></div>
        {totals.deliveriesPending > 0 && <p className="hint">Entregas adicionales pendientes: {totals.deliveriesPending}</p>}
        <div className="team-prizes__scroll"><table><thead><tr><th>Puesto</th><th>Equipo / Nombre</th><th>Yape para premios</th><th>Premio</th><th>Estado</th><th>Pago / Entrega</th></tr></thead><tbody>
          {data.payments.map((payment) => {
            const hasMoney = Number(payment.amount) > 0
            const team = data.context.teams.find((row) => row.id === payment.registration_id)
            const notice = teamPrizeNoticeLink(data.settlement, payment, team)
            return <tr key={payment.id}>
              <td><strong>{payment.place}.º</strong></td>
              <td><strong>{payment.team_name}</strong><small className="team-prizes__note">{payment.registered_name}</small></td>
              <td>{hasMoney ? <><div className="team-prizes__number"><span>{payment.prize_yape_phone}</span><button type="button" className="btn btn--sm" onClick={() => copy(payment.prize_yape_phone)}>Copiar número</button></div>{!payment.paid_at && team?.prize_yape_phone && team.prize_yape_phone !== payment.prize_yape_phone && <small className="team-prizes__note">La inscripción tiene otro Yape: {team.prize_yape_phone}. {isAdmin && <button className="btn btn--sm" type="button" disabled={busy || !!error} onClick={() => openAction(payment, 'refresh_yape')}>Actualizar destino</button>}</small>}</> : '—'}</td>
              <td><strong>{money(payment.amount)}</strong>{payment.item_text && <small className="team-prizes__note">{payment.item_text}</small>}</td>
              <td><span className={`badge badge--${payment.paid_at ? 'approved' : hasMoney ? 'pending' : 'draft'}`}>{hasMoney ? payment.paid_at ? 'Pagado' : 'Por pagar' : 'Sin premio monetario'}</span>{payment.item_text && <small className="team-prizes__note">{payment.delivered_at ? 'Entrega registrada' : 'Entrega pendiente'}</small>}</td>
              <td>{hasMoney && (payment.paid_at ? <><span>{dateTime(payment.paid_at)}</span>{payment.reference && <small className="team-prizes__note">{payment.reference}</small>}{notice && <div className="row-actions"><a className="btn btn--sm" href={notice} target="_blank" rel="noopener noreferrer">Avisar pago</a></div>}</> : isAdmin && <button className="btn btn--sm btn--primary" type="button" disabled={busy || !!error} onClick={() => openAction(payment, 'pay')}>Registrar pago</button>)}{payment.item_text && <div className="row-actions">{payment.delivered_at ? <small>{dateTime(payment.delivered_at)}</small> : isAdmin && <button className="btn btn--sm" type="button" disabled={busy || !!error} onClick={() => openAction(payment, 'deliver')}>Registrar entrega</button>}</div>}</td>
            </tr>
          })}
        </tbody></table></div>
        {isAdmin && !data.payments.some((row) => row.paid_at || row.delivered_at) && <button className="btn btn--ghost btn--sm" type="button" style={{ marginTop: 12 }} disabled={busy || !!error} onClick={() => { setConfirmation(''); setDialog({ action: 'cancel', settlementId: data.settlement.id }) }}>Rehacer premios sin pagos</button>}
      </>}
    </>}
    {dialog?.action === 'confirm' && <ConfirmPrizes context={dialog.context} busy={busy} onClose={() => !busy && setDialog(null)} onConfirm={(podium, items) => run(() => supabase.rpc('confirm_team_prizes', { p_edition_id: editionId, p_game_key: game, p_stage_id: dialog.context.stage_id, p_podium: podium, p_items: items, p_expected_prizes: dialog.context.prizes }))} />}
    {dialog?.payment && <Modal title={dialog.action === 'pay' ? 'Registrar pago realizado' : dialog.action === 'refresh_yape' ? 'Actualizar destino pendiente' : 'Registrar entrega realizada'} onClose={() => !busy && setDialog(null)}>
      <form onSubmit={(event) => { event.preventDefault(); run(() => supabase.rpc('record_team_prize_payment', { p_edition_id: editionId, p_payment_id: dialog.payment.id, p_action: dialog.action, p_reference: reference, p_expected_amount: Number(dialog.payment.amount), p_expected_yape: dialog.payment.prize_yape_phone })) }}>
        <h3>{dialog.payment.place}.º · {dialog.payment.team_name}</h3><p>{dialog.payment.registered_name}</p>
        {dialog.action === 'pay' ? <><p>Importe: <strong>{money(dialog.payment.amount)}</strong></p><div className="team-prizes__number"><span>Yape: {dialog.payment.prize_yape_phone}</span><button type="button" className="btn btn--sm" onClick={() => copy(dialog.payment.prize_yape_phone)}>Copiar número</button></div><p className="hint">Confirma el destinatario en Yape. Registra el pago después de realizar la transferencia. Este botón no envía dinero.</p><label className="field"><span>Referencia (opcional)</span><input maxLength={300} value={reference} onChange={(e) => setReference(e.target.value)} /></label></> : dialog.action === 'refresh_yape' ? <p>Se reemplazará {dialog.payment.prize_yape_phone} por el Yape corregido en la inscripción: <strong>{reference}</strong>. Verifica el nuevo destino antes de transferir.</p> : <p>Entrega: <strong>{dialog.payment.item_text}</strong>. Confirma únicamente si ya fue entregado.</p>}
        <button className="btn btn--primary" disabled={busy}>Confirmar {dialog.action === 'pay' ? 'pago' : dialog.action === 'refresh_yape' ? 'nuevo destino' : 'entrega'}</button>
      </form>
    </Modal>}
    {dialog?.action === 'cancel' && <Modal title="Rehacer premios sin pagos" onClose={() => !busy && setDialog(null)}><form onSubmit={(event) => { event.preventDefault(); run(() => supabase.rpc('cancel_team_prizes', { p_edition_id: editionId, p_settlement_id: dialog.settlementId, p_confirmation: confirmation })) }}><p>Se retirará esta liquidación para volver a revisar puestos, importes y destinos. Los resultados del torneo se conservan. No se permite si hay pagos o entregas registrados.</p><label className="field"><span>Escribe REHACER PREMIOS</span><input required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label><button className="btn btn--bad" disabled={busy || confirmation !== 'REHACER PREMIOS'}>Rehacer premios</button></form></Modal>}
  </section>
}
