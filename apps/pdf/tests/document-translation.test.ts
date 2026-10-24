/**
 * Document translation, app side (spec §8, §9): the window, the
 * confirmation, the job, its lifetime, the files and the report. The main
 * process is a fake preload bridge and fake structure / store channels, so no
 * provider and no subscription program is ever reached; "sending" means a
 * call to the fake `aiStream`.
 */
import { act, createElement, createRef, Fragment } from 'react'
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
import { aiRunErrorText } from '@genoffice/ui'
import { DocumentJobRegistry } from '../../../packages/pdf-structure/src/jobs'
import { blockKeyString } from '../../../packages/pdf-structure/src/store/keys'
import type {
  JobRecordInput,
  JobStatus,
  TranslationBlockEntry,
} from '../../../packages/pdf-structure/src/store/store'
import type { TranslationReport } from '../../../packages/pdf-structure/src/translate/result'
import { translationBlockKeys } from '../../../packages/pdf-structure/src/store/keys'
import { translationUnits } from '../../../packages/pdf-structure/src/translate'
import type { DocumentTree, InlineRun } from '../../../packages/pdf-structure/src/tree/types'
import type { WritebackReport } from '../../../packages/pdf-structure/src/writeback/types'
import { strings } from '../src/renderer/i18n/strings'
import { AiPageReading, type AiPageReadingApi } from '../src/renderer/ai-read/AiPageReading'
import {
  DocumentTranslation,
  type DocumentTranslationApi,
  type DocumentTranslationHandle,
  type DocumentTranslationProps,
} from '../src/renderer/translate/DocumentTranslation'
import {
  combineReports,
  languageName,
  mergeTranslationReport,
  pdfFormatBlock,
  translationOutputName,
  untranslatedLines,
  writableFormats,
} from '../src/renderer/translate/translate-model'
import { DocumentJobSession } from '../src/renderer/doc-jobs/job-session'
import { AGENT_TOOLS, executePdfTool, type PdfAiDeps } from '../src/renderer/ai/tools'
import { createPdfSkill } from '../src/renderer/ai/pdf-skill'
import type {
  PdfStoreWriteRequest,
  PdfStructureConvertRequest,
  PdfStructureWriteBackRequest,
} from '../src/shared/ipc'

const translate = createI18n(strings)
const t: DocumentTranslationProps['t'] = (key, params) => translate('en', key, params)

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

const runs = (text: string): InlineRun[] => [{ kind: 'text', text }]
const at = (page: number) => ({ page, pageFingerprint: `fp${page}`, source: 'pdf' as const })

/** two English text pages: a heading and two paragraphs; or two scanned pages with no text */
function fakeTree(kind: 'text' | 'scanned' = 'text'): DocumentTree {
  return {
    version: 1,
    variant: 'original',
    info: {},
    sourcePageCount: 2,
    pages: [1, 2].map((page) => ({
      page,
      fingerprint: `fp${page}`,
      status: kind,
      widthPt: 595,
      heightPt: 842,
    })),
    blocks:
      kind === 'text'
        ? [
            {
              ...at(1),
              id: 'p1.1',
              kind: 'heading',
              level: 1,
              levelSource: 'font',
              runs: runs('Annual report of the river farm'),
            },
            {
              ...at(1),
              id: 'p1.2',
              kind: 'paragraph',
              runs: runs('The quick brown fox jumps over the lazy dog.'),
            },
            {
              ...at(2),
              id: 'p2.1',
              kind: 'paragraph',
              runs: runs('The harvest grew by a third this year.'),
            },
          ]
        : [],
    footnotes: [],
    outline: [],
    toc: [],
    footnoteLinkFailedPages: [],
    warnings: [],
  } as unknown as DocumentTree
}

interface StreamStart {
  requestId: string
  settings: AiSettings
  system?: string
  messages: Array<{ role: string; text?: string }>
  tools?: unknown[]
}

/** the translation answer for a request: every block prefixed with `[de] ` */
function translationAnswer(request: StreamStart): string {
  const prompt = request.messages[0]?.text ?? ''
  const json = /<document_blocks>\n([\s\S]*)\n<\/document_blocks>/.exec(prompt)?.[1] ?? '{}'
  const blocks = (JSON.parse(json) as { blocks?: Array<{ id: string; text: string }> }).blocks ?? []
  return JSON.stringify({ translations: blocks.map((b) => ({ id: b.id, text: `[de] ${b.text}` })) })
}

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
    answerAll() {
      for (const s of starts) {
        if (answered.has(s.requestId)) continue
        answered.add(s.requestId)
        push(s.requestId, { type: 'delta', text: translationAnswer(s) })
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

interface StoredTr {
  provider: string
  model: string
  blocks: Map<string, TranslationBlockEntry>
}

const EMPTY_REPORT = (lang: string, total: number, translated: number): TranslationReport => ({
  lang,
  total,
  translated,
  untranslated: [],
  pending: total - translated,
  complete: translated === total,
  provider: 'claude-code',
  model: '',
})

function fakeChannels(
  options: {
    tree?: DocumentTree
    unfinished?: JobStatus[]
    /** a stored translation: lang, provider, model, how many of the first blocks */
    stored?: {
      lang: string
      provider: string
      model: string
      blocks: number
      /** how many of those blocks a person edited (the first ones) */
      edited?: number
    }
  } = {},
) {
  const tree = options.tree ?? fakeTree()
  const translations = new Map<string, StoredTr>()
  if (options.stored) {
    const units = translationUnits(tree)
    const keys = translationBlockKeys(units)
    const blocks = new Map<string, TranslationBlockEntry>()
    for (let i = 0; i < options.stored.blocks; i++) {
      blocks.set(blockKeyString(keys[i]!), {
        key: keys[i]!,
        status: 'translated',
        text: `[old] ${i}`,
        savedAt: 1,
        ...(i < (options.stored.edited ?? 0) ? { edited: true as const } : {}),
      })
    }
    translations.set(options.stored.lang, {
      provider: options.stored.provider,
      model: options.stored.model,
      blocks,
    })
  }
  const writes: PdfStoreWriteRequest[] = []
  const jobs: JobRecordInput[] = []
  const picks: string[] = []
  const converts: PdfStructureConvertRequest[] = []
  const writeBacks: PdfStructureWriteBackRequest[] = []
  const done = (lang: string) => translations.get(lang)?.blocks.size ?? 0
  const store = {
    docHash: vi.fn(async () => ({ ok: true as const, docHash: DOC })),
    aiReadPages: vi.fn(async () => ({ ok: true as const, pages: [] })),
    translations: vi.fn(async () => ({ ok: true as const, langs: [...translations.keys()] })),
    translation: vi.fn(async (_doc: string, lang: string) => {
      const tr = translations.get(lang)
      return {
        ok: true as const,
        translation: tr
          ? { lang, provider: tr.provider, model: tr.model, blocks: [...tr.blocks.values()] }
          : null,
      }
    }),
    unfinishedJobs: vi.fn(async () => ({ ok: true as const, jobs: options.unfinished ?? [] })),
    write: vi.fn(async (request: PdfStoreWriteRequest) => {
      writes.push(request)
      if (request.kind === 'translationMeta') {
        const tr = translations.get(request.lang) ?? {
          provider: '',
          model: '',
          blocks: new Map<string, TranslationBlockEntry>(),
        }
        translations.set(request.lang, { ...tr, provider: request.provider, model: request.model })
      }
      if (request.kind === 'translationBlocks') {
        const tr = translations.get(request.lang)!
        for (const b of request.blocks) tr.blocks.set(blockKeyString(b.key), { ...b, savedAt: 2 })
      }
      if (request.kind === 'deleteTranslation') translations.delete(request.lang)
      if (request.kind === 'deleteTranslationExceptEdited') {
        const tr = translations.get(request.lang)
        let removed = 0
        for (const [k, b] of [...(tr?.blocks ?? [])]) {
          if (b.edited) continue
          tr!.blocks.delete(k)
          removed++
        }
        return { ok: true as const, removed }
      }
      if (request.kind === 'job') jobs.push(request.job)
      return { ok: true as const }
    }),
    migrate: vi.fn(async () => ({
      ok: true as const,
      docHash: DOC,
      aiReadPages: 0,
      translationBlocks: 0,
      languages: [],
      jobs: 0,
    })),
    deleteDocument: vi.fn(async () => ({ ok: true as const })),
  }
  const total = translationUnits(tree).length
  const api: DocumentTranslationApi & AiPageReadingApi = {
    tree: vi.fn(async () => ({
      ok: true as const,
      docHash: DOC,
      tree,
      fingerprints: [1, 2].map((page) => ({ page, fingerprint: `fp${page}` })),
      cached: false,
    })),
    cancel: vi.fn(async () => true),
    onProgress: vi.fn(() => () => {}),
    pickTarget: vi.fn(async (request: { kind: string; defaultName?: string }) => {
      const path = `C:\\out\\${request.defaultName}.${request.kind}`
      picks.push(path)
      return path
    }),
    convert: vi.fn(async (request: PdfStructureConvertRequest) => {
      converts.push(request)
      const lang = request.translation!.lang
      return {
        ok: true as const,
        docHash: DOC,
        outPath: request.outPath,
        warnings: [],
        assetsWritten: 0,
        assetsReused: 0,
        translation: EMPTY_REPORT(lang, total, done(lang)),
      }
    }),
    writeBack: vi.fn(async (request: PdfStructureWriteBackRequest) => {
      writeBacks.push(request)
      const lang = request.payload.lang
      const translation = EMPTY_REPORT(lang, total, done(lang))
      const writer: WritebackReport = {
        lang,
        total,
        translated: done(lang),
        overflowed: [],
        originalPages: [],
        untranslated: [],
      }
      return {
        ok: true as const,
        docHash: DOC,
        outPath: request.outPath,
        report: { writer, translation },
      }
    }),
    store,
    releaseTarget: vi.fn(async () => true),
    openResult: vi.fn(async () => true),
    revealResult: vi.fn(async () => true),
  }
  return { api, store, writes, jobs, picks, converts, writeBacks, translations }
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
  for (let i = 0; i < 80; i++) {
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
    encrypted?: boolean
    lang?: DocumentTranslationProps['lang']
    /** mount AI page reading beside it (the resume offer lives there) */
    withAiRead?: boolean
  } = {},
) {
  bridge = fakeBridge({
    settings: { ...normalizeAiSettings({}), subscriptionNoticeSeen: true, ...o.settings },
    statuses: o.statuses ?? statusesOf('ready', 'signed-out'),
  })
  vi.stubGlobal('pdfApi', bridge.api)
  const channels = o.channels ?? fakeChannels()
  const handle = createRef<DocumentTranslationHandle>()
  const session = new DocumentJobSession(new DocumentJobRegistry())
  const onOpenAiRead = vi.fn()
  const prepare = vi.fn(async () => true)
  const lang = o.lang ?? 'en'
  const props: DocumentTranslationProps = {
    filePath: PATH,
    fileName: 'report.pdf',
    password: undefined,
    pageCount: 2,
    lang,
    t,
    encrypted: o.encrypted ?? false,
    api: channels.api,
    session,
    docInfo: { title: 'Report' },
    prepare,
    onNotice: vi.fn(),
    onOpenAiRead,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const translation = createElement(DocumentTranslation, { ...props, ref: handle })
  const tree = o.withAiRead
    ? createElement(
        Fragment,
        null,
        createElement(AiPageReading, {
          filePath: PATH,
          password: undefined,
          pageCount: 2,
          lang,
          t,
          api: channels.api,
          session,
          openPageRenderer: vi.fn(),
          onNotice: vi.fn(),
          onResumeTranslation: (job: JobStatus) => handle.current?.resume(job),
          languageName: (code: string) => languageName(code, lang),
        }),
        translation,
      )
    : translation
  await act(async () => root!.render(tree))
  await settle()
  return { el: container, handle, channels, session, onOpenAiRead, prepare }
}

const q = (el: Element, selector: string) => el.querySelector(selector) as HTMLElement | null
const click = async (el: Element, selector: string) => {
  const target = q(el, selector)
  if (!target) throw new Error(`nothing matches ${selector}`)
  await act(async () => target.click())
  await settle()
}
const choose = async (el: Element, selector: string, value: string) => {
  const select = q(el, selector) as HTMLSelectElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}
const checked = (el: Element, field: string) =>
  (q(el, `[data-field="${field}"]`) as HTMLInputElement).checked
const disabled = (el: Element, selector: string) =>
  (q(el, selector) as HTMLButtonElement | HTMLInputElement).disabled

async function openWindow(
  m: Awaited<ReturnType<typeof mount>>,
  request: { lang: string | null; pages: number[] | null } = { lang: null, pages: null },
) {
  let answer: ReturnType<DocumentTranslationHandle['requestOpen']> | undefined
  await act(async () => {
    answer = m.handle.current!.requestOpen(request)
  })
  expect(answer).toEqual({ opened: true })
  await until(() => q(m.el, '[data-field="language"]') !== null, 'the choices')
}

async function openToConfirm(
  m: Awaited<ReturnType<typeof mount>>,
  request?: { lang: string | null; pages: number[] | null },
) {
  await openWindow(m, request)
  await click(m.el, '[data-action="next"]')
  await until(() => (q(m.el, '[data-calls]')?.dataset.calls ?? '') !== '', 'the estimate')
}

describe('translation window: choices', () => {
  it('defaults: the UI language (the document is not in it), every page, the PDF', async () => {
    const m = await mount({ lang: 'ko' })
    await openWindow(m)
    expect((q(m.el, '[data-field="language"]') as HTMLSelectElement).value).toBe('ko')
    expect(m.el.querySelectorAll('[data-field="language"] option')).toHaveLength(21)
    expect((q(m.el, 'input[name="pdf-translate-pages"]') as HTMLInputElement).checked).toBe(true)
    expect(checked(m.el, 'format-pdf')).toBe(true)
    expect(checked(m.el, 'format-md')).toBe(false)
    // bilingual applies to every format, the PDF included (decision 0057)
    expect(disabled(m.el, '[data-field="bilingual"]')).toBe(false)
    expect(q(m.el, '[data-units]')?.dataset.units).toBe('3')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('a document in the UI language defaults to English; the AI window can preselect another', async () => {
    const m = await mount({ lang: 'en' })
    await openWindow(m)
    expect((q(m.el, '[data-field="language"]') as HTMLSelectElement).value).toBe('en')
    await click(m.el, '.pdf-modal-actions .pdf-modal-btn:not([data-action])')
    await openWindow(m, { lang: 'de', pages: [2] })
    expect((q(m.el, '[data-field="language"]') as HTMLSelectElement).value).toBe('de')
    expect((q(m.el, '[data-field="range"]') as HTMLInputElement).value).toBe('2')
    expect(q(m.el, '[data-units]')?.dataset.units).toBe('1')
  })

  it('an encrypted document cannot have the translated PDF, with the reason shown', async () => {
    const m = await mount({ encrypted: true, lang: 'ko' })
    await openWindow(m)
    expect(disabled(m.el, '[data-field="format-pdf"]')).toBe(true)
    expect(checked(m.el, 'format-pdf')).toBe(false)
    expect(checked(m.el, 'format-md')).toBe(true)
    expect(q(m.el, '[data-pdf-blocked]')?.dataset.pdfBlocked).toBe('encrypted')
    expect(q(m.el, '[data-pdf-blocked]')?.textContent).toBe(strings.en.trPdfEncrypted)
  })

  it.each(['ar', 'he', 'hi'])('the translated PDF is not offered for %s', async (code) => {
    const m = await mount({ lang: 'ko' })
    await openWindow(m)
    expect(checked(m.el, 'format-pdf')).toBe(true)
    await choose(m.el, '[data-field="language"]', code)
    expect(disabled(m.el, '[data-field="format-pdf"]')).toBe(true)
    expect(q(m.el, '[data-pdf-blocked]')?.dataset.pdfBlocked).toBe('script')
    // the PDF alone was chosen: Markdown takes its place, so Next still works
    expect(checked(m.el, 'format-md')).toBe(true)
    expect(disabled(m.el, '[data-action="next"]')).toBe(false)
    // back to a writable language: the PDF can be chosen again
    await choose(m.el, '[data-field="language"]', 'de')
    expect(disabled(m.el, '[data-field="format-pdf"]')).toBe(false)
  })

  it('refuses a document with nothing to translate and points a scan to AI page reading', async () => {
    const m = await mount({ channels: fakeChannels({ tree: fakeTree('scanned') }) })
    await openWindow(m)
    expect(q(m.el, '[data-error="no-blocks"]')?.textContent).toContain(strings.en.trNoBlocks)
    expect(q(m.el, '[data-error="no-blocks"]')?.textContent).toContain(strings.en.trNoBlocksScanned)
    expect(disabled(m.el, '[data-action="next"]')).toBe(true)
    await click(m.el, '[data-action="open-ai-read"]')
    expect(m.onOpenAiRead).toHaveBeenCalledTimes(1)
    expect(q(m.el, '[role="dialog"]')).toBeNull()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })
})

describe('translation window: confirmation', () => {
  it('sends nothing without the confirmation, and nothing when cancelled there', async () => {
    const m = await mount({ lang: 'ko' })
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    await openToConfirm(m)
    expect(q(m.el, '[data-calls]')?.textContent).toBe(t('trConfirmCalls', { calls: 1, blocks: 3 }))
    expect(q(m.el, '[data-route="ready"]')?.textContent).toBe(
      t('arConfirmProvider', { provider: 'Claude' }),
    )
    expect(q(m.el, '[data-paid]')).toBeNull()
    expect(q(m.el, '[data-provider-change]')).toBeNull()
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(m.channels.api.pickTarget).not.toHaveBeenCalled()
    await click(m.el, '.pdf-modal-actions .pdf-modal-btn:not([data-action])')
    expect(q(m.el, '[role="dialog"]')).toBeNull()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('names the charge on a paid route', async () => {
    const base = normalizeAiSettings({})
    const m = await mount({
      settings: {
        provider: 'anthropic',
        providers: { ...base.providers, anthropic: { apiKey: 'k', model: 'claude-sonnet-x' } },
      },
    })
    await openToConfirm(m)
    expect(q(m.el, '[data-paid]')?.textContent).toMatch(/will charge for this$/)
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('shows the model the subscription resolves to and switches it on the confirmation', async () => {
    const base = normalizeAiSettings({})
    const statuses = {
      'claude-code': {
        provider: 'claude-code',
        state: 'ready',
        meteredAccepted: false,
        loginMethod: 'subscription',
        models: [
          { id: '', label: 'Default', resolved: 'claude-sonnet-5-5' },
          { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', resolved: 'claude-sonnet-5-5' },
          { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
        ],
      },
      codex: { provider: 'codex', state: 'signed-out', meteredAccepted: false },
    } as SubscriptionStatusMap
    const m = await mount({
      settings: {
        provider: 'auto',
        providers: { ...base.providers, 'claude-code': { apiKey: '', model: '' } },
      },
      statuses,
    })
    await openToConfirm(m)
    await until(() => q(m.el, '[data-model-picker] .ai-model-chip') !== null, 'the model chip')
    expect(q(m.el, '[data-model-picker] .ai-model-picker-label')?.textContent).toBe('Model')
    expect(q(m.el, '[data-model-picker] .ai-model-chip')?.textContent).toContain('Sonnet 5.5')

    await click(m.el, '[data-model-picker] .ai-model-chip')
    await until(() => q(m.el, '[role="option"]') !== null, 'the model list')
    const haiku = [...m.el.querySelectorAll('[role="option"]')].find((option) =>
      option.textContent?.includes('Haiku 4.5'),
    ) as HTMLElement | undefined
    expect(haiku).toBeTruthy()
    await act(async () => haiku!.click())
    await settle()

    const written = bridge.api.setAiSettings.mock.calls.at(-1)?.[0] as AiSettings
    expect(written.providers['claude-code']?.model).toBe('claude-haiku-4-5')
    expect(q(m.el, '[data-model-picker] .ai-model-chip')?.textContent).toContain('Haiku 4.5')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('warns when the stored translation was made with another provider or model', async () => {
    const channels = fakeChannels({
      stored: { lang: 'de', provider: 'codex', model: 'gpt-x', blocks: 1 },
    })
    const m = await mount({ channels })
    await openToConfirm(m, { lang: 'de', pages: null })
    expect(q(m.el, '[data-done]')?.textContent).toBe(t('trConfirmDone', { done: 1, total: 3 }))
    const warning = q(m.el, '[data-provider-change]')
    expect(warning?.textContent).toContain('gpt-x')
    expect(warning?.textContent).toContain('Claude')
  })

  it('does not start and shows the connect prompt when nothing is connected', async () => {
    const m = await mount({ statuses: statusesOf('signed-out', 'not-installed') })
    await openToConfirm(m)
    expect(q(m.el, '.ai-sub-prompt')).not.toBeNull()
    expect(disabled(m.el, '[data-action="start"]')).toBe(true)
    await click(m.el, '[data-action="start"]')
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('"translate again from the start" asks once more, then replaces the stored translation', async () => {
    const channels = fakeChannels({
      stored: { lang: 'de', provider: 'claude-code', model: '', blocks: 2 },
    })
    const m = await mount({ channels })
    await openToConfirm(m, { lang: 'de', pages: null })
    await click(m.el, '[data-action="restart"]')
    const ask = q(m.el, '[data-restart-confirm]')
    expect(ask?.textContent).toContain(
      t('trRestartConfirm', { language: languageName('de', 'en'), count: 2 }),
    )
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    await click(m.el, '[data-action="restart-no"]')
    expect(q(m.el, '[data-restart-confirm]')).toBeNull()
    expect(channels.writes.some((w) => w.kind === 'deleteTranslation')).toBe(false)

    await click(m.el, '[data-action="restart"]')
    await click(m.el, '[data-action="restart-yes"]')
    await until(() => bridge.starts.length === 1, 'the job to send')
    expect(channels.writes.some((w) => w.kind === 'deleteTranslation')).toBe(true)
    // every block is sent again, not only the pending one
    expect(bridge.starts[0]!.messages[0]!.text).toContain('quick brown fox')
    expect(bridge.starts[0]!.messages[0]!.text).toContain('Annual report')
  })

  it('a finished translation only writes the files: nothing is sent', async () => {
    const channels = fakeChannels({
      stored: { lang: 'de', provider: 'claude-code', model: '', blocks: 3 },
    })
    const m = await mount({ channels })
    await openToConfirm(m, { lang: 'de', pages: null })
    expect(q(m.el, '[data-nothing]')).not.toBeNull()
    await click(m.el, '[data-action="export"]')
    await until(() => q(m.el, '.pdf-translate-report') !== null, 'the report')
    expect(channels.writeBacks).toHaveLength(1)
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('bilingual on the PDF asks for a bilingual PDF', async () => {
    const channels = fakeChannels({
      stored: { lang: 'de', provider: 'claude-code', model: '', blocks: 3 },
    })
    const m = await mount({ channels })
    await openWindow(m, { lang: 'de', pages: null })
    await click(m.el, '[data-field="bilingual"]')
    await click(m.el, '[data-action="next"]')
    await until(() => q(m.el, '[data-nothing]') !== null, 'the confirmation')
    await click(m.el, '[data-action="export"]')
    await until(() => q(m.el, '.pdf-translate-report') !== null, 'the report')
    expect(channels.writeBacks[0]).toMatchObject({ payload: { lang: 'de', bilingual: true } })
  })
})

describe('translation: the job', () => {
  it('after Start: save targets first, one batch per call without tools, then the files and the report', async () => {
    const m = await mount({ lang: 'ko' })
    await openWindow(m, { lang: 'de', pages: null })
    await click(m.el, '[data-field="format-md"]')
    await click(m.el, '[data-action="next"]')
    await until(() => (q(m.el, '[data-calls]')?.dataset.calls ?? '') !== '', 'the estimate')
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 1, 'the call')
    expect(m.channels.picks).toEqual(['C:\\out\\report.de.pdf', 'C:\\out\\report.de.md'])
    const sent = bridge.starts[0]!
    expect(sent.tools ?? []).toEqual([])
    expect(sent.settings.provider).toBe('claude-code')
    expect(sent.system).toContain('German (de)')
    expect(q(m.el, '[data-job-kind="translate"][data-job-state="running"]')).not.toBeNull()
    expect(q(m.el, '.pdf-job-strip-detail')?.textContent).toBe(
      t('arConfirmProvider', { provider: 'Claude' }),
    )
    expect(q(m.el, '[role="dialog"]')).toBeNull()

    await act(async () => bridge.answerAll())
    await until(() => q(m.el, '.pdf-translate-report') !== null, 'the report')
    expect(m.channels.writeBacks[0]).toMatchObject({
      path: PATH,
      outPath: 'C:\\out\\report.de.pdf',
      payload: { lang: 'de' },
    })
    expect(m.channels.converts[0]).toMatchObject({
      format: 'md',
      outPath: 'C:\\out\\report.de.md',
      translation: { lang: 'de', bilingual: false },
    })
    expect(m.prepare).toHaveBeenCalled()
    expect(q(m.el, '[data-translated]')?.textContent).toBe(
      t('trReportTranslated', { language: languageName('de', 'ko'), translated: 3, total: 3 }),
    )
    // closing the report opens the Markdown result in a tab
    await click(m.el, '[data-action="close-report"]')
    expect(m.channels.api.openResult).toHaveBeenCalledWith({
      source: PATH,
      path: 'C:\\out\\report.de.md',
    })
  })

  it('a cancelled save dialog starts nothing', async () => {
    const m = await mount()
    ;(m.channels.api.pickTarget as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
    await openToConfirm(m, { lang: 'de', pages: null })
    await click(m.el, '[data-action="start"]')
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(q(m.el, '[data-step="confirm"]')).not.toBeNull()
  })

  it('one job per document: a second open answers with the running progress', async () => {
    const m = await mount()
    await openToConfirm(m, { lang: 'de', pages: null })
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 1, 'the job to send')
    let again: ReturnType<DocumentTranslationHandle['requestOpen']> | undefined
    await act(async () => {
      again = m.handle.current!.requestOpen({ lang: null, pages: null })
    })
    expect(again).toHaveProperty('running')
    expect(q(m.el, '[role="dialog"]')).toBeNull()
  })

  it('stops at once on a rate limit, shows when it lifts, and offers the partial export', async () => {
    const channels = fakeChannels({
      stored: { lang: 'de', provider: 'claude-code', model: '', blocks: 1 },
    })
    const m = await mount({ channels })
    await openToConfirm(m, { lang: 'de', pages: null })
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 1, 'the job to send')
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
    expect(bridge.starts).toHaveLength(1)
    expect(q(m.el, '.pdf-job-strip-title')?.textContent).toBe(
      aiRunErrorText('en', { kind: 'rate-limit', provider: 'claude-code', resetsAt }),
    )
    expect(channels.jobs.at(-1)).toMatchObject({ state: 'stopped', last_error: 'rate-limit' })
    expect(channels.writeBacks).toHaveLength(0)
    expect(q(m.el, '[data-action="continue-later"]')).not.toBeNull()

    await click(m.el, '[data-action="export-partial"]')
    await until(() => q(m.el, '.pdf-translate-report') !== null, 'the partial report')
    expect(channels.writeBacks).toHaveLength(1)
    expect(q(m.el, '.pdf-translate-report')?.dataset.partial).toBe('true')
    expect(q(m.el, '[data-pending]')?.textContent).toBe(t('trReportPending', { count: 2 }))
    expect(bridge.starts).toHaveLength(1)
  })

  it('"continue later" keeps the stored blocks and writes nothing', async () => {
    const channels = fakeChannels({
      stored: { lang: 'de', provider: 'claude-code', model: '', blocks: 1 },
    })
    const m = await mount({ channels })
    await openToConfirm(m, { lang: 'de', pages: null })
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 1, 'the job to send')
    await click(m.el, '[data-action="stop-job"]')
    await until(() => q(m.el, '[data-job-state="stopped"]') !== null, 'the job to stop')
    expect(q(m.el, '.pdf-job-strip-title')?.textContent).toBe(strings.en.trStoppedCancelled)
    await click(m.el, '[data-action="continue-later"]')
    expect(q(m.el, '[data-job-kind]')).toBeNull()
    expect(channels.writeBacks).toHaveLength(0)
    expect(channels.writes.some((w) => w.kind === 'deleteTranslation')).toBe(false)
  })

  it('closing the tab stops the job and cancels its calls', async () => {
    const m = await mount()
    await openToConfirm(m, { lang: 'de', pages: null })
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 1, 'the job to send')
    const ids = bridge.starts.map((s) => s.requestId)
    await act(async () => root!.unmount())
    root = null
    await new Promise((resolve) => setTimeout(resolve, 20))
    const cancelled = bridge.api.aiStreamCancel.mock.calls.map((c) => (c as unknown[])[0])
    expect(cancelled.sort()).toEqual([...ids].sort())
    expect(m.channels.jobs.at(-1)).toMatchObject({ state: 'stopped', last_error: 'interrupted' })
    expect(m.session.running(DOC)).toBeNull()
    expect(m.channels.writeBacks).toHaveLength(0)
  })
})

describe('translation: resume offer', () => {
  const stopped: JobStatus = {
    kind: 'translate',
    lang: 'de',
    state: 'stopped',
    last_error: 'interrupted',
    outputs: [],
    progress: { done: 1, total: 4 },
  }

  it('is offered once on reopen and never starts by itself; Continue opens the window', async () => {
    const channels = fakeChannels({ unfinished: [stopped] })
    const m = await mount({ channels, withAiRead: true })
    const offer = q(m.el, '[data-resume-kind="translate"]')
    expect(offer?.textContent).toContain(
      t('jobResumeTranslate', { language: languageName('de', 'en'), percent: 25 }),
    )
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(channels.api.tree).not.toHaveBeenCalled()
    await click(m.el, '[data-action="resume-job"]')
    await until(() => q(m.el, '[data-field="language"]') !== null, 'the window')
    expect((q(m.el, '[data-field="language"]') as HTMLSelectElement).value).toBe('de')
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(channels.api.pickTarget).not.toHaveBeenCalled()
  })
})

describe('start_document_translation tool', () => {
  const depsWith = (open?: PdfAiDeps['startDocumentTranslation']): PdfAiDeps =>
    ({
      pageCount: () => 5,
      ...(open ? { startDocumentTranslation: open } : {}),
    }) as unknown as PdfAiDeps
  const call = (input: Record<string, unknown> = {}) => ({
    id: 't1',
    name: 'start_document_translation',
    input,
  })

  it('is offered to the model and described in the skill prompt', () => {
    const tool = AGENT_TOOLS.find((x) => x.name === 'start_document_translation')
    expect(tool).toBeDefined()
    const skill = createPdfSkill({ imageGenAvailable: () => true } as unknown as PdfAiDeps)
    expect(skill.systemPrompt).toContain('start_document_translation')
  })

  it('only opens the window with the language and returns at once', async () => {
    const open = vi.fn(() => ({ opened: true as const }))
    const result = await executePdfTool(depsWith(open), call({ language: 'en' }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith({ lang: 'en', pages: null })
    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('nothing has been sent yet')
    expect(result.output).toContain('do not claim the document was translated')
  })

  it('works through the editor: the window opens with the language, nothing is sent', async () => {
    const m = await mount({ lang: 'ko' })
    const deps = {
      pageCount: () => 2,
      startDocumentTranslation: (request: { lang: string | null; pages: number[] | null }) =>
        m.handle.current!.requestOpen(request),
    } as unknown as PdfAiDeps
    let result: Awaited<ReturnType<typeof executePdfTool>> | undefined
    await act(async () => {
      result = await executePdfTool(deps, call({ language: 'ja' }))
    })
    expect(result?.isError).toBeUndefined()
    await until(() => q(m.el, '[data-field="language"]') !== null, 'the window')
    expect((q(m.el, '[data-field="language"]') as HTMLSelectElement).value).toBe('ja')
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('refuses an unknown language or pages outside the document without opening anything', async () => {
    const open = vi.fn(() => ({ opened: true as const }))
    expect((await executePdfTool(depsWith(open), call({ language: 'xx' }))).isError).toBe(true)
    expect((await executePdfTool(depsWith(open), call({ pages: [0, 6] }))).isError).toBe(true)
    expect(open).not.toHaveBeenCalled()
  })

  it('reports a running job, and says so where the window is not available', async () => {
    const running = vi.fn(() => ({ running: { done: 3, total: 8 } }))
    expect((await executePdfTool(depsWith(running), call())).output).toContain('(3/8)')
    const none = await executePdfTool(depsWith(), call())
    expect(none.isError).toBe(true)
    expect(none.output).toContain('not available')
  })
})

describe('translation: formats and the report', () => {
  it('the PDF is blocked for an encrypted document and for ar, he, hi', () => {
    expect(pdfFormatBlock(true, 'en')).toBe('encrypted')
    for (const code of ['ar', 'he', 'hi']) expect(pdfFormatBlock(false, code)).toBe('script')
    expect(pdfFormatBlock(false, 'ko')).toBeNull()
    expect(writableFormats(new Set(['pdf', 'epub']), 'script')).toEqual(['epub'])
    expect(writableFormats(new Set(['epub', 'pdf', 'md']), null)).toEqual(['pdf', 'md', 'epub'])
    expect(translationOutputName('Report.PDF', 'zh-TW')).toBe('Report.zh-TW')
  })

  const translation: TranslationReport = {
    lang: 'de',
    total: 6,
    translated: 4,
    untranslated: [{ unitKey: 'p1.3', blockId: 'p1.3', page: 1, reason: 'placeholder-mismatch' }],
    pending: 1,
    complete: false,
    provider: 'claude-code',
    model: '',
  }
  const writer: WritebackReport = {
    lang: 'de',
    total: 6,
    translated: 3,
    overflowed: [{ unitKey: 'p2.1', blockId: 'p2.1', page: 2 }],
    originalPages: [{ page: 3, reason: 'ocr-unavailable' }],
    untranslated: [
      // tried and failed: the translation's own reason wins
      { unitKey: 'p1.3', blockId: 'p1.3', page: 1, reason: 'not-translated' },
      // never tried: pending, not listed
      { unitKey: 'p2.4', blockId: 'p2.4', page: 2, reason: 'not-translated' },
      // translated but not written: the writer's reason
      { unitKey: 'p2.2', blockId: 'p2.2', page: 2, reason: 'font-missing' },
    ],
  }

  it('merges the stored translation’s reasons with the PDF writer’s report', () => {
    const merged = mergeTranslationReport(translation, writer)!
    expect(merged.translated).toBe(3)
    expect(merged.pending).toBe(1)
    expect(merged.untranslated).toEqual([
      { unitKey: 'p1.3', page: 1, reason: 'placeholder-mismatch' },
      { unitKey: 'p2.2', page: 2, reason: 'font-missing' },
    ])
    expect(merged.overflowed).toEqual([{ unitKey: 'p2.1', page: 2 }])
    expect(merged.originalPages).toEqual([{ page: 3, reason: 'ocr-unavailable' }])
    expect(untranslatedLines(merged.untranslated, t)).toEqual([
      t('trReasonLine', { reason: t('trReasonPlaceholder'), pages: '1', count: 1 }),
      t('trReasonLine', { reason: t('trReasonFont'), pages: '2', count: 1 }),
    ])
  })

  it('Markdown alone reports the stored translation; formats together keep the PDF’s detail', () => {
    const md = mergeTranslationReport(translation, null)!
    expect(md.translated).toBe(4)
    expect(md.originalPages).toEqual([])
    const both = combineReports([mergeTranslationReport(translation, writer), md])!
    expect(both.originalPages).toHaveLength(1)
    expect(both.untranslated.map((b) => b.unitKey)).toEqual(['p1.3', 'p2.2'])
    expect(mergeTranslationReport(null, null)).toBeNull()
  })

  it('shows the report with its parts', async () => {
    const m = await mount()
    // a report straight from the model: render it through the real component
    const { TranslateReport } = await import('../src/renderer/translate/TranslateReport')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () =>
      r.render(
        createElement(TranslateReport, {
          t,
          language: 'German',
          report: mergeTranslationReport(translation, writer),
          outputs: [{ format: 'pdf', path: 'C:\\out\\report.de.pdf' }],
          failures: [],
          partial: true,
          onOpenFolder: vi.fn(),
          onClose: vi.fn(),
        }),
      ),
    )
    expect(q(host, '[data-report="untranslated"]')?.textContent).toContain(
      strings.en.trReasonPlaceholder,
    )
    expect(q(host, '[data-report="overflowed"]')?.textContent).toBe(
      t('trReportOverflowed', { pages: '2', count: 1 }),
    )
    expect(q(host, '[data-report="original-pages"]')?.textContent).toContain(
      t('trPageLine', { page: 3, reason: t('trPageOcr') }),
    )
    expect(q(host, '[data-output="pdf"]')?.textContent).toBe('report.de.pdf')
    await act(async () => r.unmount())
    host.remove()
    expect(m.el).toBeTruthy()
  })
})

describe('translation window: store only, and edited blocks on a restart', () => {
  it('"store only" alone writes no file: no save dialog, no PDF, no Markdown, no report', async () => {
    const m = await mount()
    await openWindow(m, { lang: 'de', pages: null })
    await click(m.el, '[data-field="format-pdf"]')
    // no format at all is refused
    expect(disabled(m.el, '[data-action="next"]')).toBe(true)
    await click(m.el, '[data-field="format-store"]')
    expect(disabled(m.el, '[data-action="next"]')).toBe(false)
    await click(m.el, '[data-action="next"]')
    await until(() => (q(m.el, '[data-calls]')?.dataset.calls ?? '') !== '', 'the estimate')
    await click(m.el, '[data-action="start"]')
    await until(() => bridge.starts.length === 1, 'the call')
    expect(m.channels.picks).toEqual([])
    await act(async () => bridge.answerAll())
    await until(
      () => q(m.el, '[data-job-kind="translate"][data-job-state="complete"]') !== null,
      'the job to finish',
    )
    await settle()
    expect(m.channels.writes.filter((w) => w.kind === 'translationBlocks')).not.toHaveLength(0)
    expect(m.channels.converts).toHaveLength(0)
    expect(m.channels.writeBacks).toHaveLength(0)
    expect(m.prepare).not.toHaveBeenCalled()
    expect(q(m.el, '.pdf-translate-report')).toBeNull()
  })

  it('a restart with edited blocks offers to keep them: only the others are removed and sent', async () => {
    const channels = fakeChannels({
      stored: { lang: 'de', provider: 'claude-code', model: '', blocks: 2, edited: 1 },
    })
    const m = await mount({ channels })
    await openToConfirm(m, { lang: 'de', pages: null })
    await click(m.el, '[data-action="restart"]')
    await until(() => q(m.el, '[data-edited-count]') !== null, 'the edited count')
    expect(q(m.el, '[data-edited-count]')?.textContent).toBe(
      t('trRestartEditedCount', { count: 1 }),
    )
    expect(q(m.el, '[data-action="restart-discard-edited"]')?.textContent).toBe(
      t('trRestartDiscardEdited', { count: 1 }),
    )
    expect(q(m.el, '[data-action="restart-keep-edited"]')?.textContent).toBe(
      t('trRestartKeepEdited'),
    )
    expect(q(m.el, '[data-action="restart-yes"]')).toBeNull()
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()

    await click(m.el, '[data-action="restart-keep-edited"]')
    await until(() => bridge.starts.length === 1, 'the job to send')
    expect(channels.writes.some((w) => w.kind === 'deleteTranslationExceptEdited')).toBe(true)
    expect(channels.writes.some((w) => w.kind === 'deleteTranslation')).toBe(false)
    // the edited heading stays and is not sent; the other two blocks are
    const text = bridge.starts[0]!.messages[0]!.text ?? ''
    expect(text).not.toContain('Annual report')
    expect(text).toContain('quick brown fox')
    expect(text).toContain('harvest grew')
    expect(channels.translations.get('de')!.blocks.size).toBe(1)
  })

  it('a restart that also deletes the edited blocks replaces the whole translation', async () => {
    const channels = fakeChannels({
      stored: { lang: 'de', provider: 'claude-code', model: '', blocks: 2, edited: 1 },
    })
    const m = await mount({ channels })
    await openToConfirm(m, { lang: 'de', pages: null })
    await click(m.el, '[data-action="restart"]')
    await until(() => q(m.el, '[data-action="restart-discard-edited"]') !== null, 'the choice')
    await click(m.el, '[data-action="restart-discard-edited"]')
    await until(() => bridge.starts.length === 1, 'the job to send')
    expect(channels.writes.some((w) => w.kind === 'deleteTranslation')).toBe(true)
    expect(channels.writes.some((w) => w.kind === 'deleteTranslationExceptEdited')).toBe(false)
    expect(bridge.starts[0]!.messages[0]!.text).toContain('Annual report')
  })
})
