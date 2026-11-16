import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const Results = (await server.ssrLoadModule('/src/components/FfRoomResults.jsx')).default
  const Payments = (await server.ssrLoadModule('/src/components/FfRoomPayments.jsx')).default
  const Import = (await server.ssrLoadModule('/src/components/FfRoomImport.jsx')).default
  const Access = (await server.ssrLoadModule('/src/components/FfRoomAccess.jsx')).default
  const FreeFireRooms = (await server.ssrLoadModule('/src/pages/FreeFireRooms.jsx')).default
  const { AuthProvider } = await server.ssrLoadModule('/src/context/AuthContext.jsx')
  const { ToastProvider } = await server.ssrLoadModule('/src/context/ToastContext.jsx')
  const page = renderToStaticMarkup(React.createElement(AuthProvider, null, React.createElement(ToastProvider, null, React.createElement(FreeFireRooms))))
  assert.match(page, /aria-label="Filtrar salas por modalidad"/)
  assert.match(page, /aria-pressed="true">Solo por kills y Booyah/)
  assert.ok(!page.includes('>Todos</button>'))
  for (const label of ['Solo por kills y Booyah', 'Solo por Top', 'Dúo por kills y Booyah', 'Dúo por Top']) assert.ok(page.includes(label))
  assert.ok(!page.includes('<select'))
  const people = [{ id: 'a', slot: 1, status: 'approved', nickname_1: 'Jugador A', nickname_2: 'Jugador B', full_name: 'Nombre registrado', whatsapp: '999999999', prize_yape_phone: '988888888' }, { id: 'b', slot: 2, status: 'approved', nickname_1: 'Sin premio', prize_yape_phone: '977777777' }]
  const results = [{ registration_id: 'a', placement: 1, kills_1: 2, kills_2: 3, booyah: true }]
  for (const kind of ['solo_top', 'duo_top', 'duo_kills']) {
    const roomPeople = kind === 'solo_top' ? people.map((p) => ({ ...p, nickname_2: null })) : people
    for (const status of ['closed', 'playing', 'finished']) {
      const html = renderToStaticMarkup(React.createElement(Results, { kind, room: { id: 'room', status, capacity: 24, kill_reward: 0.5, booyah_reward: 5 }, people: roomPeople, visibleIds: new Set(['a', 'b']), results, prizes: [{ place: 1, amount: 100 }], busy: false, onDirty() {}, onSave() {} }))
      assert.match(html, /Posición/)
      assert.match(html, /Jugador A/)
      assert.equal(html.includes('Guardar todos los resultados'), status === 'playing')
      const preview = renderToStaticMarkup(React.createElement(Import, { kind, room: { id: 'room', status }, people: roomPeople, prizes: [], busy: false, hasDraft: false, onClose() {}, onImport() {} }))
      assert.match(preview, /Verificar y previsualizar/)
      assert.match(preview, /Probar con esta nómina/)
      assert.equal(preview.includes('Solo vista previa.'), status !== 'playing')
    }
  }
  const html = renderToStaticMarkup(React.createElement(Payments, { people, results, visibleIds: new Set(['a', 'b']), payments: [{ id: 'p', registration_id: 'a', concept: 'reward', amount: 7.5 }, { id: 'z', registration_id: 'b', concept: 'reward', amount: 0 }], admin: true, busy: false, onPay() {} }))
  assert.match(html, /988888888/)
  assert.doesNotMatch(html, /999999999|977777777/)
  assert.equal((html.match(/Copiar número/g) || []).length, 1)
  assert.match(html, /Nombre registrado/)
  const access = renderToStaticMarkup(React.createElement(Access, { access: { game_room_id: '12345', room_password: 'PRIVADO' }, busy: false, onEditing() {}, onSave() {} }))
  assert.match(access, /type="password"/)
  assert.match(access, /Guardar acceso/)
  console.log('PASS renderizado de Resultados en tres modalidades y tres estados; Pagos usa Yape y oculta importes cero')
} finally { await server.close() }
