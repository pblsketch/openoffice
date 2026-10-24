/**
 * Crash-recovery copies from the Word editor's renderer: a never-saved
 * document's copy goes to the main process (app data) instead of a silent
 * first save into the default folder, an unchanged document is not copied
 * again, a restored untitled copy opens dirty and asks where on its first
 * save, and a copy is exactly what a save would write at that moment (the
 * engine's narrow patch over the opened original). Real file actions on a
 * real editor; the main process is a stub that records the calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildBlankDocx, readDocxPartBase64 } from '@genoffice/docx-engine'
import { editorExtensions } from '../src/renderer/editor/extensions'
import type { DocState } from '../src/renderer/doc-state'
import type { OpenDocxResult } from '../src/shared/ipc'

const handoff = new Map<string, Uint8Array>()
vi.mock('../src/renderer/doc-bytes', () => ({
  fetchDocBytes: async (url: string) => {
    const bytes = handoff.get(url)
    if (!bytes) throw new Error(`no bytes for ${url}`)
    handoff.delete(url)
    return bytes.slice()
  },
}))

vi.mock('../src/renderer/components/toast-bus', () => ({
  showToast: () => {},
  setToastEmitter: () => {},
}))

const { forgetRecoveryCopy, loadFile, newFile, save, writeRecoveryCopy } =
  await import('../src/renderer/file-actions')
type Ctx = Parameters<typeof loadFile>[0]

let urlSeq = 0
function hand(bytes: Uint8Array): string {
  const url = `test-bytes://${++urlSeq}`
  handoff.set(url, bytes)
  return url
}

interface Call {
  channel: string
  path: string | null
  bytes?: Uint8Array
  meta?: unknown
}

let calls: Call[] = []
let pickedPath: string | null = null
let desktop: Record<string, ReturnType<typeof vi.fn>>

function installDesktop(): void {
  calls = []
  pickedPath = null
  const record = (channel: string) => async (path: string | null, data: ArrayBuffer) => {
    calls.push({ channel, path, bytes: new Uint8Array(data) })
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
    writeRecoveryCopy: vi.fn(async (path: string | null, data: ArrayBuffer, meta?: unknown) => {
      calls.push({ channel: 'recovery', path, bytes: new Uint8Array(data), meta })
      return { ok: true }
    }),
    pickSaveAsPath: vi.fn(async () => (pickedPath ? { path: pickedPath } : null)),
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
  return new Proxy(state, {
    get(target, key) {
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

function typeParagraph(editor: Editor, text: string): void {
  editor.commands.setContent({
    type: 'doc',
    content: [
      { type: 'docParagraph', attrs: { docxIndex: null }, content: [{ type: 'text', text }] },
    ],
  })
}

/** a docx with a part the editor never models: it must pass through untouched */
async function docxWithExtraPart(): Promise<Uint8Array> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await buildBlankDocx({}))
  zip.file('customXml/item1.xml', '<root><keep attr="1">kept as is</keep></root>')
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
}

function openResult(path: string, bytes: Uint8Array, extra: Partial<OpenDocxResult> = {}) {
  return {
    path,
    name: path.split('/').pop() ?? path,
    dataUrl: hand(bytes),
    hash: 'h',
    ...extra,
  } as OpenDocxResult
}

beforeEach(() => {
  installDesktop()
  // the jsdom test environment has no CSS.escape (document style CSS uses it)
  ;(globalThis as { CSS?: unknown }).CSS ??= { escape: (s: string) => s }
})

afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

describe('a never-saved document', () => {
  it('copies into app data through the main process, never a file in a user folder', async () => {
    const ctx = makeCtx()
    expect(await newFile(ctx)).toBe(true)
    typeParagraph(ctx.editor as Editor, 'A draft nobody saved yet')
    ctx.dirtyRef.current = true
    expect(await writeRecoveryCopy(ctx)).toBe('written')
    expect(calls.map((c) => c.channel)).toEqual(['recovery'])
    expect(calls[0].path).toBeNull()
    expect(calls[0].meta).toEqual({ title: docOf(ctx).fileName, format: 'docx' })
    // nothing was saved: no save-new into the default folder, no dialog
    for (const save of ['saveDocxNew', 'saveDocxAs', 'saveDocx', 'saveDocxTo', 'pickSaveAsPath'])
      expect(desktop[save]).not.toHaveBeenCalled()
    expect(docOf(ctx).filePath).toBeNull()
  })

  it('its first save asks where, offering the first heading as the name; an automatic save writes nothing', async () => {
    const ctx = makeCtx()
    expect(await newFile(ctx)).toBe(true)
    const editor = ctx.editor as Editor
    editor.commands.setContent('<h1>Field trip plan</h1><p>Bring water</p>')
    ctx.dirtyRef.current = true
    // AutoSave or any other automatic pass never picks a place for it
    expect(await save(ctx, false, true)).toBe(false)
    for (const save of ['saveDocxNew', 'saveDocxAs', 'pickSaveAsPath'])
      expect(desktop[save]).not.toHaveBeenCalled()
    // the user's own first save shows the dialog instead of landing in the default folder
    pickedPath = '/docs/field-trip.docx'
    expect(await save(ctx, false)).toBe(true)
    expect(desktop.pickSaveAsPath).toHaveBeenCalledTimes(1)
    expect(desktop.pickSaveAsPath.mock.calls[0][0]).toContain('Field trip plan')
    expect(desktop.saveDocxNew).not.toHaveBeenCalled()
    expect(docOf(ctx).filePath).toBe('/docs/field-trip.docx')
  })

  it('a cancelled first save writes nothing and keeps the document unsaved', async () => {
    const ctx = makeCtx()
    expect(await newFile(ctx)).toBe(true)
    typeParagraph(ctx.editor as Editor, 'Not yet')
    ctx.dirtyRef.current = true
    pickedPath = ''
    expect(await save(ctx, false)).toBe(false)
    for (const save of ['saveDocxNew', 'saveDocxAs', 'saveDocx'])
      expect(desktop[save]).not.toHaveBeenCalled()
    expect(docOf(ctx).filePath).toBeNull()
    expect(ctx.dirtyRef.current).toBe(true)
  })

  it('an untouched blank document is not copied', async () => {
    const ctx = makeCtx()
    await newFile(ctx)
    ctx.dirtyRef.current = true
    expect(await writeRecoveryCopy(ctx)).toBe('skipped')
    expect(calls).toEqual([])
  })
})

describe('copy ticks', () => {
  it('skip an unchanged document, copy again after an edit and after a save', async () => {
    const ctx = makeCtx()
    await loadFile(ctx, openResult('/docs/a.docx', await buildBlankDocx({})))
    typeParagraph(ctx.editor as Editor, 'first')
    ctx.dirtyRef.current = true
    expect(await writeRecoveryCopy(ctx)).toBe('written')
    expect(await writeRecoveryCopy(ctx)).toBe('skipped')
    typeParagraph(ctx.editor as Editor, 'second')
    expect(await writeRecoveryCopy(ctx)).toBe('written')
    // a save drops the copy in the main process: the same content needs a new one
    expect(await save(ctx, false)).toBe(true)
    typeParagraph(ctx.editor as Editor, 'second')
    ctx.dirtyRef.current = true
    expect(await writeRecoveryCopy(ctx)).toBe('written')
    expect(calls.filter((c) => c.channel === 'recovery')).toHaveLength(3)
  })

  it('copy an unchanged document again once the main process dropped its copy', async () => {
    const ctx = makeCtx()
    await loadFile(ctx, openResult('/docs/kept-dirty.docx', await buildBlankDocx({})))
    typeParagraph(ctx.editor as Editor, 'still unsaved')
    ctx.dirtyRef.current = true
    expect(await writeRecoveryCopy(ctx)).toBe('written')
    expect(await writeRecoveryCopy(ctx)).toBe('skipped')
    // "Don't Save" dropped the copy, then the quit was cancelled: still dirty
    forgetRecoveryCopy()
    expect(await writeRecoveryCopy(ctx)).toBe('written')
    expect(calls.filter((c) => c.channel === 'recovery')).toHaveLength(2)
  })

  it('report a failed write so the timer backs off', async () => {
    const ctx = makeCtx()
    await loadFile(ctx, openResult('/docs/b.docx', await buildBlankDocx({})))
    typeParagraph(ctx.editor as Editor, 'edit')
    ctx.dirtyRef.current = true
    desktop.writeRecoveryCopy.mockResolvedValueOnce({ ok: false, failed: true })
    expect(await writeRecoveryCopy(ctx)).toBe('failed')
  })

  it('write the bytes a save would write: untouched parts pass through as opened', async () => {
    const original = await docxWithExtraPart()
    const ctx = makeCtx()
    await loadFile(ctx, openResult('/docs/kept.docx', original))
    typeParagraph(ctx.editor as Editor, 'edited body')
    ctx.dirtyRef.current = true
    expect(await writeRecoveryCopy(ctx)).toBe('written')
    const copy = calls.find((c) => c.channel === 'recovery')!.bytes!
    expect(await save(ctx, false)).toBe(true)
    const saved = calls.find((c) => c.channel === 'save')!.bytes!
    expect(copy).toEqual(saved)
    const part = (zip: Uint8Array) => readDocxPartBase64(zip, 'customXml/item1.xml')
    expect(await part(copy)).toBe(await part(original))
    expect(await part(copy)).not.toBeNull()
  })
})

describe('a restored untitled copy', () => {
  it('opens dirty and without a file; its first save asks where, suggesting the old path', async () => {
    const ctx = makeCtx()
    const outcome = await loadFile(
      ctx,
      openResult('gone.docx', await buildBlankDocx({}), {
        untitledCopy: true,
        recovered: true,
        saveAsDefaultPath: '/usb/reports/gone.docx',
        hash: '',
      }),
    )
    expect(outcome).toBe('ok')
    expect(docOf(ctx).filePath).toBeNull()
    expect(ctx.dirtyRef.current).toBe(true)
    // an automatic save never picks a place for it
    expect(await save(ctx, false, true)).toBe(false)
    expect(desktop.saveDocxNew).not.toHaveBeenCalled()
    pickedPath = '/docs/rescued.docx'
    expect(await save(ctx, false)).toBe(true)
    expect(desktop.pickSaveAsPath).toHaveBeenCalledWith(
      'gone.docx',
      '/usb/reports/gone.docx',
      'docx',
    )
    expect(desktop.saveDocxNew).not.toHaveBeenCalled()
    // the source of the Save As is still "no file": the main process drops the untitled copy
    expect(desktop.saveDocxAs.mock.calls[0][2]).toBeNull()
    expect(docOf(ctx).filePath).toBe('/docs/rescued.docx')
  })
})
