// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { dropCdnFallback } from '../scripts/excalidraw-fonts.mjs'

const require = createRequire(import.meta.url)
// the production build is what the app bundles; a test run may resolve the development one
const prodDir = join(dirname(require.resolve('@excalidraw/excalidraw')), '..', 'prod')

describe('the font CDN fallback', () => {
  it('is found and dropped in the pinned library build', () => {
    const chunks = readdirSync(prodDir)
      .filter((name) => name.endsWith('.js'))
      .map((name) => readFileSync(join(prodDir, name), 'utf8'))
      .filter((code) => code.includes('ASSETS_FALLBACK_URL'))
    expect(chunks.length).toBeGreaterThan(0)
    const patched = chunks.map(dropCdnFallback).filter((code) => code !== null)
    expect(patched).toHaveLength(1)
    expect(patched[0]).not.toMatch(/\.push\(new URL\(\w+,\w+\.ASSETS_FALLBACK_URL\)\)/)
  })

  it('leaves code without the fallback alone', () => {
    expect(dropCdnFallback('const a = 1')).toBeNull()
  })
})
