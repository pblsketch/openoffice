/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiComposer } from '../src/AiComposer'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const base = {
  value: 'hello',
  busy: false,
  placeholder: 'Ask',
  hintIdle: 'Enter to send',
  hintBusy: 'Working',
  sendLabel: 'Send',
  stopLabel: 'Stop',
  onChange: () => {},
  onSend: () => {},
  onStop: () => {},
}

function html(extra: Record<string, unknown>): string {
  act(() => root.render(createElement(AiComposer, { ...base, ...extra })))
  return host.innerHTML
}

describe('AiComposer footerBelow', () => {
  it('renders exactly the input box when the prop is absent', () => {
    const without = html({})
    expect(host.children).toHaveLength(1)
    expect(host.firstElementChild?.className).toBe('ai-input-box')
    expect(host.querySelector('.ai-input-below')).toBeNull()
    // null and false mean "no row" too, with the same markup
    expect(html({ footerBelow: null })).toBe(without)
    expect(html({ footerBelow: false })).toBe(without)
    expect(html({ footerBelow: undefined })).toBe(without)
  })

  it('puts the row after the box, outside it', () => {
    html({ footerBelow: createElement('span', { className: 'chip' }, 'Project') })
    expect([...host.children].map((c) => c.className)).toEqual(['ai-input-box', 'ai-input-below'])
    const box = host.querySelector('.ai-input-box')!
    expect(box.querySelector('.chip')).toBeNull()
    expect(host.querySelector('.ai-input-below > .chip')?.textContent).toBe('Project')
    // the box itself is unchanged by the row
    const boxHtml = box.outerHTML
    html({})
    expect(host.querySelector('.ai-input-box')!.outerHTML).toBe(boxHtml)
  })
})
