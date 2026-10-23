import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiRunError, HEADLESS_SUBSCRIPTION_CONSENT_VERSION } from '@genoffice/ai-provider'
import {
  detectSubscriptionLogin,
  type SubscriptionDetection,
} from '@genoffice/ai-provider/subscription'
import { ResultStore, blockKeyString, documentHash } from '../../pdf-structure/src/store'
import { defaultRegistry } from '../src/cli'
import { createContext, disposeContext, runWithInline } from '../src/mcp/run'
import { buildArgv, resolveTools } from '../src/mcp/tools'
import { backgroundJobCount, stopBackgroundJobs } from '../src/pdf-jobs'
import { run, tempDir, writeMinimalPdf } from './helpers'

// pdf ai-read / pdf translate / pdf status and their MCP tools. Nothing here may reach a vendor
// CLI or the network: the status check and the provider stream are fakes.
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
  images?: unknown[]
}
type Callbacks = { onDelta: (t: string) => void; signal: AbortSignal }

/** what a well-behaved model answers: a page transcription, or every block translated */
function answer(system: string, messages: Message[]): string {
  const text = messages[0]!.text
  if (system.includes('transcribe one page')) {
    return '<page-content>\n# Read by AI\n\nText the AI read.\n</page-content>'
  }
  const data = /<document_blocks>\n([\s\S]*?)\n<\/document_blocks>/.exec(text)![1]!
  const blocks = (JSON.parse(data) as { blocks: { id: string; text: string }[] }).blocks
  return JSON.stringify({
    translations: blocks.map((b) => ({ id: b.id, text: `[fr] ${b.text}` })),
  })
}

function respondNormally(): void {
  fakes.stream.mockImplementation(
    async (
      _p: string,
      _c: unknown,
      system: string,
      messages: Message[],
      _t: unknown,
      _m: number,
      cb: Callbacks,
    ) => {
      cb.onDelta(answer(system, messages))
    },
  )
}

/** a model call that waits until `release` (or the job is stopped) */
function holdCalls(): { release: () => void; calls: () => number } {
  let open: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  let count = 0
  fakes.stream.mockImplementation(
    async (
      _p: string,
      _c: unknown,
      system: string,
      messages: Message[],
      _t: unknown,
      _m: number,
      cb: Callbacks,
    ) => {
      count++
      await new Promise<void>((resolve, reject) => {
        gate.then(resolve, reject)
        cb.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
      cb.onDelta(answer(system, messages))
    },
  )
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

const PAGES = ['Alpha page has words.', 'Beta page has words.', 'Gamma page has words.']

function samplePdf(dir: string): string {
  return writeMinimalPdf(join(dir, 'book.pdf'), PAGES)
}

async function until(check: () => Promise<boolean>, ms = 20_000): Promise<void> {
  const end = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > end) throw new Error('timed out waiting')
    await new Promise((r) => setTimeout(r, 50))
  }
}

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

describe('pdf ai-read', () => {
  it('answers only the estimate without --yes and sends nothing', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const r = await run(['pdf', 'ai-read', pdf, '--pages', '1-2', '--json'], { env })
    expect(r.code).toBe(0)
    expect(r.json().status).toBe('ok')
    expect(r.json().detail).toEqual({
      started: false,
      estimate: {
        calls: 2,
        pages: 2,
        provider: 'claude-code',
        route: 'subscription',
        metered: false,
      },
      pages_skipped: [],
    })
    expect(fakes.stream).not.toHaveBeenCalled()
  })

  it('refuses a route billed per request without --allow-paid, before sending', async () => {
    const { dir, env } = dataFolder(KEY)
    const pdf = samplePdf(dir)
    const estimate = await run(['pdf', 'ai-read', pdf, '--pages', '1', '--json'], { env })
    expect(estimate.code).toBe(0)
    expect(estimate.json().detail.estimate).toEqual({
      calls: 1,
      pages: 1,
      provider: 'anthropic',
      route: 'key',
      metered: true,
    })
    const refused = await run(['pdf', 'ai-read', pdf, '--pages', '1', '--yes', '--json'], { env })
    expect(refused.code).toBe(4)
    expect(refused.json()).toMatchObject({
      status: 'error',
      error: 'paid_route_not_allowed',
      detail: { route: 'key', via: 'anthropic' },
    })
    expect(fakes.stream).not.toHaveBeenCalled()

    const allowed = await run(
      ['pdf', 'ai-read', pdf, '--pages', '1', '--yes', '--allow-paid', '--json'],
      { env },
    )
    expect(allowed.code).toBe(0)
    expect(allowed.json().detail.pages_read).toEqual([1])
    expect(fakes.stream).toHaveBeenCalledTimes(1)
  })

  it('sends one page image per request, keeps the readings and skips them next time', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const r = await run(['pdf', 'ai-read', pdf, '--pages', '1-2', '--yes', '--json'], { env })
    expect(r.code).toBe(0)
    expect(r.json().detail).toEqual({
      pages_read: [1, 2],
      pages_skipped: [],
      pages_failed: [],
      provider: 'claude-code',
      model: '',
    })
    expect(fakes.stream).toHaveBeenCalledTimes(2)
    const [, , system, messages, tools] = fakes.stream.mock.calls[0]!
    expect(system).toContain('transcribe one page')
    expect(tools).toEqual([])
    expect((messages as Message[])[0]!.images).toHaveLength(1)
    // progress goes to stderr, the result stays one JSON object on stdout
    expect(r.stderr).toContain('ai-read')

    const again = await run(['pdf', 'ai-read', pdf, '--pages', '1-3', '--json'], { env })
    expect(again.json().detail.estimate).toMatchObject({ calls: 1, pages: 1 })
    expect(again.json().detail.pages_skipped).toEqual([1, 2])

    const status = await run(['pdf', 'status', pdf, '--json'], { env })
    expect(status.json().detail.ai_read).toEqual({
      pages: [1, 2],
      job: { state: 'complete', outputs: [], progress: { done: 2, total: 2 } },
    })
    // the readings replace the pages in the structured text
    const read = await run(['pdf', 'read', pdf, '--structured', '--page', '1', '--json'], { env })
    expect(read.json().detail.pages_read[0].text).toContain('Text the AI read.')
  })

  it('stops at a usage limit and answers exit 4 with errorCode and resetsAt', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    fakes.stream.mockRejectedValue(
      new AiRunError('rate-limit', 'limit reached', { resetsAt: 1_900_000_000_000 }),
    )
    const r = await run(['pdf', 'ai-read', pdf, '--pages', '1-3', '--yes', '--json'], { env })
    expect(r.code).toBe(4)
    expect(r.json()).toMatchObject({
      error: 'app_unavailable',
      detail: {
        errorCode: 'rate-limit',
        resetsAt: 1_900_000_000_000,
        pages_read: [],
        done_pages: 0,
        total_pages: 3,
      },
    })
    const status = await run(['pdf', 'status', pdf, '--json'], { env })
    expect(status.json().detail.ai_read.job).toMatchObject({
      state: 'stopped',
      last_error: 'rate-limit',
      resetsAt: 1_900_000_000_000,
    })
  })

  it('refuses when no AI provider can be used from the command line', async () => {
    const { dir, env } = dataFolder({ provider: 'claude-code' })
    const pdf = samplePdf(dir)
    const r = await run(['pdf', 'ai-read', pdf, '--pages', '1', '--json'], { env })
    expect(r.code).toBe(4)
    expect(r.json().detail).toEqual({ errorCode: 'unavailable' })
    expect(r.json().message).toContain('PDF AI page reading is unavailable')
  })

  it('checks --pages before anything else', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const missing = await run(['pdf', 'ai-read', pdf, '--json'], { env })
    expect(missing.json().error).toBe('missing_argument')
    const beyond = await run(['pdf', 'ai-read', pdf, '--pages', '2-5', '--json'], { env })
    expect(beyond.code).toBe(1)
    expect(beyond.json()).toMatchObject({ error: 'out_of_range', detail: { valid_range: [1, 3] } })
    expect(fakes.detect).not.toHaveBeenCalled()
  })
})

describe('pdf translate', () => {
  it('answers only the estimate without --yes', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const r = await run(['pdf', 'translate', pdf, '--to', 'fr', '--json'], { env })
    expect(r.code).toBe(0)
    const detail = r.json().detail
    expect(detail).toEqual({
      started: false,
      estimate: {
        calls: 1,
        pages: 3,
        provider: 'claude-code',
        route: 'subscription',
        metered: false,
      },
      done_blocks: 0,
      total_blocks: 3,
    })
    expect(fakes.stream).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'book.fr.pdf'))).toBe(false)
  })

  it.each(['ar', 'he', 'hi'])(
    'refuses a PDF in %s before sending anything, and takes md for it',
    async (lang) => {
      const { dir, env } = dataFolder(SUBSCRIPTION)
      const pdf = samplePdf(dir)
      const r = await run(['pdf', 'translate', pdf, '--to', lang, '--json'], { env })
      expect(r.code).toBe(1)
      expect(r.json()).toMatchObject({
        error: 'unsupported',
        detail: { lang, supported_formats: ['md', 'epub'] },
      })
      expect(fakes.detect).not.toHaveBeenCalled()
      const md = await run(['pdf', 'translate', pdf, '--to', lang, '--format', 'md', '--json'], {
        env,
      })
      expect(md.code).toBe(0)
      expect(md.json().detail.started).toBe(false)
      expect(fakes.stream).not.toHaveBeenCalled()
    },
  )

  it('refuses a paid route without --allow-paid', async () => {
    const { dir, env } = dataFolder(KEY)
    const pdf = samplePdf(dir)
    const r = await run(['pdf', 'translate', pdf, '--to', 'fr', '--yes', '--json'], { env })
    expect(r.code).toBe(4)
    expect(r.json()).toMatchObject({
      error: 'paid_route_not_allowed',
      detail: { route: 'key', via: 'anthropic' },
    })
    expect(fakes.stream).not.toHaveBeenCalled()
  })

  it('writes a bilingual PDF with --bilingual: each sheet twice as wide', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const r = await run(
      ['pdf', 'translate', pdf, '--to', 'fr', '--format', 'pdf', '--bilingual', '--yes', '--json'],
      { env },
    )
    expect(r.code).toBe(0)
    const out = join(dir, 'book.fr.pdf')
    expect(r.json().detail.outputs).toEqual([out])
    const { PDFDocument } = await import('pdf-lib')
    const [source, sheets] = await Promise.all([
      PDFDocument.load(readFileSync(pdf)),
      PDFDocument.load(readFileSync(out)),
    ])
    expect(sheets.getPageCount()).toBe(source.getPageCount())
    const page = source.getPage(0).getSize()
    expect(sheets.getPage(0).getSize()).toEqual({ width: page.width * 2, height: page.height })
  })

  it('translates and writes <name>.<lang>.<ext> beside the source, then needs --force', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const r = await run(
      ['pdf', 'translate', pdf, '--to', 'fr', '--format', 'pdf,md', '--yes', '--json'],
      { env },
    )
    expect(r.code).toBe(0)
    const detail = r.json().detail
    const outputs = [join(dir, 'book.fr.pdf'), join(dir, 'book.fr.md')]
    expect(detail).toMatchObject({
      lang: 'fr',
      provider: 'claude-code',
      model: '',
      translated_blocks: 3,
      untranslated_blocks: expect.any(Array),
      overflowed_blocks: expect.any(Array),
      original_pages: expect.any(Array),
      outputs,
    })
    expect(Object.keys(detail).sort()).toEqual(
      [
        'lang',
        'provider',
        'model',
        'translated_blocks',
        'untranslated_blocks',
        'overflowed_blocks',
        'original_pages',
        'outputs',
      ].sort(),
    )
    expect(readFileSync(outputs[1]!, 'utf8')).toContain('[fr] Alpha page has words.')
    expect(readFileSync(outputs[0]!).subarray(0, 5).toString()).toBe('%PDF-')
    expect(r.stderr).toContain('translate')

    const status = await run(['pdf', 'status', pdf, '--json'], { env })
    expect(status.json().detail.translations).toEqual([
      {
        lang: 'fr',
        provider: 'claude-code',
        model: '',
        done_blocks: 3,
        total_blocks: 3,
        complete: true,
        job: { state: 'complete', outputs, progress: { done: 3, total: 3 } },
      },
    ])

    const again = await run(['pdf', 'translate', pdf, '--to', 'fr', '--format', 'md', '--yes'], {
      env,
    })
    expect(again.code).toBe(2)
  })

  it('stops at a usage limit: no file without --partial, the finished part with it', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    fakes.stream.mockRejectedValue(
      new AiRunError('rate-limit', 'limit reached', { resetsAt: 1_900_000_000_000 }),
    )
    const stopped = await run(
      ['pdf', 'translate', pdf, '--to', 'fr', '--format', 'md', '--yes', '--json'],
      { env },
    )
    expect(stopped.code).toBe(4)
    expect(stopped.json()).toMatchObject({
      error: 'app_unavailable',
      detail: {
        errorCode: 'rate-limit',
        resetsAt: 1_900_000_000_000,
        done_blocks: 0,
        total_blocks: 3,
      },
    })
    expect(existsSync(join(dir, 'book.fr.md'))).toBe(false)

    const partial = await run(
      ['pdf', 'translate', pdf, '--to', 'fr', '--format', 'md', '--partial', '--yes', '--json'],
      { env },
    )
    expect(partial.code).toBe(0)
    expect(partial.json().status).toBe('partial')
    expect(partial.json().detail).toMatchObject({
      stopped: { errorCode: 'rate-limit', resetsAt: 1_900_000_000_000 },
      translated_blocks: 0,
      outputs: [join(dir, 'book.fr.md')],
    })
    // the untranslated rest stays in the source language
    expect(readFileSync(join(dir, 'book.fr.md'), 'utf8')).toContain('Alpha page has words.')
    const status = await run(['pdf', 'status', pdf, '--json'], { env })
    expect(status.json().detail.translations[0].job).toMatchObject({
      state: 'stopped',
      last_error: 'rate-limit',
      resetsAt: 1_900_000_000_000,
      outputs: [join(dir, 'book.fr.md')],
    })
  })

  it('continues from the store and starts over with --restart', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const first = await run(
      ['pdf', 'translate', pdf, '--to', 'fr', '--pages', '1', '--format', 'md', '--yes', '--json'],
      { env },
    )
    expect(first.code).toBe(0)
    expect(first.json().detail.translated_blocks).toBe(1)
    expect(fakes.stream).toHaveBeenCalledTimes(1)

    // the whole document now: page 1 is in the store and is not sent again
    const estimate = await run(
      ['pdf', 'translate', pdf, '--to', 'fr', '--format', 'md', '--json'],
      {
        env,
      },
    )
    expect(estimate.json().detail).toMatchObject({ done_blocks: 1, total_blocks: 3 })
    const rest = await run(
      [
        'pdf',
        'translate',
        pdf,
        '--to',
        'fr',
        '--format',
        'md',
        '--out',
        join(dir, 'all.md'),
        '--yes',
        '--json',
      ],
      { env },
    )
    expect(rest.code).toBe(0)
    expect(rest.json().detail.translated_blocks).toBe(3)
    const sent = (fakes.stream.mock.calls[1]![3] as Message[])[0]!.text
    expect(sent).not.toContain('Alpha')
    expect(sent).toContain('Beta')

    const restart = await run(
      ['pdf', 'translate', pdf, '--to', 'fr', '--format', 'md', '--restart', '--json'],
      { env },
    )
    expect(restart.json().detail).toMatchObject({ done_blocks: 0, total_blocks: 3 })
    const redo = await run(
      [
        'pdf',
        'translate',
        pdf,
        '--to',
        'fr',
        '--format',
        'md',
        '--out',
        join(dir, 'again.md'),
        '--restart',
        '--yes',
        '--json',
      ],
      { env },
    )
    expect(redo.code).toBe(0)
    expect((fakes.stream.mock.calls[2]![3] as Message[])[0]!.text).toContain('Alpha')
  })

  it('--restart keeps the blocks a person edited and sends only the others', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const first = await run(['pdf', 'translate', pdf, '--to', 'fr', '--format', 'md', '--yes'], {
      env,
    })
    expect(first.code).toBe(0)
    // the person edits the translation of page 1 in the app
    const docHash = documentHash(new Uint8Array(readFileSync(pdf)))
    const store = new ResultStore(dir)
    const fr = await store.readTranslation(docHash, 'fr')
    const alpha = [...fr!.blocks.values()].find((b) => b.text?.includes('Alpha'))!
    await store.writeEditedTranslationBlock(docHash, 'fr', alpha.key, 'Alpha edited by hand')

    const estimate = await run(
      ['pdf', 'translate', pdf, '--to', 'fr', '--format', 'md', '--restart', '--json'],
      { env },
    )
    expect(estimate.json().detail).toMatchObject({ done_blocks: 1, total_blocks: 3 })

    fakes.stream.mockClear()
    const out = join(dir, 'kept.md')
    const redo = await run(
      [
        'pdf',
        'translate',
        pdf,
        '--to',
        'fr',
        '--format',
        'md',
        '--out',
        out,
        '--restart',
        '--yes',
        '--json',
      ],
      { env },
    )
    expect(redo.code).toBe(0)
    const sent = fakes.stream.mock.calls.map((c) => (c[3] as Message[])[0]!.text).join('\n')
    expect(sent).not.toContain('Alpha')
    expect(sent).toContain('Beta')
    expect(readFileSync(out, 'utf8')).toContain('Alpha edited by hand')
    const after = await store.readTranslation(docHash, 'fr')
    expect(after?.blocks.get(blockKeyString(alpha.key))).toMatchObject({
      text: 'Alpha edited by hand',
      edited: true,
    })
  })

  it('refuses while a job of any kind runs on the document, naming it', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const docHash = documentHash(new Uint8Array(readFileSync(pdf)))
    const store = new ResultStore(dir)
    const runId = 'a'.repeat(64)
    const cases = [
      {
        record: { kind: 'highlight' as const, runId, progress: { done: 1, total: 4 } },
        job: { kind: 'highlight', runId, progress: { done: 1, total: 4 } },
        words: 'AI highlighting',
      },
      {
        record: { kind: 'translate-page' as const, lang: 'fr' },
        job: { kind: 'translate-page', lang: 'fr' },
        words: 'page translation (fr)',
      },
      {
        record: { kind: 'summary' as const, lang: 'ko' },
        job: { kind: 'summary', lang: 'ko' },
        words: 'summary (ko)',
      },
    ]
    for (const c of cases) {
      await store.writeJob(docHash, { ...c.record, state: 'running' })
      const r = await run(
        ['pdf', 'translate', pdf, '--to', 'fr', '--format', 'md', '--yes', '--json'],
        { env },
      )
      expect(r.code).toBe(4)
      expect(r.json()).toMatchObject({
        error: 'app_unavailable',
        detail: { errorCode: 'document-job-running' },
      })
      expect(r.json().detail.job).toEqual(c.job)
      expect(r.json().message).toContain(c.words)
      await store.writeJob(docHash, { ...c.record, state: 'complete' })
    }
    expect(fakes.stream).not.toHaveBeenCalled()
  })

  it('validates the language and the formats before anything else', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const lang = await run(['pdf', 'translate', pdf, '--to', 'xx', '--json'], { env })
    expect(lang.json()).toMatchObject({ error: 'unsupported' })
    expect(lang.json().detail.supported).toContain('ko')
    const format = await run(
      ['pdf', 'translate', pdf, '--to', 'fr', '--format', 'docx', '--json'],
      {
        env,
      },
    )
    expect(format.json().error).toBe('invalid_argument')
    expect(fakes.detect).not.toHaveBeenCalled()
  })
})

describe('pdf status', () => {
  it('pins the shape for a document the store does not know', async () => {
    const { dir, env } = dataFolder({})
    const pdf = samplePdf(dir)
    const r = await run(['pdf', 'status', pdf, '--json'], { env })
    expect(r.code).toBe(0)
    expect(r.json().detail).toEqual({
      ai_read: { pages: [], job: { state: 'idle', outputs: [] } },
      translations: [],
    })
    expect(fakes.detect).not.toHaveBeenCalled()
  })

  it('keeps its shape when records of the reading-assistant job kinds exist', async () => {
    const { dir, env } = dataFolder({})
    const pdf = samplePdf(dir)
    const docHash = documentHash(new Uint8Array(readFileSync(pdf)))
    const store = new ResultStore(dir)
    await store.writeJob(docHash, { kind: 'translate-page', lang: 'fr', state: 'running' })
    await store.writeJob(docHash, { kind: 'highlight', runId: 'b'.repeat(64), state: 'stopped' })
    await store.writeJob(docHash, { kind: 'summary', lang: 'en', state: 'complete' })
    const r = await run(['pdf', 'status', pdf, '--json'], { env })
    expect(r.code).toBe(0)
    expect(r.json().detail).toEqual({
      ai_read: { pages: [], job: { state: 'idle', outputs: [] } },
      translations: [],
    })
    expect(r.json().summary).not.toContain('running')
  })

  it('reports a record that stopped refreshing as stopped, interrupted', async () => {
    const { dir, env } = dataFolder({})
    const pdf = samplePdf(dir)
    const docHash = documentHash(new Uint8Array(readFileSync(pdf)))
    const old = new ResultStore(dir, { now: () => Date.now() - 60_000 })
    await old.writeJob(docHash, {
      kind: 'translate',
      lang: 'de',
      state: 'running',
      progress: { done: 1, total: 4 },
    })
    const r = await run(['pdf', 'status', pdf, '--json'], { env })
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
})

describe('the MCP tools start the job in the server and answer at once', () => {
  const tools = new Map(resolveTools(defaultRegistry()).map((t) => [t.name, t]))

  it('builds the command line from the tool parameters', () => {
    expect(
      buildArgv(tools.get('pdf_translate')!, {
        file: 'a.pdf',
        to: 'ko',
        format: 'md,epub',
        bilingual: true,
        allow_paid: true,
        yes: true,
        partial: true,
      }).argv,
    ).toEqual([
      'pdf',
      'translate',
      'a.pdf',
      '--to',
      'ko',
      '--format',
      'md,epub',
      '--bilingual',
      '--partial',
      '--yes',
      '--allow-paid',
    ])
    expect(buildArgv(tools.get('pdf_ai_read')!, { file: 'a.pdf', pages: '1-3' }).argv).toEqual([
      'pdf',
      'ai-read',
      'a.pdf',
      '--pages',
      '1-3',
    ])
    expect(
      buildArgv(tools.get('convert')!, { file: 'a.pdf', to: 'epub', no_cover: true, title: 'T' })
        .argv,
    ).toEqual(['convert', 'a.pdf', '--to', 'epub', '--title', 'T', '--no-cover'])
    expect(buildArgv(tools.get('pdf_read')!, { file: 'a.pdf', structured: true }).argv).toEqual([
      'pdf',
      'read',
      'a.pdf',
      '--structured',
    ])
    expect(tools.get('pdf_status')!.readOnly).toBe(true)
    expect(tools.get('pdf_translate')!.openWorld).toBe(true)
    expect(tools.get('pdf_ai_read')!.openWorld).toBe(true)
    expect(tools.get('pdf_images')!.params.find((p) => p.key === 'out')!.required).toBe(true)
  })

  it('pdf_translate answers started: true while the job runs; pdf_status follows it to its files', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const held = holdCalls()
    const ctx = createContext({ cwd: dir, env, log: () => undefined })
    try {
      const call = (name: string, args: Record<string, unknown>) => {
        const built = buildArgv(tools.get(name)!, args)
        return runWithInline(built.argv, built.inline, ctx)
      }
      const estimate = await call('pdf_translate', { file: pdf, to: 'fr', format: 'md' })
      expect(estimate.ok?.detail?.started).toBe(false)

      const started = await call('pdf_translate', { file: pdf, to: 'fr', format: 'md', yes: true })
      expect(started.ok?.detail).toMatchObject({ started: true, estimate: { calls: 1 } })
      expect(backgroundJobCount()).toBe(1)
      await until(async () => held.calls() === 1)

      const running = await call('pdf_status', { file: pdf })
      expect(running.ok?.detail?.translations).toMatchObject([
        { lang: 'fr', complete: false, job: { state: 'running', outputs: [] } },
      ])
      // one job per document: a second start is refused with the running job's progress
      const busy = await call('pdf_ai_read', { file: pdf, pages: '1', yes: true })
      expect(busy.error).toMatchObject({
        code: 4,
        error: 'app_unavailable',
        detail: { errorCode: 'document-job-running', job: { kind: 'translate', lang: 'fr' } },
      })

      held.release()
      await until(async () => backgroundJobCount() === 0)
      const done = await call('pdf_status', { file: pdf })
      expect(done.ok?.detail?.translations).toEqual([
        {
          lang: 'fr',
          provider: 'claude-code',
          model: '',
          done_blocks: 3,
          total_blocks: 3,
          complete: true,
          job: {
            state: 'complete',
            outputs: [join(dir, 'book.fr.md')],
            progress: { done: 3, total: 3 },
          },
        },
      ])
      expect(readFileSync(join(dir, 'book.fr.md'), 'utf8')).toContain('[fr] Gamma')
    } finally {
      disposeContext(ctx)
    }
  })

  it('a job the server leaves behind stops as interrupted and keeps what it stored', async () => {
    const { dir, env } = dataFolder(SUBSCRIPTION)
    const pdf = samplePdf(dir)
    const held = holdCalls()
    const ctx = createContext({ cwd: dir, env, log: () => undefined })
    try {
      const built = buildArgv(tools.get('pdf_ai_read')!, { file: pdf, pages: '1-2', yes: true })
      const started = await runWithInline(built.argv, built.inline, ctx)
      expect(started.ok?.detail).toMatchObject({
        started: true,
        estimate: { calls: 2, pages: 2 },
      })
      await until(async () => held.calls() >= 1)
      await stopBackgroundJobs()
      expect(backgroundJobCount()).toBe(0)
      const status = await runWithInline(
        buildArgv(tools.get('pdf_status')!, { file: pdf }).argv,
        [],
        ctx,
      )
      expect(status.ok?.detail?.ai_read).toEqual({
        pages: [],
        job: {
          state: 'stopped',
          last_error: 'interrupted',
          outputs: [],
          progress: { done: 0, total: 2 },
        },
      })
    } finally {
      disposeContext(ctx)
    }
  })
})
