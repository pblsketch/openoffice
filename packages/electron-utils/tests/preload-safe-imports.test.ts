/**
 * The skills bridge runs in sandboxed preloads, where any Node module import
 * stops the whole preload from loading (every window bridge then disappears).
 * Its modules may import other modules only as types, or Node-free ones.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', 'src')
const PRELOAD_MODULES = [
  'user-skills-bridge.ts',
  'user-skills-channels.ts',
  'handoff-editors.ts',
  'outbound-bridge.ts',
  'outbound-channels.ts',
  'project-folder-bridge.ts',
]
const NODE_FREE = new Set([
  './user-skills-channels',
  './handoff-editors',
  './outbound-channels',
  // types and constants only (folder-api.ts imports nothing at runtime)
  '@genoffice/project-store/folder-api',
])

function runtimeImports(file: string): string[] {
  const text = readFileSync(join(SRC, file), 'utf8')
  const found: string[] = []
  for (const match of text.matchAll(/^import\s+(type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
    if (!match[1]) found.push(match[2] ?? '')
  }
  return found
}

describe('preload-safe bridges', () => {
  it('imports only electron and Node-free modules at runtime', () => {
    for (const file of PRELOAD_MODULES) {
      for (const spec of runtimeImports(file)) {
        expect(spec === 'electron' || NODE_FREE.has(spec), `${file} imports ${spec}`).toBe(true)
      }
    }
  })

  it('keeps the project folder contract free of runtime imports', () => {
    const contract = join(__dirname, '..', '..', 'project-store', 'src', 'folder-api.ts')
    const text = readFileSync(contract, 'utf8')
    for (const match of text.matchAll(/^import\s+(type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
      expect(match[1], `folder-api.ts imports ${match[2]} at runtime`).toBeTruthy()
    }
  })
})
