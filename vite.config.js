import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// CSP estricta solo en build (en dev Vite necesita scripts inline para HMR).
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-src https://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: 'inject-csp',
      transformIndexHtml(html) {
        if (command !== 'build') return html
        return html.replace('</head>', `    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n  </head>`)
      },
    },
  ],
}))
