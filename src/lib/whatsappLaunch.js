// Cambia únicamente el destino de apertura. No modifica el número ni el mensaje.
export function whatsappLaunchUrl(href, target = 'web') {
  if (!['web', 'app'].includes(target)) return null
  try {
    const url = new URL(href)
    const phone = url.pathname.replace(/^\//, '').replace(/\/$/, '')
    if (url.protocol !== 'https:' || url.hostname !== 'wa.me' || url.port || url.username || url.password
      || !/^[1-9][0-9]{7,14}$/.test(phone) || url.searchParams.getAll('text').length !== 1 || !url.searchParams.get('text')) return null
    return target === 'app' ? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(url.searchParams.get('text'))}` : href
  } catch { return null }
}

// En web se reserva la pestaña durante el clic para evitar el bloqueo de popups.
// En aplicación no se crea pestaña: el protocolo se abre en el contexto del panel.
export function prepareWhatsAppLaunch(target = 'web', browser = window) {
  if (!['web', 'app'].includes(target)) throw new Error('Elige Aplicación instalada o Navegador.')
  const popup = target === 'web' ? browser.open('about:blank', '_blank') : null
  if (target === 'web' && !popup) throw new Error('Permite ventanas emergentes para abrir WhatsApp en el navegador.')
  if (popup) popup.opener = null
  return {
    open(href) {
      const url = whatsappLaunchUrl(href, target)
      if (!url) throw new Error('No se pudo preparar un enlace válido de WhatsApp.')
      if (popup) popup.location.replace(url)
      else browser.location.assign(url)
    },
    close() { popup?.close() },
  }
}
