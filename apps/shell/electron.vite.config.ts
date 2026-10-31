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
    // the Google client for Drive (decision 0033) comes from the build's
    // environment only; without it the build offers no Drive at all
    define: {
      __GENOFFICE_GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GENOFFICE_GOOGLE_CLIENT_ID ?? ''),
      __GENOFFICE_GOOGLE_CLIENT_SECRET__: JSON.stringify(
        process.env.GENOFFICE_GOOGLE_CLIENT_SECRET ?? '',
      ),
    },
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
          // dedicated preload for the agent window (see src/main/agent/agent-window.ts)
          agent: resolve(__dirname, 'src/preload/agent.ts'),
          // dedicated preload for the attach-a-document window (see src/main/doc-picker/doc-picker-window.ts)
          'doc-picker': resolve(__dirname, 'src/preload/doc-picker.ts'),
          // dedicated preload for the Quick Look preview window (see src/main/quick-look/quick-look-window.ts)
          'quick-look': resolve(__dirname, 'src/preload/quick-look.ts'),
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
          // agent window (see src/main/agent/agent-window.ts)
          agent: resolve(__dirname, 'src/renderer/agent.html'),
          // attach-a-document window (see src/main/doc-picker/doc-picker-window.ts)
          'doc-picker': resolve(__dirname, 'src/renderer/doc-picker.html'),
          // Quick Look preview window (see src/main/quick-look/quick-look-window.ts)
          'quick-look': resolve(__dirname, 'src/renderer/quick-look.html'),
        },
      },
    },
    server: {
      port: Number(process.env.SHELL_DEV_PORT) || 5199,
      strictPort: Boolean(process.env.SHELL_DEV_PORT),
    },
  },
})
