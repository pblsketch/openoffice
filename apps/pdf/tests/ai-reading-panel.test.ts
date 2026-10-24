/**
 * The AI window's reading aids on screen (reading-assist spec 4.4, 4.8,
 * 10.4, 10.9): the suggested questions (only in an empty conversation, one
 * send per click, the connect prompt when nothing is connected) and the
 * "Document overview" section (nothing sent on open, one gated call for a
 * short document, the start confirmation before a long one, the stored
 * overview shown without sending, the changed-document notice, a term opening
 * the viewer search). The preload bridge and the store and structure channels
 * are fakes; "sending" means a call to the fake `aiStream`.
 */
import { act, createElement } from 'react'
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
import { DocumentJobRegistry } from '../../../packages/pdf-structure/src/jobs'
import type { InsightsEntry } from '../../../packages/pdf-structure/src/store/reading'
import type { DocumentTree } from '../../../packages/pdf-structure/src/tree/types'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import { DocumentInsights } from '../src/renderer/ai/insights/insights-controller'
import { InsightsCard, type InsightsCardProps } from '../src/renderer/ai/insights/InsightsCard'
import type { PdfAppDeps } from '../src/renderer/ai/tools'
import { DocumentJobSession } from '../src/renderer/doc-jobs/job-session'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { strings } from '../src/renderer/i18n/strings'
import type { PdfStoreWriteRequest } from '../src/shared/ipc'

const translate = createI18n(strings)
const t: InsightsCardProps['t'] = (key, params) => translate('en', key, params)

const DOC = 'a'.repeat(64)
const PATH = 'C:\\docs\\report.pdf'

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

interface StreamStart {
  requestId: string
  settings: AiSettings
  system?: string
  messages: Array<{ role: string; text?: string }>
  tools?: unknown[]
}

function fakeBridge(initial: { settings: AiSettings; statuses: SubscriptionStatusMap }) {
  const state = { settings: initial.settings, statuses: initial.statuses }
  const starts: StreamStart[] = []
  const answered = new Set<string>()
  const listeners = new Set<(chunk: IpcStreamChunk) => void>()
  const api = {
    getAiSettings: vi.fn(async () => state.settings),
    setAiSettings: vi.fn(async (next: AiSettings) => {
      state.settings = next
    }),
    onAiSettingsChanged: () => () => {},
    openAiModelSettings: vi.fn(async () => {}),
    onLanguageChanged: () => () => {},
    setAiPanelPrefs: vi.fn(async () => ({})),
    openSourcePath: vi.fn(async () => {}),
    imageGenerationAvailable: vi.fn(async () => false),
    subscription: {
      statuses: vi.fn(async () => state.statuses),
      recheck: vi.fn(async () => state.statuses),
      login: vi.fn(async () => ({ ok: true })),
      install: vi.fn(async () => ({ ok: true })),
      setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses: state.statuses })),
      onChanged: () => () => {},
      openInstallHelp: vi.fn(async () => {}),
    },
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
    answerAll(text: (start: StreamStart) => string) {
      for (const s of starts) {
        if (answered.has(s.requestId)) continue
        answered.add(s.requestId)
        push(s.requestId, { type: 'delta', text: text(s) })
        push(s.requestId, { type: 'done' })
      }
    },
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
let bridge: ReturnType<typeof fakeBridge>

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollTo = () => {}
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
  for (let i = 0; i < 80; i++) {
    if (check()) return
    await settle()
  }
  throw new Error(`timed out waiting for ${what}`)
}

const q = (el: Element, selector: string) => el.querySelector(selector) as HTMLElement | null
const click = async (target: Element | null) => {
  if (!target) throw new Error('nothing to click')
  await act(async () => (target as HTMLElement).click())
  await settle()
}

function useBridge(statuses: SubscriptionStatusMap) {
  bridge = fakeBridge({
    settings: { ...normalizeAiSettings({}), subscriptionNoticeSeen: true },
    statuses,
  })
  vi.stubGlobal('pdfApi', bridge.api)
}

async function render(element: ReturnType<typeof createElement>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(element))
  await settle()
  return container
}

// ── suggested questions ──

const APP_DEPS = new Proxy(
  {
    fileName: () => 'doc.pdf',
    pageCount: () => 3,
    currentPage: () => 1,
    readOnly: () => false,
    selection: () => null,
    pendingSummary: () => '',
    annotationSummary: () => '',
    metadata: () => ({}),
    outline: () => null,
    gotoPage: vi.fn(() => true),
  } as Record<string, unknown>,
  {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return () => {
        throw new Error(`unexpected deps call: ${prop}`)
      }
    },
  },
) as unknown as PdfAppDeps

async function renderPanel(
  statuses: SubscriptionStatusMap,
  extra: Partial<Parameters<typeof AiPanel>[0]> = {},
) {
  useBridge(statuses)
  return render(
    createElement(
      LocaleProvider,
      { initial: 'en' },
      createElement(AiPanel, { api: APP_DEPS, onCollapse: () => {}, ...extra }),
    ),
  )
}

const suggested = (el: Element) => [...el.querySelectorAll('.ai-suggested-btn')] as HTMLElement[]

describe('suggested questions', () => {
  it('shows the three questions in an empty conversation, worded as pinned', async () => {
    const panel = await renderPanel(statusesOf('ready', 'signed-out'))
    expect(suggested(panel).map((b) => b.textContent)).toEqual([
      'Summarize the key points',
      'What are the conclusions and evidence?',
      'What is missing or weak?',
    ])
    expect(strings.ko.airQuestion1).toBe('이 문서의 핵심을 정리해 줘')
    expect(strings.ko.airQuestion2).toBe('결론과 그 근거를 페이지와 함께 알려 줘')
    expect(strings.ko.airQuestion3).toBe('빠졌거나 약한 부분이 있어?')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('sends the question once per click and leaves the empty state', async () => {
    const panel = await renderPanel(statusesOf('ready', 'signed-out'))
    await click(suggested(panel)[1]!)
    await until(() => bridge.starts.length > 0, 'the send')
    expect(bridge.starts).toHaveLength(1)
    expect(JSON.stringify(bridge.starts[0]!.messages)).toContain(
      'What are the conclusions and evidence?',
    )
    // the conversation is no longer empty: the questions are gone
    expect(suggested(panel)).toHaveLength(0)
    await settle()
    expect(bridge.starts).toHaveLength(1)
  })

  it('shows the connect prompt instead of sending when nothing is connected', async () => {
    const panel = await renderPanel(statusesOf('signed-out', 'not-installed'))
    await click(suggested(panel)[0]!)
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(q(panel, '.ai-sub-prompt')).not.toBeNull()
    expect((q(panel, '.ai-composer textarea') as HTMLTextAreaElement).value).toBe(
      'Summarize the key points',
    )
  })

  it('puts the overview section above the conversation and hands citations over', async () => {
    const onCitation = vi.fn()
    const panel = await renderPanel(statusesOf('ready', 'signed-out'), {
      overview: createElement('div', { className: 'test-overview' }),
      onCitation,
    })
    const overview = q(panel, '.test-overview')!
    expect(overview.nextElementSibling?.classList.contains('ai-chat')).toBe(true)
    expect(onCitation).not.toHaveBeenCalled()
  })
})

// ── the overview section ──

function treeOf(pages: string[]): DocumentTree {
  return {
    version: 1,
    variant: 'original',
    info: {},
    sourcePageCount: pages.length,
    pages: pages.map((_, i) => ({
      page: i + 1,
      fingerprint: `fp${i + 1}`,
      status: 'ok',
      widthPt: 600,
      heightPt: 800,
    })),
    blocks: pages.map((text, i) => ({
      id: `b${i}`,
      page: i + 1,
      pageFingerprint: `fp${i + 1}`,
      source: 'pdf',
      kind: 'paragraph',
      runs: [{ kind: 'text', text }],
    })),
    footnotes: [],
    outline: [],
    toc: [],
    footnoteLinkFailedPages: [],
    warnings: [],
  } as unknown as DocumentTree
}

const ANSWER = JSON.stringify({
  summary3: ['One.', 'Two.', 'Three.'],
  summary: 'The summary.',
  terms: [{ term: 'Widget', meaning: 'The product.', page: 1 }],
})

const ENTRY: InsightsEntry = {
  lang: 'en',
  summary3: ['Stored one.', 'Stored two.', 'Stored three.'],
  summary: 'Stored summary.',
  terms: [{ term: 'Gizmo', meaning: 'A stored term.', page: 2 }],
  provider: 'claude-code',
  model: '',
  createdAt: 1,
  pageFingerprints: ['fp1', 'fp2'],
}

async function mountOverview(o: {
  statuses?: SubscriptionStatusMap
  pages?: string[]
  stored?: InsightsEntry
  fingerprints?: () => string[]
  hash?: () => string
}) {
  useBridge(o.statuses ?? statusesOf('ready', 'signed-out'))
  const pages = o.pages ?? ['Widget page one.', 'Page two.']
  const stored = new Map<string, InsightsEntry>()
  if (o.stored) stored.set(`${DOC}/en`, o.stored)
  const writes: PdfStoreWriteRequest[] = []
  const hash = o.hash ?? (() => DOC)
  const store = {
    docHash: vi.fn(async () => ({ ok: true as const, docHash: hash() })),
    insights: vi.fn(async (docHash: string, lang: string) => ({
      ok: true as const,
      insights: stored.get(`${docHash}/${lang}`) ?? null,
    })),
    pageFingerprints: vi.fn(async () => ({
      ok: true as const,
      docHash: hash(),
      fingerprints: o.fingerprints?.() ?? pages.map((_, i) => `fp${i + 1}`),
    })),
    write: vi.fn(async (request: PdfStoreWriteRequest) => {
      writes.push(request)
      if (request.kind === 'insights') {
        stored.set(`${request.docHash}/${request.entry.lang}`, request.entry)
      }
      return { ok: true as const }
    }),
    unfinishedJobs: vi.fn(async () => ({ ok: true as const, jobs: [] })),
    aiReadPages: vi.fn(async () => ({ ok: true as const, pages: [] })),
  }
  const tree = vi.fn(async () => ({
    ok: true as const,
    docHash: hash(),
    tree: treeOf(pages),
    fingerprints: pages.map((_, i) => ({ page: i + 1, fingerprint: `fp${i + 1}` })),
    cached: false,
  }))
  const structure = { tree, cancel: vi.fn(async () => ({ ok: true as const })) }
  const insights = new DocumentInsights({
    store,
    structure: structure as never,
    file: () => ({ path: PATH }),
    lang: 'en',
  })
  await insights.load()
  const session = new DocumentJobSession(new DocumentJobRegistry())
  const props: InsightsCardProps = {
    insights,
    session,
    lang: 'en',
    t,
    onSearchTerm: vi.fn(),
    onGotoPage: vi.fn(),
    onNotice: vi.fn(),
  }
  const el = await render(createElement(InsightsCard, props))
  return { el, insights, session, props, writes, tree, store }
}

describe('document overview', () => {
  it('sends nothing on open: only "Create overview" is there', async () => {
    const { el, tree, writes } = await mountOverview({})
    expect(q(el, '[data-action="create"]')?.textContent).toBe('Create overview')
    expect(tree).not.toHaveBeenCalled()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
  })

  it('makes a short document in one tool-less call and stores it', async () => {
    const { el, tree, writes } = await mountOverview({})
    await click(q(el, '[data-action="create"]'))
    await until(() => bridge.starts.length > 0, 'the overview call')
    expect(tree).toHaveBeenCalledTimes(1)
    expect(bridge.starts).toHaveLength(1)
    expect(bridge.starts[0]!.tools ?? []).toEqual([])
    expect(bridge.starts[0]!.messages[0]!.text).toContain('[page 1]\nWidget page one.')
    await act(async () => bridge.answerAll(() => ANSWER))
    await until(() => !!q(el, '[data-section="summary3"]'), 'the overview')
    expect(el.textContent).toContain('One.')
    expect(el.textContent).toContain('The summary.')
    const saved = writes.find((w) => w.kind === 'insights')
    expect(saved?.kind === 'insights' && saved.entry.pageFingerprints).toEqual(['fp1', 'fp2'])
    expect(bridge.starts).toHaveLength(1)
  })

  it('shows the connect prompt and sends nothing when no AI is connected', async () => {
    const { el } = await mountOverview({ statuses: statusesOf('signed-out', 'not-installed') })
    await click(q(el, '[data-action="create"]'))
    await until(() => !!q(el, '.ai-sub-prompt'), 'the connect prompt')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('asks for confirmation before a long document and sends only after Start', async () => {
    const long = Array.from({ length: 3 }, (_, i) => `Page ${i + 1} ${'w'.repeat(30_000)}`)
    const { el, session } = await mountOverview({ pages: long })
    await click(q(el, '[data-action="create"]'))
    await until(() => !!q(el, '[data-confirm]'), 'the start confirmation')
    const calls = Number(q(el, '[data-calls]')!.getAttribute('data-calls'))
    expect(calls).toBeGreaterThan(2)
    expect(q(el, '[data-route="ready"]')?.getAttribute('data-provider')).toBe('claude-code')
    expect(q(el, '[data-model-picker] .ai-model-picker-label')?.textContent).toBe('Model')
    expect(q(el, '[data-model-picker] .ai-model-chip')).not.toBeNull()
    expect(el.textContent).toContain('The text of the whole document is sent.')
    expect(q(el, '[data-paid]')).toBeNull()
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    await click(q(el, '[data-action="start"]'))
    await until(() => bridge.starts.length > 0, 'the first batch')
    expect(bridge.starts).toHaveLength(1)
    expect(session.list()[0]?.kind).toBe('summary')
    expect(q(el, '[data-job-kind="summary"] .pdf-job-strip-detail')?.textContent).toBe(
      'AI used: Claude',
    )
    // stop: never resumed, nothing stored
    await act(async () => session.stop(DOC))
    await until(() => !!q(el, '.ai-overview-error'), 'the stopped line')
    expect(el.textContent).toContain('Stopped. Pressing again starts over.')
  })

  it('cancelling the confirmation sends nothing', async () => {
    const long = Array.from({ length: 3 }, (_, i) => `Page ${i + 1} ${'w'.repeat(30_000)}`)
    const { el } = await mountOverview({ pages: long })
    await click(q(el, '[data-action="create"]'))
    await until(() => !!q(el, '[data-confirm]'), 'the start confirmation')
    await click([...el.querySelectorAll('.ai-overview-actions button')][0]!)
    expect(q(el, '[data-confirm]')).toBeNull()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('reports a malformed answer and stores nothing', async () => {
    const { el, writes } = await mountOverview({})
    await click(q(el, '[data-action="create"]'))
    await until(() => bridge.starts.length > 0, 'the overview call')
    await act(async () => bridge.answerAll(() => 'Sure! Here is a summary in prose.'))
    await until(() => !!q(el, '.ai-overview-error'), 'the error')
    expect(el.textContent).toContain("The AI's answer was not in the overview format.")
    expect(writes.some((w) => w.kind === 'insights')).toBe(false)
  })

  it('shows the stored overview without sending; a term opens the viewer search', async () => {
    const { el, props, tree } = await mountOverview({ stored: ENTRY })
    expect(el.textContent).toContain('Stored one.')
    expect(el.textContent).toContain('Stored summary.')
    expect(tree).not.toHaveBeenCalled()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    await click(q(el, '[data-action="search-term"]'))
    expect(props.onSearchTerm).toHaveBeenCalledWith('Gizmo')
    await click(q(el, '[data-action="goto-page"]'))
    expect(props.onGotoPage).toHaveBeenCalledWith(2)
    // "Regenerate" is offered, and only pressing it sends
    expect(q(el, '[data-action="regenerate"]')).not.toBeNull()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('copies a section', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const { el, props } = await mountOverview({ stored: ENTRY })
    await click(q(el, '[data-section="summary"] [data-action="copy"]'))
    expect(writeText).toHaveBeenCalledWith('Stored summary.')
    expect(props.onNotice).toHaveBeenCalledWith('Copied')
  })

  it('says the document changed when a save changed pages the overview came from', async () => {
    let hash = DOC
    let fps = ['fp1', 'fp2']
    const { el, insights } = await mountOverview({
      stored: ENTRY,
      hash: () => hash,
      fingerprints: () => fps,
    })
    hash = 'c'.repeat(64)
    fps = ['fp1', 'fp2-edited']
    await act(async () => insights.load())
    await settle()
    expect(q(el, '[data-stale]')?.textContent).toContain('The document has changed')
    expect(q(el, '[data-action="regenerate-stale"]')?.textContent).toBe('Regenerate')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('collapses and remembers it', async () => {
    const { el } = await mountOverview({ stored: ENTRY })
    await click(q(el, '.ai-overview-toggle'))
    expect(q(el, '.ai-overview-body')).toBeNull()
    expect(window.localStorage.getItem('pdf-ai-overview-open')).toBe('0')
  })
})
