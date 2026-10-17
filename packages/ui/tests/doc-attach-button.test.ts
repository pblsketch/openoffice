/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { brandText, LANGS } from '@genoffice/i18n'
import { DocAttachButton, docPickedOf } from '../src/DocAttachButton'
import { DOC_ATTACH_STRINGS } from '../src/strings-doc-attach'

const BRIDGE_KEY = 'aiOfficeDocs'

const setBridge = (value: unknown) => {
  ;(globalThis as Record<string, unknown>)[BRIDGE_KEY] = value
}

describe('docPickedOf', () => {
  it('passes the picked paths, dropping anything that is not a string', () => {
    expect(docPickedOf({ ok: true, paths: ['C:/t/a.docx', 3] }, 'en')).toEqual({
      paths: ['C:/t/a.docx'],
      notes: [],
    })
  })

  it('says the list window is already open, and stays quiet otherwise', () => {
    expect(docPickedOf({ ok: false, reason: 'busy' }, 'ko').notes).toEqual([
      '목록 창이 이미 열려 있습니다',
    ])
    expect(docPickedOf({ ok: false, reason: 'cancelled' }, 'ko')).toEqual({
      paths: [],
      notes: [],
    })
    expect(docPickedOf({ ok: false, reason: 'unavailable' }, 'ko')).toEqual({
      paths: [],
      notes: [],
    })
    expect(docPickedOf(null, 'en')).toEqual({ paths: [], notes: [] })
  })
})

describe('doc-attach strings', () => {
  it('fills every language, and the button shows the product name', () => {
    expect(LANGS).toHaveLength(21)
    for (const lang of LANGS) {
      expect(DOC_ATTACH_STRINGS[lang].label.trim().length, lang).toBeGreaterThan(0)
      expect(DOC_ATTACH_STRINGS[lang].busy.trim().length, lang).toBeGreaterThan(0)
    }
    // the dictionary keeps the upstream token; the button produces the product name
    expect(DOC_ATTACH_STRINGS.en.label).toBe('Attach from GenOffice documents')
    expect(brandText(DOC_ATTACH_STRINGS.ko.label, 'ko')).toBe('이음오피스 문서에서 첨부')
  })
})

describe('DocAttachButton', () => {
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
    delete (globalThis as Record<string, unknown>)[BRIDGE_KEY]
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders nothing when the shell bridge is absent', () => {
    act(() => root.render(createElement(DocAttachButton, { lang: 'en', onPicked: vi.fn() })))
    expect(host.querySelector('button')).toBeNull()
  })

  it('renders nothing when the shell is not answering', async () => {
    setBridge({
      available: async () => false,
      pick: async () => ({ ok: false, reason: 'unavailable' }),
    })
    await act(async () => {
      root.render(createElement(DocAttachButton, { lang: 'en', onPicked: vi.fn() }))
    })
    expect(host.querySelector('button')).toBeNull()
  })

  it('calls onPicked with the paths, and locks the button while picking', async () => {
    let release: (v: unknown) => void = () => {}
    const pick = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          release = resolve
        }),
    )
    setBridge({ available: async () => true, pick })
    const onPicked = vi.fn()
    await act(async () => {
      root.render(createElement(DocAttachButton, { lang: 'zh', onPicked }))
    })
    const button = host.querySelector('button')!
    expect(button).not.toBeNull()
    expect(button.disabled).toBe(false)
    act(() => button.click())
    expect(button.disabled).toBe(true)
    await act(async () => {
      release({ ok: true, paths: ['C:/t/a.docx'] })
    })
    expect(onPicked).toHaveBeenCalledWith({ paths: ['C:/t/a.docx'], notes: [] })
    expect(button.disabled).toBe(false)
  })

  it('passes the already-open notice through, and stays quiet on cancel', async () => {
    const onPicked = vi.fn()
    setBridge({ available: async () => true, pick: async () => ({ ok: false, reason: 'busy' }) })
    await act(async () => {
      root.render(createElement(DocAttachButton, { lang: 'ko', onPicked }))
    })
    await act(async () => host.querySelector('button')!.click())
    expect(onPicked).toHaveBeenLastCalledWith({
      paths: [],
      notes: ['목록 창이 이미 열려 있습니다'],
    })

    setBridge({
      available: async () => true,
      pick: async () => ({ ok: false, reason: 'cancelled' }),
    })
    await act(async () => host.querySelector('button')!.click())
    expect(onPicked).toHaveBeenCalledTimes(1)
  })
})
