import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The bridge script inside the draw.io frame: one classic script with a fixed
// name (out/bridge/bridge.js), loaded before draw.io's own scripts.
export default defineConfig({
  build: {
    outDir: resolve(__dirname, 'out/bridge'),
    emptyOutDir: true,
    target: 'chrome120',
    minify: false,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'src/bridge/bridge.ts'),
      formats: ['iife'],
      name: 'ieumDiagramBridge',
      fileName: () => 'bridge.js',
    },
  },
})
