// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ColorPicker, eyedropperHex } from '../src/color-picker'

let root: Root | null = null

function mount(eyedropper: string | undefined, onPick = vi.fn()): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const strings = { themeColors: 'Theme', standardColors: 'Standard', eyedropper }
  act(() => root!.render(createElement(ColorPicker, { value: null, strings, onPick })))
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
  delete (window as unknown as { EyeDropper?: unknown }).EyeDropper
})

describe('eyedropperHex', () => {
  it('normalizes the picked value to #RRGGBB', () => {
    expect(eyedropperHex('#a1b2c3')).toBe('#A1B2C3')
    expect(eyedropperHex('rgba(255, 0, 16, 0.5)')).toBe('#FF0010')
    expect(eyedropperHex('transparent')).toBeNull()
  })
})

describe('ColorPicker eyedropper row', () => {
  it('stays hidden unless the caller asks for it and the browser can pick', () => {
    expect(mount('Eyedropper').querySelector('.gcp-eyedropper')).toBeNull()
    act(() => root?.unmount())
    ;(window as unknown as { EyeDropper: unknown }).EyeDropper = class {}
    expect(mount(undefined).querySelector('.gcp-eyedropper')).toBeNull()
  })

  it('emits the picked screen color', async () => {
    ;(window as unknown as { EyeDropper: unknown }).EyeDropper = class {
      open() {
        return Promise.resolve({ sRGBHex: '#0a0b0c' })
      }
    }
    const onPick = vi.fn()
    const c = mount('Eyedropper', onPick)
    const btn = c.querySelector<HTMLButtonElement>('.gcp-eyedropper')!
    expect(btn.textContent).toContain('Eyedropper')
    await act(async () => btn.click())
    expect(onPick).toHaveBeenCalledWith('#0A0B0C')
  })

  it('does nothing when the pick is cancelled', async () => {
    ;(window as unknown as { EyeDropper: unknown }).EyeDropper = class {
      open() {
        return Promise.reject(new DOMException('cancelled', 'AbortError'))
      }
    }
    const onPick = vi.fn()
    const c = mount('Eyedropper', onPick)
    await act(async () => c.querySelector<HTMLButtonElement>('.gcp-eyedropper')!.click())
    expect(onPick).not.toHaveBeenCalled()
  })
})
