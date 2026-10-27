import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    // @genoffice/* workspace packages ship TS source (no build step, no
    // compiled entry point) — externalizing them makes Node's ESM loader try
    // to resolve their relative imports at runtime and fail. Bundle those;
    // externalize everything else (Electron, zod, node builtins).
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@genoffice/ai-provider',
          '@genoffice/agent-core',
          '@genoffice/ai-search',
          '@genoffice/docx-engine',
          '@genoffice/file-parse',
          '@genoffice/font-metrics',
          '@genoffice/electron-utils',
          '@genoffice/i18n',
          '@genoffice/pptx-render',
          '@genoffice/ui',
          '@genoffice/xlsx-gateway',
        ],
      }),
    ],
  },
  preload: {
    // Sandboxed preload scripts cannot require arbitrary npm packages at
    // runtime, so the drop-open bridge and the subscription channel names
    // (@genoffice/ai-provider/browser, which reaches @genoffice/i18n for the
    // product name) must be bundled, not externalized.
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@genoffice/electron-utils', '@genoffice/ai-provider', '@genoffice/i18n'],
      }),
    ],
  },
  renderer: {
    plugins: [react()],
    // one Yjs for the co-editing session's state and presence (two copies break sync)
    resolve: { dedupe: ['yjs'] },
  },
})
