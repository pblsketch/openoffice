import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

/**
 * The engine is bundled into the renderer as well as run from Node, so nothing
 * under src/ may reach for a Node builtin, `Buffer` or `require`. (The DOM is
 * kept out by the type check: this package compiles without the DOM library.)
 */
describe('src/ runs in a browser and in Node alike', () => {
  const files = sourceFiles(SRC).filter((file) => file.endsWith('.ts'))

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((file) => [file.slice(SRC.length + 1), file]))('%s', (_name, file) => {
    const code = readFileSync(file, 'utf8')
    expect(code).not.toMatch(/from\s+['"]node:/)
    expect(code).not.toMatch(/from\s+['"](?:fs|path|crypto|zlib|buffer|stream|util|os)['"]/)
    // a dynamic or bare import of a builtin
    expect(code).not.toMatch(
      /\bimport\s*\(?\s*['"](?:node:|(?:fs|path|crypto|zlib|buffer|stream|util|os)['"])/,
    )
    expect(code).not.toMatch(/\brequire\s*\(/)
    expect(code).not.toMatch(/\bBuffer\b/)
    expect(code).not.toMatch(/\bprocess\./)
    expect(code).not.toMatch(/\bglobalThis\s*(?:\.\s*|\[\s*['"`])(?:process|Buffer)\b/)
  })
})
