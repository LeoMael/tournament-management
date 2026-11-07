import { useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useToast } from '../../context/ToastContext'
import { Modal } from '../ui'
import { GAME_LABEL } from '../../lib/format'
import { INDIVIDUAL_STATUS } from '../../lib/individuals'

export default function DeleteIndividualModal({ person, onClose, onChanged }) {
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const inFlight = useRef(false)
  const toast = useToast()
  const close = () => { if (!inFlight.current) onClose() }
  const remove = async (event) => {
    event.preventDefault()
    if (inFlight.current || confirmation !== 'ELIMINAR') return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('delete_individual_registration', {
        p_id: person.id, p_confirmation: confirmation, p_expected_status: person.status,
      })
      if (rpcError) throw rpcError
      if (!data || data.deleted !== true || data.id !== person.id) throw new Error('No se pudo confirmar el resultado. Reintenta para comprobarlo.')
      await onChanged()
      toast.success('Solicitud eliminada.')
      inFlight.current = false
      onClose()
    } catch (err) {
      setError(['PGRST202', '42883'].includes(err.code) ? 'La función no está disponible. Revisa la aplicación de la migración 005.' : err.message || 'No se pudo confirmar la eliminación. Inténtalo de nuevo.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return (
    <Modal title="Eliminar solicitud individual" onClose={close} footer={<div className="foot-actions"><button type="button" className="btn" disabled={busy} onClick={close}>Cancelar</button><button type="submit" form="delete-individual-form" className="btn btn--bad" disabled={busy || confirmation !== 'ELIMINAR'}>{busy ? 'Eliminando…' : 'Eliminar solicitud'}</button></div>}>
      <div>
        <h3>¿Estás seguro?</h3>
        <p>Se eliminará la solicitud de <strong>{person.full_name}</strong> ({person.nickname}) · {GAME_LABEL[person.game_key]} · {INDIVIDUAL_STATUS[person.status]}.</p>
        <p className="hint">Los comprobantes de pago y devolución se conservan. Esta acción no se puede deshacer.</p>
      </div>
      <form id="delete-individual-form" onSubmit={remove}>
        <label className="field"><span>Escribe ELIMINAR para confirmar</span><input autoFocus autoComplete="off" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} /></label>
        {error && <p className="error-box" role="alert">{error}</p>}
      </form>
    </Modal>
  )
}
