// Neutraliza inyección de fórmulas en Excel/Sheets (= + - @ tab CR).
const safeCell = (value) => {
  let s = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(safeCell).join(','), ...rows.map((r) => r.map(safeCell).join(','))]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
