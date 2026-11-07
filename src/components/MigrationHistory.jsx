export default function MigrationHistory({ status, loading, onRefresh }) {
  const rows = [...status.rows].sort((a, b) => b.version.localeCompare(a.version))
  return (
    <section className="card">
      <h2>Versión de la base de datos</h2>
      {status.state === 'loading' && <p>Consultando historial…</p>}
      {status.state === 'missing' && <p>La tabla de historial no existe o no está disponible en el esquema de la API. Revisa y aplica la migración 002 después de la 001.</p>}
      {status.state === 'error' && <p>No se pudo consultar el historial de migraciones. Comprueba permisos y conexión.</p>}
      {status.state === 'ready' && (rows.length ? <><p>Última versión registrada: {rows[0].version}</p><ul>{rows.map((row) => <li key={row.version}>{row.version} · {row.description} · {new Date(row.applied_at).toLocaleString()}</li>)}</ul></> : <p>No hay versiones registradas.</p>)}
      <button className="btn" type="button" disabled={loading} onClick={onRefresh}>{loading ? 'Actualizando…' : 'Actualizar versión'}</button>
    </section>
  )
}
