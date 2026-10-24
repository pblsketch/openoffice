import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// The page runs the book translation core; its pdf-structure helpers come from the
// environment-free modules (see src/renderer/translate/pdf-structure-browser.ts).
const pageAlias = [
  {
    find: /^@genoffice\/pdf-structure$/,
    replacement: fileURLToPath(
      new URL('./src/renderer/translate/pdf-structure-browser.ts', import.meta.url),
    ),
  },
]

export default defineConfig({
  // @genoffice/i18n and @genoffice/electron-utils ship as TS source — must be bundled
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@genoffice/i18n', '@genoffice/electron-utils'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@genoffice/i18n', '@genoffice/electron-utils'] })],
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: pageAlias },
    server: {
      port: Number(process.env.EPUB_DEV_PORT) || 5181,
      strictPort: Boolean(process.env.EPUB_DEV_PORT),
    },
  },
})
