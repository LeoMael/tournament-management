import test from 'node:test'
import assert from 'node:assert/strict'
import { whatsappLaunchUrl, prepareWhatsAppLaunch } from '../src/lib/whatsappLaunch.js'

const message = 'Hola, ★Jugador★.\n*TU SLOT ASIGNADO: 07*\nID: 12345\nContraseña: a&b + ✓'
const web = 'https://wa.me/51930475802?text=' + encodeURIComponent(message)

test('aplicación conserva número, símbolos y texto completo; navegador conserva enlace original', () => {
  const native = new URL(whatsappLaunchUrl(web, 'app'))
  assert.equal(native.protocol, 'whatsapp:')
  assert.equal(native.hostname, 'send')
  assert.equal(native.searchParams.get('phone'), '51930475802')
  assert.equal(native.searchParams.get('text'), message)
  assert.equal(whatsappLaunchUrl(web, 'web'), web)
  for (const invalid of ['javascript:alert(1)', 'https://evil.test/51930475802?text=x', 'https://wa.me@evil.test/51930475802?text=x', 'https://wa.me/bad?text=x', 'https://wa.me/51930475802?text=x&text=y', 'https://wa.me/51930475802', null]) assert.equal(whatsappLaunchUrl(invalid, 'app'), null)
  assert.equal(whatsappLaunchUrl(web, 'otro'), null)
})
test('aplicación no crea pestañas; abrir solo deriva a la app y no envía mensajes', () => {
  const calls = []
  const launch = prepareWhatsAppLaunch('app', { open() { throw new Error('No debe crear pestaña') }, location: { assign(url) { calls.push(url) } } })
  assert.equal(calls.length, 0)
  launch.open(web)
  assert.deepEqual(calls, [whatsappLaunchUrl(web, 'app')])
  launch.close()
  assert.throws(() => launch.open('https://evil.test'), /válido/)
  assert.equal(calls.length, 1)
})
test('navegador reserva una sola pestaña, elimina opener y permite cerrarla ante error', () => {
  const calls = [], popup = { opener: {}, location: { replace(url) { calls.push(url) } }, close() { calls.push('closed') } }
  const launch = prepareWhatsAppLaunch('web', { open(...args) { calls.push(args); return popup } })
  assert.equal(popup.opener, null)
  launch.open(web)
  launch.close()
  assert.deepEqual(calls, [['about:blank', '_blank'], web, 'closed'])
  assert.throws(() => prepareWhatsAppLaunch('web', { open() { return null } }), /emergentes/)
})
