import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  // Bundle everything into the shell main (same policy as apps/docs): the
  // imported docs/sheets main modules are TS source with no build artifacts,
  // so externalizing them would break Node ESM resolution at runtime.
  main: {
    // node:sqlite is a Node 22+ builtin the bundler's builtin list may predate
    build: { rollupOptions: { external: ['node:sqlite'] } },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          // dedicated preload for the auto-update window
          update: resolve(__dirname, 'src/preload/update.ts'),
          // dedicated preload for the PDF password prompt window
          'pdf-password': resolve(__dirname, 'src/preload/pdf-password.ts'),
          // dedicated preload for the generate window (see src/main/generate/generate-window.ts)
          generate: resolve(__dirname, 'src/preload/generate.ts'),
          // dedicated preload for the PDF tools window (see src/main/pdf-tools/pdf-tools-window.ts)
          'pdf-tools': resolve(__dirname, 'src/preload/pdf-tools.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // strong-guidance update window (see src/main/update-window.ts)
          update: resolve(__dirname, 'src/renderer/update.html'),
          // PDF password prompt window (see src/main/pdf-password-dialog.ts)
          'pdf-password': resolve(__dirname, 'src/renderer/pdf-password.html'),
          // generate window (see src/main/generate/generate-window.ts)
          generate: resolve(__dirname, 'src/renderer/generate.html'),
          // PDF tools window (see src/main/pdf-tools/pdf-tools-window.ts)
          'pdf-tools': resolve(__dirname, 'src/renderer/pdf-tools.html'),
        },
      },
    },
    server: {
      port: Number(process.env.SHELL_DEV_PORT) || 5199,
      strictPort: Boolean(process.env.SHELL_DEV_PORT),
    },
  },
})
