/**
 * AI page reading, app side (spec §7, §9): the window, the confirmation, the
 * job and its lifetime. The main process is a fake preload bridge and fake
 * structure / store channels, so no provider and no subscription program is
 * ever reached; "sending" means a call to the fake `aiStream`.
 */
import { act, createElement, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcStreamChunk } from '@genoffice/agent-core'
import {
  normalizeAiSettings,
  type AiSettings,
  type AiSubscriptionState,
  type SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import { createI18n } from '@genoffice/i18n'
import { aiProviderDisplayName, aiRunErrorText } from '@genoffice/ui'
import { DocumentJobRegistry } from '../../../packages/pdf-structure/src/jobs'
import type {
  AiReadPageEntry,
  JobRecordInput,
  JobStatus,
} from '../../../packages/pdf-structure/src/store/store'
import type { DocumentTree } from '../../../packages/pdf-structure/src/tree/types'
import { strings } from '../src/renderer/i18n/strings'
import {
  AiPageReading,
  type AiPageReadingApi,
  type AiPageReadingHandle,
  type AiPageReadingProps,
} from '../src/renderer/ai-read/AiPageReading'
import { DocumentJobSession } from '../src/renderer/doc-jobs/job-session'
import { rememberJobPages } from '../src/renderer/doc-jobs/job-pages'
import type { PdfStoreWriteRequest } from '../src/shared/ipc'

const translate = createI18n(strings)
const t: AiPageReadingProps['t'] = (key, params) => translate('en', key, params)

const DOC = 'a'.repeat(64)
const SAVED_DOC = 'b'.repeat(64)
const PATH = 'C:\\docs\\scan.pdf'
const FPS = ['fp1', 'fp2', 'fp3', 'fp4', 'fp5']
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const ANSWER = '<page-content>\n# Read title\n\nRead body.\n</page-content>'

const statusesOf = (claude: AiSubscriptionState, codex: AiSubscriptionState) =>
  ({
    'claude-code': {
      provider: 'claude-code',
      state: claude,
      meteredAccepted: false,
      ...(claude === 'ready' ? { loginMethod: 'subscription' as const } : {}),
    },
    codex: {
      provider: 'codex',
      state: codex,
      meteredAccepted: false,
      ...(codex === 'ready' ? { loginMethod: 'subscription' as const } : {}),
    },
  }) as SubscriptionStatusMap

/** pages 1 text, 2 scanned, 3 degraded, 4 footnotes not linked, 5 text */
function fakeTree(): DocumentTree {
  const status = ['text', 'scanned', 'degraded', 'text', 'text']
  return {
    version: 1,
    variant: 'original',
    info: {},
    sourcePageCount: 5,
    pages: FPS.map((fingerprint, i) => ({
      page: i + 1,
      fingerprint,
      status: status[i],
      widthPt: 595,
      heightPt: 842,
    })),
    blocks: [],
    footnotes: [],
    outline: [],
    toc: [],
    footnoteLinkFailedPages: [4],
    warnings: [],
  } as unknown as DocumentTree
}

interface StreamStart {
  requestId: string
  settings: AiSettings
  system?: string
  messages: Array<{ role: string; text?: string; images?: Array<{ base64: string; mime: string }> }>
  tools?: unknown[]
}

function fakeBridge(initial: { settings: AiSettings; statuses: SubscriptionStatusMap }) {
  const state = { settings: initial.settings, statuses: initial.statuses }
  const starts: StreamStart[] = []
  const answered = new Set<string>()
  const listeners = new Set<(chunk: IpcStreamChunk) => void>()
  const statusListeners = new Set<(s: SubscriptionStatusMap) => void>()
  const settingsListeners = new Set<() => void>()
  const subscription = {
    statuses: vi.fn(async () => state.statuses),
    recheck: vi.fn(async () => state.statuses),
    login: vi.fn(async () => ({ ok: true })),
    install: vi.fn(async () => ({ ok: true })),
    setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses: state.statuses })),
    onChanged: (handler: (s: SubscriptionStatusMap) => void) => {
      statusListeners.add(handler)
      return () => statusListeners.delete(handler)
    },
    openInstallHelp: vi.fn(async () => {}),
  }
  const api = {
    getAiSettings: vi.fn(async () => state.settings),
    setAiSettings: vi.fn(async (next: AiSettings) => {
      state.settings = next
      // the main process broadcasts ai:settings-changed to every renderer, this one included
      for (const listener of [...settingsListeners]) listener()
    }),
    onAiSettingsChanged: (handler: () => void) => {
      settingsListeners.add(handler)
      return () => settingsListeners.delete(handler)
    },
    openAiModelSettings: vi.fn(async () => {}),
    subscription,
    aiStream: vi.fn(async (request: StreamStart) => {
      starts.push(request)
    }),
    aiStreamCancel: vi.fn(async () => {}),
    onAiStream: (listener: (chunk: IpcStreamChunk) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const push = (requestId: string, chunk: Omit<IpcStreamChunk, 'requestId'>) => {
    for (const listener of [...listeners]) listener({ requestId, ...chunk })
  }
  return {
    api,
    starts,
    subscription,
    /** answer every call not answered yet */
    answerAll(text = ANSWER) {
      for (const s of starts) {
        if (answered.has(s.requestId)) continue
        answered.add(s.requestId)
        push(s.requestId, { type: 'delta', text })
        push(s.requestId, { type: 'done' })
      }
    },
    fail(chunk: Omit<IpcStreamChunk, 'requestId'>) {
      for (const s of starts) {
        if (answered.has(s.requestId)) continue
        answered.add(s.requestId)
        push(s.requestId, chunk)
      }
    },
  }
}

function fakeChannels(
  options: {
    stored?: string[]
    unfinished?: JobStatus[]
    counts?: { editedTranslationBlocks: number; passages: number }
  } = {},
) {
  const aiRead = new Map<string, AiReadPageEntry>(
    (options.stored ?? []).map((fp) => [
      fp,
      { pageFingerprint: fp, payload: { version: 1 }, savedAt: 1 },
    ]),
  )
  const writes: PdfStoreWriteRequest[] = []
  const jobs: JobRecordInput[] = []
  const store = {
    docHash: vi.fn(async () => ({ ok: true as const, docHash: DOC })),
    aiReadPages: vi.fn(async () => ({ ok: true as const, pages: [...aiRead.values()] })),
    translations: vi.fn(async () => ({ ok: true as const, langs: [] })),
    translation: vi.fn(async () => ({ ok: true as const, translation: null })),
    unfinishedJobs: vi.fn(async () => ({ ok: true as const, jobs: options.unfinished ?? [] })),
    write: vi.fn(async (request: PdfStoreWriteRequest) => {
      writes.push(request)
      if (request.kind === 'aiReadPage') {
        aiRead.set(request.pageFingerprint, {
          pageFingerprint: request.pageFingerprint,
          payload: request.payload,
          savedAt: 2,
        })
      }
      if (request.kind === 'job') jobs.push(request.job)
      return { ok: true as const }
    }),
    migrate: vi.fn(async () => ({
      ok: true as const,
      docHash: SAVED_DOC,
      aiReadPages: 1,
      translationBlocks: 0,
      languages: [],
      jobs: 0,
    })),
    deleteDocument: vi.fn(async () => ({ ok: true as const })),
    deleteCounts: vi.fn(async () => ({
      ok: true as const,
      ...(options.counts ?? { editedTranslationBlocks: 0, passages: 0 }),
    })),
    passages: vi.fn(async () => ({ ok: true as const, cards: [] })),
    highlightRuns: vi.fn(async () => ({ ok: true as const, runs: [] })),
    highlightBlocks: vi.fn(async () => ({ ok: true as const, blocks: [] })),
    latestHighlight: vi.fn(async () => ({ ok: true as const, run: null, blocks: [] })),
    insights: vi.fn(async () => ({ ok: true as const, insights: null })),
    pageFingerprints: vi.fn(async () => ({ ok: true as const, docHash: DOC, fingerprints: FPS })),
    translationRecency: vi.fn(async () => ({ ok: true as const, langs: [] })),
  }
  const api: AiPageReadingApi = {
    tree: vi.fn(async () => ({
      ok: true as const,
      docHash: DOC,
      tree: fakeTree(),
      fingerprints: FPS.map((fingerprint, i) => ({ page: i + 1, fingerprint })),
      cached: false,
    })),
    cancel: vi.fn(async () => true),
    onProgress: vi.fn(() => () => {}),
    store,
  }
  return { api, store, writes, jobs }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
let bridge: ReturnType<typeof fakeBridge>

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => window.localStorage.clear())

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.unstubAllGlobals()
})

const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  })

async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (check()) return
    await settle()
  }
  throw new Error(`timed out waiting for ${what}`)
}

async function mount(
  o: {
    settings?: Partial<AiSettings>
    statuses?: SubscriptionStatusMap
    channels?: ReturnType<typeof fakeChannels>
    props?: Partial<AiPageReadingProps>
  } = {},
) {
  bridge = fakeBridge({
    settings: { ...normalizeAiSettings({}), subscriptionNoticeSeen: true, ...o.settings },
    statuses: o.statuses ?? statusesOf('ready', 'signed-out'),
  })
  vi.stubGlobal('pdfApi', bridge.api)
  const channels = o.channels ?? fakeChannels()
  const renderer = { render: vi.fn(async () => PNG), close: vi.fn() }
  const openPageRenderer = vi.fn(async () => renderer)
  const handle = createRef<AiPageReadingHandle>()
  const session = new DocumentJobSession(new DocumentJobRegistry())
  const onStoredChange = vi.fn()
  const onNotice = vi.fn()
  const props: AiPageReadingProps = {
    filePath: PATH,
    password: undefined,
    pageCount: 5,
    lang: 'en',
    t,
    api: channels.api,
    session,
    openPageRenderer,
    onStoredChange,
    onNotice,
    ...o.props,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(createElement(AiPageReading, { ...props, ref: handle })))
  await settle()
  return { el: container, handle, channels, renderer, openPageRenderer, session, onStoredChange }
}

const q = (el: Element, selector: string) => el.querySelector(selector) as HTMLElement | null
const click = async (el: Element, selector: string) => {
  const target = q(el, selector)
  if (!target) throw new Error(`nothing matches ${selector}`)
  await act(async () => target.click())
  await settle()
}

async function openToConfirm(
  m: Awaited<ReturnType<typeof mount>>,
  pages: number[] | null = null,
): Promise<void> {
  let answer: ReturnType<AiPageReadingHandle['requestOpen']> | undefined
  await act(async () => {
    answer = m.handle.current!.requestOpen(pages)
  })
  expect(answer).toEqual({ opened: true })
  await until(() => q(m.el, '[data-action="next"]:not([disabled])') !== null, 'the picker')
  await click(m.el, '[data-action="next"]')
  await until(() => q(m.el, '[data-calls]')?.dataset.calls !== '', 'the estimate')
}

describe('AI page reading: picker and confirmation', () => {
  it('preselects scanned, degraded and footnote pages with their reason and marks read pages', async () => {
    const m = await mount({ channels: fakeChannels({ stored: ['fp3'] }) })
    await act(async () => {
      m.handle.current!.requestOpen(null)
    })
    await until(() => q(m.el, '[data-pages]') !== null, 'the page list')
    const rows = [...m.el.querySelectorAll('[data-pages] li')] as HTMLElement[]
    expect(rows.map((r) => r.dataset.page)).toEqual(['2', '3', '4'])
    expect(rows[0]!.textContent).toContain(strings.en.arReasonScanned)
    expect(rows[1]!.textContent).toContain(strings.en.arReasonDegraded)
    expect(rows[1]!.textContent).toContain(strings.en.arAlreadyRead)
    expect(rows[2]!.textContent).toContain(strings.en.arReasonFootnote)
    // adding pages: no cap, any page of the document
    const input = q(m.el, '.pdf-ai-read-add input') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, '1, 5')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(m.el, '[data-action="add-pages"]')
    const pages = [...m.el.querySelectorAll('[data-pages] li')].map(
      (r) => (r as HTMLElement).dataset.page,
    )
    expect(pages).toEqual(['1', '2', '3', '4', '5'])
    expect(q(m.el, '[data-selected-count]')?.dataset.selectedCount).toBe('5')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('sends nothing without the confirmation, and nothing when cancelled there', async () => {
    const m = await mount()
    expect(bridge.subscription.statuses).not.toHaveBeenCalled()
    await openToConfirm(m)
    expect(q(m.el, '[data-calls]')?.textContent).toBe(t('arConfirmCalls', { calls: 3 }))
    expect(q(m.el, '[data-route="ready"]')?.textContent).toBe(
      t('arConfirmProvider', { provider: 'Claude' }),
    )
    expect(q(m.el, '[data-paid]')).toBeNull()
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(m.openPageRenderer).not.toHaveBeenCalled()
    await click(m.el, '.pdf-modal-actions .pdf-modal-btn:not([data-action])')
    expect(q(m.el, '[role="dialog"]')).toBeNull()
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('after Start sends one page image per call, no tools, on the confirmed provider, and stores the readings', async () => {
    const m = await mount()
    await openToConfirm(m)
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 2, 'two calls (concurrency 2)')
    for (const s of bridge.starts) {
      expect(s.tools ?? []).toEqual([])
      expect(s.messages).toHaveLength(1)
      expect(s.messages[0]!.images).toHaveLength(1)
      expect(s.messages[0]!.images![0]!.mime).toBe('image/png')
      // pinned: an `auto` selection is sent as the provider the user confirmed
      expect(s.settings.provider).toBe('claude-code')
    }
    expect(q(m.el, '[role="dialog"]')).toBeNull()
    expect(q(m.el, '[data-job-state="running"]')).not.toBeNull()
    expect(q(m.el, '.pdf-job-strip-detail')?.textContent).toBe(
      t('arConfirmProvider', { provider: 'Claude' }),
    )
    await act(async () => bridge.answerAll())
    await until(() => bridge.starts.length === 3, 'the third page')
    await act(async () => bridge.answerAll())
    await until(() => q(m.el, '[data-job-state="complete"]') !== null, 'the job to complete')
    const stored = m.channels.writes.filter((w) => w.kind === 'aiReadPage')
    expect(stored.map((w) => (w as { pageFingerprint: string }).pageFingerprint).sort()).toEqual([
      'fp2',
      'fp3',
      'fp4',
    ])
    expect(m.renderer.close).toHaveBeenCalled()
    expect(m.onStoredChange).toHaveBeenCalled()
    expect(q(m.el, '[data-job-state="complete"]')?.textContent).toContain(t('arDone', { count: 3 }))
  })

  it('refuses to start, saying why, when the model cannot read images', async () => {
    const base = normalizeAiSettings({})
    const m = await mount({
      settings: {
        provider: 'glm',
        providers: { ...base.providers, glm: { apiKey: 'k', model: 'glm-4' } },
      },
    })
    await openToConfirm(m)
    expect(q(m.el, '[data-error="vision"]')?.textContent).toBe(
      t('arVisionProvider', { provider: aiProviderDisplayName('glm') }),
    )
    expect((q(m.el, '[data-action="start"]') as HTMLButtonElement).disabled).toBe(true)
    await click(m.el, '[data-action="start"]')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('offers the model picker on the confirmation; picking a vision model clears the refusal', async () => {
    const base = normalizeAiSettings({})
    const m = await mount({
      settings: {
        provider: 'deepseek',
        providers: {
          ...base.providers,
          deepseek: { apiKey: 'k', model: 'deepseek-v4-pro' },
        },
      },
    })
    await openToConfirm(m)
    expect(q(m.el, '[data-error="vision"]')?.textContent).toBe(
      t('arVisionModel', { model: 'deepseek-v4-pro' }),
    )
    await until(() => q(m.el, '[data-model-picker] .ai-model-chip') !== null, 'the model chip')
    expect(q(m.el, '[data-model-picker] .ai-model-picker-label')?.textContent).toBe('Model')
    await click(m.el, '[data-model-picker] .ai-model-chip')
    await until(() => q(m.el, '[role="option"]') !== null, 'the model list')
    const flash = [...m.el.querySelectorAll('[role="option"]')].find((option) =>
      option.textContent?.includes('deep-seek-v4.1-flash'),
    ) as HTMLElement | undefined
    expect(flash).toBeTruthy()
    await act(async () => flash!.click())
    await settle()

    expect(bridge.api.setAiSettings).toHaveBeenCalled()
    expect(q(m.el, '[data-error="vision"]')).toBeNull()
    expect((q(m.el, '[data-action="start"]') as HTMLButtonElement).disabled).toBe(false)
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('names the charge on a paid route and none on a subscription', async () => {
    const base = normalizeAiSettings({})
    const m = await mount({
      settings: {
        provider: 'anthropic',
        providers: { ...base.providers, anthropic: { apiKey: 'k', model: 'claude-sonnet-x' } },
      },
    })
    await openToConfirm(m)
    const paid = q(m.el, '[data-paid]')
    expect(paid).not.toBeNull()
    expect(paid!.textContent).toMatch(/will charge for this$/)
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('shows the connect prompt and does not start when nothing is connected', async () => {
    const m = await mount({ statuses: statusesOf('signed-out', 'not-installed') })
    await openToConfirm(m)
    expect(q(m.el, '.ai-sub-prompt')).not.toBeNull()
    expect((q(m.el, '[data-action="start"]') as HTMLButtonElement).disabled).toBe(true)
    await click(m.el, '[data-action="start"]')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })
})

describe('AI page reading: the job', () => {
  it('one job per document: a second open answers with the running progress', async () => {
    const m = await mount()
    await openToConfirm(m)
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 2, 'the job to send')
    let again: ReturnType<AiPageReadingHandle['requestOpen']> | undefined
    await act(async () => {
      again = m.handle.current!.requestOpen(null)
    })
    expect(again).toHaveProperty('running')
    expect(q(m.el, '[role="dialog"]')).toBeNull()
  })

  it('does not start beside a job another process is running on the file', async () => {
    const running: JobStatus = {
      kind: 'ai-read',
      state: 'running',
      outputs: [],
      progress: { done: 1, total: 4 },
    }
    const m = await mount({ channels: fakeChannels({ unfinished: [running] }) })
    await openToConfirm(m)
    await click(m.el, '[data-action="start"]')
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(q(m.el, '[data-error="start"]')?.textContent).toBe(t('arBusy', { done: 1, total: 4 }))
  })

  it('stops at once on a rate limit and shows when it lifts', async () => {
    const m = await mount()
    await openToConfirm(m)
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 2, 'the job to send')
    const resetsAt = Date.now() + 3_600_000
    await act(async () =>
      bridge.fail({
        type: 'error',
        error: 'limit',
        errorCode: 'rate-limit',
        errorResetsAt: resetsAt,
      }),
    )
    await until(() => q(m.el, '[data-job-state="stopped"]') !== null, 'the job to stop')
    expect(bridge.starts).toHaveLength(2)
    expect(q(m.el, '.pdf-job-strip-title')?.textContent).toBe(
      aiRunErrorText('en', { kind: 'rate-limit', provider: 'claude-code', resetsAt }),
    )
    const last = m.channels.jobs.at(-1)!
    expect(last).toMatchObject({ state: 'stopped', last_error: 'rate-limit', resetsAt })
  })

  it('Stop ends the job and cancels the calls in flight', async () => {
    const m = await mount()
    await openToConfirm(m)
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 2, 'the job to send')
    await click(m.el, '[data-action="stop-job"]')
    await until(() => q(m.el, '[data-job-state="stopped"]') !== null, 'the job to stop')
    expect(bridge.api.aiStreamCancel).toHaveBeenCalledTimes(2)
    // the job's own requests only: the AI window's media calls in this tab keep running
    for (const call of bridge.api.aiStreamCancel.mock.calls) {
      expect((call as unknown[])[1]).toBe('request')
    }
    expect(m.channels.jobs.at(-1)).toMatchObject({ state: 'stopped', last_error: 'cancelled' })
  })

  it('closing the tab stops the job and cancels its calls', async () => {
    const m = await mount()
    await openToConfirm(m)
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 2, 'the job to send')
    const ids = bridge.starts.map((s) => s.requestId)
    await act(async () => root!.unmount())
    root = null
    await new Promise((resolve) => setTimeout(resolve, 20))
    const cancelled = bridge.api.aiStreamCancel.mock.calls.map((c) => (c as unknown[])[0])
    expect(cancelled.sort()).toEqual([...ids].sort())
    expect(m.channels.jobs.at(-1)).toMatchObject({ state: 'stopped', last_error: 'interrupted' })
    expect(m.session.running(DOC)).toBeNull()
  })
})

describe('AI page reading: resume, save, delete', () => {
  const stopped: JobStatus = {
    kind: 'ai-read',
    state: 'stopped',
    last_error: 'rate-limit',
    outputs: [],
    progress: { done: 2, total: 4 },
  }

  it('offers an unfinished job once and never starts it by itself', async () => {
    rememberJobPages(DOC, 'ai-read', undefined, [2, 3])
    const channels = fakeChannels({ unfinished: [stopped] })
    const m = await mount({ channels })
    const offer = q(m.el, '[data-resume-kind="ai-read"]')
    expect(offer?.textContent).toContain(t('jobResumeAiRead', { percent: 50 }))
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(channels.api.tree).not.toHaveBeenCalled()
    // Continue opens the confirmation with the remembered pages; still nothing is sent
    await click(m.el, '[data-action="resume-job"]')
    await until(() => q(m.el, '[data-step="confirm"]') !== null, 'the confirmation')
    await until(() => q(m.el, '[data-calls]')?.dataset.calls !== '', 'the estimate')
    expect(q(m.el, '[data-calls]')?.dataset.calls).toBe('2')
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('later dismisses the offer without starting anything', async () => {
    const m = await mount({ channels: fakeChannels({ unfinished: [stopped] }) })
    await click(m.el, '[data-action="dismiss-resume"]')
    expect(q(m.el, '[data-resume-kind]')).toBeNull()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('an in-app save carries the stored results to the saved file', async () => {
    rememberJobPages(DOC, 'ai-read', undefined, [2])
    const m = await mount()
    let moved: string | null = null
    await act(async () => {
      moved = await m.handle.current!.afterSave()
    })
    expect(m.channels.store.migrate).toHaveBeenCalledWith({ path: PATH, oldDocHash: DOC })
    // the save path confirms "in the file" states under exactly this hash
    expect(moved).toBe(SAVED_DOC)
    // the remembered pages follow, so the resume offer of the saved file has them
    expect(window.localStorage.getItem(`genoffice-pdf-job-pages:${SAVED_DOC}:ai-read`)).toBe('[2]')
  })

  it('a save whose migration failed answers no hash', async () => {
    const m = await mount()
    m.channels.store.migrate.mockImplementation(async () => ({
      ok: false as const,
      error: 'io',
    }))
    let moved: string | null = 'x'
    await act(async () => {
      moved = await m.handle.current!.afterSave()
    })
    expect(moved).toBeNull()
  })

  it('a second start right after a save is not refused by its own job carried to the saved file', async () => {
    const m = await mount()
    await openToConfirm(m)
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 2, 'the job to send')
    // saved while the job runs: the save carried its 'running' record to the saved file
    await act(async () => m.handle.current!.afterSave())
    const carried: JobStatus = {
      kind: 'ai-read',
      state: 'running',
      outputs: [],
      progress: { done: 0, total: 4 },
      updatedAt: Date.now() - 1,
    }
    m.channels.store.unfinishedJobs.mockImplementation(async () => ({
      ok: true as const,
      jobs: [carried],
    }))
    // the job finishes; the start comes before its own carry rewrote that record
    for (let i = 0; i < 10 && !q(m.el, '[data-job-state="complete"]'); i++) {
      await act(async () => bridge.answerAll())
      await settle()
    }
    expect(q(m.el, '[data-job-state="complete"]')).not.toBeNull()
    // the saved file, with pages not read yet
    const savedTree = fakeTree()
    const savedFps = FPS.map((fp) => `${fp}-saved`)
    savedTree.pages.forEach((page, i) => (page.fingerprint = savedFps[i]!))
    vi.mocked(m.channels.api.tree).mockImplementation(async () => ({
      ok: true as const,
      docHash: SAVED_DOC,
      tree: savedTree,
      fingerprints: savedFps.map((fingerprint, i) => ({ page: i + 1, fingerprint })),
      cached: false,
    }))
    const sent = bridge.starts.length
    await openToConfirm(m)
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length > sent, 'the second job to send')
    expect(q(m.el, '[data-error="start"]')).toBeNull()
  })

  it('deletes this document’s stored results only after confirming', async () => {
    const m = await mount()
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    await act(async () => m.handle.current!.deleteStored())
    expect(confirm).toHaveBeenCalledWith(strings.en.arDeleteConfirm)
    expect(m.channels.store.deleteDocument).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    await act(async () => m.handle.current!.deleteStored())
    expect(m.channels.store.deleteDocument).toHaveBeenCalledWith(DOC)
    expect(m.onStoredChange).toHaveBeenCalled()
  })

  it('names the edited translations and passage cards the delete takes along, leaving out zeros', async () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    const cases = [
      [{ editedTranslationBlocks: 3, passages: 2 }, t('arDeleteAlsoBoth', { edited: 3, cards: 2 })],
      [{ editedTranslationBlocks: 4, passages: 0 }, t('arDeleteAlsoEdited', { count: 4 })],
      [{ editedTranslationBlocks: 0, passages: 1 }, t('arDeleteAlsoCards', { count: 1 })],
    ] as const
    for (const [counts, extra] of cases) {
      const m = await mount({ channels: fakeChannels({ counts }) })
      await act(async () => m.handle.current!.deleteStored())
      expect(m.channels.store.deleteCounts).toHaveBeenCalledWith(DOC)
      expect(confirm).toHaveBeenLastCalledWith(`${strings.en.arDeleteConfirm}
${extra}`)
      await act(async () => root?.unmount())
      root = null
    }
    // the Korean wording of the spec
    const ko: AiPageReadingProps['t'] = (key, params) => translate('ko', key, params)
    expect(ko('arDeleteAlsoBoth', { edited: 3, cards: 2 })).toBe(
      '사람이 고친 번역 3개, 구절 카드 2개도 지워집니다.',
    )
    // no counts (an older shell): the plain question
    const m = await mount()
    m.channels.store.deleteCounts.mockResolvedValue({ ok: false, error: 'not-available' } as never)
    await act(async () => m.handle.current!.deleteStored())
    expect(confirm).toHaveBeenLastCalledWith(strings.en.arDeleteConfirm)
  })

  it('offers an unfinished AI highlight run under its own name and hands it to its screen', async () => {
    const highlight: JobStatus = {
      kind: 'highlight',
      runId: 'run1',
      state: 'stopped',
      outputs: [],
      progress: { done: 1, total: 2 },
    }
    const onResumeHighlight = vi.fn()
    const m = await mount({
      channels: fakeChannels({ unfinished: [highlight] }),
      props: { onResumeHighlight },
    })
    const offer = q(m.el, '[data-resume-kind="highlight"]')
    expect(offer?.textContent).toContain(t('jobResumeHighlight', { percent: 50 }))
    expect(offer?.textContent).not.toContain(t('jobResumeAiRead', { percent: 50 }))
    await click(m.el, '[data-action="resume-job"]')
    expect(onResumeHighlight).toHaveBeenCalledWith(highlight)
    // continuing opens no AI-read window and sends nothing
    expect(q(m.el, '[data-step]')).toBeNull()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('never offers a page translation or a summary, nor a highlight run without its screen', async () => {
    const others: JobStatus[] = [
      { kind: 'translate-page', lang: 'en', state: 'stopped', outputs: [] },
      { kind: 'summary', lang: 'en', state: 'stopped', outputs: [] },
      { kind: 'highlight', runId: 'run1', state: 'stopped', outputs: [] },
    ]
    const m = await mount({
      channels: fakeChannels({ unfinished: others }),
      props: { onResumeTranslation: vi.fn() },
    })
    expect(q(m.el, '[data-resume-kind]')).toBeNull()
  })
})
