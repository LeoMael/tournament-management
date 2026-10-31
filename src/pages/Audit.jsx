import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { dateTime } from '../lib/format'
import { ErrorBox, PageHeader, Spinner } from '../components/ui'

function summarize(row) {
  if (row.op === 'INSERT') return 'Creado'
  if (row.op === 'DELETE') return 'Eliminado'
  const changed = Object.keys(row.new_data || {}).filter(
    (k) => JSON.stringify(row.new_data[k]) !== JSON.stringify(row.old_data?.[k]) && k !== 'updated_at',
  )
  return changed.map((k) => `${k}: ${JSON.stringify(row.old_data?.[k])} → ${JSON.stringify(row.new_data[k])}`).join(' · ') || 'Sin cambios'
}

export default function Audit() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(200)
      .then(({ data, error: err }) => (err ? setError(err.message) : setRows(data)))
  }, [])

  if (error) return <ErrorBox error={error} />
  if (!rows) return <Spinner />
  return (
    <>
      <PageHeader eyebrow="Sistema" title="Auditoría" subtitle="Últimos 200 cambios hechos en el sistema." />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Admin</th><th>Tabla</th><th>Acción</th><th>Detalle</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{dateTime(r.at)}</td><td>{r.actor_email ?? 'sistema'}</td><td>{r.table_name}</td><td>{r.op}</td>
                <td style={{ maxWidth: 480, wordBreak: 'break-word' }}>{summarize(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="empty">Sin movimientos.</p>}
      </div>
    </>
  )
}
