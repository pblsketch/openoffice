import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { excalidrawFonts } from './scripts/excalidraw-fonts.mjs'

const PUBLIC_DIR = resolve(__dirname, 'public')

// renderer-only dev server (embedded by shell via EXCALIDRAW_RENDERER_URL for HMR; no standalone Electron)
export default defineConfig({
  root: 'src/renderer',
  plugins: [react(), excalidrawFonts(PUBLIC_DIR)],
  publicDir: PUBLIC_DIR,
  server: {
    port: Number(process.env.EXCALIDRAW_DEV_PORT) || 5181,
    strictPort: true,
  },
})
