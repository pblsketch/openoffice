import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UNSAVED_CHANGES_MESSAGE,
  setOpenFilesSource,
} from '@genoffice/electron-utils/unsaved-files'
// the deck engine's own writer, by path: the mark under test is the saved one
import { setRedactExt } from '../../../packages/pptx-engine/src/redaction-xml'
import type { JevTransport } from '../src/main/file-index/decider'
import { extractText } from '../src/main/file-index/extract'
import { FileIndexer } from '../src/main/file-index/indexer'
import { normalizeFileSearchSettings, SearchReranker } from '../src/main/file-index/rerank'
import { FileIndexStore } from '../src/main/file-index/store'
import {
  readKnowledgeFilePage,
  readKnowledgeFileText,
  searchSavedKnowledgeBase,
} from '../src/main/knowledge-base'

/**
 * What a reader withheld from a model in one file must not come out when the
 * shell reads that file for another purpose: the search index (body, snippet,
 * excerpt), the knowledge base (read, search excerpt) and the optional
 * reranker. A file that is open with unsaved changes is not read at all, since
 * a mark only reaches the file on save.
 */

const SECRET = '13800138000'
const LABEL = 'client phone'
const MARKER = `{{${LABEL}}}`

const MD = `please call <span class="redact-span" data-redaction="" data-label="${LABEL}">${SECRET}</span> to confirm the order`
const MD_BROKEN = `please call <span class="redact-span" data-redaction="" data-label="${LABEL}">${SECRET} to confirm`
const HTML = [
  '<html><head>',
  `<meta name="token" content="tok-${SECRET}" data-gx-redact-content="token">`,
  `<script>const KEY = /*gx:redact:API key*/ "sk-${SECRET}";</script>`,
  '</head><body>',
  `<p>please call <span data-gx-redact="${LABEL}">${SECRET}</span> to confirm the order</p>`,
  '</body></html>',
].join('\n')
const HTML_BROKEN = `<p>please call <span data-gx-redact>${SECRET}</span> to confirm</p>`

const SLIDE_NS =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'

async function deck(rPr: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    'ppt/slides/slide1.xml',
    `<p:sld ${SLIDE_NS}><p:cSld><p:spTree><p:sp><p:txBody><a:p>` +
      '<a:r><a:t>please call </a:t></a:r>' +
      `<a:r>${rPr}<a:t>${SECRET}</a:t></a:r>` +
      '<a:r><a:t> to confirm the order</a:t></a:r>' +
      '</a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
  )
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
const MARKED_RPR = setRedactExt('<a:rPr lang="en-US"/>', LABEL)
// the extension is there, the label is not: a mark nobody can resolve
const BROKEN_RPR = MARKED_RPR.replace(/<go:redact[^>]*\/>/, '')

let dir: string
let store: FileIndexStore
let dbPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-withheld-'))
  dbPath = join(dir, 'index.db')
  store = new FileIndexStore(dbPath)
})
afterEach(() => {
  setOpenFilesSource(null)
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

function write(name: string, content: string | Uint8Array): string {
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}

async function writeWithheldFiles(): Promise<string[]> {
  return [
    write('note.md', MD),
    write('page.html', HTML),
    write('deck.pptx', await deck(MARKED_RPR)),
  ]
}

const fileMeta = (path: string) => {
  const st = statSync(path)
  return { path, mtimeMs: st.mtimeMs, sizeBytes: st.size }
}

describe('the search index never holds withheld text', () => {
  it('indexes each format with the marker in place of the words', async () => {
    for (const path of await writeWithheldFiles()) {
      const extracted = await extractText(path)
      expect(extracted.kind, path).toBe('text')
      const text = extracted.kind === 'text' ? extracted.text : ''
      expect(text, path).not.toContain(SECRET)
      expect(text, path).toContain(MARKER)
      expect(text, path).toContain('to confirm the order')
    }
  })

  it('records a file whose mark cannot be processed as an error, with no body', async () => {
    const broken = [
      write('broken.md', MD_BROKEN),
      write('broken.html', HTML_BROKEN),
      write('broken.pptx', await deck(BROKEN_RPR)),
    ]
    for (const path of broken) {
      const extracted = await extractText(path)
      expect(extracted.kind, path).toBe('error')
      expect(JSON.stringify(extracted), path).not.toContain(SECRET)
    }
  })

  it('cannot be searched by the withheld words, and quotes none of them', async () => {
    const paths = await writeWithheldFiles()
    for (const path of paths) {
      const extracted = await extractText(path)
      store.upsert(fileMeta(path), extracted.kind === 'text' ? extracted.text : null, 'ok')
    }
    expect(store.search(SECRET).total).toBe(0)
    expect(store.search(`tok-${SECRET}`).total).toBe(0)
    const found = store.search('confirm', { excerptChars: 400 })
    expect(found.total).toBe(3)
    expect(JSON.stringify(found)).not.toContain(SECRET)
    expect(JSON.stringify(store.excerptsFor(paths, 'confirm', 400))).not.toContain(SECRET)
  })
})

describe('an index built before withholding was honoured is rebuilt once', () => {
  /** the database as an earlier version left it: bodies read verbatim, no extraction stamp */
  function leaveOldIndex(paths: readonly string[]): void {
    for (const path of paths) store.upsert(fileMeta(path), `please call ${SECRET} to confirm`, 'ok')
    store.close()
    const db = new DatabaseSync(dbPath)
    db.exec("DELETE FROM meta WHERE key = 'extract'")
    db.close()
  }

  it('drops every body the old rule indexed, so no excerpt can quote it', async () => {
    const paths = await writeWithheldFiles()
    leaveOldIndex(paths)
    store = new FileIndexStore(dbPath)
    expect(store.count()).toBe(0)
    expect(store.search(SECRET).total).toBe(0)
    expect(store.search('confirm').total).toBe(0)
    expect(store.excerptsFor(paths, 'confirm', 400)).toEqual([])
  })

  it('does not drop the rebuilt index again on the next start', async () => {
    const [note] = await writeWithheldFiles()
    leaveOldIndex([note!])
    store = new FileIndexStore(dbPath)
    store.upsert(fileMeta(note!), `please call ${MARKER} to confirm`, 'ok')
    store.close()
    store = new FileIndexStore(dbPath)
    expect(store.count()).toBe(1)
    expect(store.search('confirm').total).toBe(1)
  })

  it('re-extracts files the old index already knew, although they did not change', async () => {
    const root = join(dir, 'tree')
    mkdirSync(root)
    const note = join(root, 'note.md')
    writeFileSync(note, MD)
    leaveOldIndex([note])
    store = new FileIndexStore(dbPath)
    // the worker double answers every extraction with "body of <path>"
    const indexer = new FileIndexer(store, join(__dirname, 'file-index-test-worker.mjs'), {
      roots: () => [root],
      extraPaths: () => [],
    })
    try {
      await indexer.scan()
      await vi.waitFor(() => expect(store.listAll().get(note)?.status).toBe('ok'), {
        timeout: 5_000,
        interval: 25,
      })
      expect(store.search(SECRET).total).toBe(0)
      expect(store.excerptsFor([note], 'body', 400)[0]?.excerpt).toContain('body of')
    } finally {
      indexer.stop()
    }
  })
})

describe('the knowledge base reads a file the way its own editor shows it to a model', () => {
  it('returns the marker for each format', async () => {
    for (const path of await writeWithheldFiles()) {
      const text = await readKnowledgeFileText(path)
      expect(text, path).not.toContain(SECRET)
      expect(text, path).toContain(MARKER)
    }
  })

  it('fails the read, without the words, when a mark cannot be processed', async () => {
    const broken = [
      write('broken.md', MD_BROKEN),
      write('broken.html', HTML_BROKEN),
      write('broken.pptx', await deck(BROKEN_RPR)),
    ]
    for (const path of broken) {
      const failure = await readKnowledgeFilePage(path, 0).catch((e: Error) => e)
      expect(failure, path).toBeInstanceOf(Error)
      expect((failure as Error).message, path).toMatch(/redaction/i)
      expect((failure as Error).message, path).not.toContain(SECRET)
    }
  })
})

describe('a file open with unsaved changes is not read', () => {
  it('refuses a knowledge read and says to save first', async () => {
    const note = write('note.md', 'plain saved text')
    setOpenFilesSource(() => [{ filePath: note, dirty: true }])
    await expect(readKnowledgeFilePage(note, 0)).rejects.toThrow(UNSAVED_CHANGES_MESSAGE)
  })

  it('refuses even when the text was read and cached before the edit', async () => {
    const note = write('cached.md', 'plain saved text')
    expect((await readKnowledgeFilePage(note, 0)).text).toBe('plain saved text')
    setOpenFilesSource(() => [{ filePath: note, dirty: true }])
    await expect(readKnowledgeFilePage(note, 0)).rejects.toThrow(UNSAVED_CHANGES_MESSAGE)
    setOpenFilesSource(() => [{ filePath: note, dirty: false }])
    expect((await readKnowledgeFilePage(note, 0)).text).toBe('plain saved text')
  })

  it('leaves the search excerpt of such a file out of a knowledge search', async () => {
    const [a, b, c] = ['a.md', 'b.md', 'c.md'].map((name) => write(name, 'budget'))
    const pool = [a!, b!, c!].map((path) => ({
      path,
      name: path.slice(dir.length + 1),
      ext: 'md',
      snippetText: `budget excerpt of ${path}`,
    }))
    const search = () => pool
    expect(await searchSavedKnowledgeBase(search, 'budget', [a!, b!, c!], 8)).toHaveLength(3)
    setOpenFilesSource(() => [{ filePath: b!, dirty: true }])
    const hits = await searchSavedKnowledgeBase(search, 'budget', [a!, b!, c!], 8)
    expect(hits.map((h) => h.path)).toEqual([a, c])
    expect(JSON.stringify(hits)).not.toContain(`excerpt of ${b}`)
  })

  describe('and its excerpt is not sent to the reranker', () => {
    const settings = normalizeFileSearchSettings({
      rerank: true,
      endpoint: 'openrouter',
      keys: { openrouter: 'k' },
    })
    /** a well-formed answer scoring every document it was sent */
    const judge =
      (seen: string[][]): JevTransport =>
      async (_url, body) => {
        const docs = JSON.parse(body).state.documents as Array<{ title: string; text: string }>
        seen.push(docs.map((d) => `${d.title}: ${d.text}`))
        const answers = Object.fromEntries(
          docs.map((_d, i) => [
            `d${i}`,
            { type: 'score', score: 2, confidence: 0.9, probabilities: { 0: 0, 1: 0, 2: 1 } },
          ]),
        )
        return {
          status: 200,
          body: JSON.stringify({
            model: 'typesafe/jev-1.13',
            answers,
            usage: { input_tokens: 120, cost: 0.00001 },
          }),
        }
      }

    it('judges the saved files only', async () => {
      const paths = ['first.md', 'second.md', 'third.md'].map((name) => write(name, 'x'))
      store.upsert(fileMeta(paths[0]!), 'budget first', 'ok')
      store.upsert(fileMeta(paths[1]!), `budget second ${SECRET}`, 'ok')
      store.upsert(fileMeta(paths[2]!), 'budget third', 'ok')
      setOpenFilesSource(() => [{ filePath: paths[1]!, dirty: true }])
      const seen: string[][] = []
      const result = await new SearchReranker(store, judge(seen)).rerank('budget', paths, settings)
      expect(seen).toHaveLength(1)
      expect(seen[0]!.join('\n')).not.toContain(SECRET)
      expect(seen[0]!.join('\n')).not.toContain('second.md')
      expect(result!.order.sort()).toEqual([paths[0], paths[2]].sort())
    })

    it('sends nothing when fewer than two saved files are left', async () => {
      const paths = ['first.md', 'second.md'].map((name) => write(name, 'x'))
      store.upsert(fileMeta(paths[0]!), 'budget first', 'ok')
      store.upsert(fileMeta(paths[1]!), `budget second ${SECRET}`, 'ok')
      setOpenFilesSource(() => [{ filePath: paths[1]!, dirty: true }])
      const seen: string[][] = []
      const result = await new SearchReranker(store, judge(seen)).rerank('budget', paths, settings)
      expect(result).toBeNull()
      expect(seen).toEqual([])
    })
  })
})

describe('an excerpt is only quoted from the version of a file that is on disk', () => {
  // a file saved a moment ago (with a new withholding mark, say) is still in
  // the index as it was before, until the next scan re-reads it
  it('keeps a file indexed as it is now, and drops one saved since', () => {
    const current = write('current.md', 'budget as indexed')
    const stale = write('stale.md', 'budget as indexed')
    store.upsert(fileMeta(current), 'budget as indexed', 'ok')
    store.upsert(fileMeta(stale), `budget with ${SECRET}`, 'ok')
    writeFileSync(
      stale,
      `budget with <span data-redaction="">${SECRET}</span> saved after the scan`,
    )
    expect(store.pathsIndexedAsOnDisk([stale, current])).toEqual([current])
  })

  it('drops a file the index does not know, and one that is gone', () => {
    const known = write('known.md', 'budget')
    const unknown = write('unknown.md', 'budget')
    const gone = write('gone.md', 'budget')
    store.upsert(fileMeta(known), 'budget', 'ok')
    store.upsert(fileMeta(gone), 'budget', 'ok')
    rmSync(gone)
    expect(store.pathsIndexedAsOnDisk([known, unknown, gone])).toEqual([known])
    expect(store.pathsIndexedAsOnDisk([])).toEqual([])
  })

  it('answers for more paths than one query can name', () => {
    const paths = Array.from({ length: 1200 }, (_v, i) => join(dir, `none-${i}.md`))
    const real = write('real.md', 'budget')
    store.upsert(fileMeta(real), 'budget', 'ok')
    expect(store.pathsIndexedAsOnDisk([...paths, real])).toEqual([real])
  })
})

describe('shell wiring (src/main/index.ts needs a running Electron, so the text is pinned)', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8')

  it('tells the editors which open documents have unsaved changes', () => {
    const at = source.indexOf('setOpenFilesSource(')
    expect(at).toBeGreaterThan(0)
    const body = source.slice(at, at + 400)
    expect(body).toContain('tabManager.openDocuments()')
    expect(body).toContain('detachedOpenDocuments()')
  })

  it('answers a knowledge search through the search that leaves unsaved files out', () => {
    const at = source.indexOf("ipcMain.handle('kb:search'")
    const end = source.indexOf("ipcMain.handle('kb:read'")
    const handler = source.slice(at, end)
    // the starred search (and a project widening of it) that leaves unsaved files out
    expect(handler).toContain('searchSavedKnowledgeWithProject(')
    expect(handler).not.toContain('searchKnowledgeBase(')
    // and only over the files the index holds as they are on disk
    expect(handler).toContain('store.pathsIndexedAsOnDisk(readStarredFiles())')
  })

  it('hands the reranker only the files the index holds as they are on disk', () => {
    const at = source.indexOf('HOME_CHANNELS.rerankSearch,')
    const handler = source.slice(at, at + 1200)
    expect(handler).toContain(
      'searchReranker.rerank(q, fileIndexStore.pathsIndexedAsOnDisk(paths), settings)',
    )
  })
})
