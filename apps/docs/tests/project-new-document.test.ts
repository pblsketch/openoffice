/**
 * Project folders (spec 6) in the Word editor: a new document a create flow
 * made (the AI's new Word document, a skill template's copy once its run ended
 * well) is saved into its panel's project with no dialog. The renderer sends
 * the bytes, a name and the format; main picks the folder and a free name.
 * Without a project nothing is written and the document stays untitled, as
 * before; a refused write keeps it untitled and says why. Runs the real file
 * actions on a real editor against a stub main process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { docxToOdt } from '@genoffice/odt-engine'
import { buildBlankDocx } from '@genoffice/docx-engine'
import { editorExtensions } from '../src/renderer/editor/extensions'
import type { DocState } from '../src/renderer/doc-state'
import type { OpenDocxResult } from '../src/shared/ipc'
import { zipEntryNames } from '../src/main/doc-format'

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

const { applyAiDocContent, loadFile, newFile, saveIntoProject } =
  await import('../src/renderer/file-actions')
type Ctx = Parameters<typeof loadFile>[0]

let urlSeq = 0
function hand(bytes: Uint8Array): string {
  const url = `test-bytes://${++urlSeq}`
  handoff.set(url, bytes)
  return url
}

type ProjectAnswer =
  { ok: true; path: string } | { ok: false; skipped: true } | { ok: false; error: string }

let answer: ProjectAnswer
let desktop: Record<string, ReturnType<typeof vi.fn>>

function installDesktop(): void {
  answer = { ok: false, skipped: true }
  const ok = async (path: string) => ({ ok: true, path })
  desktop = {
    getRecentFiles: vi.fn(async () => []),
    getSystemLocale: vi.fn(async () => 'en-US'),
    docPasswordIntentRevision: vi.fn(async () => 0),
    discardDocPasswordIntents: vi.fn(async () => ({ ok: true })),
    saveDocx: vi.fn(ok),
    saveDocxTo: vi.fn(ok),
    saveDocxNew: vi.fn(ok),
    saveDocxAs: vi.fn(ok),
    saveDocxIntoProject: vi.fn(async () => answer),
    writeRecoveryCopy: vi.fn(ok),
    pickSaveAsPath: vi.fn(async () => null),
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

function isZip(bytes: Uint8Array): boolean {
  return (zipEntryNames(bytes) ?? []).length > 0
}

beforeEach(() => {
  // the jsdom test environment has no CSS.escape (document style CSS uses it)
  ;(globalThis as { CSS?: unknown }).CSS ??= { escape: (s: string) => s }
  installDesktop()
  toast.mockClear()
})

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
})

async function blankUntitled(): Promise<Ctx> {
  const ctx = makeCtx()
  await newFile(ctx)
  expect(docOf(ctx).filePath).toBeNull()
  return ctx
}

const CONTENT = { title: 'Weekly report', html: '<h1>Weekly report</h1><p>All on track.</p>' }

describe("the AI's new Word document (create_document docx)", () => {
  it('with a project: saved there with no dialog; the tab adopts the file', async () => {
    answer = { ok: true, path: 'D:/Plan/drafts/Weekly report (2).docx' }
    const ctx = await blankUntitled()
    await applyAiDocContent(ctx, CONTENT)
    expect(desktop.saveDocxIntoProject).toHaveBeenCalledTimes(1)
    const [name, format, data] = desktop.saveDocxIntoProject!.mock.calls[0] as [
      string,
      string,
      ArrayBuffer,
    ]
    // the renderer offers a name, its format and the bytes; main picks the folder
    expect(name).toBe('Weekly report.docx')
    expect(format).toBe('docx')
    expect(isZip(new Uint8Array(data))).toBe(true)
    expect(docOf(ctx).filePath).toBe('D:/Plan/drafts/Weekly report (2).docx')
    expect(docOf(ctx).fileName).toBe('Weekly report (2).docx')
    expect(ctx.dirtyRef.current).toBe(false)
    expect(desktop.pickSaveAsPath).not.toHaveBeenCalled()
    expect(desktop.saveDocxNew).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalledWith(expect.anything(), 'error')
  })

  it('without a project: nothing written, the document stays untitled as before', async () => {
    answer = { ok: false, skipped: true }
    const ctx = await blankUntitled()
    await applyAiDocContent(ctx, CONTENT)
    expect(desktop.saveDocxIntoProject).toHaveBeenCalledTimes(1)
    expect(docOf(ctx).filePath).toBeNull()
    // the automatic first save still asks nothing and writes nothing (decision 0061)
    expect(desktop.pickSaveAsPath).not.toHaveBeenCalled()
    expect(desktop.saveDocxNew).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it('a refused write keeps it untitled and says why', async () => {
    answer = { ok: false, error: 'EACCES: permission denied' }
    const ctx = await blankUntitled()
    await applyAiDocContent(ctx, CONTENT)
    expect(docOf(ctx).filePath).toBeNull()
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining('EACCES: permission denied'),
      'error',
    )
    expect(desktop.saveDocxNew).not.toHaveBeenCalled()
  })

  it('an older preload without the channel keeps the behavior of today', async () => {
    delete desktop.saveDocxIntoProject
    const ctx = await blankUntitled()
    await applyAiDocContent(ctx, CONTENT)
    expect(docOf(ctx).filePath).toBeNull()
    expect(toast).not.toHaveBeenCalled()
  })
})

describe("a skill template's copy once its run ended well", () => {
  it('an untitled ODT copy goes into the project as ODT', async () => {
    answer = { ok: true, path: 'D:/Plan/Letter.odt' }
    const odt = (await docxToOdt(await buildBlankDocx({}))).odtBytes
    const ctx = makeCtx()
    const copy: OpenDocxResult = {
      path: 'Letter.odt',
      name: 'Letter.odt',
      dataUrl: hand(odt),
      hash: 'h',
      untitledCopy: true,
    }
    await loadFile(ctx, copy)
    expect(docOf(ctx).filePath).toBeNull()
    expect(await saveIntoProject(ctx, docOf(ctx).fileName)).toBe(true)
    const [name, format] = desktop.saveDocxIntoProject!.mock.calls[0] as [string, string]
    expect(name).toBe('Letter.odt')
    expect(format).toBe('odt')
    expect(docOf(ctx).filePath).toBe('D:/Plan/Letter.odt')
  })

  it('a document that has its file already is left alone', async () => {
    const ctx = makeCtx()
    const saved: OpenDocxResult = {
      path: 'D:/Plan/Kept.docx',
      name: 'Kept.docx',
      dataUrl: hand(await buildBlankDocx({})),
      hash: 'h',
    }
    await loadFile(ctx, saved)
    expect(await saveIntoProject(ctx, 'Kept.docx')).toBe(false)
    expect(desktop.saveDocxIntoProject).not.toHaveBeenCalled()
  })
})
