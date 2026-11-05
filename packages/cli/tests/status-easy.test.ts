import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { documentJobs } from '../../pdf-structure/src'
import { ResultStore, documentHash, type TranslationBlockKey } from '../../pdf-structure/src/store'
import { run, tempDir, writeMinimalPdf } from './helpers'

// `pdf status` and `epub status` do not show easy explanations (spec 6.3): their
// results and job records make no translation entry and change no number, and an
// easy job running in this process never stands in for a translation's progress.
// Nothing here may reach a vendor CLI or the network: both are replaced by fakes.
const fakes = vi.hoisted(() => ({ detect: vi.fn(), stream: vi.fn() }))

vi.mock('@genoffice/ai-provider/subscription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider/subscription')>()),
  detectSubscriptionLogin: fakes.detect,
}))

vi.mock('@genoffice/ai-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider')>()),
  streamForProvider: fakes.stream,
}))

const releases: Array<() => void> = []

beforeEach(() => {
  fakes.detect.mockReset()
  fakes.stream.mockReset()
})

afterEach(() => {
  for (const release of releases.splice(0)) release()
  expect(fakes.detect).not.toHaveBeenCalled()
  expect(fakes.stream).not.toHaveBeenCalled()
})

function dataFolder(): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = tempDir()
  writeFileSync(join(dir, 'ai-settings.json'), JSON.stringify({ provider: 'auto', providers: {} }))
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

const key = (n: number): TranslationBlockKey => ({
  pageFingerprint: `${n}`.repeat(64).slice(0, 64),
  textHash: 'c'.repeat(64),
  occurrence: n,
})

/** a plain translation into `ko`: meta, two blocks, and its running job record */
async function writePlain(store: ResultStore, docHash: string): Promise<void> {
  await store.writeTranslationMeta(docHash, 'ko', { provider: 'codex', model: 'm1' })
  await store.writeTranslationBlocks(docHash, 'ko', [
    { key: key(1), status: 'translated', text: 'one' },
    { key: key(2), status: 'translated', text: 'two' },
  ])
  await store.writeJob(docHash, {
    kind: 'translate',
    lang: 'ko',
    state: 'running',
    progress: { done: 2, total: 5 },
  })
}

/** easy explanations into `ko` (beside the translation) and `en` (easy only), with records */
async function writeEasy(store: ResultStore, docHash: string): Promise<void> {
  for (const lang of ['ko', 'en']) {
    await store.writeTranslationMeta(docHash, lang, { provider: 'claude-code', model: 'e' }, 'easy')
    await store.writeTranslationBlocks(
      docHash,
      lang,
      [1, 2, 3, 4].map((n) => ({ key: key(n), status: 'translated' as const, text: 'easy' })),
      'easy',
    )
    await store.writeJob(docHash, {
      kind: 'translate',
      lang,
      state: lang === 'ko' ? 'complete' : 'running',
      mode: 'easy',
      outputs: ['easy.md'],
      progress: { done: 4, total: 4 },
    })
    await store.writeJob(docHash, { kind: 'translate-page', lang, state: 'running', mode: 'easy' })
  }
}

/** an easy job of this process holding the document, with progress no record has */
function holdEasyJob(docHash: string, lang: string): void {
  const lease = documentJobs.acquire(
    { docHash, kind: 'translate', lang, mode: 'easy', progress: { done: 9, total: 9 } },
    () => {},
  )
  releases.push(() => lease.release())
}

function samplePdf(dir: string): string {
  return writeMinimalPdf(join(dir, 'book.pdf'), ['Alpha page has words.', 'Beta page has words.'])
}

async function sampleBook(dir: string): Promise<string> {
  const zip = new JSZip()
  const date = new Date('2026-01-01T00:00:00Z')
  zip.file('mimetype', 'application/epub+zip', { date, compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
      '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>' +
      '</container>\n',
    { date },
  )
  zip.file(
    'OEBPS/content.opf',
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">\n' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
      '<dc:identifier id="uid">urn:uuid:11111111-2222-3333-4444-555555555555</dc:identifier>\n' +
      '<dc:title>Tale</dc:title>\n<dc:language>en</dc:language>\n' +
      '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>\n</metadata>\n<manifest>\n' +
      '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>\n' +
      '</manifest>\n<spine>\n<itemref idref="c1"/>\n</spine>\n</package>\n',
    { date },
  )
  zip.file(
    'OEBPS/c1.xhtml',
    '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">\n' +
      '<head><title>One</title></head>\n<body>\n<p>Alpha one.</p>\n</body>\n</html>\n',
    { date },
  )
  const path = join(dir, 'book.epub')
  writeFileSync(path, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }))
  return path
}

interface StatusCase {
  name: 'pdf' | 'epub'
  file: (dir: string) => Promise<string>
  empty: Record<string, unknown>
}

const CASES: StatusCase[] = [
  {
    name: 'pdf',
    file: async (dir) => samplePdf(dir),
    empty: { ai_read: { pages: [], job: { state: 'idle', outputs: [] } }, translations: [] },
  },
  { name: 'epub', file: sampleBook, empty: { translations: [] } },
]

describe.each(CASES)('$name status and easy explanations', ({ name, file, empty }) => {
  const status = async (path: string, env: NodeJS.ProcessEnv) => {
    const r = await run([name, 'status', path, '--json'], { env })
    expect(r.code).toBe(0)
    const out = r.json() as { summary: string; detail: Record<string, unknown> }
    return { summary: out.summary, detail: out.detail }
  }

  it('answers exactly the same with and without easy results and records', async () => {
    const { dir, env } = dataFolder()
    const path = await file(dir)
    const docHash = documentHash(new Uint8Array(readFileSync(path)))
    const store = new ResultStore(dir)
    await writePlain(store, docHash)
    const before = await status(path, env)
    expect(before.detail.translations).toEqual([
      {
        lang: 'ko',
        provider: 'codex',
        model: 'm1',
        done_blocks: 2,
        total_blocks: 5,
        complete: false,
        job: { state: 'running', outputs: [], progress: { done: 2, total: 5 } },
      },
    ])
    expect(before.summary).toContain('1 translation(s), 1 job(s) running')

    await writeEasy(store, docHash)
    expect(await status(path, env)).toEqual(before)
  })

  it('makes no translation entry for a document with only easy explanations', async () => {
    const { dir, env } = dataFolder()
    const path = await file(dir)
    const docHash = documentHash(new Uint8Array(readFileSync(path)))
    await writeEasy(new ResultStore(dir), docHash)
    const r = await status(path, env)
    expect(r.detail).toEqual(empty)
    expect(r.summary).toContain('0 translation(s)')
    expect(r.summary).not.toContain('running')
  })

  it('never lets an easy job of this process stand in for the translation’s progress', async () => {
    const { dir, env } = dataFolder()
    const path = await file(dir)
    const docHash = documentHash(new Uint8Array(readFileSync(path)))
    const store = new ResultStore(dir)
    await writePlain(store, docHash)
    const before = await status(path, env)

    holdEasyJob(docHash, 'ko')
    const during = await status(path, env)
    expect(during).toEqual(before)
    expect(during.detail.translations).toMatchObject([
      { done_blocks: 2, total_blocks: 5, job: { progress: { done: 2, total: 5 } } },
    ])
  })

  it('still lets a plain job of this process stand in (the path the easy job skips)', async () => {
    const { dir, env } = dataFolder()
    const path = await file(dir)
    const docHash = documentHash(new Uint8Array(readFileSync(path)))
    await writePlain(new ResultStore(dir), docHash)
    const lease = documentJobs.acquire(
      { docHash, kind: 'translate', lang: 'ko', progress: { done: 9, total: 9 } },
      () => {},
    )
    releases.push(() => lease.release())
    const r = await status(path, env)
    expect(r.detail.translations).toMatchObject([
      { done_blocks: 9, total_blocks: 9, job: { progress: { done: 9, total: 9 } } },
    ])
  })
})
