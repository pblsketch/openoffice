import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// renderer-only dev server (embedded by shell via EPUB_RENDERER_URL for HMR; no standalone Electron)
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  // the book translation core's pdf-structure helpers (see src/renderer/translate/pdf-structure-browser.ts)
  resolve: {
    alias: [
      {
        find: /^@genoffice\/pdf-structure$/,
        replacement: fileURLToPath(
          new URL('./src/renderer/translate/pdf-structure-browser.ts', import.meta.url),
        ),
      },
    ],
  },
  server: {
    port: Number(process.env.EPUB_DEV_PORT) || 5181,
    strictPort: true,
  },
})
