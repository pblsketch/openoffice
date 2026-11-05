/**
 * Side-by-side translation view, the actions (reading-assist spec 4.5, 10
 * item 5): the page translation button (one press on a subscription, the
 * paid-route question once per tab and again for another provider), its job
 * record and provider record, "translate the rest (N)", one document job at
 * a time, the stop reason in the column, "translate again" on a paragraph
 * (one call, the whole-page key, the question first for an edit), the
 * paragraph editor and its round trip, and "translate all pages".
 *
 * The main process is a fake preload bridge and fake structure / store
 * channels: no provider, no subscription program and no network is reached;
 * "sending" means a call to the fake `aiStream`.
 */
import { act, createElement, type ReactElement } from 'react'
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
import {
  blockKeyString,
  translationBlockKeys,
  type TranslationBlockKey,
} from '../../../packages/pdf-structure/src/store/keys'
import type {
  JobRecordInput,
  TranslationBlockEntry,
} from '../../../packages/pdf-structure/src/store/store'
import {
  buildTranslatedTree,
  translationUnits,
} from '../../../packages/pdf-structure/src/translate'
import type {
  DocumentTree,
  InlineRun,
  TreeBlock,
} from '../../../packages/pdf-structure/src/tree/types'
import { strings } from '../src/renderer/i18n/strings'
import type { TFunc } from '../src/renderer/i18n/locale'
import type { TranslationMode } from '../../../packages/pdf-structure/src/store/job-keys'
import type { PdfStoreWriteRequest, PdfStoredTranslation } from '../src/shared/ipc'
import { DocumentJobSession } from '../src/renderer/doc-jobs/job-session'
import { useBilingual } from '../src/renderer/bilingual/useBilingual'
import type { BilingualDataApi } from '../src/renderer/bilingual/useBilingualData'
import { useBilingualActions } from '../src/renderer/bilingual/BilingualActions'
import { pageActionLabel } from '../src/renderer/bilingual/actions-controller'
import type { BilingualStoreApi } from '../src/renderer/bilingual/actions-controller'

const translate = createI18n(strings)
const t: TFunc = (key, params) => translate('en', key, params)

const DOC = 'c'.repeat(64)
const PATH = 'C:\\docs\\paper.pdf'

const runs = (text: string): InlineRun[] => [{ kind: 'text', text }]
const at = (page: number) => ({ page, pageFingerprint: `fp${page}`, source: 'pdf' as const })
const para = (id: string, page: number, text: string, r: InlineRun[] = runs(text)): TreeBlock => ({
  ...at(page),
  kind: 'paragraph',
  id,
  runs: r,
})

/**
 * Three pages. Page 1: a heading (bold), the same sentence twice, one more
 * paragraph. Page 2: one paragraph. Page 3: one paragraph.
 */
function fakeTree(): DocumentTree {
  return {
    version: 1,
    variant: 'original',
    info: {},
    sourcePageCount: 3,
    pages: [1, 2, 3].map((page) => ({
      page,
      fingerprint: `fp${page}`,
      status: 'text' as const,
      widthPt: 600,
      heightPt: 800,
    })),
    blocks: [
      {
        ...at(1),
        kind: 'heading',
        id: 'p1.0',
        level: 1,
        levelSource: 'font',
        runs: [{ kind: 'text', text: 'Introduction', bold: true }],
      },
      para('p1.1', 1, 'Same words here.'),
      para('p1.2', 1, 'Same words here.'),
      para('p1.3', 1, 'One more paragraph.'),
      para('p2.0', 2, 'Second page text.'),
      para('p3.0', 3, 'Third page text.'),
    ],
    footnotes: [],
    outline: [],
    toc: [],
    footnoteLinkFailedPages: [],
    warnings: [],
  } as unknown as DocumentTree
}

function keysOf(tree: DocumentTree): Map<string, TranslationBlockKey> {
  const units = translationUnits(tree)
  const keys = translationBlockKeys(units)
  return new Map(units.map((u, i) => [u.key, keys[i]!]))
}

// ── the bridge: settings, statuses, the AI stream ──

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

const promptBlocks = (request: StreamStart): Array<{ id: string; text: string }> => {
  const prompt = request.messages[0]?.text ?? ''
  const json = /<document_blocks>\n([\s\S]*)\n<\/document_blocks>/.exec(prompt)?.[1] ?? '{}'
  return (JSON.parse(json) as { blocks?: Array<{ id: string; text: string }> }).blocks ?? []
}

/** every block back with `[ko] ` in front */
const goodAnswer = (request: StreamStart): string =>
  JSON.stringify({
    translations: promptBlocks(request).map((b) => ({ id: b.id, text: `[ko] ${b.text}` })),
  })

function fakeBridge(initial: { settings: AiSettings; statuses: SubscriptionStatusMap }) {
  const state = { settings: initial.settings, statuses: initial.statuses }
  const starts: StreamStart[] = []
  const answered = new Set<string>()
  const listeners = new Set<(chunk: IpcStreamChunk) => void>()
  const settingsListeners = new Set<() => void>()
  const subscription = {
    statuses: vi.fn(async () => state.statuses),
    recheck: vi.fn(async () => state.statuses),
    login: vi.fn(async () => ({ ok: true })),
    install: vi.fn(async () => ({ ok: true })),
    setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses: state.statuses })),
    onChanged: () => () => {},
    openInstallHelp: vi.fn(async () => {}),
  }
  const api = {
    getAiSettings: vi.fn(async () => state.settings),
    setAiSettings: vi.fn(async (next: AiSettings) => {
      state.settings = next
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
  const pending = () => starts.filter((s) => !answered.has(s.requestId))
  return {
    api,
    starts,
    answerAll(answer: (s: StreamStart) => string = goodAnswer) {
      for (const s of pending()) {
        answered.add(s.requestId)
        push(s.requestId, { type: 'delta', text: answer(s) })
        push(s.requestId, { type: 'done' })
      }
    },
    fail(chunk: Omit<IpcStreamChunk, 'requestId'>) {
      for (const s of pending()) {
        answered.add(s.requestId)
        push(s.requestId, chunk)
      }
    },
    changeSettings(next: AiSettings) {
      state.settings = next
      for (const l of [...settingsListeners]) l()
    },
  }
}

// ── the store ──

/** the fake store's key: the language, with `#easy` for an easy explanation */
const storeKey = (lang: string, mode?: string): string => (mode === 'easy' ? `${lang}#easy` : lang)

function fakeStore(tree: DocumentTree, stored: Record<string, PdfStoredTranslation> = {}) {
  const translations = new Map<
    string,
    { provider: string | null; model: string | null; blocks: Map<string, TranslationBlockEntry> }
  >()
  // a key `ko#easy` stores an easy explanation in Korean
  for (const [lang, tr] of Object.entries(stored)) {
    translations.set(lang, {
      provider: tr.provider,
      model: tr.model,
      blocks: new Map(tr.blocks.map((b) => [blockKeyString(b.key), b])),
    })
  }
  const writes: PdfStoreWriteRequest[] = []
  const jobs: JobRecordInput[] = []
  const ensure = (lang: string, mode?: string) => {
    let tr = translations.get(storeKey(lang, mode))
    if (!tr) {
      tr = { provider: null, model: null, blocks: new Map() }
      translations.set(storeKey(lang, mode), tr)
    }
    return tr
  }
  const store = {
    docHash: vi.fn(async () => ({ ok: true as const, docHash: DOC })),
    aiReadPages: vi.fn(async () => ({ ok: true as const, pages: [] })),
    translationRecency: vi.fn(async (_doc: string, mode?: string) => ({
      ok: true as const,
      langs: [...translations.keys()]
        .filter((key) => key.endsWith('#easy') === (mode === 'easy'))
        .map((key) => ({ lang: key.replace(/#easy$/, ''), savedAt: 5 })),
    })),
    translation: vi.fn(async (_doc: string, lang: string, mode?: string) => {
      const tr = translations.get(storeKey(lang, mode))
      return {
        ok: true as const,
        translation: tr
          ? { lang, provider: tr.provider, model: tr.model, blocks: [...tr.blocks.values()] }
          : null,
      }
    }),
    unfinishedJobs: vi.fn(async () => ({ ok: true as const, jobs: [] })),
    migrate: vi.fn(),
    write: vi.fn(async (request: PdfStoreWriteRequest) => {
      writes.push(request)
      if (request.kind === 'translationMeta') {
        const tr = ensure(request.lang, request.mode)
        tr.provider = request.provider
        tr.model = request.model
      }
      if (request.kind === 'translationBlocks') {
        const tr = ensure(request.lang, request.mode)
        for (const b of request.blocks) tr.blocks.set(blockKeyString(b.key), { ...b, savedAt: 9 })
      }
      if (request.kind === 'editedTranslationBlock') {
        const tr = ensure(request.lang, request.mode)
        tr.blocks.set(blockKeyString(request.key), {
          key: request.key,
          status: 'translated',
          text: request.text,
          edited: true,
          savedAt: 9,
        })
      }
      if (request.kind === 'job') jobs.push(request.job)
      return { ok: true as const }
    }),
  }
  return { store, writes, jobs, translations }
}

function storedOf(
  tree: DocumentTree,
  lang: string,
  blocks: Record<string, Partial<TranslationBlockEntry>>,
  provider: string | null = 'codex',
): PdfStoredTranslation {
  const keys = keysOf(tree)
  return {
    lang,
    provider,
    model: provider ? 'm' : null,
    blocks: Object.entries(blocks).map(([id, b]) => ({
      key: keys.get(id)!,
      status: 'translated' as const,
      savedAt: 1,
      ...b,
    })),
  }
}

// ── mounting ──

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let container: HTMLDivElement | null = null
let bridge: ReturnType<typeof fakeBridge>

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

interface HarnessProps {
  api: BilingualDataApi
  store: BilingualStoreApi
  session: DocumentJobSession
  onTranslateAll: (lang: string | null, mode: TranslationMode) => void
}

function Harness(p: HarnessProps): ReactElement {
  const actions = useBilingualActions({
    session: p.session,
    store: p.store,
    lang: 'en',
    t,
    filePath: PATH,
    password: undefined,
    onTranslateAll: p.onTranslateAll,
  })
  const view = useBilingual({
    enabled: true,
    onClose: () => {},
    filePath: PATH,
    password: undefined,
    uiLang: 'en',
    t,
    revision: 0,
    api: p.api,
    scrollRef: { current: null },
    scale: 1,
    pageGeom: () => ({ pw: 600, ph: 800, rot: 0 }),
    savedRot: () => 0,
    savedPageCount: 3,
    rowCount: 3,
    visibleRows: new Set([0, 1, 2]),
    unsavedPageEdits: false,
    reservedWidth: 0,
    slots: actions.slots,
  })
  return createElement(
    'div',
    null,
    view.bar,
    [0, 1, 2].map((i) =>
      createElement('div', { key: i, className: 'pdf-row' }, view.column([i], i)),
    ),
  )
}

async function mount(
  o: {
    settings?: Partial<AiSettings>
    statuses?: SubscriptionStatusMap
    stored?: Record<string, PdfStoredTranslation>
  } = {},
) {
  const tree = fakeTree()
  bridge = fakeBridge({
    settings: { ...normalizeAiSettings({}), subscriptionNoticeSeen: true, ...o.settings },
    statuses: o.statuses ?? statusesOf('ready', 'signed-out'),
  })
  vi.stubGlobal('pdfApi', bridge.api)
  const s = fakeStore(tree, o.stored ?? {})
  const api = {
    tree: vi.fn(async () => ({
      ok: true as const,
      docHash: DOC,
      tree,
      fingerprints: [],
      cached: false,
    })),
    cancel: vi.fn(async () => true),
    onProgress: () => () => {},
    store: s.store,
  } as unknown as BilingualDataApi
  const session = new DocumentJobSession(new DocumentJobRegistry())
  const onTranslateAll = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(
      createElement(Harness, {
        api,
        store: s.store as unknown as BilingualStoreApi,
        session,
        onTranslateAll,
      }),
    ),
  )
  await settle()
  await until(
    () => container!.querySelector('[data-bl-page="1"] .bl-col-body') !== null,
    'the view',
  )
  return { el: container, tree, ...s, session, onTranslateAll }
}

const q = (el: Element, selector: string) => el.querySelector(selector) as HTMLElement | null
const col = (el: Element, page: number) => q(el, `[data-bl-page="${page}"]`)!
const pageButton = (el: Element, page: number) =>
  q(col(el, page), '[data-action="bl-translate-page"]') as HTMLButtonElement | null
const item = (el: Element, id: string) => q(el, `[data-bl-id="${id}"]`)!
const click = async (target: HTMLElement | null) => {
  if (!target) throw new Error('nothing to click')
  await act(async () => target.click())
  await settle()
}
const dblclick = async (target: HTMLElement) => {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  })
  await settle()
}

// ── page translation ──

describe('page translation button', () => {
  it('labels: "translate this page" with nothing stored, "translate the rest (N)" otherwise', () => {
    expect(pageActionLabel({ units: 4, pending: 4 }, t)).toBe(t('blTranslatePage'))
    expect(pageActionLabel({ units: 4, pending: 3 }, t)).toBe(t('blTranslateRest', { count: 3 }))
    expect(pageActionLabel({ units: 4, pending: 0 }, t)).toBeNull()
  })

  it('shows the counts per page and the provider, and sends nothing on showing', async () => {
    const tree = fakeTree()
    const m = await mount({ stored: { ko: storedOf(tree, 'ko', { 'p1.0': { text: '서론' } }) } })
    expect(pageButton(m.el, 1)?.textContent).toBe(t('blTranslateRest', { count: 3 }))
    expect(pageButton(m.el, 1)?.dataset.blPending).toBe('3')
    expect(pageButton(m.el, 2)?.textContent).toBe(t('blTranslatePage'))
    const name = aiProviderDisplayName('claude-code')
    await until(() => q(col(m.el, 1), '.bl-provider') !== null, 'the provider name')
    expect(q(col(m.el, 1), '.bl-provider')?.textContent).toBe(name)
    // the app's screen tip, not the native title
    expect(pageButton(m.el, 1)?.dataset.tip).toBe(t('blSendsTo', { provider: name }))
    expect(pageButton(m.el, 1)?.hasAttribute('title')).toBe(false)
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(m.writes).toEqual([])
  })

  it('on a subscription one press sends exactly that page’s pending blocks, as a page job', async () => {
    const tree = fakeTree()
    const m = await mount({ stored: { ko: storedOf(tree, 'ko', { 'p1.0': { text: '서론' } }) } })
    await click(pageButton(m.el, 1))
    await until(() => bridge.starts.length === 1, 'the call')
    const sent = bridge.starts[0]!
    expect(sent.tools ?? []).toEqual([])
    expect(sent.settings.provider).toBe('claude-code')
    expect(promptBlocks(sent).map((b) => b.text)).toEqual([
      'Same words here.',
      'Same words here.',
      'One more paragraph.',
    ])
    expect(q(col(m.el, 1), '[data-bl-page-job="1"]')).not.toBeNull()

    await act(async () => bridge.answerAll())
    await until(() => item(m.el, 'p1.3').textContent?.includes('[ko] One more') === true, 'refresh')
    const keys = keysOf(tree)
    const blocks = m.writes.flatMap((w) => (w.kind === 'translationBlocks' ? w.blocks : []))
    expect(blocks.map((b) => blockKeyString(b.key))).toEqual(
      ['p1.1', 'p1.2', 'p1.3'].map((id) => blockKeyString(keys.get(id)!)),
    )
    // the same sentence twice: told apart by occurrence
    expect(blocks.map((b) => b.key.occurrence)).toEqual([0, 1, 0])
    // its own job record; never the document translation's, never a restart
    expect(m.jobs.length).toBeGreaterThan(0)
    expect(m.jobs.every((j) => j.kind === 'translate-page' && j.lang === 'ko')).toBe(true)
    expect(m.writes.some((w) => w.kind === 'deleteTranslation')).toBe(false)
    // the stored provider record (another AI) is left alone, and nobody is told about the mix
    expect(m.writes.some((w) => w.kind === 'translationMeta')).toBe(false)
    expect(m.translations.get('ko')!.provider).toBe('codex')
    expect(bridge.starts).toHaveLength(1)
    expect(pageButton(m.el, 1)).toBeNull()
  })

  it('writes the provider record when the language has none', async () => {
    const m = await mount()
    await click(pageButton(m.el, 2))
    await until(() => bridge.starts.length === 1, 'the call')
    await act(async () => bridge.answerAll())
    await until(() => m.writes.some((w) => w.kind === 'translationBlocks'), 'the blocks')
    expect(m.writes.find((w) => w.kind === 'translationMeta')).toMatchObject({
      lang: expect.any(String),
      provider: 'claude-code',
    })
  })

  it('one document job at a time: other buttons wait, "translate again" too', async () => {
    const tree = fakeTree()
    const m = await mount({ stored: { ko: storedOf(tree, 'ko', { 'p1.0': { text: '서론' } }) } })
    await click(pageButton(m.el, 2))
    await until(() => bridge.starts.length === 1, 'the call')
    expect(pageButton(m.el, 1)?.disabled).toBe(true)
    expect(pageButton(m.el, 1)?.textContent).toBe(t('blWaiting'))
    const again = q(item(m.el, 'p1.0'), '[data-action="bl-retranslate"]') as HTMLButtonElement
    expect(again.disabled).toBe(true)
    await click(pageButton(m.el, 1))
    await click(again)
    expect(bridge.starts).toHaveLength(1)
    await act(async () => bridge.answerAll())
    await until(() => pageButton(m.el, 1)?.disabled === false, 'the wait to end')
  })

  it('stops at once on a rate limit and says why inside the column', async () => {
    const m = await mount()
    await click(pageButton(m.el, 1))
    await until(() => bridge.starts.length === 1, 'the call')
    const resetsAt = Date.now() + 3_600_000
    await act(async () =>
      bridge.fail({
        type: 'error',
        error: 'limit',
        errorCode: 'rate-limit',
        errorResetsAt: resetsAt,
      }),
    )
    await until(() => q(col(m.el, 1), '[data-bl-page-note="1"]') !== null, 'the stop reason')
    expect(q(col(m.el, 1), '[data-bl-page-note="1"]')?.textContent).toBe(
      aiRunErrorText('en', { kind: 'rate-limit', provider: 'claude-code', resetsAt }),
    )
    expect(bridge.starts).toHaveLength(1)
    expect(m.jobs.at(-1)).toMatchObject({ kind: 'translate-page', state: 'stopped' })
  })

  it('a paid route asks once per tab, and again when the provider changes', async () => {
    const base = normalizeAiSettings({})
    const m = await mount({
      settings: {
        provider: 'anthropic',
        providers: { ...base.providers, anthropic: { apiKey: 'k', model: 'claude-sonnet-x' } },
      },
    })
    const name = aiProviderDisplayName('anthropic')
    await until(() => q(col(m.el, 1), '.bl-provider') !== null, 'the route')
    await click(pageButton(m.el, 1))
    const ask = q(col(m.el, 1), '[data-bl-paid-ask="1"]')
    expect(ask?.textContent).toContain(t('blPaidAsk', { provider: name }))
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    // cancel: nothing sent, the button is back
    await click(q(col(m.el, 1), '[data-action="bl-paid-no"]'))
    expect(q(col(m.el, 1), '[data-bl-paid-ask]')).toBeNull()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()

    await click(pageButton(m.el, 1))
    await click(q(col(m.el, 1), '[data-action="bl-paid-yes"]'))
    await until(() => bridge.starts.length === 1, 'the call')
    expect(bridge.starts[0]!.settings.provider).toBe('anthropic')
    await act(async () => bridge.answerAll())
    await until(() => pageButton(m.el, 2)?.disabled === false, 'the job to end')

    // the same provider: no question this time
    await click(pageButton(m.el, 2))
    expect(q(col(m.el, 2), '[data-bl-paid-ask]')).toBeNull()
    await until(() => bridge.starts.length === 2, 'the second call')
    await act(async () => bridge.answerAll())
    await until(() => pageButton(m.el, 3)?.disabled === false, 'the second job to end')

    // another paid provider: asked again
    bridge.changeSettings({
      ...base,
      subscriptionNoticeSeen: true,
      provider: 'openai',
      providers: {
        ...base.providers,
        openai: { ...base.providers.openai, apiKey: 'sk', model: 'g' },
      },
    })
    await until(
      () => q(col(m.el, 3), '.bl-provider')?.textContent === aiProviderDisplayName('openai'),
      'the new route',
    )
    await click(pageButton(m.el, 3))
    expect(q(col(m.el, 3), '[data-bl-paid-ask="3"]')?.textContent).toContain(
      t('blPaidAsk', { provider: aiProviderDisplayName('openai') }),
    )
    await settle()
    expect(bridge.starts).toHaveLength(2)
  })

  it('a provider change while the question is shown asks again for the new one; nothing is sent', async () => {
    const base = normalizeAiSettings({})
    const m = await mount({
      settings: {
        provider: 'anthropic',
        providers: { ...base.providers, anthropic: { apiKey: 'k', model: 'claude-sonnet-x' } },
      },
    })
    await until(() => q(col(m.el, 1), '.bl-provider') !== null, 'the route')
    await click(pageButton(m.el, 1))
    expect(q(col(m.el, 1), '[data-bl-paid-ask="1"]')?.textContent).toContain(
      t('blPaidAsk', { provider: aiProviderDisplayName('anthropic') }),
    )
    // the settings change in another window while the question is on screen
    bridge.changeSettings({
      ...base,
      subscriptionNoticeSeen: true,
      provider: 'openai',
      providers: {
        ...base.providers,
        openai: { ...base.providers.openai, apiKey: 'sk', model: 'g' },
      },
    })
    await settle()
    await settle()
    await click(q(col(m.el, 1), '[data-action="bl-paid-yes"]'))
    expect(q(col(m.el, 1), '[data-bl-paid-ask="1"]')?.textContent).toContain(
      t('blPaidAsk', { provider: aiProviderDisplayName('openai') }),
    )
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    // agreeing to the provider named now sends with it
    await click(q(col(m.el, 1), '[data-action="bl-paid-yes"]'))
    await until(() => bridge.starts.length === 1, 'the call')
    expect(bridge.starts[0]!.settings.provider).toBe('openai')
  })

  it('goes through the send gate: the first-connection notice holds the press until acknowledged', async () => {
    const m = await mount({ settings: { subscriptionNoticeSeen: false } })
    await click(pageButton(m.el, 2))
    await until(() => q(m.el, '.ai-sub-first') !== null, 'the notice')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    await click(q(m.el, '.ai-sub-first .ai-sub-btn'))
    await until(() => bridge.starts.length === 1, 'the held press to start')
  })

  it('not connected: the connect prompt answers and nothing is sent', async () => {
    const m = await mount({ statuses: statusesOf('signed-out', 'signed-out') })
    await click(pageButton(m.el, 2))
    await until(() => q(m.el, '.ai-sub-prompt') !== null, 'the connect prompt')
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })
})

// ── translate again ──

describe('translate again', () => {
  it('a failed paragraph: one call with that block alone, stored in place by its page key', async () => {
    const tree = fakeTree()
    const m = await mount({
      stored: {
        ko: storedOf(tree, 'ko', {
          'p1.1': { text: '같은 말' },
          'p1.2': { status: 'failed', reason: 'placeholder-mismatch', text: undefined },
        }),
      },
    })
    // pending paragraphs have no "translate again" (the page button covers them)
    expect(q(item(m.el, 'p1.3'), '[data-action="bl-retranslate"]')).toBeNull()
    await click(q(item(m.el, 'p1.2'), '[data-action="bl-retranslate"]'))
    await until(() => bridge.starts.length === 1, 'the call')
    expect(promptBlocks(bridge.starts[0]!).map((b) => b.text)).toEqual(['Same words here.'])
    expect(bridge.starts[0]!.tools ?? []).toEqual([])
    await act(async () => bridge.answerAll())
    await until(() => item(m.el, 'p1.2').textContent?.includes('[ko] Same') === true, 'refresh')
    const write = m.writes.find((w) => w.kind === 'translationBlocks')
    expect(write).toMatchObject({
      kind: 'translationBlocks',
      blocks: [
        { key: keysOf(tree).get('p1.2'), status: 'translated', text: '[ko] Same words here.' },
      ],
    })
    expect(write?.kind === 'translationBlocks' && write.blocks[0]!.key.occurrence).toBe(1)
    expect(bridge.starts).toHaveLength(1)
    expect(m.jobs).toEqual([])
  })

  it('a wrong answer leaves a translation as it was, after one call only', async () => {
    const tree = fakeTree()
    const m = await mount({ stored: { ko: storedOf(tree, 'ko', { 'p2.0': { text: '둘째 쪽' } }) } })
    await click(q(item(m.el, 'p2.0'), '[data-action="bl-retranslate"]'))
    await until(() => bridge.starts.length === 1, 'the call')
    await act(async () => bridge.answerAll(() => JSON.stringify({ translations: [] })))
    await until(() => q(item(m.el, 'p2.0'), '[data-bl-para-note]') !== null, 'the note')
    expect(bridge.starts).toHaveLength(1)
    expect(m.writes.filter((w) => w.kind === 'translationBlocks')).toEqual([])
    expect(item(m.el, 'p2.0').textContent).toContain('둘째 쪽')
  })

  it('waits while another process runs a job on the document: nothing is sent', async () => {
    const tree = fakeTree()
    const m = await mount({ stored: { ko: storedOf(tree, 'ko', { 'p2.0': { text: '둘째 쪽' } }) } })
    m.store.unfinishedJobs.mockResolvedValue({
      ok: true as const,
      jobs: [
        { kind: 'translate', lang: 'ko', state: 'running', outputs: [], updatedAt: Date.now() },
      ],
    } as never)
    await click(q(item(m.el, 'p2.0'), '[data-action="bl-retranslate"]'))
    await until(() => q(item(m.el, 'p2.0'), '[data-bl-para-note]') !== null, 'the note')
    expect(q(item(m.el, 'p2.0'), '[data-bl-para-note]')?.textContent).toBe(t('blBusy'))
    expect(m.store.unfinishedJobs).toHaveBeenCalledWith(DOC)
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(m.writes).toEqual([])
  })

  it('uses the screen tip, not the native title', async () => {
    const tree = fakeTree()
    const m = await mount({ stored: { ko: storedOf(tree, 'ko', { 'p2.0': { text: '둘째 쪽' } }) } })
    const again = q(item(m.el, 'p2.0'), '[data-action="bl-retranslate"]')!
    expect(again.dataset.tip).toBe(t('blRetranslateTip'))
    expect(again.hasAttribute('title')).toBe(false)
  })

  it('an edited paragraph asks first; Cancel sends nothing', async () => {
    const tree = fakeTree()
    const m = await mount({
      stored: { ko: storedOf(tree, 'ko', { 'p2.0': { text: '사람이 고침', edited: true } }) },
    })
    await click(q(item(m.el, 'p2.0'), '[data-action="bl-retranslate"]'))
    expect(q(item(m.el, 'p2.0'), '[data-bl-discard-ask]')?.textContent).toContain(
      t('blDiscardEditAsk'),
    )
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    await click(q(item(m.el, 'p2.0'), '[data-action="bl-discard-no"]'))
    expect(q(item(m.el, 'p2.0'), '[data-bl-discard-ask]')).toBeNull()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()

    await click(q(item(m.el, 'p2.0'), '[data-action="bl-retranslate"]'))
    await click(q(item(m.el, 'p2.0'), '[data-action="bl-discard-yes"]'))
    await until(() => bridge.starts.length === 1, 'the call')
    await act(async () => bridge.answerAll())
    await until(() => m.writes.some((w) => w.kind === 'translationBlocks'), 'the write')
    const write = m.writes.find((w) => w.kind === 'translationBlocks')
    expect(write?.kind === 'translationBlocks' && write.blocks[0]).not.toHaveProperty('edited')
  })
})

// ── editing ──

describe('editing a translated paragraph', () => {
  it('double-click opens the editor with the "formatting will be removed" hint; Escape cancels', async () => {
    const tree = fakeTree()
    const marked: InlineRun[] = [{ kind: 'text', text: '서론', bold: true }]
    const m = await mount({
      stored: { ko: storedOf(tree, 'ko', { 'p1.0': { text: '서론', runs: marked } }) },
    })
    await dblclick(item(m.el, 'p1.0'))
    const area = q(item(m.el, 'p1.0'), 'textarea') as HTMLTextAreaElement
    expect(area.value).toBe('서론')
    expect(q(item(m.el, 'p1.0'), '[data-bl-format-hint]')?.textContent).toBe(t('blEditDropsFormat'))
    await act(async () => {
      area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await settle()
    expect(q(item(m.el, 'p1.0'), 'textarea')).toBeNull()
    expect(m.writes).toEqual([])
    // a pending paragraph has nothing to edit
    await dblclick(item(m.el, 'p1.3'))
    expect(q(item(m.el, 'p1.3'), 'textarea')).toBeNull()
  })

  it('saves plain text as an edit, shows it, and the outputs use it', async () => {
    const tree = fakeTree()
    const m = await mount({ stored: { ko: storedOf(tree, 'ko', { 'p2.0': { text: '둘째 쪽' } }) } })
    await dblclick(item(m.el, 'p2.0'))
    expect(q(item(m.el, 'p2.0'), '[data-bl-format-hint]')).toBeNull()
    const area = q(item(m.el, 'p2.0'), 'textarea') as HTMLTextAreaElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        area,
        '사람이 고친 둘째 쪽',
      )
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(q(item(m.el, 'p2.0'), '[data-action="bl-edit-save"]'))
    await until(() => item(m.el, 'p2.0').classList.contains('bl-edited'), 'the edit to show')
    expect(m.writes).toEqual([
      {
        kind: 'editedTranslationBlock',
        docHash: DOC,
        lang: 'ko',
        key: keysOf(tree).get('p2.0'),
        text: '사람이 고친 둘째 쪽',
      },
    ])
    expect(item(m.el, 'p2.0').textContent).toContain('사람이 고친 둘째 쪽')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()

    // the translated outputs are built from the stored blocks: the edit is what they show
    const tr = m.translations.get('ko')!
    const out = buildTranslatedTree(tree, 'ko', {
      lang: 'ko',
      provider: tr.provider,
      model: tr.model,
      blocks: tr.blocks,
    })
    const texts = out.blocks.flatMap((b) =>
      'runs' in b
        ? [(b.runs as InlineRun[]).map((r) => (r.kind === 'text' ? r.text : '')).join('')]
        : [],
    )
    expect(texts).toContain('사람이 고친 둘째 쪽')
    expect(texts).not.toContain('Second page text.')
  })
})

// ── the bar ──

describe('translate all pages', () => {
  it('opens the document translation window for the shown language; nothing is sent', async () => {
    const tree = fakeTree()
    const m = await mount({ stored: { ko: storedOf(tree, 'ko', { 'p1.0': { text: '서론' } }) } })
    await click(q(m.el, '[data-action="bl-translate-all"]'))
    expect(m.onTranslateAll).toHaveBeenCalledWith('ko', 'translate')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })
})

// ── the easy explanation (translation-reading spec 5.3) ──

describe('easy explanation in the side-by-side view', () => {
  const modeButton = (el: Element, mode: TranslationMode) =>
    q(el, `[data-bl-mode="${mode}"]`) as HTMLButtonElement | null
  const easyStored = (tree: DocumentTree) => ({
    ko: storedOf(tree, 'ko', { 'p2.0': { text: '둘째 쪽 번역' } }),
    'ko#easy': storedOf(tree, 'ko', { 'p2.0': { text: '둘째 쪽 쉬운 풀이' } }),
  })

  it('defaults to the translation; the switch shows the easy results and is remembered; nothing is sent', async () => {
    const tree = fakeTree()
    const m = await mount({ stored: easyStored(tree) })
    expect(modeButton(m.el, 'translate')?.getAttribute('aria-pressed')).toBe('true')
    expect(modeButton(m.el, 'easy')?.getAttribute('aria-pressed')).toBe('false')
    expect(item(m.el, 'p2.0').textContent).toContain('둘째 쪽 번역')

    await click(modeButton(m.el, 'easy'))
    await until(
      () => item(m.el, 'p2.0').textContent?.includes('쉬운 풀이') === true,
      'the easy text',
    )
    expect(item(m.el, 'p2.0').textContent).not.toContain('둘째 쪽 번역')
    // a paragraph with no easy result stays the faint source text
    expect(item(m.el, 'p1.3').className).toContain('bl-source')
    expect(m.store.translation).toHaveBeenCalledWith(DOC, 'ko', 'easy')
    expect(m.store.translationRecency).toHaveBeenCalledWith(DOC, 'easy')
    expect(window.localStorage.getItem('genoffice-pdf-bilingual-mode')).toBe('easy')
    // the labels follow the mode
    expect(pageButton(m.el, 2)).toBeNull()
    expect(pageButton(m.el, 1)?.textContent).toBe(t('blEasyPage'))
    expect(q(m.el, '[data-action="bl-translate-all"]')?.textContent).toBe(t('blEasyTranslateAll'))

    // hovering a paragraph and switching back send nothing and write nothing
    await act(async () => {
      item(m.el, 'p2.0').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await click(modeButton(m.el, 'translate'))
    await until(() => item(m.el, 'p2.0').textContent?.includes('번역') === true, 'the translation')
    await click(modeButton(m.el, 'easy'))
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(m.writes).toEqual([])
  })

  it('a new view opens in the mode chosen last', async () => {
    window.localStorage.setItem('genoffice-pdf-bilingual-mode', 'easy')
    const tree = fakeTree()
    const m = await mount({ stored: easyStored(tree) })
    expect(modeButton(m.el, 'easy')?.getAttribute('aria-pressed')).toBe('true')
    await until(
      () => item(m.el, 'p2.0').textContent?.includes('쉬운 풀이') === true,
      'the easy text',
    )
    expect(q(m.el, '.bl-bar-lang span')?.textContent).toBe(t('blEasyLanguage'))
  })

  it('an easy view with nothing stored defaults to the UI language', async () => {
    window.localStorage.setItem('genoffice-pdf-bilingual-mode', 'easy')
    const m = await mount({
      stored: { ko: storedOf(fakeTree(), 'ko', { 'p2.0': { text: '둘' } }) },
    })
    expect((q(m.el, '.bl-bar-lang select') as HTMLSelectElement).value).toBe('en')
  })

  it('"explain this page" runs an easy page job: every write and job record carries the mode', async () => {
    window.localStorage.setItem('genoffice-pdf-bilingual-mode', 'easy')
    const tree = fakeTree()
    const m = await mount({ stored: easyStored(tree) })
    await until(() => pageButton(m.el, 1) !== null, 'the page button')
    expect(pageButton(m.el, 3)?.textContent).toBe(t('blEasyPage'))
    await click(pageButton(m.el, 1))
    await until(() => bridge.starts.length === 1, 'the call')
    expect(bridge.starts[0]!.tools ?? []).toEqual([])
    await act(async () => bridge.answerAll())
    await until(() => item(m.el, 'p1.3').textContent?.includes('[ko] One more') === true, 'refresh')
    const stored = m.writes.filter(
      (w) => w.kind === 'translationBlocks' || w.kind === 'translationMeta',
    )
    expect(stored.length).toBeGreaterThan(0)
    expect(stored.every((w) => 'mode' in w && w.mode === 'easy')).toBe(true)
    expect(m.jobs.length).toBeGreaterThan(0)
    expect(m.jobs.every((j) => j.kind === 'translate-page' && j.mode === 'easy')).toBe(true)
    // the plain translation is left alone
    expect(m.translations.get('ko')!.blocks.size).toBe(1)
    expect(m.translations.get('ko#easy')!.blocks.size).toBe(5)
  })

  it('"explain the rest (N)" names the easy explanation', () => {
    expect(pageActionLabel({ units: 4, pending: 3 }, t, 'easy')).toBe(t('blEasyRest', { count: 3 }))
    expect(pageActionLabel({ units: 4, pending: 4 }, t, 'easy')).toBe(t('blEasyPage'))
  })

  it('"explain again" on one paragraph writes the easy result only', async () => {
    window.localStorage.setItem('genoffice-pdf-bilingual-mode', 'easy')
    const tree = fakeTree()
    const m = await mount({ stored: easyStored(tree) })
    await until(
      () => item(m.el, 'p2.0').textContent?.includes('쉬운 풀이') === true,
      'the easy text',
    )
    const again = q(item(m.el, 'p2.0'), '[data-action="bl-retranslate"]')!
    expect(again.textContent).toBe(t('blEasyRetranslate'))
    await click(again)
    await until(() => bridge.starts.length === 1, 'the call')
    expect(promptBlocks(bridge.starts[0]!).map((b) => b.text)).toEqual(['Second page text.'])
    await act(async () => bridge.answerAll())
    await until(() => m.writes.some((w) => w.kind === 'translationBlocks'), 'the write')
    expect(m.writes.find((w) => w.kind === 'translationBlocks')).toMatchObject({
      lang: 'ko',
      mode: 'easy',
      blocks: [{ key: keysOf(tree).get('p2.0'), status: 'translated' }],
    })
    const plain = m.translations.get('ko')!.blocks.get(blockKeyString(keysOf(tree).get('p2.0')!))
    expect(plain).toMatchObject({ text: '둘째 쪽 번역' })
    expect(m.jobs).toEqual([])
  })

  it('an edit of an easy paragraph is stored as an edited easy block', async () => {
    window.localStorage.setItem('genoffice-pdf-bilingual-mode', 'easy')
    const tree = fakeTree()
    const m = await mount({ stored: easyStored(tree) })
    await until(
      () => item(m.el, 'p2.0').textContent?.includes('쉬운 풀이') === true,
      'the easy text',
    )
    await dblclick(item(m.el, 'p2.0'))
    const area = q(item(m.el, 'p2.0'), 'textarea') as HTMLTextAreaElement
    expect(area.getAttribute('aria-label')).toBe(t('blEasyEditLabel'))
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        area,
        '사람이 고친 쉬운 풀이',
      )
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(q(item(m.el, 'p2.0'), '[data-action="bl-edit-save"]'))
    await until(() => item(m.el, 'p2.0').classList.contains('bl-edited'), 'the edit to show')
    expect(m.writes).toEqual([
      {
        kind: 'editedTranslationBlock',
        docHash: DOC,
        lang: 'ko',
        key: keysOf(tree).get('p2.0'),
        text: '사람이 고친 쉬운 풀이',
        mode: 'easy',
      },
    ])
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('the paid-route question is asked once per tab, whatever the mode', async () => {
    const base = normalizeAiSettings({})
    const m = await mount({
      settings: {
        provider: 'anthropic',
        providers: { ...base.providers, anthropic: { apiKey: 'k', model: 'claude-sonnet-x' } },
      },
    })
    await until(() => q(col(m.el, 1), '.bl-provider') !== null, 'the route')
    await click(pageButton(m.el, 1))
    expect(q(col(m.el, 1), '[data-bl-paid-ask="1"]')).not.toBeNull()
    await click(q(col(m.el, 1), '[data-action="bl-paid-yes"]'))
    await until(() => bridge.starts.length === 1, 'the call')
    await act(async () => bridge.answerAll())
    await until(() => pageButton(m.el, 2)?.disabled === false, 'the job to end')

    await click(modeButton(m.el, 'easy'))
    await until(() => pageButton(m.el, 2)?.textContent === t('blEasyPage'), 'the easy labels')
    await click(pageButton(m.el, 2))
    expect(q(col(m.el, 2), '[data-bl-paid-ask]')).toBeNull()
    await until(() => bridge.starts.length === 2, 'the easy call')
    expect(bridge.starts[1]!.settings.provider).toBe('anthropic')
  })

  it('the first paid press in the easy mode asks with the easy words; nothing is sent', async () => {
    window.localStorage.setItem('genoffice-pdf-bilingual-mode', 'easy')
    const base = normalizeAiSettings({})
    const m = await mount({
      settings: {
        provider: 'anthropic',
        providers: { ...base.providers, anthropic: { apiKey: 'k', model: 'claude-sonnet-x' } },
      },
    })
    await until(() => q(col(m.el, 1), '.bl-provider') !== null, 'the route')
    await click(pageButton(m.el, 1))
    expect(q(col(m.el, 1), '[data-action="bl-paid-yes"]')?.textContent).toBe(t('blEasyPaidYes'))
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('"explain all pages" opens the document window in the easy mode; nothing is sent', async () => {
    window.localStorage.setItem('genoffice-pdf-bilingual-mode', 'easy')
    const tree = fakeTree()
    const m = await mount({ stored: easyStored(tree) })
    await until(() => q(m.el, '[data-action="bl-translate-all"]') !== null, 'the bar')
    await click(q(m.el, '[data-action="bl-translate-all"]'))
    expect(m.onTranslateAll).toHaveBeenCalledWith('ko', 'easy')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })
})
