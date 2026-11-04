/**
 * ODT documents in the Word editor: open by extension, save back into the
 * ODT (narrow patch, re-baselined after each save), password ODT refusal,
 * Save As format changes with their confirmation, and crash-recovery copies
 * that keep the format. Runs the real file actions on a real editor; the main
 * process is a stub that records what would be written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildBlankDocx, readDocxPartBase64 } from '@genoffice/docx-engine'
import { docxToOdt, odtToDocx } from '@genoffice/odt-engine'
import { editorExtensions } from '../src/renderer/editor/extensions'
import type { DocState } from '../src/renderer/doc-state'
import { isOdtDoc } from '../src/renderer/doc-state'
import type { OpenDocxResult } from '../src/shared/ipc'
import { setFormatChangeHost } from '../src/renderer/components/format-change-bus'
import { zipEntryNames } from '../src/main/doc-format'
import { undoDepth } from '@tiptap/pm/history'
import { buildOdt } from '../../../packages/odt-engine/tests/helpers/build-odt'
import { hancomSample } from '../../../packages/odt-engine/tests/helpers/hancom-sample'
import {
  hCell,
  hPara,
  hRow,
  hTable,
} from '../../../packages/odt-engine/tests/helpers/hancom-fragments'

const handoff = new Map<string, Uint8Array>()
vi.mock('../src/renderer/doc-bytes', () => ({
  fetchDocBytes: async (url: string) => {
    const bytes = handoff.get(url)
    if (!bytes) throw new Error(`no bytes for ${url}`)
    handoff.delete(url)
    return bytes.slice()
  },
}))

const toast = vi.fn()
vi.mock('../src/renderer/components/toast-bus', () => ({
  showToast: (...args: unknown[]) => toast(...args),
  setToastEmitter: () => {},
}))

const { loadFile, save, writeRecoveryCopy } = await import('../src/renderer/file-actions')
type Ctx = Parameters<typeof loadFile>[0]

let urlSeq = 0
function hand(bytes: Uint8Array): string {
  const url = `test-bytes://${++urlSeq}`
  handoff.set(url, bytes)
  return url
}

function openResult(path: string, bytes: Uint8Array, recovered = false): OpenDocxResult {
  return {
    path,
    name: path.split('/').pop() ?? path,
    dataUrl: hand(bytes),
    hash: 'h',
    ...(recovered ? { recovered: true } : {}),
  }
}

interface Written {
  channel: string
  path: string
  bytes: Uint8Array
}

let written: Written[] = []
let pickedPath: string | null = null
let desktop: Record<string, ReturnType<typeof vi.fn>>

function installDesktop(): void {
  written = []
  const record = (channel: string) => async (path: string, data: ArrayBuffer) => {
    written.push({ channel, path, bytes: new Uint8Array(data) })
    return { ok: true, path }
  }
  desktop = {
    getRecentFiles: vi.fn(async () => []),
    getSystemLocale: vi.fn(async () => 'en-US'),
    docPasswordIntentRevision: vi.fn(async () => 0),
    discardDocPasswordIntents: vi.fn(async () => ({ ok: true })),
    saveDocx: vi.fn(record('save')),
    saveDocxTo: vi.fn(record('save-to')),
    saveDocxNew: vi.fn(record('save-new')),
    saveDocxAs: vi.fn(record('save-as')),
    writeRecoveryCopy: vi.fn(record('recovery')),
    pickSaveAsPath: vi.fn(async () => (pickedPath ? { path: pickedPath } : null)),
    openDocxPath: vi.fn(async (path: string) => {
      const last = [...written].reverse().find((w) => w.path === path)
      return last ? openResult(path, last.bytes) : null
    }),
    captureRect: vi.fn(async () => null),
    materializeDocx: vi.fn(async () => null),
  }
  ;(window as unknown as { desktop: unknown }).desktop = desktop
}

const editors: Editor[] = []

function makeCtx(): Ctx {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
  })
  editors.push(editor)
  const state: Record<string, unknown> = {
    editor,
    doc: null as DocState | null,
    dirtyRef: { current: false },
    saveInFlightRef: { current: false },
    saveIncompleteRef: { current: false },
    pendingMixedExportRef: { current: false },
    printAutoOpenedPreviewRef: { current: false },
    section: null,
    sectionDirty: false,
    sections: [],
    sectionsDirty: [],
    trailingStartType: null,
    pageColor: null,
    pageColorDirty: false,
    header: null,
    headerDirty: false,
    footer: null,
    footerDirty: false,
    hfVariants: {},
    hfVariantsDirty: [],
    sectionHfEdits: {},
    hfLinks: {},
    titlePg: false,
    titlePgDirty: false,
    evenOddHf: false,
    evenOddHfDirty: false,
    mirrorMargins: false,
    mirrorMarginsDirty: false,
    pgNumEdit: null,
    pgNumDirtySections: [],
    pendingNumbering: { newDefs: [], restartNums: [], levelEdits: [], picBullets: [] },
    numberingDirty: false,
    styleUpserts: {},
    comments: [],
    commentsDirty: false,
    watermark: null,
    watermarkDirty: false,
    watermarkStyle: null,
    watermarkPicture: null,
    inkAnnotations: [],
    inksDirty: false,
    footnotes: [],
    endnotes: [],
    notesDirty: false,
    sources: [],
    sourcesDirty: false,
    zoteroDocumentData: '',
    zoteroDocumentDataDirty: false,
    themeFonts: null,
    themeFontsDirty: false,
    themeColors: null,
    themeColorsDirty: false,
    protection: null,
    protectionDirty: false,
    writeProtection: null,
    writeProtectionDirty: false,
    removePersonalInfo: false,
    removePersonalInfoDirty: false,
    setDoc: (next: unknown) => {
      state.doc = typeof next === 'function' ? (next as (p: unknown) => unknown)(state.doc) : next
    },
  }
  // every other setter / callback is a no-op
  return new Proxy(state, {
    get(target, key) {
      // optional inputs (settleFontSettings, defaultFonts …) stay absent
      if (
        typeof key === 'string' &&
        !(key in target) &&
        key !== 'settleFontSettings' &&
        /^(set|on|prompt|bump)/.test(key)
      )
        return () => {}
      return target[key as string]
    },
  }) as unknown as Ctx
}

function docOf(ctx: Ctx): DocState {
  const doc = (ctx as unknown as { doc: DocState | null }).doc
  if (!doc) throw new Error('no document')
  return doc
}

const decoder = new TextDecoder()
async function part(zip: Uint8Array, name: string): Promise<string> {
  const b64 = await readDocxPartBase64(zip, name)
  if (b64 === null) throw new Error(`no ${name}`)
  return decoder.decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
}

/** the text:p elements of content.xml, as written */
async function odtParagraphs(odt: Uint8Array): Promise<string[]> {
  const xml = await part(odt, 'content.xml')
  return [...xml.matchAll(/<text:p\b[^>]*?(?:\/>|>[\s\S]*?<\/text:p>)/g)].map((m) => m[0])
}

const blankOdt = async () => (await docxToOdt(await buildBlankDocx({}))).odtBytes

function setParagraphs(editor: Editor, texts: string[]): void {
  editor.commands.setContent({
    type: 'doc',
    content: texts.map((text) => ({
      type: 'docParagraph',
      attrs: { docxIndex: null },
      content: [{ type: 'text', text }],
    })),
  })
}

/** replace the text of the top-level paragraph whose text is `from` */
function editParagraph(editor: Editor, from: string, to: string): void {
  let at = -1
  editor.state.doc.forEach((node, offset) => {
    if (node.textContent === from) at = offset
  })
  if (at < 0) throw new Error(`no paragraph ${from}`)
  editor.view.dispatch(editor.state.tr.insertText(to, at + 1, at + 1 + from.length))
}

function isOdtBytes(bytes: Uint8Array): boolean {
  const names = zipEntryNames(bytes) ?? []
  return names.includes('mimetype') && !names.includes('[Content_Types].xml')
}

// ---- a password-protected ODT (stored zip with manifest:encryption-data) ----

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function storedZip(entries: Array<[string, string]>): Uint8Array {
  const enc = new TextEncoder()
  const locals: number[] = []
  const central: number[] = []
  const u16 = (out: number[], v: number) => out.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (out: number[], v: number) =>
    out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const [name, text] of entries) {
    const nameBytes = enc.encode(name)
    const data = enc.encode(text)
    const crc = crc32(data)
    const offset = locals.length
    u32(locals, 0x04034b50)
    u16(locals, 20)
    u16(locals, 0)
    u16(locals, 0)
    u32(locals, 0)
    u32(locals, crc)
    u32(locals, data.length)
    u32(locals, data.length)
    u16(locals, nameBytes.length)
    u16(locals, 0)
    locals.push(...nameBytes, ...data)
    u32(central, 0x02014b50)
    u16(central, 20)
    u16(central, 20)
    u16(central, 0)
    u16(central, 0)
    u32(central, 0)
    u32(central, crc)
    u32(central, data.length)
    u32(central, data.length)
    u16(central, nameBytes.length)
    u16(central, 0)
    u16(central, 0)
    u16(central, 0)
    u16(central, 0)
    u32(central, 0)
    u32(central, offset)
    central.push(...nameBytes)
  }
  const end: number[] = []
  u32(end, 0x06054b50)
  u16(end, 0)
  u16(end, 0)
  u16(end, entries.length)
  u16(end, entries.length)
  u32(end, central.length)
  u32(end, locals.length)
  u16(end, 0)
  return new Uint8Array([...locals, ...central, ...end])
}
function passwordOdt(): Uint8Array {
  return storedZip([
    ['mimetype', 'application/vnd.oasis.opendocument.text'],
    [
      'META-INF/manifest.xml',
      '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">' +
        '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>' +
        '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml" manifest:size="10">' +
        '<manifest:encryption-data manifest:checksum-type="SHA1/1K" manifest:checksum="AAAA">' +
        '<manifest:algorithm manifest:algorithm-name="Blowfish CFB" manifest:initialisation-vector="AAAA"/>' +
        '<manifest:key-derivation manifest:key-derivation-name="PBKDF2" manifest:iteration-count="1024" manifest:salt="AAAA"/>' +
        '</manifest:encryption-data></manifest:file-entry></manifest:manifest>',
    ],
    ['content.xml', 'xxxxxxxxxx'],
  ])
}

beforeEach(() => {
  // the jsdom test environment has no CSS.escape (document style CSS uses it)
  ;(globalThis as { CSS?: unknown }).CSS ??= { escape: (s: string) => s }
  installDesktop()
  toast.mockClear()
  pickedPath = null
  setFormatChangeHost(null)
})

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  setFormatChangeHost(null)
})

describe('opening ODT in the Word editor', () => {
  it('picks ODT by extension and keeps format, original bytes, bridge and report', async () => {
    // the bridge docx stamps each zip entry with the current time (2 s
    // resolution); two conversions that straddle a tick differ only there,
    // which a busy machine makes likely. Hold the clock still for both.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-02T03:04:06Z'))
    try {
      const ctx = makeCtx()
      const odt = await blankOdt()
      expect(await loadFile(ctx, openResult('/docs/form.odt', odt))).toBe('ok')
      const doc = docOf(ctx)
      expect(doc.format).toBe('odt')
      expect(isOdtDoc(doc)).toBe(true)
      expect(doc.odt?.original).toEqual(odt)
      expect(doc.odt?.bridge.elements.length).toBeGreaterThan(0)
      expect(Array.isArray(doc.odt?.report)).toBe(true)
      // the editor shows the bridge docx (the same bytes every time for one ODT)
      const bridge = await odtToDocx(odt)
      expect(doc.parsed.internal.originalBytes).toEqual(bridge.docxBytes)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a .docx still opens as docx with no ODT baseline', async () => {
    const ctx = makeCtx()
    expect(await loadFile(ctx, openResult('/docs/a.docx', await buildBlankDocx({})))).toBe('ok')
    expect(docOf(ctx).format).toBe('docx')
    expect(docOf(ctx).odt).toBeUndefined()
  })

  it('a password ODT shows the remove-the-password notice and opens nothing', async () => {
    const ctx = makeCtx()
    const outcome = await loadFile(ctx, openResult('/docs/locked.odt', passwordOdt()))
    expect(outcome).toBe('failed')
    expect((ctx as unknown as { doc: unknown }).doc).toBeNull()
    expect(toast).toHaveBeenCalledTimes(1)
    const [message, kind] = toast.mock.calls[0] as [string, string]
    expect(kind).toBe('error')
    expect(message).toContain('locked.odt')
    expect(message).not.toMatch(/^Open failed|打开失败/)
  })
})

describe('saving an ODT document', () => {
  it('an unchanged save writes the original ODT bytes to the .odt path', async () => {
    const ctx = makeCtx()
    const odt = await blankOdt()
    await loadFile(ctx, openResult('/docs/form.odt', odt))
    expect(await save(ctx, false)).toBe(true)
    expect(written).toHaveLength(1)
    expect(written[0].channel).toBe('save')
    expect(written[0].path).toBe('/docs/form.odt')
    expect(written[0].bytes).toEqual(odt)
  })

  it('edits go through saveOdt; two saves in a row keep untouched parts byte-identical', async () => {
    const ctx = makeCtx()
    await loadFile(ctx, openResult('/docs/form.odt', await blankOdt()))
    const editor = ctx.editor as Editor
    setParagraphs(editor, ['Alpha paragraph', 'Beta paragraph'])
    ctx.dirtyRef.current = true
    expect(await save(ctx, false)).toBe(true)
    const first = written[0].bytes
    expect(isOdtBytes(first)).toBe(true)
    // the save baseline stays the ODT as opened
    expect(docOf(ctx).odt?.original).not.toEqual(first)
    const firstParas = await odtParagraphs(first)
    const alpha = firstParas.find((p) => p.includes('Alpha paragraph'))
    expect(alpha).toBeDefined()

    editParagraph(editor, 'Beta paragraph', 'Beta edited')
    ctx.dirtyRef.current = true
    expect(await save(ctx, false)).toBe(true)
    const second = written[1].bytes
    expect(written[1].path).toBe('/docs/form.odt')
    const secondParas = await odtParagraphs(second)
    // the paragraph nobody touched is the same XML; the edited one changed
    expect(secondParas).toContain(alpha)
    expect(secondParas.some((p) => p.includes('Beta edited'))).toBe(true)
    expect(await part(second, 'styles.xml')).toBe(await part(first, 'styles.xml'))
    expect(await part(second, 'meta.xml')).toBe(await part(first, 'meta.xml'))

    // nothing changed since: the third save is the second's bytes exactly
    expect(await save(ctx, false)).toBe(true)
    expect(written[2].bytes).toEqual(second)
  })

  it('an MCP target must keep the tab format', async () => {
    const ctx = makeCtx()
    await loadFile(ctx, openResult('/docs/form.odt', await blankOdt()))
    const onError = vi.fn()
    expect(
      await save(ctx, false, false, undefined, { path: '/out/x.docx', overwrite: true, onError }),
    ).toBe(false)
    expect(onError).toHaveBeenCalled()
    expect(written).toHaveLength(0)
    expect(await save(ctx, false, false, undefined, { path: '/out/x.odt', overwrite: true })).toBe(
      true,
    )
    expect(written[0].channel).toBe('save-to')
    expect(isOdtBytes(written[0].bytes)).toBe(true)
  })
})

describe('Save As with a format change', () => {
  it('docx → ODT asks with the report; cancel writes nothing', async () => {
    const ctx = makeCtx()
    await loadFile(ctx, openResult('/docs/a.docx', await buildBlankDocx({})))
    // a watermark is something ODT cannot keep, so the conversion reports it
    Object.assign(ctx, { watermark: 'DRAFT', watermarkDirty: true })
    const asked: unknown[] = []
    setFormatChangeHost((request, answer) => {
      asked.push(request)
      answer(false)
    })
    pickedPath = '/docs/a.odt'
    expect(await save(ctx, true)).toBe(false)
    expect(asked).toHaveLength(1)
    expect((asked[0] as { to: string }).to).toBe('odt')
    expect((asked[0] as { report: Array<{ feature: string }> }).report).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'dropped', feature: 'watermark' })]),
    )
    expect(written).toHaveLength(0)
    expect(docOf(ctx).format).toBe('docx')
    expect(docOf(ctx).filePath).toBe('/docs/a.docx')
  })

  it('docx → ODT confirmed writes ODT and reloads the tab as an ODT document', async () => {
    const ctx = makeCtx()
    await loadFile(ctx, openResult('/docs/a.docx', await buildBlankDocx({})))
    setParagraphs(ctx.editor as Editor, ['Hello ODT'])
    ctx.dirtyRef.current = true
    setFormatChangeHost((_request, answer) => answer(true))
    pickedPath = '/docs/a.odt'
    expect(await save(ctx, true)).toBe(true)
    expect(written).toHaveLength(1)
    expect(written[0].channel).toBe('save-as')
    expect(written[0].path).toBe('/docs/a.odt')
    expect(isOdtBytes(written[0].bytes)).toBe(true)
    expect(desktop.openDocxPath).toHaveBeenCalledWith('/docs/a.odt')
    const doc = docOf(ctx)
    expect(doc.format).toBe('odt')
    expect(doc.filePath).toBe('/docs/a.odt')
    expect(doc.odt?.original).toEqual(written[0].bytes)
    expect(ctx.dirtyRef.current).toBe(false)
    expect((ctx.editor as Editor).state.doc.textContent).toContain('Hello ODT')
    // the next plain save is an ODT save of the new file
    expect(await save(ctx, false)).toBe(true)
    expect(written[1].path).toBe('/docs/a.odt')
    expect(written[1].bytes).toEqual(written[0].bytes)
  })

  it('ODT → docx with an empty report saves without asking and reloads as docx', async () => {
    const ctx = makeCtx()
    await loadFile(ctx, openResult('/docs/form.odt', await blankOdt()))
    expect(docOf(ctx).odt?.report).toEqual([])
    const host = vi.fn()
    setFormatChangeHost(host)
    pickedPath = '/docs/form.docx'
    expect(await save(ctx, true)).toBe(true)
    expect(host).not.toHaveBeenCalled()
    expect(written[0].path).toBe('/docs/form.docx')
    expect(isOdtBytes(written[0].bytes)).toBe(false)
    expect(zipEntryNames(written[0].bytes)).toContain('[Content_Types].xml')
    expect(docOf(ctx).format).toBe('docx')
    expect(docOf(ctx).odt).toBeUndefined()
  })

  it('ODT → docx shows the open-time report when it has items', async () => {
    const ctx = makeCtx()
    await loadFile(ctx, openResult('/docs/form.odt', await blankOdt()))
    const doc = docOf(ctx)
    ;(ctx as unknown as { doc: DocState }).doc = {
      ...doc,
      odt: { ...doc.odt!, report: [{ kind: 'dropped', feature: 'protection', count: 2 }] },
    }
    const asked: unknown[] = []
    setFormatChangeHost((request, answer) => {
      asked.push(request)
      answer(false)
    })
    pickedPath = '/docs/form.docx'
    expect(await save(ctx, true)).toBe(false)
    expect(asked).toEqual([
      { to: 'docx', report: [{ kind: 'dropped', feature: 'protection', count: 2 }] },
    ])
    expect(written).toHaveLength(0)
  })

  it('Save As in the same format writes that format without asking', async () => {
    const ctx = makeCtx()
    const odt = await blankOdt()
    await loadFile(ctx, openResult('/docs/form.odt', odt))
    const host = vi.fn()
    setFormatChangeHost(host)
    pickedPath = '/docs/copy.odt'
    expect(await save(ctx, true)).toBe(true)
    expect(desktop.pickSaveAsPath).toHaveBeenCalledWith('form.odt', '/docs/form.odt', 'odt', true)
    expect(host).not.toHaveBeenCalled()
    expect(written[0].path).toBe('/docs/copy.odt')
    expect(written[0].bytes).toEqual(odt)
    expect(docOf(ctx).filePath).toBe('/docs/copy.odt')
    expect(docOf(ctx).format).toBe('odt')
  })
})

describe('crash recovery of an ODT tab', () => {
  it('the recovery copy is ODT, restores as an ODT document, and saves as ODT', async () => {
    const ctx = makeCtx()
    await loadFile(ctx, openResult('/docs/form.odt', await blankOdt()))
    setParagraphs(ctx.editor as Editor, ['Unsaved work'])
    ctx.dirtyRef.current = true
    await writeRecoveryCopy(ctx)
    expect(written).toHaveLength(1)
    expect(written[0].channel).toBe('recovery')
    expect(written[0].path).toBe('/docs/form.odt')
    const copy = written[0].bytes
    expect(isOdtBytes(copy)).toBe(true)

    // reopen after a crash: the main process hands back the copy, marked recovered
    const restored = makeCtx()
    expect(await loadFile(restored, openResult('/docs/form.odt', copy, true))).toBe('ok')
    expect(docOf(restored).format).toBe('odt')
    expect(restored.dirtyRef.current).toBe(true)
    expect((restored.editor as Editor).state.doc.textContent).toContain('Unsaved work')
    expect(await save(restored, false)).toBe(true)
    const saved = written[written.length - 1]
    expect(saved.channel).toBe('save')
    expect(saved.path).toBe('/docs/form.odt')
    expect(isOdtBytes(saved.bytes)).toBe(true)
  })
})

/**
 * The odt-engine's Hancom-like sample. Its builder hands JSZip TextEncoder
 * output, which JSZip does not recognise across the jsdom realm: give it
 * this realm's Uint8Array for the duration of the build.
 */
async function hancomOdt(): Promise<Uint8Array> {
  const Native = globalThis.TextEncoder
  class RealmEncoder extends Native {
    encode(input?: string): Uint8Array<ArrayBuffer> {
      return new Uint8Array(super.encode(input))
    }
  }
  globalThis.TextEncoder = RealmEncoder
  try {
    // without its picture: JSZip in this test realm cannot take the engine's
    // decoded picture bytes either (one realm in the app, no such problem)
    const sample = hancomSample()
    const blocks = sample.blocks.filter((b) => !b.includes(sample.pieces.image.frame))
    // a plain body table next to the sample's nested and framed ones
    blocks.splice(
      blocks.length - 1,
      0,
      hTable('Table2', 2, [hRow([hCell(hPara('cell one')), hCell(hPara('cell two'))])]),
    )
    const body = blocks.join('')
    return await buildOdt({ ...sample.options, body, pictures: {} })
  } finally {
    globalThis.TextEncoder = Native
  }
}

/** replace `from` with `to` wherever it sits (body paragraph, table cell …), as typing would */
function editText(editor: Editor, from: string, to: string): void {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at >= 0) return false
    if (node.isText && node.text?.includes(from)) at = pos + node.text.indexOf(from)
    return true
  })
  if (at < 0) throw new Error(`no text ${from}`)
  editor.view.dispatch(editor.state.tr.insertText(to, at, at + from.length))
}

describe('ODT edge cases', () => {
  it('a corrupt ODT shows the open-failure notice and opens nothing', async () => {
    const ctx = makeCtx()
    const corrupt = new TextEncoder().encode('PK this is not a real zip archive')
    expect(await loadFile(ctx, openResult('/docs/broken.odt', corrupt))).toBe('failed')
    expect((ctx as unknown as { doc: unknown }).doc).toBeNull()
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][1]).toBe('error')
    expect(written).toHaveLength(0)
  })

  it('edits arriving during a save stay dirty and the next save writes them all', async () => {
    const ctx = makeCtx()
    const odt = await hancomOdt()
    await loadFile(ctx, openResult('/docs/hancom.odt', odt))
    const editor = ctx.editor as Editor
    editText(editor, 'after  section', 'first edit')
    ctx.dirtyRef.current = true
    // the user keeps typing while the main process writes
    desktop.saveDocx.mockImplementationOnce(async (path: string, data: ArrayBuffer) => {
      written.push({ channel: 'save', path, bytes: new Uint8Array(data) })
      editText(editor, 'cell one', 'typed meanwhile')
      return { ok: true }
    })
    expect(await save(ctx, false)).toBe(true)
    expect(ctx.saveIncompleteRef.current).toBe(true)
    expect(editor.state.doc.textContent).toContain('typed meanwhile')
    const during = await odtParagraphs(written[0].bytes)
    expect(during.some((p) => p.includes('first edit'))).toBe(true)
    expect(during.some((p) => p.includes('typed meanwhile'))).toBe(false)

    ctx.dirtyRef.current = true
    expect(await save(ctx, false)).toBe(true)
    const next = await odtParagraphs(written[1].bytes)
    expect(next.some((p) => p.includes('first edit'))).toBe(true)
    expect(next.some((p) => p.includes('typed meanwhile'))).toBe(true)
    // paragraphs nobody touched are still the original bytes
    const original = await odtParagraphs(odt)
    // ("after  section" is written with <text:s/> for its second space)
    const untouched = original.filter((p) => !/after .*section|cell one/.test(p))
    expect(untouched.length).toBeGreaterThan(10)
    for (const para of untouched) expect(next).toContain(para)
  })
})

function textPos(editor: Editor, text: string): number {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(text)) at = pos + node.text.indexOf(text)
    return true
  })
  if (at < 0) throw new Error(`no text ${text}`)
  return at
}

describe('saving keeps the ODT baseline it was opened with', () => {
  it('no redraw and no undo loss after a save, whatever the edit', async () => {
    const ctx = makeCtx()
    const odt = await hancomOdt()
    await loadFile(ctx, openResult('/docs/hancom.odt', odt))
    const editor = ctx.editor as Editor
    const bridge = docOf(ctx).odt?.bridge
    // Text edits never redraw. Formatting and paragraph splits redraw after a
    // save exactly as they do in a docx document (the shared post-save rebase
    // of the editor's own saved docx), so only the former are asserted here.
    const keepsEditor = new Set(['paragraph text', 'cell text'])
    const edits: Array<[string, () => void]> = [
      ['paragraph text', () => editText(editor, 'after  section', 'edited paragraph')],
      ['cell text', () => editText(editor, 'cell one', 'edited cell')],
      [
        'bold',
        () => {
          const at = textPos(editor, 'edited paragraph')
          editor
            .chain()
            .setTextSelection({ from: at, to: at + 6 })
            .setMark('bold')
            .run()
        },
      ],
      [
        'font size',
        () => {
          const at = textPos(editor, 'edited cell')
          editor
            .chain()
            .setTextSelection({ from: at, to: at + 6 })
            .setMark('docTextStyle', { sizeHalfPoints: 40 })
            .run()
        },
      ],
      [
        'paragraph split',
        () => {
          const at = textPos(editor, 'cell')
          editor
            .chain()
            .setTextSelection(at + 2)
            .splitBlock()
            .run()
        },
      ],
    ]
    for (const [label, edit] of edits) {
      edit()
      ctx.dirtyRef.current = true
      const before = editor.state.doc
      const depth = undoDepth(editor.state)
      expect(depth, label).toBeGreaterThan(0)
      expect(await save(ctx, false), label).toBe(true)
      if (keepsEditor.has(label)) {
        expect(editor.state.doc, `${label}: content replaced`).toBe(before)
        expect(undoDepth(editor.state), `${label}: undo history`).toBe(depth)
      }
      expect(ctx.dirtyRef.current, label).toBe(false)
      // the save baseline is still the ODT as opened, and the editor's
      // reference is the docx it saved (nothing re-derived from the ODT)
      expect(docOf(ctx).odt?.original).toEqual(odt)
      expect(docOf(ctx).odt?.bridge).toBe(bridge)
    }
  })

  it('three saves with edits in between keep untouched parts byte-identical', async () => {
    const ctx = makeCtx()
    const odt = await hancomOdt()
    await loadFile(ctx, openResult('/docs/hancom.odt', odt))
    const editor = ctx.editor as Editor
    const outputs: Uint8Array[] = []
    const rounds: Array<() => void> = [
      () => editText(editor, 'after  section', 'first edit'),
      () => editText(editor, 'cell one', 'second edit'),
      () => {
        const at = textPos(editor, 'back to portrait')
        editor
          .chain()
          .setTextSelection({ from: at, to: at + 4 })
          .setMark('bold')
          .run()
      },
    ]
    for (const edit of rounds) {
      edit()
      ctx.dirtyRef.current = true
      expect(await save(ctx, false)).toBe(true)
      outputs.push(written[written.length - 1].bytes)
    }
    const original = await odtParagraphs(odt)
    const untouched = original.filter((p) => !/after .*section|cell one|back to portrait/.test(p))
    expect(untouched.length).toBeGreaterThan(10)
    const [first, second, third] = await Promise.all(outputs.map(odtParagraphs))
    for (const para of untouched) {
      expect(first).toContain(para)
      expect(second).toContain(para)
      expect(third).toContain(para)
    }
    // an edit, once saved, is written the same way by every later save
    const firstEdit = first.find((p) => p.includes('first edit'))
    expect(firstEdit).toBeDefined()
    expect(second).toContain(firstEdit)
    expect(third).toContain(firstEdit)
    const secondEdit = second.find((p) => p.includes('second edit'))
    expect(third).toContain(secondEdit)
    for (const name of ['meta.xml', 'settings.xml', 'styles.xml'])
      expect(await part(outputs[2], name), name).toBe(await part(outputs[0], name))
    // and a save with no further edit is the previous output exactly
    expect(await save(ctx, false)).toBe(true)
    expect(written[written.length - 1].bytes).toEqual(outputs[2])
  })
})
