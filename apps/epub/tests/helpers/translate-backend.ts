/**
 * A stand-in for the main process and the preload of the book translation
 * tests: the real engine reads the units and builds the result books, the
 * real result store keeps the translations in a temporary folder (through the
 * editor's own store handlers), and a fake model answers on the AI stream.
 * No real `claude` or `codex` is ever reached: `aiStream` is this file's.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { vi } from 'vitest'
import type { AgentMessage, IpcStreamChunk, IpcStreamStart } from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'
import {
  buildTranslatedEpub,
  epubDocumentHash,
  epubTranslationUnits,
  openEpub,
  type EpubBook,
} from '@genoffice/epub-engine'
import { ResultStore } from '@genoffice/pdf-structure/store'
import { bookSummary } from '../../src/main/book-session'
import { createEpubStoreHandlers } from '../../src/main/store-handlers'
import type {
  EpubBookSummary,
  EpubPickResultPathRequest,
  EpubPickResultTarget,
  EpubWriteTranslatedRequest,
} from '../../src/shared/ipc'
import type { BookTranslationApi } from '../../src/renderer/translate/BookTranslation'
import { xhtml } from './book'

const CONTAINER_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
  '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n' +
  '</container>\n'

export interface ChapterSource {
  title: string
  body: string
  /** not well-formed: the chapter cannot be translated */
  broken?: boolean
}

/** An EPUB 3 book with a nav document, one chapter per entry. */
export async function buildTranslateBook(
  chapters: readonly ChapterSource[],
  options: { language?: string; fixedLayout?: boolean } = {},
): Promise<Uint8Array> {
  const items = chapters.map((_, i) => `c${i + 1}`)
  const opf =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">\n' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    '<dc:identifier id="uid">urn:uuid:0f0e0d0c-0b0a-0908-0706-050403020100</dc:identifier>\n' +
    '<dc:title>The Test Book</dc:title>\n' +
    `<dc:language>${options.language ?? 'en'}</dc:language>\n` +
    '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>\n' +
    (options.fixedLayout ? '<meta property="rendition:layout">pre-paginated</meta>\n' : '') +
    '</metadata>\n<manifest>\n' +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n' +
    items
      .map((id) => `<item id="${id}" href="text/${id}.xhtml" media-type="application/xhtml+xml"/>`)
      .join('\n') +
    '\n</manifest>\n<spine>\n' +
    items.map((id) => `<itemref idref="${id}"/>`).join('\n') +
    '\n</spine>\n</package>\n'
  const nav = xhtml(
    'Contents',
    '<nav epub:type="toc"><ol>' +
      chapters.map((c, i) => `<li><a href="text/c${i + 1}.xhtml">${c.title}</a></li>`).join('') +
      '</ol></nav>',
  )
  const zip = new JSZip()
  const date = new Date('2026-01-01T00:00:00Z')
  zip.file('mimetype', 'application/epub+zip', { date, compression: 'STORE' })
  zip.file('META-INF/container.xml', CONTAINER_XML, { date, createFolders: false })
  zip.file('OEBPS/content.opf', opf, { date, createFolders: false })
  zip.file('OEBPS/nav.xhtml', nav, { date, createFolders: false })
  chapters.forEach((c, i) => {
    const body = c.broken ? `<h1>${c.title}</h1>\n<p>Broken <b>markup</p>` : c.body
    zip.file(`OEBPS/text/c${i + 1}.xhtml`, xhtml(c.title, body), { date, createFolders: false })
  })
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/** How the fake model answers one call; `null` = never answers (until the call is cancelled). */
export type FakeAnswer = (
  blocks: Array<{ id: string; text: string }>,
  call: number,
) => string | null

/** Every block back with a prefix: placeholders and markup stay as they were. */
export const prefixAnswer =
  (prefix = 'KO: '): FakeAnswer =>
  (blocks) =>
    JSON.stringify({ translations: blocks.map((b) => ({ id: b.id, text: `${prefix}${b.text}` })) })

function requestBlocks(messages: AgentMessage[]): Array<{ id: string; text: string }> {
  const first = messages[0] as { text?: string } | undefined
  const text = first?.text ?? ''
  const start = text.indexOf('<document_blocks>')
  const end = text.indexOf('</document_blocks>')
  const data = JSON.parse(text.slice(start + '<document_blocks>'.length, end)) as {
    blocks: Array<{ id: string; text: string }>
  }
  return data.blocks
}

export const SUBSCRIPTION_READY = {
  'claude-code': {
    provider: 'claude-code',
    state: 'ready',
    loginMethod: 'subscription',
    meteredAccepted: false,
  },
  codex: { provider: 'codex', state: 'not-installed', meteredAccepted: false },
}

export const SUBSCRIPTION_SETTINGS = {
  provider: 'claude-code',
  subscriptionNoticeSeen: true,
} as unknown as AiSettings

/** a key provider: the user pays per call */
export const PAID_SETTINGS = {
  provider: 'anthropic',
  providers: { anthropic: { apiKey: 'test-key', model: 'test-model' } },
  subscriptionNoticeSeen: true,
} as unknown as AiSettings

export interface FakeBackend {
  api: BookTranslationApi
  summary: EpubBookSummary
  /** the saved book (changes with `resave`) */
  readonly book: EpubBook
  readonly bytes: Uint8Array
  readonly docHash: string
  store: ResultStore
  /** every model call's blocks, in order */
  calls: Array<Array<{ id: string; text: string }>>
  /** 'ai' per model call and 'write' per result book, in order (tests add their own) */
  events: string[]
  aiStream: ReturnType<typeof vi.fn>
  aiStreamCancel: ReturnType<typeof vi.fn>
  aiStreamCancelRequest: ReturnType<typeof vi.fn>
  writeTranslated: ReturnType<typeof vi.fn>
  openSourcePath: ReturnType<typeof vi.fn>
  pickResultTarget: ReturnType<typeof vi.fn>
  /** what the next pick answers (default: `<dir>/<kind>.epub`) */
  picks: EpubPickResultTarget[]
  /** the folder result books go to */
  dir: string
  settings: { current: AiSettings }
  answer: { current: FakeAnswer }
  /** a save wrote other bytes (an automatic save, Ctrl+S): the saved book and its hash change */
  resave(bytes: Uint8Array): Promise<void>
  dispose(): void
}

export async function createFakeBackend(
  bytes: Uint8Array,
  o: { answer?: FakeAnswer; settings?: AiSettings } = {},
): Promise<FakeBackend> {
  const load = async (next: Uint8Array) => {
    const opened = await openEpub(next)
    if (!opened.ok) throw new Error(`test book did not open: ${opened.detail}`)
    return { book: opened.book, bytes: next, docHash: await epubDocumentHash(next) }
  }
  const saved = await load(bytes)
  const dir = mkdtempSync(join(tmpdir(), 'genoffice-epub-translate-'))
  const store = new ResultStore(join(dir, 'user-data'))
  const handlers = createEpubStoreHandlers({ store: () => store, knows: () => true })
  const listeners = new Set<(chunk: IpcStreamChunk) => void>()
  const pending = new Map<string, () => void>()
  const calls: FakeBackend['calls'] = []
  const events: string[] = []
  const settings = { current: o.settings ?? SUBSCRIPTION_SETTINGS }
  const answer = { current: o.answer ?? prefixAnswer() }
  const picks: EpubPickResultTarget[] = []
  const emit = (chunk: IpcStreamChunk) => {
    for (const l of [...listeners]) l(chunk)
  }

  const aiStream = vi.fn(async (request: IpcStreamStart<AiSettings>) => {
    events.push('ai')
    const blocks = requestBlocks(request.messages)
    const call = calls.length
    calls.push(blocks)
    const text = answer.current(blocks, call)
    if (text === null) {
      pending.set(request.requestId, () => emit({ requestId: request.requestId, type: 'done' }))
      return
    }
    setTimeout(() => {
      emit({ requestId: request.requestId, type: 'delta', text })
      emit({ requestId: request.requestId, type: 'done' })
    }, 0)
  })
  const cancel = (requestId: string) => {
    pending.delete(requestId)
  }
  const aiStreamCancel = vi.fn(async (requestId: string) => cancel(requestId))
  const aiStreamCancelRequest = vi.fn(async (requestId: string) => cancel(requestId))

  const writeTranslated = vi.fn(async (request: EpubWriteTranslatedRequest) => {
    events.push('write')
    if (request.docHash !== saved.docHash) return { ok: false as const, error: 'stale' as const }
    const stored = await store.readTranslation(request.docHash, request.lang)
    const built = await buildTranslatedEpub(saved.bytes, {
      kind: request.kind,
      lang: request.lang,
      ...(request.chapters ? { chapters: request.chapters } : {}),
      results: stored?.blocks ?? new Map(),
    })
    if (!built.ok) return { ok: false as const, error: 'refused' as const }
    return {
      ok: true as const,
      path: request.path,
      report: built.report,
      identifier: built.identifier,
    }
  })
  const pickResultTarget = vi.fn(
    async (request: EpubPickResultPathRequest): Promise<EpubPickResultTarget> =>
      picks.length > 0
        ? picks.shift()!
        : { ok: true, path: join(dir, `${request.kind}.${request.lang}.epub`) },
  )
  const openSourcePath = vi.fn(async () => {})

  const api = {
    documentHash: async () => ({ ok: true as const, docHash: saved.docHash }),
    translationUnits: async (request: { chapters?: number[] }) => {
      const { book, docHash } = saved
      const { units, skipped } = await epubTranslationUnits(
        book,
        request.chapters ? { chapters: request.chapters } : {},
      )
      return { ok: true as const, docHash, units, skipped }
    },
    pickResultTarget,
    writeTranslated,
    store: {
      translation: (hash: string, lang: string) => handlers.translation(1, hash, lang),
      unfinishedJobs: (hash: string) => handlers.unfinishedJobs(1, hash),
      write: (request: unknown) => handlers.write(1, request),
    },
    getAiSettings: async () => settings.current,
    setAiSettings: async () => {},
    onAiSettingsChanged: () => () => {},
    openAiModelSettings: async () => {},
    aiStream,
    aiStreamCancel,
    aiStreamCancelRequest,
    onAiStream: (listener: (chunk: IpcStreamChunk) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    openSourcePath,
  } as unknown as BookTranslationApi

  return {
    api,
    summary: bookSummary(saved.book),
    get book() {
      return saved.book
    },
    get bytes() {
      return saved.bytes
    },
    get docHash() {
      return saved.docHash
    },
    store,
    calls,
    events,
    aiStream,
    aiStreamCancel,
    aiStreamCancelRequest,
    writeTranslated,
    openSourcePath,
    pickResultTarget,
    picks,
    dir,
    settings,
    answer,
    resave: async (next) => {
      Object.assign(saved, await load(next))
    },
    dispose: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/** The subscription calls the shared connection hook and the job's route check read. */
export function fakeSubscription(statuses: unknown = SUBSCRIPTION_READY) {
  return {
    statuses: async () => statuses,
    recheck: async () => statuses,
    login: async () => ({ ok: true }),
    install: async () => ({ ok: true }),
    update: async () => ({ ok: true }),
    cancelLogin: async () => ({ ok: true }),
    setMeteredAccepted: async () => ({ ok: true, statuses }),
    onChanged: () => () => {},
    openInstallHelp: async () => {},
  }
}
