import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { excalidrawFonts } from './scripts/excalidraw-fonts.mjs'

const PUBLIC_DIR = resolve(__dirname, 'public')

export default defineConfig({
  // these workspace packages ship as TS source — must be bundled
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@genoffice/i18n', '@genoffice/electron-utils', '@genoffice/excalidraw-engine'],
      }),
    ],
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@genoffice/i18n', '@genoffice/electron-utils', '@genoffice/excalidraw-engine'],
      }),
    ],
  },
  renderer: {
    plugins: [react(), excalidrawFonts(PUBLIC_DIR)],
    // the drawing library's fonts, copied from the package (scripts/excalidraw-fonts.mjs)
    publicDir: PUBLIC_DIR,
    server: {
      port: Number(process.env.EXCALIDRAW_DEV_PORT) || 5181,
      strictPort: Boolean(process.env.EXCALIDRAW_DEV_PORT),
    },
  },
})
