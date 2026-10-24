import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiRunError, HEADLESS_SUBSCRIPTION_CONSENT_VERSION } from '@genoffice/ai-provider'
import {
  detectSubscriptionLogin,
  type SubscriptionDetection,
} from '@genoffice/ai-provider/subscription'
import { ResultStore, documentHash } from '../../pdf-structure/src/store'
import { defaultRegistry } from '../src/cli'
import { createContext, disposeContext, runWithInline } from '../src/mcp/run'
import { buildArgv, resolveTools, toolShape } from '../src/mcp/tools'
import { backgroundJobCount, stopBackgroundJobs } from '../src/pdf-jobs'
import { run, tempDir } from './helpers'

// epub translate / epub status and their MCP tools. Nothing here may reach a vendor CLI or the
// network: the status check and the provider stream are fakes.
const fakes = vi.hoisted(() => ({ detect: vi.fn(), stream: vi.fn() }))

vi.mock('@genoffice/ai-provider/subscription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider/subscription')>()),
  detectSubscriptionLogin: fakes.detect,
}))

vi.mock('@genoffice/ai-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider')>()),
  streamForProvider: fakes.stream,
}))

const READY: Record<string, SubscriptionDetection> = {
  'claude-code': { provider: 'claude-code', state: 'ready', loginMethod: 'subscription' },
  codex: { provider: 'codex', state: 'ready', loginMethod: 'subscription' },
}

/** Claude Code with the automatic-call switch on: a subscription route, not billed per request */
const SUBSCRIPTION = {
  provider: 'claude-code',
  headlessSubscriptionEnabled: true,
  headlessSubscriptionConsentVersion: HEADLESS_SUBSCRIPTION_CONSENT_VERSION,
}

/** a provider key the user selected: billed per request */
const KEY = {
  provider: 'anthropic',
  providers: { anthropic: { apiKey: 'sk-test', model: 'claude-sonnet-4-5' } },
}

interface Message {
  role: string
  text: string
}
type Callbacks = { onDelta: (t: string) => void; signal: AbortSignal }

/** every block translated with a "[fr] " prefix (placeholders are kept as they are) */
function answer(messages: Message[]): string {
  const text = messages[0]!.text
  const data = /<document_blocks>\n([\s\S]*?)\n<\/document_blocks>/.exec(text)![1]!
  const blocks = (JSON.parse(data) as { blocks: { id: string; text: string }[] }).blocks
  return JSON.stringify({
    translations: blocks.map((b) => ({ id: b.id, text: `[fr] ${b.text}` })),
  })
}

type StreamArgs = [string, unknown, string, Message[], unknown, number, Callbacks]

function respondNormally(): void {
  fakes.stream.mockImplementation(async (...a: StreamArgs) => {
    a[6].onDelta(answer(a[3]))
  })
}

/** a model call that waits until `release` (or the job is stopped) */
function holdCalls(): { release: () => void; calls: () => number } {
  let open: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  let count = 0
  fakes.stream.mockImplementation(async (...a: StreamArgs) => {
    count++
    await new Promise<void>((resolve, reject) => {
      gate.then(resolve, reject)
      a[6].signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })
    a[6].onDelta(answer(a[3]))
  })
  return { release: open, calls: () => count }
}

function dataFolder(settings: Record<string, unknown>): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = tempDir()
  writeFileSync(
    join(dir, 'ai-settings.json'),
    JSON.stringify({ provider: 'auto', providers: {}, ...settings }),
  )
  return {
    dir,
    env: {
      ...process.env,
      GENOFFICE_USER_DATA: dir,
      GENOFFICE_AI_SETTINGS: '',
      GENOFFICE_AUDIT_LOG: 'off',
      GENOFFICE_ALLOWED_ROOTS: '',
    },
  }
}

const CONTAINER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
  '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>' +
  '</container>\n'

const xhtml = (title: string, body: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' +
  '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">\n' +
  `<head><title>${title}</title></head>\n<body>\n${body}\n</body>\n</html>\n`

interface BookOptions {
  /** extra metadata lines (a fixed-layout book adds its rendition:layout here) */
  meta?: string[]
  /** extra entries, such as META-INF/rights.xml */
  extra?: Record<string, string>
}

/** A small EPUB 3 book: a title, a nav, and three chapters of which the second is broken. */
function bookFiles(o: BookOptions = {}): Record<string, string> {
  return {
    'META-INF/container.xml': CONTAINER,
    'OEBPS/content.opf':
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">\n' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
      '<dc:identifier id="uid">urn:uuid:11111111-2222-3333-4444-555555555555</dc:identifier>\n' +
      '<dc:title>Tale</dc:title>\n<dc:language>en</dc:language>\n' +
      '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>\n' +
      `${(o.meta ?? []).join('\n')}\n</metadata>\n<manifest>\n` +
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n' +
      '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>\n' +
      '<item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>\n' +
      '<item id="c3" href="c3.xhtml" media-type="application/xhtml+xml"/>\n' +
      '</manifest>\n<spine>\n<itemref idref="c1"/>\n<itemref idref="c2"/>\n<itemref idref="c3"/>\n</spine>\n</package>\n',
    'OEBPS/nav.xhtml': xhtml(
      'Contents',
      '<nav epub:type="toc"><ol>' +
        '<li><a href="c1.xhtml">Alpha chapter</a></li>' +
        '<li><a href="c2.xhtml">Broken chapter</a></li>' +
        '<li><a href="c3.xhtml">Gamma chapter</a></li>' +
        '</ol></nav>',
    ),
    'OEBPS/c1.xhtml': xhtml('One', '<p>Alpha one.</p>\n<p>Alpha two.</p>'),
    'OEBPS/c2.xhtml': xhtml('Two', '<p>Broken <b>chapter</p>'),
    'OEBPS/c3.xhtml': xhtml('Three', '<p>Gamma words.</p>'),
    ...o.extra,
  }
}

async function zipBook(files: Record<string, string>, mimetype = true): Promise<Uint8Array> {
  const zip = new JSZip()
  const date = new Date('2026-01-01T00:00:00Z')
  if (mimetype) zip.file('mimetype', 'application/epub+zip', { date, compression: 'STORE' })
  for (const [name, data] of Object.entries(files)) {
    zip.file(name, data, { date, compression: 'DEFLATE', createFolders: false })
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

async function sampleBook(dir: string, o: BookOptions = {}, name = 'book.epub'): Promise<string> {
  const path = join(dir, name)
  writeFileSync(path, await zipBook(bookFiles(o)))
  return path
}

async function entryText(epub: string, name: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(epub))
  return zip.file(name)!.async('string')
}

async function until(check: () => Promise<boolean>, ms = 20_000): Promise<void> {
  const end = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > end) throw new Error('timed out waiting')
    await new Promise((r) => setTimeout(r, 50))
  }
}

const sentTexts = (): string =>
  fakes.stream.mock.calls.map((c) => (c[3] as Message[])[0]!.text).join('\n')

/** title + three contents labels + the blocks of chapters 1 and 3 */
const TOTAL_UNITS = 7

const CHAPTERS = [
  { index: 1, title: 'Alpha chapter', read_only: false },
  { index: 2, title: 'Broken chapter', read_only: true },
  { index: 3, title: 'Gamma chapter', read_only: false },
]

beforeEach(() => {
  // the replacements must be in force before any command runs, or a test would start a real CLI
  expect(vi.isMockFunction(detectSubscriptionLogin)).toBe(true)
  fakes.detect.mockReset()
  fakes.detect.mockImplementation(async (provider: string) => READY[provider])
  fakes.stream.mockReset()
  respondNormally()
})

afterEach(async () => {
  await stopBackgroundJobs()
  vi.restoreAllMocks()
})

describe('epub translate: before anything is sent', () => {
  it('answers only the estimate without --yes and sends nothing', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const book = await sampleBook(dir)
    const r = await run(['epub', 'translate', book, '--to', 'fr', '--json'], { env })
    expect(r.code).toBe(0)
    expect(r.json().status).toBe('ok')
    expect(r.json().detail).toEqual({
      started: false,
      estimate: {
        calls: 1,
        chapters: 3,
        provider: 'claude-code',
        route: 'subscription',
        metered: false,
      },
      done_blocks: 0,
      total_blocks: TOTAL_UNITS,
      chapters: CHAPTERS,
    })
    expect(fakes.stream).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'book.fr.epub'))).toBe(false)
  })

  it('counts only the chosen chapters in the estimate', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const book = await sampleBook(dir)
    const r = await run(['epub', 'translate', book, '--to', 'fr', '--chapters', '3', '--json'], {
      env,
    })
    expect(r.code).toBe(0)
    expect(r.json().detail).toMatchObject({
      estimate: { chapters: 1 },
      done_blocks: 0,
      total_blocks: TOTAL_UNITS - 2,
      chapters: CHAPTERS,
    })
  })

  it('refuses a route billed per request without --allow-paid, before sending', async () => {
    const { dir, env } = dataFolder(KEY)
    const book = await sampleBook(dir)
    const estimate = await run(['epub', 'translate', book, '--to', 'fr', '--json'], { env })
    expect(estimate.code).toBe(0)
    expect(estimate.json().detail.estimate).toEqual({
      calls: 1,
      chapters: 3,
      provider: 'anthropic',
      route: 'key',
      metered: true,
    })
    const refused = await run(['epub', 'translate', book, '--to', 'fr', '--yes', '--json'], {
      env,
    })
    expect(refused.code).toBe(4)
    expect(refused.json()).toMatchObject({
      status: 'error',
      error: 'paid_route_not_allowed',
      detail: { route: 'key', via: 'anthropic' },
    })
    expect(fakes.stream).not.toHaveBeenCalled()

    const allowed = await run(
      ['epub', 'translate', book, '--to', 'fr', '--yes', '--allow-paid', '--json'],
      { env },
    )
    expect(allowed.code).toBe(0)
    expect(fakes.stream).toHaveBeenCalled()
  })

  it('refuses chapters outside the book with out_of_range and the valid range', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const book = await sampleBook(dir)
    const r = await run(['epub', 'translate', book, '--to', 'fr', '--chapters', '2-4', '--json'], {
      env,
    })
    expect(r.code).toBe(1)
    expect(r.json()).toMatchObject({ error: 'out_of_range', detail: { valid_range: [1, 3] } })
    const zero = await run(['epub', 'translate', book, '--to', 'fr', '--chapters', '0', '--json'], {
      env,
    })
    expect(zero.code).toBe(1)
    const bad = await run(
      ['epub', 'translate', book, '--to', 'fr', '--chapters', 'a-b', '--json'],
      {
        env,
      },
    )
    expect(bad.code).toBe(1)
    expect(bad.json().error).toBe('invalid_argument')
    expect(fakes.detect).not.toHaveBeenCalled()
    expect(fakes.stream).not.toHaveBeenCalled()
  })

  it('validates the language and --kind before anything else', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const book = await sampleBook(dir)
    const lang = await run(['epub', 'translate', book, '--to', 'xx', '--json'], { env })
    expect(lang.code).toBe(1)
    expect(lang.json()).toMatchObject({ error: 'unsupported' })
    expect(lang.json().detail.supported).toContain('ko')
    const missing = await run(['epub', 'translate', book, '--json'], { env })
    expect(missing.code).toBe(1)
    expect(missing.json().error).toBe('missing_argument')
    for (const kind of ['pdf', 'translated,side', '']) {
      const r = await run(['epub', 'translate', book, '--to', 'fr', '--kind', kind, '--json'], {
        env,
      })
      expect(r.code, kind).toBe(1)
      expect(r.json().error, kind).toBe('invalid_argument')
    }
    const other = await run(['epub', 'translate', book, '--to', 'fr', '--pages', '1', '--json'], {
      env,
    })
    expect(other.code).toBe(1)
    expect(other.json().error).toBe('unknown_option')
    expect(fakes.detect).not.toHaveBeenCalled()
    expect(fakes.stream).not.toHaveBeenCalled()
  })

  it('refuses books it cannot translate with unsupported and detail.reason', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const write = async (name: string, bytes: Uint8Array | string): Promise<string> => {
      const path = join(dir, name)
      writeFileSync(path, bytes)
      return path
    }
    const many: Record<string, string> = {}
    for (let i = 0; i < 10_001; i++) many[`OEBPS/f${i}.txt`] = ''
    const cases: { file: string; reason: string; args?: string[] }[] = [
      {
        file: await sampleBook(dir, { extra: { 'META-INF/rights.xml': '<rights/>' } }, 'drm.epub'),
        reason: 'drm',
      },
      {
        file: await sampleBook(
          dir,
          { meta: ['<meta property="rendition:layout">pre-paginated</meta>'] },
          'fixed.epub',
        ),
        reason: 'fixed-layout',
      },
      {
        file: await write('plain.epub', await zipBook({ 'readme.txt': 'not a book' })),
        reason: 'not-epub',
      },
      { file: await write('notes.txt', 'plain text'), reason: 'not-epub' },
      { file: await write('broken.epub', 'PK\u0003\u0004 this is no archive'), reason: 'damaged' },
      {
        file: await write('huge.epub', await zipBook({ ...bookFiles(), ...many })),
        reason: 'too-large',
      },
      { file: await sampleBook(dir), reason: 'no-text', args: ['--chapters', '2'] },
    ]
    for (const c of cases) {
      const r = await run(
        ['epub', 'translate', c.file, '--to', 'fr', ...(c.args ?? []), '--json'],
        {
          env,
        },
      )
      expect(r.code, c.reason).toBe(1)
      expect(r.json(), c.reason).toMatchObject({
        error: 'unsupported',
        detail: { reason: c.reason },
      })
    }
    expect(fakes.stream).not.toHaveBeenCalled()
  }, 60_000)
})

describe('epub translate: running the job', () => {
  it('writes <name>.<lang>.epub beside the source, answers the success detail, then needs --force', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const book = await sampleBook(dir)
    const r = await run(['epub', 'translate', book, '--to', 'fr', '--yes', '--json'], { env })
    expect(r.code).toBe(0)
    expect(r.json().status).toBe('ok')
    const out = join(dir, 'book.fr.epub')
    expect(r.json().output_path).toBe(out)
    expect(r.json().detail).toEqual({
      lang: 'fr',
      provider: 'claude-code',
      model: '',
      translated_blocks: 3,
      untranslated_blocks: [],
      original_chapters: [{ chapter: 2, reason: 'broken' }],
      outputs: [out],
    })
    expect(r.stderr).toContain('translate')
    const c1 = await entryText(out, 'OEBPS/c1.xhtml')
    expect(c1).toContain('[fr] Alpha one.')
    expect(c1).not.toContain('<p>Alpha one.</p>')
    expect(await entryText(out, 'OEBPS/content.opf')).toContain('[fr] Tale')
    // the source book is not changed
    expect(await entryText(book, 'OEBPS/c1.xhtml')).toContain('<p>Alpha one.</p>')

    const status = await run(['epub', 'status', book, '--json'], { env })
    expect(status.code).toBe(0)
    expect(status.json().detail).toEqual({
      translations: [
        {
          lang: 'fr',
          provider: 'claude-code',
          model: '',
          done_blocks: TOTAL_UNITS,
          total_blocks: TOTAL_UNITS,
          complete: true,
          job: {
            state: 'complete',
            outputs: [out],
            progress: { done: TOTAL_UNITS, total: TOTAL_UNITS },
          },
        },
      ],
    })

    const again = await run(['epub', 'translate', book, '--to', 'fr', '--yes', '--json'], { env })
    expect(again.code).toBe(2)
    expect(again.json().error).toBe('output_exists')
    const forced = await run(['epub', 'translate', book, '--to', 'fr', '--yes', '--force'], {
      env,
    })
    expect(forced.code).toBe(0)
  })

  it('names both kinds beside the source, or after an --out base path', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const book = await sampleBook(dir)
    const both = await run(
      [
        'epub',
        'translate',
        book,
        '--to',
        'fr',
        '--kind',
        'bilingual,translated',
        '--yes',
        '--json',
      ],
      { env },
    )
    expect(both.code).toBe(0)
    const outputs = [join(dir, 'book.fr.epub'), join(dir, 'book.fr.bilingual.epub')]
    expect(both.json().detail.outputs).toEqual(outputs)
    expect(both.json().output_path).toBeUndefined()
    const bilingual = await entryText(outputs[1]!, 'OEBPS/c1.xhtml')
    expect(bilingual).toContain('<p>Alpha one.</p>')
    expect(bilingual).toContain('[fr] Alpha one.')
    expect(await entryText(outputs[1]!, 'OEBPS/content.opf')).toContain('Tale ([fr] Tale)')

    mkdirSync(join(dir, 'out'))
    const based = await run(
      [
        'epub',
        'translate',
        book,
        '--to',
        'fr',
        '--kind',
        'translated,bilingual',
        '--out',
        join(dir, 'out', 'x.epub'),
        '--yes',
        '--json',
      ],
      { env },
    )
    expect(based.code).toBe(0)
    expect(based.json().detail.outputs).toEqual([
      join(dir, 'out', 'x.epub'),
      join(dir, 'out', 'x.bilingual.epub'),
    ])

    const one = await run(
      [
        'epub',
        'translate',
        book,
        '--to',
        'fr',
        '--kind',
        'bilingual',
        '--out',
        join(dir, 'out', 'side.epub'),
        '--yes',
        '--json',
      ],
      { env },
    )
    expect(one.code).toBe(0)
    expect(one.json().detail.outputs).toEqual([join(dir, 'out', 'side.epub')])

    const onto = await run(
      ['epub', 'translate', book, '--to', 'fr', '--out', book, '--force', '--yes', '--json'],
      { env },
    )
    expect(onto.code).toBe(1)
    expect(onto.json().error).toBe('invalid_argument')
  })

  it('stops at a usage limit: no file without --partial, the finished part with it', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const book = await sampleBook(dir)
    fakes.stream.mockRejectedValue(
      new AiRunError('rate-limit', 'limit reached', { resetsAt: 1_900_000_000_000 }),
    )
    const stopped = await run(['epub', 'translate', book, '--to', 'fr', '--yes', '--json'], {
      env,
    })
    expect(stopped.code).toBe(4)
    expect(stopped.json()).toMatchObject({
      error: 'app_unavailable',
      detail: {
        errorCode: 'rate-limit',
        resetsAt: 1_900_000_000_000,
        done_blocks: 0,
        total_blocks: TOTAL_UNITS,
      },
    })
    expect(existsSync(join(dir, 'book.fr.epub'))).toBe(false)

    const partial = await run(
      ['epub', 'translate', book, '--to', 'fr', '--partial', '--yes', '--json'],
      { env },
    )
    expect(partial.code).toBe(0)
    expect(partial.json().status).toBe('partial')
    const out = join(dir, 'book.fr.epub')
    expect(partial.json().detail).toMatchObject({
      lang: 'fr',
      stopped: { errorCode: 'rate-limit', resetsAt: 1_900_000_000_000 },
      translated_blocks: 0,
      done_blocks: 0,
      total_blocks: TOTAL_UNITS,
      outputs: [out],
      original_chapters: [{ chapter: 2, reason: 'broken' }],
    })
    const untranslated = partial.json().detail.untranslated_blocks as {
      chapter: number
      reason: string
    }[]
    expect(untranslated.map((u) => u.chapter)).toEqual([1, 1, 3])
    // the untranslated rest stays in the source language
    expect(await entryText(out, 'OEBPS/c1.xhtml')).toContain('<p>Alpha one.</p>')
    const status = await run(['epub', 'status', book, '--json'], { env })
    expect(status.json().detail.translations[0].job).toMatchObject({
      state: 'stopped',
      last_error: 'rate-limit',
      resetsAt: 1_900_000_000_000,
      outputs: [out],
    })
  })

  it('continues from the store and starts over with --restart', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const book = await sampleBook(dir)
    const first = await run(
      ['epub', 'translate', book, '--to', 'fr', '--chapters', '1', '--yes', '--json'],
      { env },
    )
    expect(first.code).toBe(0)
    expect(first.json().detail).toMatchObject({
      translated_blocks: 2,
      original_chapters: [
        { chapter: 2, reason: 'not-chosen' },
        { chapter: 3, reason: 'not-chosen' },
      ],
    })
    expect(fakes.stream).toHaveBeenCalledTimes(1)

    // the whole book now: chapter 1, the title and the contents are in the store and not sent again
    const estimate = await run(['epub', 'translate', book, '--to', 'fr', '--json'], { env })
    expect(estimate.json().detail).toMatchObject({
      done_blocks: TOTAL_UNITS - 1,
      total_blocks: TOTAL_UNITS,
    })
    fakes.stream.mockClear()
    const rest = await run(
      ['epub', 'translate', book, '--to', 'fr', '--out', join(dir, 'all.epub'), '--yes', '--json'],
      { env },
    )
    expect(rest.code).toBe(0)
    expect(rest.json().detail.translated_blocks).toBe(3)
    expect(sentTexts()).not.toContain('Alpha')
    expect(sentTexts()).toContain('Gamma words.')

    const restart = await run(['epub', 'translate', book, '--to', 'fr', '--restart', '--json'], {
      env,
    })
    expect(restart.json().detail).toMatchObject({ done_blocks: 0, total_blocks: TOTAL_UNITS })
    fakes.stream.mockClear()
    const redo = await run(
      [
        'epub',
        'translate',
        book,
        '--to',
        'fr',
        '--out',
        join(dir, 'again.epub'),
        '--restart',
        '--yes',
        '--json',
      ],
      { env },
    )
    expect(redo.code).toBe(0)
    expect(sentTexts()).toContain('Alpha one.')
  })

  it('refuses while another job runs on the book, pointing at epub status', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const book = await sampleBook(dir)
    const docHash = documentHash(new Uint8Array(readFileSync(book)))
    const store = new ResultStore(dir)
    await store.writeJob(docHash, {
      kind: 'translate',
      lang: 'de',
      state: 'running',
      progress: { done: 1, total: 7 },
    })
    const r = await run(['epub', 'translate', book, '--to', 'fr', '--yes', '--json'], { env })
    expect(r.code).toBe(4)
    expect(r.json()).toMatchObject({
      error: 'app_unavailable',
      detail: {
        errorCode: 'document-job-running',
        job: { kind: 'translate', lang: 'de', progress: { done: 1, total: 7 } },
      },
    })
    expect(r.json().suggestion).toContain('epub status')
    expect(fakes.stream).not.toHaveBeenCalled()
  })
})

describe('epub status', () => {
  it('pins the shape for a book the store does not know, and sends nothing', async () => {
    const { dir, env } = dataFolder({})
    const book = await sampleBook(dir)
    const r = await run(['epub', 'status', book, '--json'], { env })
    expect(r.code).toBe(0)
    expect(r.json().detail).toEqual({ translations: [] })
    expect(fakes.detect).not.toHaveBeenCalled()
  })

  it('reports a record that stopped refreshing as stopped, interrupted', async () => {
    const { dir, env } = dataFolder({})
    const book = await sampleBook(dir)
    const docHash = documentHash(new Uint8Array(readFileSync(book)))
    const old = new ResultStore(dir, { now: () => Date.now() - 60_000 })
    await old.writeJob(docHash, {
      kind: 'translate',
      lang: 'de',
      state: 'running',
      progress: { done: 1, total: 4 },
    })
    const r = await run(['epub', 'status', book, '--json'], { env })
    expect(r.json().detail.translations).toEqual([
      {
        lang: 'de',
        provider: null,
        model: null,
        done_blocks: 1,
        total_blocks: 4,
        complete: false,
        job: {
          state: 'stopped',
          last_error: 'interrupted',
          outputs: [],
          progress: { done: 1, total: 4 },
        },
      },
    ])
  })

  it('takes no options and refuses a file that is not an EPUB', async () => {
    const { dir, env } = dataFolder({})
    const book = await sampleBook(dir)
    const opt = await run(['epub', 'status', book, '--to', 'fr', '--json'], { env })
    expect(opt.json().error).toBe('unknown_option')
    const txt = join(dir, 'a.txt')
    writeFileSync(txt, 'x')
    const r = await run(['epub', 'status', txt, '--json'], { env })
    expect(r.code).toBe(1)
    expect(r.json()).toMatchObject({ error: 'unsupported', detail: { reason: 'not-epub' } })
    const verb = await run(['epub', 'read', book, '--json'], { env })
    expect(verb.code).toBe(1)
    expect(verb.json().error).toBe('invalid_argument')
  })
})

describe('the MCP tools epub_translate and epub_status', () => {
  const tools = new Map(resolveTools(defaultRegistry()).map((t) => [t.name, t]))

  it('take the command options under the same names', () => {
    const translate = tools.get('epub_translate')!
    const status = tools.get('epub_status')!
    expect(translate.openWorld).toBe(true)
    expect(status.readOnly).toBe(true)
    expect(Object.keys(toolShape(translate)).sort()).toEqual(
      [
        'file',
        'to',
        'chapters',
        'kind',
        'out',
        'partial',
        'restart',
        'yes',
        'allow_paid',
        'force',
      ].sort(),
    )
    expect(translate.params.find((p) => p.key === 'to')!.required).toBe(true)
    expect(Object.keys(toolShape(status))).toEqual(['file'])
    expect(
      buildArgv(translate, {
        file: 'a.epub',
        to: 'ko',
        chapters: '1-3,5',
        kind: 'translated,bilingual',
        out: 'b',
        partial: true,
        restart: true,
        yes: true,
        allow_paid: true,
        force: true,
      }).argv,
    ).toEqual([
      'epub',
      'translate',
      'a.epub',
      '--to',
      'ko',
      '--chapters',
      '1-3,5',
      '--kind',
      'translated,bilingual',
      '--out',
      'b',
      '--partial',
      '--restart',
      '--yes',
      '--allow-paid',
      '--force',
    ])
    expect(buildArgv(status, { file: 'a.epub' }).argv).toEqual(['epub', 'status', 'a.epub'])
  })

  it('epub_translate answers started: true while the job runs; epub_status follows it to its files', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const book = await sampleBook(dir)
    const held = holdCalls()
    const ctx = createContext({ cwd: dir, env, log: () => undefined })
    try {
      const call = (name: string, args: Record<string, unknown>) => {
        const built = buildArgv(tools.get(name)!, args)
        return runWithInline(built.argv, built.inline, ctx)
      }
      const estimate = await call('epub_translate', { file: book, to: 'fr' })
      expect(estimate.ok?.detail?.started).toBe(false)

      const started = await call('epub_translate', { file: book, to: 'fr', yes: true })
      expect(started.ok?.detail).toMatchObject({
        started: true,
        estimate: { calls: 1, chapters: 3 },
        chapters: CHAPTERS,
      })
      expect(backgroundJobCount()).toBe(1)
      await until(async () => held.calls() === 1)

      const running = await call('epub_status', { file: book })
      expect(running.ok?.detail?.translations).toMatchObject([
        { lang: 'fr', complete: false, job: { state: 'running', outputs: [] } },
      ])
      const busy = await call('epub_translate', { file: book, to: 'de', yes: true })
      expect(busy.error).toMatchObject({
        code: 4,
        error: 'app_unavailable',
        detail: { errorCode: 'document-job-running', job: { kind: 'translate', lang: 'fr' } },
      })

      held.release()
      await until(async () => backgroundJobCount() === 0)
      const out = join(dir, 'book.fr.epub')
      const done = await call('epub_status', { file: book })
      expect(done.ok?.detail?.translations).toEqual([
        {
          lang: 'fr',
          provider: 'claude-code',
          model: '',
          done_blocks: TOTAL_UNITS,
          total_blocks: TOTAL_UNITS,
          complete: true,
          job: {
            state: 'complete',
            outputs: [out],
            progress: { done: TOTAL_UNITS, total: TOTAL_UNITS },
          },
        },
      ])
      expect(await entryText(out, 'OEBPS/c3.xhtml')).toContain('[fr] Gamma words.')
    } finally {
      disposeContext(ctx)
    }
  })
})
