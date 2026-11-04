/**
 * Picture brightness and contrast in the patched rhwp engine (vendor/rhwp-core,
 * decision 0050). The case is a synthetic two-row table whose cells are filled
 * with the same grayscale picture: brightness -4 and contrast -25 in the first
 * row (the bar under a textbook's header), 70 and -50 (Hangul's watermark
 * effect) in the second. Hangul 2024 draws the first opaque, the original 255
 * and 125 grays becoming 213 and 115, and the second translucent.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'

const require = createRequire(import.meta.url)
const CORE = dirname(require.resolve('@rhwp/core'))

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(CORE, 'rhwp_bg.wasm')) })
})

function svg(): string {
  const bytes = readFileSync(
    join(__dirname, 'fixtures', 'picture-brightness-contrast-cell-fill.hwpx'),
  )
  return new HwpDocument(new Uint8Array(bytes)).renderPageSvg(0)
}

/** Each picture of the page, with whether a translucent group wraps it. */
function pictures(page: string): { translucent: boolean }[] {
  return [...page.matchAll(/(<g opacity="0\.17">\s*)?<image /g)].map((m) => ({
    translucent: m[1] !== undefined,
  }))
}

describe('picture brightness and contrast', () => {
  // rhwp devel bakes brightness and contrast into the picture's pixels (no SVG filter any
  // more; the grays come out 214 and 116 against Hangul's 213 and 115). What patch 0024
  // keeps is which pictures are drawn translucent: devel drew both.
  it('draws a slightly adjusted picture opaque', () => {
    const page = svg()
    expect(page).not.toContain('<filter')
    expect(pictures(page)[0]).toEqual({ translucent: false })
  })

  it('keeps the watermark effect translucent', () => {
    const page = svg()
    expect(pictures(page)).toEqual([{ translucent: false }, { translucent: true }])
    expect(page.match(/<g opacity="0\.17">/g)).toHaveLength(1)
  })
})
