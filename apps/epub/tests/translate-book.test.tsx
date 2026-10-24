/**
 * Book translation in the page (spec §8), against a fake main process: the
 * real engine reads the units and builds the result books, the real result
 * store keeps the translations in a temporary folder, and a fake model
 * answers on the AI stream. No real `claude` or `codex` is reached.
 *
 * Covered: the window's defaults and checks, the confirmation (calls, AI,
 * charge wording, same-language warning, "Save and translate" and a failed
 * save, what book translation sends before a subscription's first use), the
 * run (lock on and off around it, progress, result books, report with
 * "Open"), a save while the window is open (the start uses the saved book,
 * or shows the confirmation again when the calls changed), the tab unlocked
 * when a job cannot be launched, Stop with the partial export or "later",
 * the resume offer, translating again from the start, one job per book, and
 * what the AI panel's tool hears.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AiSettings } from '@genoffice/ai-provider'
import type { Lang } from '@genoffice/i18n'
import type { EpubApi } from '../src/shared/ipc'
import { LocaleProvider, useI18n } from '../src/renderer/i18n/locale'
import {
  BookTranslation,
  type BookTranslationHandle,
} from '../src/renderer/translate/BookTranslation'
import {
  PAID_SETTINGS,
  buildTranslateBook,
  createFakeBackend,
  fakeSubscription,
  prefixAnswer,
  type ChapterSource,
  type FakeBackend,
} from './helpers/translate-backend'

/** a launch failure of the job engine, for the unlock test; null = the real engine */
const engineFault = vi.hoisted(() => ({ launch: null as Error | null }))

vi.mock('../src/renderer/translate/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/renderer/translate/engine')>()
  return {
    ...real,
    startEpubTranslationJob: (...args: Parameters<typeof real.startEpubTranslationJob>) => {
      if (engineFault.launch) throw engineFault.launch
      return real.startEpubTranslationJob(...args)
    },
  }
})

let root: Root | null = null
let container: HTMLElement | null = null
const backends: FakeBackend[] = []

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container?.remove()
  container = null
  for (const b of backends.splice(0)) b.dispose()
  window.localStorage.clear()
  engineFault.launch = null
})

const SMALL_BOOK: ChapterSource[] = [
  { title: 'Chapter One', body: '<h1>Chapter One</h1>\n<p>First <b>bold</b> paragraph.</p>' },
  { title: 'Chapter Two', body: '<h1>Chapter Two</h1>\n<p>Second paragraph.</p>' },
]

/** three chapters with a paragraph too long to share a request: one call per paragraph */
const LONG_BOOK: ChapterSource[] = [1, 2, 3].map((n) => ({
  title: `Part ${n}`,
  body: `<p>${'word '.repeat(2600).trim()}</p>`,
}))

async function backend(
  chapters = SMALL_BOOK,
  o: Parameters<typeof createFakeBackend>[1] & { language?: string } = {},
): Promise<FakeBackend> {
  const b = await createFakeBackend(
    await buildTranslateBook(chapters, o.language ? { language: o.language } : {}),
    o,
  )
  backends.push(b)
  return b
}

interface Mounted {
  el: HTMLElement
  ref: RefObject<BookTranslationHandle | null>
  lock: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  windowOpen: ReturnType<typeof vi.fn>
  order: string[]
}

async function mount(
  b: FakeBackend | null,
  o: {
    lang?: Lang
    dirty?: boolean
    saveOk?: boolean
    fixedLayout?: boolean
  } = {},
): Promise<Mounted> {
  window.epubApi = {
    subscription: fakeSubscription(),
    onLanguageChanged: () => () => {},
  } as unknown as EpubApi
  const order: string[] = b?.events ?? []
  let dirty = o.dirty ?? false
  const lock = vi.fn(async (locked: boolean) => {
    order.push(`lock:${locked}`)
    return locked
  })
  const save = vi.fn(async () => {
    order.push('save')
    if (o.saveOk === false) return false
    dirty = false
    return true
  })
  const windowOpen = vi.fn()
  const ref = createRef<BookTranslationHandle>()
  const summary = b ? { ...b.summary, fixedLayout: o.fixedLayout ?? false } : null
  function Harness() {
    const { lang, t } = useI18n()
    return (
      <BookTranslation
        ref={ref}
        book={summary}
        filePath={b ? 'C:/books/test.epub' : null}
        lang={lang}
        t={t}
        api={b?.api ?? null}
        isDirty={() => dirty}
        save={save}
        lock={lock}
        onWindowOpen={windowOpen}
      />
    )
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <LocaleProvider initial={o.lang ?? 'en'}>
        <Harness />
      </LocaleProvider>,
    )
  })
  await settle()
  return { el: container, ref, lock, save, windowOpen, order }
}

async function settle(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) await act(() => new Promise((r) => setTimeout(r, 5)))
}

async function until(check: () => boolean, what: string, tries = 400): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (check()) return
    await act(() => new Promise((r) => setTimeout(r, 10)))
  }
  throw new Error(`timed out waiting for ${what}`)
}

const q = (el: HTMLElement, selector: string) => el.querySelector<HTMLElement>(selector)

async function click(el: HTMLElement | null): Promise<void> {
  if (!el) throw new Error('nothing to click')
  await act(async () => el.click())
  await settle(2)
}

async function pick(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle(2)
}

/** open the window and wait for the units of the book */
async function openWindow(m: Mounted, lang: string | null = null): Promise<void> {
  let answer: unknown
  await act(async () => {
    answer = m.ref.current!.requestOpen({ lang, chapters: null })
  })
  expect(answer).toEqual({ opened: true })
  await until(() => !!q(m.el, '[data-units]') || !!q(m.el, '[data-error="no-units"]'), 'units')
}

/** choose the default place of every chosen result and go to the confirmation */
async function toConfirm(m: Mounted): Promise<void> {
  for (const button of m.el.querySelectorAll<HTMLElement>('[data-action^="pick-"]')) {
    await click(button)
  }
  await click(q(m.el, '[data-action="next"]'))
  await until(() => q(m.el, '[data-calls]')?.dataset.calls !== '', 'the estimate')
  await until(() => !!q(m.el, '[data-route="ready"]') || !!q(m.el, '[data-nothing]'), 'the route')
}

async function startAndFinish(m: Mounted): Promise<void> {
  await click(q(m.el, '[data-action="start"]'))
  await until(() => !!q(m.el, '[data-action="close-report"]'), 'the report')
}

describe('the book translation window', () => {
  it('opens on request with the UI language, every chapter, and sends nothing', async () => {
    const b = await backend()
    const m = await mount(b, { lang: 'ko' })
    await openWindow(m)
    const select = q(m.el, '[data-field="language"]') as HTMLSelectElement
    expect(select.value).toBe('ko')
    const boxes = m.el.querySelectorAll<HTMLInputElement>('[data-field^="chapter-"]')
    expect(boxes).toHaveLength(2)
    expect([...boxes].every((box) => box.checked && !box.disabled)).toBe(true)
    expect(m.el.textContent).toContain('Chapter One')
    expect(b.aiStream).not.toHaveBeenCalled()
    expect(m.lock).not.toHaveBeenCalled()
  })

  it('tells the page while it is open, so automatic saves wait', async () => {
    const b = await backend()
    const m = await mount(b)
    expect(m.windowOpen).not.toHaveBeenCalled()
    await openWindow(m)
    expect(m.windowOpen.mock.calls).toEqual([[true]])
    await click(q(m.el, '[data-action="cancel"]'))
    expect(m.windowOpen.mock.calls).toEqual([[true], [false]])
  })

  it('defaults to English when the book is in the UI language', async () => {
    const b = await backend(SMALL_BOOK, { language: 'ko' })
    const m = await mount(b, { lang: 'ko' })
    await openWindow(m)
    expect((q(m.el, '[data-field="language"]') as HTMLSelectElement).value).toBe('en')
  })

  it('keeps a damaged chapter out of the choice and says why', async () => {
    const b = await backend([SMALL_BOOK[0]!, { title: 'Broken', body: '', broken: true }])
    const m = await mount(b)
    await openWindow(m)
    const row = q(m.el, '[data-chapter="1"]')!
    expect(row.dataset.blocked).toBe('broken')
    expect((q(row, 'input') as HTMLInputElement).disabled).toBe(true)
    expect(row.textContent).toContain('Damaged chapter')
  })

  it('needs a place for each result and refuses the book itself', async () => {
    const b = await backend()
    const m = await mount(b)
    await openWindow(m)
    await click(q(m.el, '[data-action="next"]'))
    expect(q(m.el, '[data-error="results"]')?.textContent).toContain('Choose where to save')
    b.picks.push({ ok: false, path: 'C:/books/test.epub', reason: 'source' })
    await click(q(m.el, '[data-action="pick-translated"]'))
    expect(q(m.el, '[data-refused="source"]')).not.toBeNull()
    await click(q(m.el, '[data-action="pick-translated"]'))
    expect(q(m.el, '[data-location]')?.dataset.location).toMatch(/translated\.en\.epub$/)
    // both kinds suggested with their default names
    await click(q(m.el, '[data-field="kind-bilingual"]'))
    expect(m.el.textContent).toContain('test.en.bilingual.epub')
    await click(q(m.el, '[data-action="pick-bilingual"]'))
    await click(q(m.el, '[data-action="next"]'))
    expect(q(m.el, '[data-confirm]')).not.toBeNull()
  })
})

describe('the chosen places', () => {
  it('are chosen again after the language changes (the names carry it)', async () => {
    const b = await backend()
    const m = await mount(b)
    await openWindow(m)
    await click(q(m.el, '[data-action="pick-translated"]'))
    expect(q(m.el, '[data-location]')?.dataset.location).toMatch(/\.en\.epub$/)
    await pick(q(m.el, '[data-field="language"]') as HTMLSelectElement, 'ja')
    expect(q(m.el, '[data-location]')?.dataset.location).toBe('')
    expect(m.el.textContent).toContain('test.ja.epub')
  })
})

describe('the confirmation', () => {
  it('shows the calls, the AI and a same-language warning; no charge on a subscription', async () => {
    const b = await backend()
    const m = await mount(b, { lang: 'en' })
    await openWindow(m)
    await toConfirm(m)
    expect(Number(q(m.el, '[data-calls]')!.dataset.calls)).toBeGreaterThan(0)
    expect(q(m.el, '[data-route="ready"]')!.dataset.provider).toBe('claude-code')
    expect(q(m.el, '[data-same-language]')).not.toBeNull()
    expect(q(m.el, '[data-paid]')).toBeNull()
    expect(q(m.el, '[data-action="start"]')!.textContent).toBe('Start')
    expect(b.aiStream).not.toHaveBeenCalled()
  })

  it('says what book translation sends before a subscription is used the first time', async () => {
    const b = await backend(SMALL_BOOK, {
      settings: { provider: 'claude-code' } as unknown as AiSettings,
    })
    const m = await mount(b, { lang: 'en' })
    await openWindow(m, 'ko')
    await toConfirm(m)
    await until(() => !!q(m.el, '[data-notice="book"]'), 'the notice')
    expect(q(m.el, '[data-notice="book"]')!.textContent).toBe(
      'Book translation sends the AI the text of the chosen chapters (paragraphs with placeholders for their formatting), the book title and the table of contents entries.',
    )
    // the PDF editor's sentence is not this editor's
    expect(m.el.textContent).not.toContain('PDF editor')
    expect(b.aiStream).not.toHaveBeenCalled()
  })

  it('names the charge on a paid route', async () => {
    const b = await backend(SMALL_BOOK, { settings: PAID_SETTINGS })
    const m = await mount(b, { lang: 'ko' })
    await openWindow(m)
    await toConfirm(m)
    expect(q(m.el, '[data-paid]')?.textContent).toContain('요금이 부과됩니다')
    expect(q(m.el, '[data-same-language]')).toBeNull()
  })

  it('with unsaved changes it is "Save and translate", and a failed save starts nothing', async () => {
    const b = await backend()
    const m = await mount(b, { dirty: true, saveOk: false })
    await openWindow(m, 'ko')
    await toConfirm(m)
    const start = q(m.el, '[data-action="start"]')!
    expect(start.textContent).toBe('Save and translate')
    expect(q(m.el, '[data-unsaved]')).not.toBeNull()
    await click(start)
    await settle()
    expect(m.save).toHaveBeenCalledTimes(1)
    expect(q(m.el, '[data-error="start"]')?.textContent).toContain('could not be saved')
    expect(b.aiStream).not.toHaveBeenCalled()
    expect(m.lock).not.toHaveBeenCalled()
  })
})

describe('a run', () => {
  it('saves first, locks, translates, writes the results, unlocks and reports', async () => {
    const b = await backend()
    const m = await mount(b, { dirty: true })
    await openWindow(m, 'ko')
    await click(q(m.el, '[data-field="kind-bilingual"]'))
    await toConfirm(m)
    await startAndFinish(m)
    // the order: save, lock, model calls, two result books, unlock
    expect(m.order[0]).toBe('save')
    expect(m.order[1]).toBe('lock:true')
    expect(m.order.filter((s) => s === 'write')).toHaveLength(2)
    expect(m.order.at(-1)).toBe('lock:false')
    expect(m.order.indexOf('ai')).toBeGreaterThan(m.order.indexOf('lock:true'))
    expect(m.order.lastIndexOf('ai')).toBeLessThan(m.order.indexOf('write'))
    // the results are built from the stored translation of the saved book
    expect(b.writeTranslated.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ kind: 'translated', lang: 'ko', docHash: b.docHash }),
      expect.objectContaining({ kind: 'bilingual', lang: 'ko', docHash: b.docHash }),
    ])
    expect(Number(q(m.el, '[data-translated]')!.dataset.translated)).toBeGreaterThan(0)
    const opens = m.el.querySelectorAll<HTMLElement>('[data-action="open-result"]')
    expect(opens).toHaveLength(2)
    await click(opens[1]!)
    expect(b.openSourcePath).toHaveBeenCalledWith(opens[1]!.dataset.path)
    // the job record says the translation is complete
    expect((await b.store.unfinishedJobs(b.docHash)).length).toBe(0)
  })

  it('answers the AI panel: opened, running while it runs, unavailable without a book', async () => {
    const b = await backend(SMALL_BOOK, { answer: () => null })
    const m = await mount(b)
    await openWindow(m, 'ko')
    await toConfirm(m)
    await click(q(m.el, '[data-action="start"]'))
    await until(() => b.aiStream.mock.calls.length > 0, 'a call')
    let answer: unknown
    await act(async () => {
      answer = m.ref.current!.requestOpen({ lang: 'ko', chapters: null })
    })
    expect(answer).toMatchObject({ running: { done: 0 } })
    expect(q(m.el, '[data-job-state="running"]')).not.toBeNull()
    await click(q(m.el, '[data-action="stop-job"]'))
    await until(() => !!q(m.el, '[data-job-state="stopped"]'), 'the stop')
    expect(m.lock.mock.calls.map((c) => c[0])).toEqual([true, false])

    await act(async () => root?.unmount())
    root = null
    const none = await mount(null)
    expect(none.ref.current!.requestOpen({ lang: null, chapters: null })).toEqual({
      unavailable: true,
    })
  })

  it('does not open for a fixed-layout book', async () => {
    const b = await backend()
    const m = await mount(b, { fixedLayout: true })
    expect(m.ref.current!.requestOpen({ lang: 'ko', chapters: null })).toEqual({
      unavailable: true,
    })
    expect(q(m.el, '[role="dialog"]')).toBeNull()
  })

  it('stopping offers what is translated so far as a book, through this request only', async () => {
    const b = await backend(LONG_BOOK, {
      answer: (blocks, call) => (call === 0 ? prefixAnswer()(blocks, call) : null),
    })
    const m = await mount(b)
    await openWindow(m, 'ko')
    await toConfirm(m)
    await click(q(m.el, '[data-action="start"]'))
    await until(() => b.calls.length >= 3, 'three calls')
    await click(q(m.el, '[data-action="stop-job"]'))
    await until(() => !!q(m.el, '[data-action="export-partial"]'), 'the stop choices')
    // Stop ends the job's own streams, not the AI panel's other calls
    expect(b.aiStreamCancelRequest).toHaveBeenCalled()
    expect(b.aiStreamCancel).not.toHaveBeenCalled()
    expect(q(m.el, '[data-action="continue-later"]')).not.toBeNull()
    expect(m.lock.mock.calls.map((c) => c[0])).toEqual([true, false])
    await click(q(m.el, '[data-action="export-partial"]'))
    await until(() => !!q(m.el, '[data-partial]'), 'the partial report')
    expect(b.writeTranslated).toHaveBeenCalledTimes(1)
    expect(m.el.textContent).toContain('not translated yet')
    expect(m.lock.mock.calls.map((c) => c[0])).toEqual([true, false, true, false])
  })

  it('"Continue later" keeps the stored part and writes nothing', async () => {
    const b = await backend(LONG_BOOK, {
      answer: (blocks, call) => (call === 0 ? prefixAnswer()(blocks, call) : null),
    })
    const m = await mount(b)
    await openWindow(m, 'ko')
    await toConfirm(m)
    await click(q(m.el, '[data-action="start"]'))
    await until(() => b.calls.length >= 3, 'three calls')
    await click(q(m.el, '[data-action="stop-job"]'))
    await until(() => !!q(m.el, '[data-action="continue-later"]'), 'the stop choices')
    await click(q(m.el, '[data-action="continue-later"]'))
    expect(q(m.el, '[data-strip="job"]')).toBeNull()
    expect(b.writeTranslated).not.toHaveBeenCalled()
    const jobs = await b.store.unfinishedJobs(b.docHash)
    expect(jobs).toEqual([
      expect.objectContaining({ kind: 'translate', lang: 'ko', state: 'stopped' }),
    ])
  })

  it('refuses to start while another program translates the book', async () => {
    const b = await backend()
    await b.store.writeJob(b.docHash, {
      kind: 'translate',
      lang: 'ja',
      state: 'running',
      progress: { done: 2, total: 9 },
    })
    const m = await mount(b)
    await openWindow(m, 'ko')
    await toConfirm(m)
    await click(q(m.el, '[data-action="start"]'))
    await until(() => !!q(m.el, '[data-error="start"]'), 'the refusal')
    expect(q(m.el, '[data-error="start"]')?.textContent).toContain('already being translated (2/9)')
    expect(b.aiStream).not.toHaveBeenCalled()
    expect(m.lock).not.toHaveBeenCalled()
  })
})

/** SMALL_BOOK with the second paragraph changed: the same calls */
const EDITED_BOOK: ChapterSource[] = [
  SMALL_BOOK[0]!,
  { title: 'Chapter Two', body: '<h1>Chapter Two</h1>\n<p>Second paragraph, edited.</p>' },
]

describe('a save while the window is open', () => {
  it('starts on the saved book: its hash, its units and its result books', async () => {
    const b = await backend()
    const m = await mount(b)
    await openWindow(m, 'ko')
    await toConfirm(m)
    const opened = b.docHash
    // an automatic save or Ctrl+S wrote the book meanwhile
    await b.resave(await buildTranslateBook(EDITED_BOOK))
    expect(b.docHash).not.toBe(opened)
    await startAndFinish(m)
    expect(q(m.el, '[data-error="start"]')).toBeNull()
    expect(m.save).not.toHaveBeenCalled()
    const sent = b.calls.flat().map((block) => block.text)
    expect(sent.join('\n')).toContain('Second paragraph, edited.')
    expect(sent.join('\n')).not.toContain('Second paragraph.')
    // stored and written under the saved book's hash: nothing comes out untranslated
    expect(b.writeTranslated.mock.calls.map((c) => c[0].docHash)).toEqual([b.docHash])
    expect(q(m.el, '[data-report="untranslated"]')).toBeNull()
    expect(Number(q(m.el, '[data-translated]')!.dataset.translated)).toBeGreaterThan(0)
    expect((await b.store.readTranslation(b.docHash, 'ko'))?.blocks.size).toBe(sent.length)
    expect(await b.store.readTranslation(opened, 'ko')).toBeNull()
    expect(m.lock.mock.calls.map((c) => c[0])).toEqual([true, false])
  })

  it('shows the confirmation again when the save changed the calls, and starts nothing', async () => {
    const b = await backend()
    const m = await mount(b)
    await openWindow(m, 'ko')
    await toConfirm(m)
    const shown = Number(q(m.el, '[data-calls]')!.dataset.calls)
    await b.resave(await buildTranslateBook(LONG_BOOK.slice(0, 2)))
    await click(q(m.el, '[data-action="start"]'))
    await until(() => !!q(m.el, '[data-error="start"]'), 'the message')
    expect(q(m.el, '[data-error="start"]')!.textContent).toContain(
      'The book was saved after this window opened',
    )
    expect(b.aiStream).not.toHaveBeenCalled()
    expect(m.lock).not.toHaveBeenCalled()
    // the new numbers, counted from the saved book
    await until(() => Number(q(m.el, '[data-calls]')?.dataset.calls) > shown, 'the new estimate')
    const counted = Number(q(m.el, '[data-calls]')!.dataset.calls)
    await startAndFinish(m)
    expect(b.calls.length).toBe(counted)
    expect(b.writeTranslated.mock.calls.map((c) => c[0].docHash)).toEqual([b.docHash])
    expect(q(m.el, '[data-report="untranslated"]')).toBeNull()
  })
})

describe('a job that cannot be launched', () => {
  it('unlocks the tab and says why', async () => {
    const b = await backend()
    const m = await mount(b)
    await openWindow(m, 'ko')
    await toConfirm(m)
    engineFault.launch = new Error('the engine broke')
    await click(q(m.el, '[data-action="start"]'))
    await until(() => !!q(m.el, '[data-error="start"]'), 'the message')
    expect(q(m.el, '[data-error="start"]')!.textContent).toContain('the engine broke')
    expect(m.lock.mock.calls.map((c) => c[0])).toEqual([true, false])
    expect(b.aiStream).not.toHaveBeenCalled()
    // the window stays: the user can try again
    expect(q(m.el, '[data-confirm]')).not.toBeNull()
    engineFault.launch = null
    await startAndFinish(m)
    expect(m.lock.mock.calls.map((c) => c[0])).toEqual([true, false, true, false])
  })
})

describe('resuming and starting over', () => {
  it('offers an unfinished translation once; Continue only opens the window', async () => {
    const b = await backend()
    await b.store.writeJob(b.docHash, {
      kind: 'translate',
      lang: 'ko',
      state: 'stopped',
      progress: { done: 1, total: 4 },
    })
    const m = await mount(b)
    await until(() => !!q(m.el, '[data-strip="resume"]'), 'the offer')
    expect(q(m.el, '[data-strip="resume"]')!.textContent).toContain(
      'Unfinished translation (Korean) 25% — continue?',
    )
    await click(q(m.el, '[data-action="resume-job"]'))
    await until(() => !!q(m.el, '[data-units]'), 'the window')
    expect((q(m.el, '[data-field="language"]') as HTMLSelectElement).value).toBe('ko')
    expect(q(m.el, '[data-strip="resume"]')).toBeNull()
    await click(q(m.el, '[data-action="cancel"]'))
    await settle()
    expect(q(m.el, '[data-strip="resume"]')).toBeNull()
    expect(b.aiStream).not.toHaveBeenCalled()
  })

  it('"Later" on the offer hides it for this opening', async () => {
    const b = await backend()
    await b.store.writeJob(b.docHash, { kind: 'translate', lang: 'ko', state: 'stopped' })
    const m = await mount(b)
    await until(() => !!q(m.el, '[data-strip="resume"]'), 'the offer')
    await click(q(m.el, '[data-action="dismiss-resume"]'))
    expect(q(m.el, '[data-strip="resume"]')).toBeNull()
  })

  it('translates again from the start after asking, sending every block again', async () => {
    const b = await backend()
    const m = await mount(b)
    await openWindow(m, 'ko')
    await toConfirm(m)
    await startAndFinish(m)
    const first = b.calls.flat().length
    await click(q(m.el, '[data-action="close-report"]'))

    await openWindow(m, 'ko')
    await toConfirm(m)
    // everything is stored: nothing to send, the results can be written as they are
    expect(q(m.el, '[data-nothing]')).not.toBeNull()
    expect(q(m.el, '[data-action="export"]')).not.toBeNull()
    await click(q(m.el, '[data-action="restart"]'))
    expect(q(m.el, '[data-restart-confirm]')!.textContent).toContain('Delete the stored')
    expect(b.calls.flat().length).toBe(first)
    await click(q(m.el, '[data-action="restart-yes"]'))
    await until(() => !!q(m.el, '[data-action="close-report"]'), 'the second report')
    expect(b.calls.flat().length).toBe(first * 2)
  })
})
