// El registro exacto es necesario: una versión posterior no implica que exista 001.
export function migrationStatus(data, error) {
  if (error) {
    const missing = error.code === '42P01' || error.code === 'PGRST205'
    return { state: missing ? 'missing' : 'error', hasPrizes: false, rows: [] }
  }
  const rows = Array.isArray(data) ? data : []
  return { state: 'ready', hasPrizes: rows.some((row) => row.version === '001'), rows }
}
