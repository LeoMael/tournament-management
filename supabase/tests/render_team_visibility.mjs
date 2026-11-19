import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { TeamListVisibilityControls } = await server.ssrLoadModule('/src/components/TeamListVisibility.jsx')
  const render = (props) => renderToStaticMarkup(React.createElement(TeamListVisibilityControls, { busy: false, error: '', onChange() {}, onRetry() {}, ...props }))
  const snapshot = { editionId: 'edition', games: [{ key: 'ff', name: 'Free Fire', public_teams_visible: false }, { key: 'mlbb', name: 'Mobile Legends', public_teams_visible: true }] }
  const html = render({ snapshot })
  assert.match(html, /Publicar equipos confirmados de MLBB" aria-checked="true"/)
  assert.match(html, /Publicar equipos confirmados de Free Fire" aria-checked="false"/)
  assert.equal((html.match(/role="switch"/g) || []).length, 2)
  assert.match(html, /Publicado/)
  assert.match(html, /Oculto/)
  const loading = render({ snapshot: null })
  assert.equal((loading.match(/disabled=""/g) || []).length, 2)
  assert.match(loading, /Cargando/)
  const failed = render({ snapshot: null, error: 'Aplica la migración 036' })
  assert.equal((failed.match(/No disponible/g) || []).length, 2)
  assert.match(failed, /role="alert"/)
  assert.match(failed, /Reintentar/)
  assert.equal((render({ snapshot, busy: true }).match(/disabled=""/g) || []).length, 2)
  console.log('PASS publicación independiente de MLBB/FF; carga, error y guardado deshabilitan controles')
} finally { await server.close() }
