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
]
const NODE_FREE = new Set(['./user-skills-channels', './handoff-editors', './outbound-channels'])

function runtimeImports(file: string): string[] {
  const text = readFileSync(join(SRC, file), 'utf8')
  const found: string[] = []
  for (const match of text.matchAll(/^import\s+(type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
    if (!match[1]) found.push(match[2] ?? '')
  }
  return found
}

describe('preload-safe skills bridge', () => {
  it('imports only electron and Node-free modules at runtime', () => {
    for (const file of PRELOAD_MODULES) {
      for (const spec of runtimeImports(file)) {
        expect(spec === 'electron' || NODE_FREE.has(spec), `${file} imports ${spec}`).toBe(true)
      }
    }
  })
})
