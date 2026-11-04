import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { assertZipInflatesWithinLimits } from '@genoffice/docx-engine'

/**
 * Hangul word processor documents (HWP 5, HWPX, some HWP 3) to text, read by the
 * rhwp engine: the same WebAssembly the HWP editor runs. The engine is loaded on
 * first use and kept; a document is freed as soon as its text is out.
 */

type Engine = typeof import('@rhwp/core')
type HwpDocument = InstanceType<Engine['HwpDocument']>

/** A table cell holding more paragraphs than this is page layout, not a data cell. */
const MAX_ROW_CELL_PARAGRAPHS = 3

/**
 * Where the engine's wasm file is. A dev checkout and the tests have it in
 * node_modules; the packaged app has no node_modules and ships it under
 * Resources/wasm (apps/shell/electron-builder.cjs), like the PDF engines.
 */
function rhwpWasmPath(): string {
  const fromEnv = process.env.GENOFFICE_RHWP_WASM
  if (fromEnv) return fromEnv
  try {
    return createRequire(import.meta.url).resolve('@rhwp/core/rhwp_bg.wasm')
  } catch {
    /* fall through */
  }
  const resources = (process as { resourcesPath?: string }).resourcesPath
  if (resources) return join(resources, 'wasm', 'rhwp_bg.wasm')
  throw new Error('rhwp_bg.wasm not found (set GENOFFICE_RHWP_WASM)')
}

let engine: Promise<Engine> | null = null

function loadEngine(): Promise<Engine> {
  if (!engine) {
    const loading = (async () => {
      const mod = await import('@rhwp/core')
      // the bytes are handed over: left to itself the engine fetches its wasm by URL
      await mod.default({ module_or_path: readFileSync(rhwpWasmPath()) })
      return mod
    })()
    engine = loading
    // a failed load is tried again by the next document
    loading.catch(() => {
      if (engine === loading) engine = null
    })
  }
  return engine
}

/** The engine throws plain strings, in Korean; callers get an Error they can show. */
function engineError(thrown: unknown): Error {
  const message = thrown instanceof Error ? thrown.message : String(thrown)
  if (message.includes('암호') || /password/i.test(message)) {
    return new Error('The document is password-protected and cannot be read without its password')
  }
  if (message.includes('UNSUPPORTED_FILE_FORMAT') || message.includes('지원하지 않는 포맷')) {
    return new Error('Not a readable HWP or HWPX document')
  }
  return new Error(`Could not read the HWP document: ${message}`)
}

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The lines of the engine's plain-text export a piece of output stands for. */
const coversOf = (text: string) => text.split(/\r?\n/).map(normalize).filter(Boolean)

/** One line of output, and the plain-text lines it accounts for. */
interface Entry {
  text: string
  covers: string[]
}

const lineEntry = (text: string): Entry => ({ text, covers: coversOf(text) })

interface TableCell {
  row: number
  col: number
  paragraphs: string[]
}

/**
 * The table that is control `ctrl` of a body paragraph, or null when that control
 * is something else (a picture, a text box, a section definition).
 *
 * A table with two or more columns of short cells comes out as rows, cells joined
 * by " | " like the Word reader does it. A table that lays out a page (one
 * column, or cells that hold running text) comes out as its paragraphs in order.
 */
function tableEntries(doc: HwpDocument, sec: number, para: number, ctrl: number): Entry[] | null {
  let dims: { rowCount: number; colCount: number; cellCount: number }
  try {
    dims = JSON.parse(doc.getTableDimensions(sec, para, ctrl))
  } catch {
    return null
  }
  const cells: TableCell[] = []
  for (let cell = 0; cell < dims.cellCount; cell++) {
    const info = JSON.parse(doc.getCellInfo(sec, para, ctrl, cell)) as { row: number; col: number }
    const paragraphs: string[] = []
    const count = doc.getCellParagraphCount(sec, para, ctrl, cell)
    for (let k = 0; k < count; k++) {
      const length = doc.getCellParagraphLength(sec, para, ctrl, cell, k)
      if (length > 0) paragraphs.push(doc.getTextInCell(sec, para, ctrl, cell, k, 0, length))
    }
    cells.push({ row: info.row, col: info.col, paragraphs })
  }
  const asRows =
    dims.colCount >= 2 && cells.every((cell) => cell.paragraphs.length <= MAX_ROW_CELL_PARAGRAPHS)
  if (!asRows) return cells.flatMap((cell) => cell.paragraphs.map(lineEntry))

  // a merged cell sits at its first row and column; the places it spans stay empty,
  // so the columns still line up, but a row does not end in a run of empty places
  const rows = Array.from({ length: dims.rowCount }, () => ({
    cells: Array<string>(dims.colCount).fill(''),
    covers: [] as string[],
  }))
  for (const cell of cells) {
    const row = rows[cell.row]
    if (!row || cell.col >= dims.colCount) continue
    row.cells[cell.col] = cell.paragraphs.map(normalize).filter(Boolean).join(' ')
    row.covers.push(...cell.paragraphs.flatMap(coversOf))
  }
  return rows
    .filter((row) => row.covers.length > 0)
    .map((row) => ({ text: rowText(row.cells), covers: row.covers }))
}

function rowText(cells: string[]): string {
  let end = cells.length
  while (end > 1 && cells[end - 1] === '') end--
  return cells.slice(0, end).join(' | ')
}

/** A memo as the engine lists it; `page` is 1-based and 0 when it has no page. */
interface Memo {
  author?: string
  text?: string
  page?: number
}

/**
 * The document's memos as a `### Comments` block, in the document order the engine
 * already sorts them in. A document without memos gets no block, so its text is
 * exactly what it was before memos were read. Memos that cannot be listed are left out
 * rather than failing the read of a body that could be read.
 */
function commentLines(doc: HwpDocument): string[] {
  let memos: Memo[]
  try {
    const listed = JSON.parse(doc.getMemoList()) as unknown
    memos = Array.isArray(listed) ? (listed as Memo[]) : []
  } catch {
    return []
  }
  if (memos.length === 0) return []
  const lines = ['### Comments']
  for (const memo of memos) {
    const author = memo.author?.trim() || 'unknown'
    const page = typeof memo.page === 'number' && memo.page > 0 ? ` (p.${memo.page})` : ''
    const [first = '', ...rest] = String(memo.text ?? '')
      .replace(/\r\n/g, '\n')
      .split('\n')
    // a memo saved with a closing newline should not leave a blank line after the block
    while (rest.length > 0 && rest[rest.length - 1] === '') rest.pop()
    lines.push(`- ${author}${page}:${first ? ` ${first}` : ''}`)
    for (const line of rest) lines.push(line ? `  ${line}` : '')
  }
  return lines
}

/** The body of the document, paragraph by paragraph, each followed by the tables it holds. */
function bodyEntries(doc: HwpDocument): Entry[] {
  const entries: Entry[] = []
  const sections = doc.getSectionCount()
  for (let sec = 0; sec < sections; sec++) {
    const paragraphs = doc.getParagraphCount(sec)
    for (let para = 0; para < paragraphs; para++) {
      const length = doc.getParagraphLength(sec, para)
      if (length > 0) entries.push(lineEntry(doc.getTextRange(sec, para, 0, length)))
      const controls = (JSON.parse(doc.getControlTextPositions(sec, para)) as unknown[]).length
      for (let ctrl = 0; ctrl < controls; ctrl++) {
        const table = tableEntries(doc, sec, para, ctrl)
        if (table) entries.push(...table)
      }
    }
  }
  return entries
}

const ENTITY = /&#(\d+);|&#x([0-9a-fA-F]+);/g

/** The engine's plain-text export writes some characters as numeric references. */
const decodeEntities = (text: string) =>
  text.replace(ENTITY, (_match, dec?: string, hex?: string) =>
    String.fromCodePoint(dec ? Number(dec) : parseInt(hex!, 16)),
  )

/**
 * Put back what the walk over paragraphs and tables did not reach. The engine's
 * own plain-text export holds every piece of text in reading order (text boxes,
 * tables inside table cells, notes) but no table structure. Each of its lines is
 * looked up among the lines the structured output accounts for; a line found
 * nowhere goes in after the last line that was, so nothing is lost and little
 * moves. One pass, whatever the size: documents with tens of thousands of table
 * cells exist.
 */
function withMissingText(entries: Entry[], flat: string): string[] {
  // where each accounted-for line is: its entries in order, one per occurrence
  const places = new Map<string, number[]>()
  entries.forEach((entry, index) => {
    for (const line of entry.covers) {
      const list = places.get(line)
      if (list) list.push(index)
      else places.set(line, [index])
    }
  })
  /** occurrences of a line already matched */
  const taken = new Map<string, number>()
  /** lines put back, by the entry they follow (-1: in front of everything) */
  const extras = new Map<number, string[]>()
  let pointer = -1
  for (const raw of decodeEntities(flat).split(/\r?\n/)) {
    const line = normalize(raw)
    if (!line) continue
    const list = places.get(line)
    const used = taken.get(line) ?? 0
    if (list && used < list.length) {
      taken.set(line, used + 1)
      pointer = Math.max(pointer, list[used]!)
      continue
    }
    // the cells of a table inside a table cell arrive on one line, tab-separated
    const text = raw.includes('\t') ? rowText(raw.split('\t').map(normalize)) : raw.trim()
    const bucket = extras.get(pointer)
    if (bucket) bucket.push(text)
    else extras.set(pointer, [text])
  }
  const out = [...(extras.get(-1) ?? [])]
  entries.forEach((entry, index) => {
    out.push(entry.text)
    const more = extras.get(index)
    if (more) out.push(...more)
  })
  return out
}

/** One memo as the engine lists it: where its anchor sits in the body, and the note itself. */
export interface HwpMemo {
  id?: number
  index?: number
  author?: string
  date?: string | null
  text?: string
  place?: string
  sectionIndex?: number | null
  paraIndex?: number | null
  startCharIdx?: number | null
  endCharIdx?: number | null
  path?: Array<{
    type: string
    controlIndex?: number
    cellIndex?: number
    paraIndex?: number
  }> | null
}

/**
 * The memos of an HWP / HWPX document, as the engine holds them. Records in the bytes
 * the engine does not model are not listed; a caller checking a save counts those
 * separately from the raw file.
 */
export async function hwpMemosOf(bytes: Uint8Array): Promise<HwpMemo[]> {
  // HWPX is a zip, and the engine inflates it itself: the gate the other zip formats
  // pass runs before the engine gets the bytes
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) await assertZipInflatesWithinLimits(bytes)
  const { HwpDocument } = await loadEngine()
  let doc: HwpDocument
  try {
    // a copy: the engine may keep or change the buffer it is given
    doc = new HwpDocument(new Uint8Array(bytes))
  } catch (thrown) {
    throw engineError(thrown)
  }
  try {
    const listed = JSON.parse(doc.getMemoList()) as unknown
    return Array.isArray(listed) ? (listed as HwpMemo[]) : []
  } catch (thrown) {
    throw engineError(thrown)
  } finally {
    doc.free()
  }
}

/**
 * The bytes of an `.hwp` / `.hwpx` file, checked as parseFileToText checks them before the
 * engine gets them: the content must be what the name says (an HWPX is a zip; an HWP is
 * Hangul 5, Hangul 3, or an HWPX under the old name), and a zip must pass the zip gate.
 * For a caller that opens the document with the engine itself, such as the HWP editor
 * reading the formatting of an attached document. Throws when a check fails.
 */
export async function checkedHwpBytes(bytes: Uint8Array, ext: string): Promise<Uint8Array> {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
  const hwp3 = Buffer.from(bytes.subarray(0, 17)).toString('latin1') === 'HWP Document File'
  const fits = ext === 'hwpx' ? zip : ext === 'hwp' ? zip || ole || hwp3 : false
  if (!fits) throw new Error(`Content mismatch: the .${ext} file is not a Hangul document`)
  if (zip) await assertZipInflatesWithinLimits(bytes)
  return bytes
}

/** The text of an HWP / HWPX document: paragraphs as lines, data tables as " | " rows. */
export async function hwpToText(bytes: Uint8Array): Promise<string> {
  // HWPX is a zip, and the engine inflates it itself: the gate the other zip formats
  // pass runs before the engine gets the bytes
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) await assertZipInflatesWithinLimits(bytes)
  const { HwpDocument } = await loadEngine()
  let doc: HwpDocument
  try {
    // a copy: the engine may keep or change the buffer it is given
    doc = new HwpDocument(new Uint8Array(bytes))
  } catch (thrown) {
    throw engineError(thrown)
  }
  try {
    const flat = JSON.parse(doc.getTextFileText()) as string
    const lines = withMissingText(bodyEntries(doc), flat)
    return [...lines, ...commentLines(doc)].join('\n')
  } catch (thrown) {
    throw engineError(thrown)
  } finally {
    doc.free()
  }
}
