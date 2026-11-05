import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { setOpenFilesSource } from '@genoffice/electron-utils/unsaved-files'
import { ATTACHABLE_EXTS, attachableMaxBytes, parseFileToText } from '@genoffice/file-parse'
import {
  LONG_MATERIAL_NOTICE_CHARS,
  MAX_IMAGE_MATERIAL_BYTES,
  MAX_MATERIAL_BYTES,
  MAX_MATERIALS,
  USAGE_NOTICE_CHARS,
} from '../src/main/generate/limits'
import {
  generateNotices,
  IMAGE_MATERIAL_EXTS,
  inspectMaterial,
  materialMaxBytes,
  SUPPORTED_MATERIAL_EXTS,
  summarizeMaterials,
  untitledMaterial,
  type MaterialStatus,
} from '../src/main/generate/materials'

/**
 * Material status in the generate window: size, readable or why not, text
 * length (measured through the redaction-aware reader only), unsaved changes.
 */

const SECRET = '13800138000'
const LABEL = 'client phone'
const MD = `call <span class="redact-span" data-redaction="" data-label="${LABEL}">${SECRET}</span> today`
const MD_BROKEN = `call <span class="redact-span" data-redaction="" data-label="${LABEL}">${SECRET} today`

const DIAGRAM_FIXTURES = join(__dirname, '../../../packages/drawio-model/tests/fixtures')

let dir: string

beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve('@rhwp/core/rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-generate-'))
})
afterEach(() => {
  setOpenFilesSource(null)
  rmSync(dir, { recursive: true, force: true })
})

function write(name: string, content: string | Uint8Array): string {
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}

describe('inspectMaterial', () => {
  it('reports size and text length of a readable file', async () => {
    const path = write('notes.txt', 'hello world')
    const status = await inspectMaterial(path)
    expect(status).toMatchObject({ path, name: 'notes.txt', sizeBytes: 11, unsaved: false })
    expect(status.problem).toBeUndefined()
    expect(status.textLength).toBe('hello world'.length)
  })

  it('marks a file that no longer exists as missing', async () => {
    const status = await inspectMaterial(join(dir, 'gone.docx'))
    expect(status.problem).toBe('missing')
    expect(status.sizeBytes).toBeUndefined()
  })

  it('marks a type the reader cannot read as unsupported, without reading it', async () => {
    const path = write('clip.mp4', 'not really a video')
    let parsed = false
    const status = await inspectMaterial(path, {
      parse: async () => {
        parsed = true
        return { ok: true, kind: 'text', text: 'x' }
      },
    })
    expect(status.problem).toBe('unsupported')
    expect(parsed).toBe(false)
  })

  it('marks a file over the size cap as too large, without reading it', async () => {
    const path = write('big.txt', 'x')
    let parsed = false
    const parse = async () => {
      parsed = true
      return { ok: true, kind: 'text' as const, text: 'x' }
    }
    const over = await inspectMaterial(path, {
      stat: async () => ({ isFile: () => true, size: MAX_MATERIAL_BYTES + 1 }),
      parse,
    })
    expect(over.problem).toBe('too-large')
    expect(over.sizeBytes).toBe(MAX_MATERIAL_BYTES + 1)
    expect(parsed).toBe(false)
    const at = await inspectMaterial(path, {
      stat: async () => ({ isFile: () => true, size: MAX_MATERIAL_BYTES }),
      parse,
    })
    expect(at.problem).toBeUndefined()
  })

  it('reads a document whose size is pictures at any size', async () => {
    for (const name of ['deck.pptx', 'scan.pdf', 'report.docx']) {
      const path = write(name, 'x')
      const big = await inspectMaterial(path, {
        stat: async () => ({ isFile: () => true, size: 10 * MAX_MATERIAL_BYTES }),
        parse: async () => ({ ok: true, kind: 'text' as const, text: 'words' }),
      })
      expect(big.problem, name).toBeUndefined()
    }
  })

  it('holds pictures to the receiving editors’ image cap', async () => {
    const path = write('photo.png', 'x')
    const over = await inspectMaterial(path, {
      stat: async () => ({ isFile: () => true, size: MAX_IMAGE_MATERIAL_BYTES + 1 }),
    })
    expect(over.problem).toBe('too-large')
    const ok = await inspectMaterial(path, {
      stat: async () => ({ isFile: () => true, size: 1024 }),
      parse: async () => ({ ok: true, kind: 'image', mime: 'image/png' }),
    })
    expect(ok.problem).toBeUndefined()
    expect(ok.textLength).toBe(0)
  })

  it('does not read a file open with unsaved changes, and says so', async () => {
    const path = write('draft.md', 'words')
    setOpenFilesSource(() => [{ filePath: path, dirty: true }])
    let parsed = false
    const status = await inspectMaterial(path, {
      parse: async () => {
        parsed = true
        return { ok: true, kind: 'text', text: 'words' }
      },
    })
    expect(status.unsaved).toBe(true)
    expect(status.problem).toBeUndefined()
    expect(parsed).toBe(false)
    setOpenFilesSource(() => [{ filePath: path, dirty: false }])
    expect((await inspectMaterial(path)).unsaved).toBe(false)
  })

  it('counts unsaved when the host cannot say which tabs are dirty', async () => {
    const path = write('draft.md', 'words')
    setOpenFilesSource(() => {
      throw new Error('tab list unavailable')
    })
    expect((await inspectMaterial(path)).unsaved).toBe(true)
  })

  it('measures a withheld span as its marker, never as the words', async () => {
    const path = write('note.md', MD)
    const status = await inspectMaterial(path)
    expect(status.problem).toBeUndefined()
    // the reader hands back `call {{client phone}} today`
    expect(status.textLength).toBe(`call {{${LABEL}}} today`.length)
    expect(JSON.stringify(status)).not.toContain(SECRET)
  })

  it('shows a file whose withholding mark cannot be read as unreadable, with no text', async () => {
    const path = write('broken.md', MD_BROKEN)
    const status = await inspectMaterial(path)
    expect(status.problem).toBe('unreadable')
    expect(status.textLength).toBe(0)
    expect(JSON.stringify(status)).not.toContain(SECRET)
  })

  it('treats a reader that fails or throws as unreadable', async () => {
    const path = write('deck.pptx', 'x')
    const failed = await inspectMaterial(path, {
      parse: async () => ({ ok: false, kind: 'text', error: 'Content mismatch' }),
    })
    expect(failed.problem).toBe('unreadable')
    const thrown = await inspectMaterial(path, {
      parse: async () => {
        throw new Error('boom')
      },
    })
    expect(thrown.problem).toBe('unreadable')
  })

  it('lists a never-saved document as untitled', () => {
    expect(untitledMaterial(42, 'Untitled')).toMatchObject({
      key: 'untitled:42',
      name: 'Untitled',
      problem: 'untitled',
    })
  })
})

/** a one-line Hangul document, built with the engine the reader uses */
function hangulDocument(): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  doc.insertText(0, 0, 0, '공문 참고 자료')
  return doc
}

describe('Hangul documents as material', () => {
  it('reads a .hwp and a .hwpx file for its text length', async () => {
    for (const [name, bytes] of [
      ['notice.hwp', hangulDocument().exportHwp()],
      ['notice.hwpx', hangulDocument().exportHwpx()],
    ] as const) {
      const path = write(name, bytes)
      const status = await inspectMaterial(path)
      expect(status.problem, name).toBeUndefined()
      expect(status.textLength, name).toBe('공문 참고 자료'.length)
    }
  })

  it('holds a .hwp to the attachment cap and reads a .hwpx at any size, as the editors do', async () => {
    const parse = async () => ({ ok: true, kind: 'text' as const, text: 'words' })
    const sized = (size: number) => async () => ({ isFile: () => true, size })
    const hwp = write('old.hwp', 'x')
    expect(materialMaxBytes('hwp')).toBe(attachableMaxBytes('hwp'))
    expect(
      (await inspectMaterial(hwp, { stat: sized(MAX_MATERIAL_BYTES + 1), parse })).problem,
    ).toBe('too-large')
    expect(
      (await inspectMaterial(hwp, { stat: sized(MAX_MATERIAL_BYTES), parse })).problem,
    ).toBeUndefined()
    const hwpx = write('form.hwpx', 'x')
    expect(materialMaxBytes('hwpx')).toBe(Number.POSITIVE_INFINITY)
    expect(
      (await inspectMaterial(hwpx, { stat: sized(10 * MAX_MATERIAL_BYTES), parse })).problem,
    ).toBeUndefined()
  })
})

describe('the material formats', () => {
  const DIAGRAM_EXTS = ['drawio', 'dio']

  /**
   * Whether `parseFileToText` reads a file named by this extension: it reads
   * by the name before the content, so a one-byte file answers. A format it
   * does not read comes back `unsupported`; one it reads comes back as text
   * (or a failed read of that format) or as a picture.
   */
  async function readerReads(ext: string): Promise<boolean> {
    const path = write(`probe.${ext}`, 'x')
    return (await parseFileToText(path)).kind !== 'unsupported'
  }

  it('are the attachable formats the reader reads, named by their last extension', async () => {
    const expected: string[] = []
    // the two diagram pictures are named by two extensions; a material is named by one
    for (const ext of [...ATTACHABLE_EXTS].filter((e) => !e.includes('.'))) {
      // draw.io diagrams are read, but left out of the material on purpose
      if (DIAGRAM_EXTS.includes(ext)) continue
      if (await readerReads(ext)) expected.push(ext)
    }
    expect([...SUPPORTED_MATERIAL_EXTS].sort()).toEqual(expected.sort())
    for (const ext of SUPPORTED_MATERIAL_EXTS) expect(ATTACHABLE_EXTS.has(ext), ext).toBe(true)
  })

  it('take Hangul, ODT and EPUB documents but not .xls, source code or draw.io diagrams', () => {
    for (const ext of ['hwp', 'hwpx', 'odt', 'epub']) {
      expect(SUPPORTED_MATERIAL_EXTS.has(ext), ext).toBe(true)
    }
    for (const ext of ['xls', 'js', 'yaml', ...DIAGRAM_EXTS]) {
      expect(SUPPORTED_MATERIAL_EXTS.has(ext), ext).toBe(false)
    }
  })

  it('keep every picture type a material is handed over as', () => {
    for (const ext of IMAGE_MATERIAL_EXTS) expect(SUPPORTED_MATERIAL_EXTS.has(ext), ext).toBe(true)
  })

  it('name a .drawio.png a picture, held to the picture cap', async () => {
    const path = join(dir, 'flow.drawio.png')
    copyFileSync(join(DIAGRAM_FIXTURES, 'out.drawio.png'), path)
    const status = await inspectMaterial(path)
    expect(status).toMatchObject({ ext: 'png' })
    expect(status.problem).toBeUndefined()
    expect(materialMaxBytes(status.ext)).toBe(MAX_IMAGE_MATERIAL_BYTES)
  })
})

describe('the two notices (8.7)', () => {
  it('warns about usage only above the threshold, for every kind', () => {
    for (const kind of ['slides', 'html', 'mindmap'] as const) {
      expect(generateNotices(kind, USAGE_NOTICE_CHARS).usage, kind).toBe(false)
      expect(generateNotices(kind, USAGE_NOTICE_CHARS + 1).usage, kind).toBe(true)
    }
  })

  it('warns about long material above its threshold, only for slides and html', () => {
    for (const kind of ['slides', 'html'] as const) {
      expect(generateNotices(kind, LONG_MATERIAL_NOTICE_CHARS).longMaterial, kind).toBe(false)
      expect(generateNotices(kind, LONG_MATERIAL_NOTICE_CHARS + 1).longMaterial, kind).toBe(true)
    }
    expect(generateNotices('mindmap', LONG_MATERIAL_NOTICE_CHARS + 1).longMaterial).toBe(false)
    expect(generateNotices('mindmap', USAGE_NOTICE_CHARS + 1).longMaterial).toBe(false)
  })

  it('starts from the documented values', () => {
    expect(LONG_MATERIAL_NOTICE_CHARS).toBe(8_000)
    expect(USAGE_NOTICE_CHARS).toBe(100_000)
    expect(MAX_MATERIALS).toBe(20)
    expect(MAX_MATERIAL_BYTES).toBe(50 * 1024 * 1024)
  })
})

describe('summarizeMaterials', () => {
  const ready = (name: string, size: number, length: number): MaterialStatus => ({
    key: name,
    name,
    path: `/m/${name}`,
    ext: 'txt',
    sizeBytes: size,
    unsaved: false,
    textLength: length,
  })

  it('totals size and text over the readable materials only', () => {
    const summary = summarizeMaterials(
      [
        ready('a.txt', 100, 5000),
        ready('b.txt', 50, 3001),
        { ...ready('c.txt', 999, 99999), problem: 'unreadable' },
      ],
      'slides',
    )
    expect(summary.totalBytes).toBe(150)
    expect(summary.totalTextLength).toBe(8001)
    expect(summary.notices).toEqual({ usage: false, longMaterial: true })
    expect(summary.canMake).toBe(true)
  })

  it('cannot make with no readable material', () => {
    const summary = summarizeMaterials(
      [{ ...ready('a.txt', 1, 1), problem: 'missing' }, untitledMaterial(1, 'Untitled')],
      'html',
    )
    expect(summary.canMake).toBe(false)
  })

  it('cannot make while any material is unsaved', () => {
    const summary = summarizeMaterials(
      [ready('a.txt', 1, 1), { ...ready('b.txt', 1, 0), unsaved: true }],
      'html',
    )
    expect(summary.unsaved.map((s) => s.name)).toEqual(['b.txt'])
    expect(summary.canMake).toBe(false)
  })

  it('cannot make with more materials than the cap', () => {
    const many = Array.from({ length: MAX_MATERIALS + 1 }, (_, i) => ready(`${i}.txt`, 1, 1))
    expect(summarizeMaterials(many, 'mindmap')).toMatchObject({ tooMany: true, canMake: false })
    expect(summarizeMaterials(many.slice(1), 'mindmap')).toMatchObject({
      tooMany: false,
      canMake: true,
    })
  })
})
