/**
 * The easy explanation of a book (spec §5.5) in the translation window,
 * against the same fake main process as translate-book.test.tsx: the real
 * engine and result store, a fake model on the AI stream. No real `claude`
 * or `codex` is reached.
 *
 * Covered: the way chosen in the window ("Translate" by default; switching
 * sends nothing), the easy default language (the UI language, also for a book
 * written in it), the result names and their suggested file names, the
 * confirmation counted from the easy explanation's own records, a run that
 * hands the mode to the engine and writes every store request and job record
 * with it, the result books built as an easy explanation, the resume offer
 * made for each way on its own, and a plain translation that stays as it was.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { openEpub } from '@genoffice/epub-engine'
import type { Lang } from '@genoffice/i18n'
import type { EpubApi, EpubStoreWriteRequest } from '../src/shared/ipc'
import { LocaleProvider, useI18n } from '../src/renderer/i18n/locale'
import {
  BookTranslation,
  type BookTranslationHandle,
} from '../src/renderer/translate/BookTranslation'
import {
  buildTranslateBook,
  createFakeBackend,
  fakeSubscription,
  type ChapterSource,
  type FakeBackend,
} from './helpers/translate-backend'

/** the options every job was started with */
const launched = vi.hoisted(() => ({ options: [] as Array<Record<string, unknown>> }))

vi.mock('../src/renderer/translate/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/renderer/translate/engine')>()
  return {
    ...real,
    startEpubTranslationJob: (...args: Parameters<typeof real.startEpubTranslationJob>) => {
      launched.options.push(args[0] as unknown as Record<string, unknown>)
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
  launched.options.length = 0
  vi.restoreAllMocks()
})

const SMALL_BOOK: ChapterSource[] = [
  { title: 'Chapter One', body: '<h1>Chapter One</h1>\n<p>First <b>bold</b> paragraph.</p>' },
  { title: 'Chapter Two', body: '<h1>Chapter Two</h1>\n<p>Second paragraph.</p>' },
]

async function backend(language?: string): Promise<FakeBackend> {
  const b = await createFakeBackend(
    await buildTranslateBook(SMALL_BOOK, language ? { language } : {}),
  )
  backends.push(b)
  return b
}

/** the store writes the page sends, in order */
function recordWrites(b: FakeBackend): EpubStoreWriteRequest[] {
  const writes: EpubStoreWriteRequest[] = []
  const store = b.api.store as { write: (request: EpubStoreWriteRequest) => Promise<unknown> }
  const real = store.write
  store.write = (request) => {
    writes.push(request)
    return real(request)
  }
  return writes
}

interface Mounted {
  el: HTMLElement
  ref: RefObject<BookTranslationHandle | null>
}

async function mount(b: FakeBackend, lang: Lang = 'ko'): Promise<Mounted> {
  window.epubApi = {
    subscription: fakeSubscription(),
    onLanguageChanged: () => () => {},
  } as unknown as EpubApi
  const ref = createRef<BookTranslationHandle>()
  function Harness() {
    const { lang: ui, t } = useI18n()
    return (
      <BookTranslation
        ref={ref}
        book={b.summary}
        filePath="C:/books/test.epub"
        lang={ui}
        t={t}
        api={b.api}
        isDirty={() => false}
        save={async () => true}
        lock={async (locked) => locked}
      />
    )
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <LocaleProvider initial={lang}>
        <Harness />
      </LocaleProvider>,
    )
  })
  await settle()
  return { el: container, ref }
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
const input = (el: HTMLElement, field: string) =>
  q(el, `[data-field="${field}"]`) as HTMLInputElement
const language = (el: HTMLElement) => (q(el, '[data-field="language"]') as HTMLSelectElement).value

async function click(el: HTMLElement | null): Promise<void> {
  if (!el) throw new Error('nothing to click')
  await act(async () => el.click())
  await settle(2)
}

async function openWindow(m: Mounted, lang: string | null = null): Promise<void> {
  await act(async () => {
    m.ref.current!.requestOpen({ lang, chapters: null })
  })
  await until(() => !!q(m.el, '[data-units]'), 'units')
}

async function chooseEasy(m: Mounted): Promise<void> {
  await click(input(m.el, 'mode-easy'))
  expect(q(m.el, '[data-mode]')?.dataset.mode).toBe('easy')
}

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

describe('the way chosen in the book translation window', () => {
  it('is "Translate" by default; choosing the easy explanation sends nothing', async () => {
    const b = await backend()
    const m = await mount(b)
    await openWindow(m)
    expect(input(m.el, 'mode-translate').checked).toBe(true)
    expect(input(m.el, 'mode-easy').checked).toBe(false)
    expect(q(m.el, '[data-mode]')!.textContent).toContain('번역')
    expect(q(m.el, '[data-mode]')!.textContent).toContain('쉬운 풀이')
    expect(q(m.el, '[data-kind="translated"]')!.textContent).toContain('번역본')

    await chooseEasy(m)
    expect(input(m.el, 'mode-easy').checked).toBe(true)
    expect(b.aiStream).not.toHaveBeenCalled()
    expect(b.writeTranslated).not.toHaveBeenCalled()
  })

  it('defaults the easy explanation to the UI language, also for a book written in it', async () => {
    const b = await backend('ko')
    const m = await mount(b, 'ko')
    await openWindow(m)
    // a translation of a Korean book defaults to English
    expect(language(m.el)).toBe('en')
    await chooseEasy(m)
    expect(language(m.el)).toBe('ko')
    expect(m.el.textContent).toContain('풀이할 언어')
    await click(input(m.el, 'mode-translate'))
    expect(language(m.el)).toBe('en')
  })

  it('names the results of an easy explanation, and suggests their own file names', async () => {
    const b = await backend()
    const m = await mount(b, 'ko')
    await openWindow(m, 'ko')
    // the plain names first
    expect(q(m.el, '[data-kind="translated"]')!.textContent).toContain('test.ko.epub')

    await chooseEasy(m)
    await click(input(m.el, 'kind-bilingual'))
    expect(q(m.el, '[data-kind="translated"]')!.textContent).toContain('풀이본')
    expect(q(m.el, '[data-kind="bilingual"]')!.textContent).toContain('원문 다음에 풀이')
    expect(q(m.el, '[data-kind="translated"]')!.textContent).toContain('test.ko.쉬운 풀이.epub')
    expect(q(m.el, '[data-kind="bilingual"]')!.textContent).toContain(
      'test.ko.쉬운 풀이.bilingual.epub',
    )

    await click(q(m.el, '[data-action="pick-translated"]'))
    await click(q(m.el, '[data-action="pick-bilingual"]'))
    expect(b.pickResultTarget.mock.calls.map((c) => c[0])).toEqual([
      { kind: 'translated', lang: 'ko', defaultName: 'test.ko.쉬운 풀이.epub' },
      { kind: 'bilingual', lang: 'ko', defaultName: 'test.ko.쉬운 풀이.bilingual.epub' },
    ])
  })

  it('asks for the places again when the way changes (the names carry it)', async () => {
    const b = await backend()
    const m = await mount(b, 'ko')
    await openWindow(m, 'ko')
    await click(q(m.el, '[data-action="pick-translated"]'))
    expect(q(m.el, '[data-location]')!.dataset.location).not.toBe('')
    await chooseEasy(m)
    expect(q(m.el, '[data-location]')!.dataset.location).toBe('')
  })
})

describe('the confirmation of an easy explanation', () => {
  it('counts from the easy explanation’s records, not the translation’s', async () => {
    const b = await backend()
    const m = await mount(b, 'ko')
    // the whole book is translated into Korean
    await openWindow(m, 'ko')
    await toConfirm(m)
    await startAndFinish(m)
    await click(q(m.el, '[data-action="close-report"]'))

    await openWindow(m, 'ko')
    await toConfirm(m)
    expect(q(m.el, '[data-nothing]')).not.toBeNull()
    await click(q(m.el, '[data-action="cancel"]'))

    // the easy explanation of the same language has nothing stored yet
    await openWindow(m, 'ko')
    await chooseEasy(m)
    await toConfirm(m)
    expect(q(m.el, '[data-nothing]')).toBeNull()
    expect(q(m.el, '[data-done]')).toBeNull()
    expect(Number(q(m.el, '[data-calls]')!.dataset.calls)).toBeGreaterThan(0)
    expect(q(m.el, '.bt-title')!.textContent).toBe('쉬운 풀이 시작 전 확인')
    expect(q(m.el, '[data-language]')!.textContent).toContain('풀이할 언어')
    expect(q(m.el, '[data-action="start"]')!.textContent).toBe('시작')
  })

  it('reports blocks already explained and another AI from the easy records only', async () => {
    const b = await backend()
    const units = await b.api.translationUnits({})
    if (!units.ok) throw new Error('no units')
    const first = units.units[0]!
    await b.store.writeTranslationMeta(
      b.docHash,
      'ko',
      { provider: 'codex', model: 'other-model' },
      'easy',
    )
    await b.store.writeTranslationBlocks(
      b.docHash,
      'ko',
      [{ key: first.key, status: 'translated', text: 'easy text' }],
      'easy',
    )
    const m = await mount(b, 'ko')
    await openWindow(m, 'ko')
    await toConfirm(m)
    // a translation: nothing stored for it
    expect(q(m.el, '[data-done]')).toBeNull()
    expect(q(m.el, '[data-provider-change]')).toBeNull()
    await click(q(m.el, '[data-action="cancel"]'))

    await openWindow(m, 'ko')
    await chooseEasy(m)
    await toConfirm(m)
    expect(q(m.el, '[data-done]')!.dataset.done).toBe('1')
    expect(q(m.el, '[data-done]')!.textContent).toContain('이미 풀이되어')
    expect(q(m.el, '[data-provider-change]')!.textContent).toContain('보관된 쉬운 풀이')
    expect(q(m.el, '[data-action="restart"]')!.textContent).toBe('처음부터 다시 풀이')
  })

  it('does not warn that the target is the book’s own language', async () => {
    const b = await backend('ko')
    const m = await mount(b, 'ko')
    await openWindow(m)
    await chooseEasy(m)
    await toConfirm(m)
    expect(q(m.el, '[data-same-language]')).toBeNull()
  })
})

describe('an easy explanation run', () => {
  it('hands the mode to the engine, writes every store request with it, builds easy books', async () => {
    const b = await backend()
    const writes = recordWrites(b)
    const m = await mount(b, 'ko')
    await openWindow(m, 'ko')
    await chooseEasy(m)
    await click(input(m.el, 'kind-bilingual'))
    await toConfirm(m)
    await startAndFinish(m)

    expect(launched.options).toHaveLength(1)
    expect(launched.options[0]!.mode).toBe('easy')
    expect(b.systems.length).toBeGreaterThan(0)
    expect(b.systems.every((s) => s.includes('into an easy version'))).toBe(true)

    // every store write is the easy explanation's, the job record says so too
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.every((w) => w.mode === 'easy')).toBe(true)
    const jobs = writes.filter((w) => w.kind === 'job')
    expect(jobs.length).toBeGreaterThan(0)
    expect(jobs.every((w) => w.kind === 'job' && w.job.mode === 'easy')).toBe(true)
    // the results are kept apart from the translation
    expect((await b.store.readTranslation(b.docHash, 'ko', 'easy'))?.blocks.size).toBeGreaterThan(0)
    expect(await b.store.readTranslation(b.docHash, 'ko')).toBeNull()

    // the result books are built as an easy explanation
    const requests = b.writeTranslated.mock.calls.map((c) => c[0])
    expect(requests.map((r) => [r.kind, r.mode])).toEqual([
      ['translated', 'easy'],
      ['bilingual', 'easy'],
    ])
    for (const r of requests) {
      const opened = await openEpub(b.written.get(r.path)!)
      if (!opened.ok) throw new Error('the result did not open')
      // the translated book: `<title> (marker)`; the bilingual one: `<original> (<title> · marker)`
      expect(opened.book.metadata.titles[0]).toBe(
        r.kind === 'translated'
          ? 'KO: The Test Book (쉬운 풀이)'
          : 'The Test Book (KO: The Test Book · 쉬운 풀이)',
      )
      // the target language: the translated book is in it, the bilingual one adds it
      expect(opened.book.metadata.languages).toContain('ko')
      if (r.kind === 'translated') expect(opened.book.metadata.languages[0]).toBe('ko')
    }

    // the report says what was made
    expect(q(m.el, '.bt-report .bt-title')!.textContent).toBe('쉬운 풀이를 마쳤습니다')
    expect(q(m.el, '[data-output="translated"]')!.textContent).toContain('풀이본')
    expect(q(m.el, '[data-output="bilingual"]')!.textContent).toContain('원문 다음에 풀이')
  })

  it('a plain translation stays as it was: no mode anywhere', async () => {
    const b = await backend()
    const writes = recordWrites(b)
    const m = await mount(b, 'ko')
    await openWindow(m, 'ko')
    await toConfirm(m)
    await startAndFinish(m)
    expect(launched.options[0]!.mode).toBeUndefined()
    expect(b.systems.every((s) => !s.includes('into an easy version'))).toBe(true)
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.every((w) => !('mode' in w))).toBe(true)
    expect(
      writes.filter((w) => w.kind === 'job').every((w) => w.kind === 'job' && !w.job.mode),
    ).toBe(true)
    expect(b.writeTranslated.mock.calls.every((c) => !('mode' in c[0]))).toBe(true)
    expect(b.pickResultTarget.mock.calls[0]![0]).toEqual({ kind: 'translated', lang: 'ko' })
    expect(await b.store.readTranslation(b.docHash, 'ko', 'easy')).toBeNull()
    expect(q(m.el, '.bt-report .bt-title')!.textContent).toBe('번역을 마쳤습니다')
  })
})

describe('the resume offer', () => {
  it('is made for each way on its own, and says which is an easy explanation', async () => {
    const b = await backend()
    await b.store.writeJob(b.docHash, {
      kind: 'translate',
      lang: 'ko',
      state: 'stopped',
      progress: { done: 1, total: 4 },
    })
    await b.store.writeJob(b.docHash, {
      kind: 'translate',
      lang: 'ko',
      mode: 'easy',
      state: 'stopped',
      progress: { done: 2, total: 4 },
    })
    const m = await mount(b, 'ko')
    await until(() => m.el.querySelectorAll('[data-strip="resume"]').length === 2, 'the offers')
    const plain = q(m.el, '[data-resume-mode="translate"]')!
    const easy = q(m.el, '[data-resume-mode="easy"]')!
    expect(plain.textContent).toContain('끝나지 않은 번역(한국어) 25%')
    expect(easy.textContent).toContain('끝나지 않은 쉬운 풀이(한국어) 50%')

    // "Later" on one leaves the other
    await click(q(plain, '[data-action="dismiss-resume"]'))
    expect(q(m.el, '[data-resume-mode="translate"]')).toBeNull()
    expect(q(m.el, '[data-resume-mode="easy"]')).not.toBeNull()

    // Continue opens the window on the easy explanation, and sends nothing
    await click(q(m.el, '[data-resume-mode="easy"] [data-action="resume-job"]'))
    await until(() => !!q(m.el, '[data-units]'), 'the window')
    expect(input(m.el, 'mode-easy').checked).toBe(true)
    expect(language(m.el)).toBe('ko')
    expect(q(m.el, '[data-strip="resume"]')).toBeNull()
    expect(b.aiStream).not.toHaveBeenCalled()
  })

  it('offers an unfinished easy explanation alone, never as a translation', async () => {
    const b = await backend()
    await b.store.writeJob(b.docHash, {
      kind: 'translate',
      lang: 'de',
      mode: 'easy',
      state: 'stopped',
      progress: { done: 1, total: 2 },
    })
    const m = await mount(b, 'ko')
    await until(() => !!q(m.el, '[data-strip="resume"]'), 'the offer')
    expect(m.el.querySelectorAll('[data-strip="resume"]')).toHaveLength(1)
    expect(q(m.el, '[data-strip="resume"]')!.dataset.resumeMode).toBe('easy')
    expect(q(m.el, '[data-strip="resume"]')!.textContent).toContain('쉬운 풀이')
  })
})
