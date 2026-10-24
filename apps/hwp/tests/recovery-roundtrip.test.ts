/**
 * A recovery copy holds the bytes a save at that moment would have written: the
 * engine's export with the save-time fixes against the opened file. Restoring
 * the copy and saving it at once writes what the save before the crash would
 * have written, so a document with lists after a section's body (master pages,
 * memos) keeps them (decision 0024).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import * as CFB from 'cfb'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { fieldKindsOf } from '../src/main/field-kinds'
import { applySaveFixes } from '../src/main/save-fixes'
import type { SaveBase } from '../src/main/save-fixes'
import { sectionTailsOf } from '../src/main/section-tails'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

const PARA_HEADER = 66
const PARA_CHAR_SHAPE = 68
const PARA_LINE_SEG = 69
const LIST_HEADER = 72
const MEMO_LIST = 93
const SECTION0 = '/BodyText/Section0'

function record(tag: number, level: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4)
  head.writeUInt32LE((tag | (level << 10) | (payload.length << 20)) >>> 0)
  return Buffer.concat([head, payload])
}

function paragraph(level: number): Buffer {
  const header = Buffer.alloc(24)
  header.writeUInt32LE(0x80000001, 0)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(1, 16)
  const shape = Buffer.alloc(8)
  const line = Buffer.alloc(36)
  line.writeUInt32LE(1000, 8)
  line.writeUInt32LE(1000, 12)
  line.writeUInt32LE(850, 16)
  return Buffer.concat([
    record(PARA_HEADER, level, header),
    record(PARA_CHAR_SHAPE, level + 1, shape),
    record(PARA_LINE_SEG, level + 1, line),
  ])
}

function masterPage(kind: number): Buffer {
  const header = Buffer.alloc(34)
  header.writeUInt32LE(1, 0)
  header.writeUInt32LE(67180, 8)
  header.writeUInt32LE(51024, 12)
  header.writeUInt8(kind, 18)
  return Buffer.concat([record(LIST_HEADER, 1, header), paragraph(1)])
}

function memo(number: number): Buffer {
  const id = Buffer.alloc(4)
  id.writeUInt32LE(number)
  const header = Buffer.alloc(16)
  header.writeUInt32LE(1, 0)
  return Buffer.concat([record(MEMO_LIST, 1, id), record(LIST_HEADER, 1, header), paragraph(1)])
}

function withTail(file: Uint8Array, ...lists: Buffer[]): Uint8Array {
  const cfb = CFB.read(Buffer.from(file), { type: 'buffer' })
  const entry = CFB.find(cfb, SECTION0)!
  const data = inflateRawSync(Buffer.from(entry.content as Uint8Array))
  CFB.utils.cfb_add(cfb, SECTION0, deflateRawSync(Buffer.concat([data, ...lists])))
  return new Uint8Array(CFB.write(cfb, { type: 'buffer' }) as Buffer)
}

/**
 * Every stream of a container by path, as it reads (compressed streams inflated). Two
 * writes of one document can lay the container out and compress a stream differently:
 * the save writes its fixed container itself, the engine writes its own.
 */
function streamsOf(file: Uint8Array): Map<string, string> {
  const cfb = CFB.read(Buffer.from(file), { type: 'buffer' })
  const streams = new Map<string, string>()
  cfb.FullPaths.forEach((path, index) => {
    const entry = cfb.FileIndex[index]
    if (entry?.type !== 2) return
    const raw = Buffer.from(entry.content as Uint8Array)
    let data: Buffer
    try {
      data = inflateRawSync(raw)
    } catch {
      data = raw
    }
    streams.set(path, data.toString('hex'))
  })
  return streams
}

function exported(...lines: string[]): Uint8Array {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  lines.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    if (line) doc.insertText(0, index, 0, line)
  })
  const bytes = doc.exportHwp()
  doc.free()
  return bytes
}

/** what the main process keeps of a file it reads for a view (hwp-main readFile) */
const baseOf = (file: Uint8Array): SaveBase => ({
  tails: sectionTailsOf(file) ?? undefined,
  kinds: fieldKindsOf(file) ?? undefined,
})

/** a save of the document as the editor holds it: the engine's export, then the fixes */
function save(doc: HwpDocument, base: SaveBase): Uint8Array {
  return applySaveFixes(doc.exportHwp(), 'hwp', undefined, base).bytes
}

describe('a restored copy saved at once', () => {
  it('writes what the save before the crash would have written', () => {
    const original = withTail(
      exported('본문 MEMO/65535/3/1769959632/2', '둘째 문단'),
      memo(3),
      masterPage(4),
      masterPage(5),
    )
    const base = baseOf(original)
    expect(base.tails?.tails.get(0)).toHaveLength(3)

    // before the crash: the user edits; the copy is the save of that moment
    const before = new HwpDocument(original)
    before.insertText(0, 1, 0, '고친 ')
    const preCrashSave = save(before, base)
    const copy = applySaveFixes(before.exportHwp(), 'hwp', undefined, base).bytes
    before.free()
    expect(copy).toEqual(preCrashSave)
    // the engine alone would have dropped the lists
    expect(sectionTailsOf(copy)?.tails.get(0)).toHaveLength(3)

    // after the restart: the copy is loaded, the save base is still the original file
    const restored = new HwpDocument(copy)
    const restoredSave = save(restored, base)
    restored.free()

    // the same streams with the same content: master pages and the memo included
    expect(streamsOf(restoredSave)).toEqual(streamsOf(preCrashSave))
    expect(sectionTailsOf(restoredSave)?.tails.get(0)).toHaveLength(3)
    const reread = new HwpDocument(restoredSave)
    const text = reread.getTextFileText()
    reread.free()
    const expected = new HwpDocument(preCrashSave)
    expect(text).toBe(expected.getTextFileText())
    expected.free()
    expect(text).toContain('고친 둘째 문단')
  })

  it('keeps the lists when the restored document is edited further', () => {
    const original = withTail(exported('본문', '둘째 문단'), masterPage(4), masterPage(5))
    const base = baseOf(original)
    const before = new HwpDocument(original)
    before.insertText(0, 0, 0, '고친 ')
    const copy = save(before, base)
    before.free()

    const restored = new HwpDocument(copy)
    restored.insertText(0, 1, 0, '더 ')
    const saved = save(restored, base)
    restored.free()
    expect(sectionTailsOf(saved)?.tails.get(0)).toHaveLength(2)
    const reread = new HwpDocument(saved)
    expect(reread.getTextFileText()).toContain('고친 본문')
    expect(reread.getTextFileText()).toContain('더 둘째 문단')
    reread.free()
  })
})
