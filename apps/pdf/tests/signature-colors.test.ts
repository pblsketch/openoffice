/**
 * Signature ink color: black by default, kept apart from the drawing pen,
 * remembered, and offered as swatches in the signature dialog.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DRAW_COLORS } from '../src/renderer/DrawLayer'
import { SignatureDialog } from '../src/renderer/SignatureDialog'
import type { TFunc } from '../src/renderer/i18n/locale'
import {
  DEFAULT_SIGN_COLOR,
  SIGN_COLORS,
  parseSignColor,
  signColorName,
} from '../src/renderer/signature-colors'

describe('signature colors', () => {
  it('defaults to black, not the red the drawing pen starts with', () => {
    expect(signColorName(DEFAULT_SIGN_COLOR)).toBe('black')
    expect(signColorName(DRAW_COLORS[0]!.rgb)).toBe('red')
    expect(SIGN_COLORS.map((c) => c.name)).toEqual(['black', 'blue', 'red'])
  })

  it('reads back a remembered color and falls back to black on bad storage', () => {
    expect(parseSignColor(JSON.stringify([0.1, 0.24, 0.62]))).toEqual([0.1, 0.24, 0.62])
    for (const raw of [null, '', 'not json', '[1,2]', '[0,0,2]', '{"r":0}', '["a",0,0]']) {
      expect(parseSignColor(raw)).toEqual(DEFAULT_SIGN_COLOR)
    }
  })

  it('names only the swatch colors; a custom pick has no name', () => {
    expect(signColorName([0.1, 0.24, 0.62])).toBe('blue')
    expect(signColorName([0.5, 0.2, 0.7])).toBeNull()
  })
})

// Identity translator: keeps the test independent of locale data
const t = ((key: string) => key) as unknown as TFunc

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  ;(window as unknown as { pdfApi: unknown }).pdfApi = {
    listSavedSignatures: () => Promise.resolve([]),
    removeSavedSignature: () => Promise.resolve(),
    addSavedSignature: () => Promise.resolve(),
  }
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function renderSign(
  color: [number, number, number],
  onColorChange: (c: [number, number, number]) => void,
) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      createElement(SignatureDialog, {
        t,
        color,
        onColorChange,
        onCancel: () => {},
        onConfirm: () => {},
      }),
    )
    await Promise.resolve()
  })
  return container
}

describe('SignatureDialog color row', () => {
  it('marks the current swatch and hands a picked swatch to the caller', async () => {
    const onColorChange = vi.fn()
    const host = await renderSign([...DEFAULT_SIGN_COLOR], onColorChange)
    const swatches = host.querySelectorAll<HTMLButtonElement>('.pdf-sign-color')
    expect([...swatches].map((b) => b.getAttribute('aria-label'))).toEqual([
      'signColorBlack',
      'signColorBlue',
      'signColorRed',
      'moreColors',
    ])
    expect(swatches[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(swatches[1]!.getAttribute('aria-pressed')).toBe('false')
    await act(async () => {
      swatches[1]!.click()
    })
    expect(onColorChange).toHaveBeenCalledWith([0.1, 0.24, 0.62])
  })

  it('shows a custom color on the more-colors swatch and opens the picker there', async () => {
    const host = await renderSign([0.5, 0.2, 0.7], () => {})
    const more = host.querySelector<HTMLButtonElement>('.pdf-sign-color-more')!
    expect(more.getAttribute('aria-pressed')).toBe('true')
    expect(more.style.background).toBe('rgb(128, 51, 179)')
    await act(async () => {
      more.click()
    })
    expect(host.querySelector('.pdf-color-popover')).not.toBeNull()
  })

  it('hides the row for an uploaded image, which keeps its own colors', async () => {
    const host = await renderSign([...DEFAULT_SIGN_COLOR], () => {})
    const tabs = host.querySelectorAll<HTMLButtonElement>('.pdf-sign-tab')
    await act(async () => {
      tabs[1]!.click()
    })
    expect(host.querySelector('.pdf-sign-colors')).not.toBeNull()
    await act(async () => {
      tabs[2]!.click()
    })
    expect(host.querySelector('.pdf-sign-colors')).toBeNull()
  })
})
