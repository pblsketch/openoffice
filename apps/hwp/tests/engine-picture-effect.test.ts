/**
 * Picture brightness and contrast in the patched rhwp engine (vendor/rhwp-core,
 * decision 0050). The case is a synthetic two-row table whose cells are filled
 * with the same grayscale picture: brightness -4 and contrast -25 in the first
 * row (the bar under a textbook's header), 70 and -50 (Hangul's watermark
 * effect) in the second. Hangul 2024 draws the first opaque, the original 255
 * and 125 grays becoming 213 and 115.
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

/** From the `<g filter=…>` wrapping a picture up to the picture itself. */
function wrapper(page: string, filter: string): string {
  const start = page.indexOf(`<g filter="url(#${filter})">`)
  expect(start, filter).toBeGreaterThanOrEqual(0)
  const rest = page.slice(start)
  return rest.slice(0, rest.indexOf('<image'))
}

describe('picture brightness and contrast', () => {
  it('draws a slightly adjusted picture opaque, the filter computed in sRGB', () => {
    const page = svg()
    // slope 0.75 and intercept 0.085 on sRGB values give Hangul's 213 and 115
    expect(page).toContain(
      '<filter id="rhwp-img-bc-b-4c-25" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="0.7500" intercept="0.0850"/>',
    )
    expect(wrapper(page, 'rhwp-img-bc-b-4c-25')).not.toContain('opacity')
  })

  it('keeps the watermark effect translucent', () => {
    const page = svg()
    expect(wrapper(page, 'rhwp-img-bc-b70c-50')).toContain('<g opacity="0.17">')
    expect(page.match(/<g opacity="0\.17">/g)).toHaveLength(1)
  })
})
