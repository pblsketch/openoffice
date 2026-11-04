import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** The one Node-only module, published as `@genoffice/drawio-model/node`. */
const NODE_ONLY = 'node-codec.ts'

/**
 * The read table, op checks and planning run in the editor's renderer and the
 * shell alike, so nothing under src/ except the Node codec may reach for a Node
 * builtin, `Buffer` or `require`. (The DOM is kept out by the type check: this
 * package compiles without the DOM library.)
 */
describe('src/ runs in a browser and in Node alike', () => {
  const files = readdirSync(SRC).filter((file) => file.endsWith('.ts') && file !== NODE_ONLY)

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files)('%s', (file) => {
    const code = readFileSync(join(SRC, file), 'utf8')
    expect(code).not.toMatch(/from\s+['"]node:/)
    expect(code).not.toMatch(/from\s+['"](?:fs|path|crypto|zlib|buffer|stream|util|os)['"]/)
    expect(code).not.toMatch(/\brequire\s*\(/)
    expect(code).not.toMatch(/\bBuffer\b/)
    expect(code).not.toMatch(/\bprocess\./)
  })

  it('keeps the Node codec out of the main entry', () => {
    const index = readFileSync(join(SRC, 'index.ts'), 'utf8')
    expect(index).not.toContain('node-codec')
    const pkg = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8'))
    expect(pkg.exports['./node']).toBe('./src/node-codec.ts')
  })
})
