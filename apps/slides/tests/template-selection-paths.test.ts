// @vitest-environment node
/**
 * The places where the slides main process gives a document another path:
 * first save, Save As, the draft written after AI generation, and a save by an
 * external tool. Each is driven through the real handler, so a hook that goes
 * missing from slides-main.ts fails here. Nothing reaches an AI provider: the
 * generated pages are built from a fixed spec.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: { sender: { id: number } }, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'slides-template-paths-')))
for (const dir of ['userData', 'documents', 'temp', 'elsewhere']) mkdirSync(join(root, dir))

/** where the next Save As dialog "lands" */
let saveDialogPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => join(root, name),
    getName: () => 'slides-test',
    getVersion: () => '0',
    whenReady: () => Promise.resolve(),
  },
  dialog: {
    showSaveDialog: async () => ({ canceled: false, filePath: saveDialogPath }),
  },
  clipboard: { writeBuffer: () => {} },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  BrowserWindow: class {
    static getFocusedWindow(): null {
      return null
    }
  },
  webContents: { getAllWebContents: () => [], fromId: () => null },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  session: {
    defaultSession: { protocol: {}, setDisplayMediaRequestHandler: () => {} },
  },
  nativeImage: {},
  net: {},
  shell: {},
  desktopCapturer: { getSources: async () => [] },
  WebContentsView: class {},
}))
// The shaping chain loads a harfbuzz wasm that cannot resolve in the unit-test env
vi.mock('../src/main/shaped-metrics', () => ({
  shapedMetricsReady: async () => {},
  refineComplexWidths: async () => {},
  complexScriptOf: () => null,
  initShapedMetrics: () => {},
  gtMeasure: (t: string) => ({ width: t.length * 8 }),
  shapedFamily: () => null,
  shapedMeasure: () => ({ width: 0 }),
}))
// no status check: registering the subscription channels would look for the CLIs
vi.mock('@genoffice/ai-provider/subscription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider/subscription')>()),
  ensureSubscriptionIpc: () => ({}),
  sharedSubscriptionStatuses: () => ({}),
}))

import { createBlankPptx, openPptx } from '@genoffice/pptx-engine'
import { registerSlidesIpc, saveSessionDeckTo } from '../src/main/slides-main'
import { sessions, type Session } from '../src/main/session-state'
import {
  TEMPLATE_SELECTION_FILE,
  TemplateSelectionStore,
} from '../src/main/template-selection-store'
import type { TemplateSelection } from '../src/shared/ipc'

const WC = 1
const FIT = 1280
const event = { sender: { id: WC, send: () => {} } }

function call<T>(channel: string, ...args: unknown[]): T {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`handler not registered: ${channel}`)
  return fn(event, ...args) as T
}

const getSelection = (): TemplateSelection | null =>
  call<TemplateSelection | null>('slides:ai-template-selection-get')
const setSelection = (selection: unknown): TemplateSelection | null =>
  call<TemplateSelection | null>('slides:ai-template-selection-set', selection)

/** what the next app start would find for a path */
const onDisk = (path: string): TemplateSelection | null =>
  new TemplateSelectionStore(join(root, 'userData')).get(path)

/** every .pptx under a folder (the default save folder itself may exist, empty) */
const decksUnder = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.pptx'))
    : []

const AURORA = { kind: 'builtin', key: 'aurora', adjustments: ['mostly blue'] }

async function blankSession(path: string): Promise<Session> {
  const bytes = await createBlankPptx()
  if (path) await writeFile(path, bytes)
  const session: Session = {
    path,
    fitWidthPx: FIT,
    undoStack: [],
    redoStack: [],
    opened: await openPptx(bytes),
  }
  sessions.set(WC, session)
  return session
}

/** a one-slide page as the local pipeline hands it over: a marker for a temp file */
async function generatedPage(title: string): Promise<string> {
  const r = await call<Promise<{ ok: boolean; marker?: string; error?: string }>>(
    'slides:local-page-generate',
    {
      specJson: JSON.stringify({
        background: '#0E1A2B',
        elements: [
          {
            type: 'text',
            x: 80,
            y: 60,
            w: 800,
            h: 90,
            paragraphs: [{ runs: [{ text: title, sizePt: 36, bold: true, color: '#FFFFFF' }] }],
          },
        ],
      }),
    },
  )
  if (!r.ok || !r.marker) throw new Error(`page not generated: ${r.error}`)
  return r.marker
}

beforeAll(() => {
  // registerSlidesIpc is guarded by a module-level flag, so it must run exactly once
  registerSlidesIpc()
})

beforeEach(() => {
  sessions.clear()
  rmSync(join(root, 'userData', TEMPLATE_SELECTION_FILE), { force: true })
})

afterAll(() => {
  sessions.clear()
  rmSync(root, { recursive: true, force: true })
})

describe('the template memory follows the document', () => {
  it('first save: asks where, then what the window remembered is written under the new path', async () => {
    const session = await blankSession('')
    const stored = setSelection(AURORA)
    expect(stored?.key).toBe('aurora')
    saveDialogPath = join(root, 'elsewhere', 'first-save.pptx')
    const r = await call<Promise<{ ok: boolean; path?: string }>>('slides:save')
    expect(r.ok).toBe(true)
    expect(session.path).toBe(saveDialogPath)
    expect(existsSync(session.path)).toBe(true)
    expect(getSelection()).toEqual(stored)
    expect(onDisk(session.path)).toEqual(stored)
    // nothing template-related lands beside the saved deck
    expect(readdirSync(dirname(session.path)).filter((f) => !f.endsWith('.pptx'))).toEqual([])
  })

  it('a later plain save leaves the record alone', async () => {
    const path = join(root, 'elsewhere', 'plain.pptx')
    await blankSession(path)
    const stored = setSelection(AURORA)
    expect((await call<Promise<{ ok: boolean }>>('slides:save')).ok).toBe(true)
    expect(onDisk(path)).toEqual(stored)
  })

  it('Save As: the same content under the new path, the original stays', async () => {
    const from = join(root, 'elsewhere', 'original.pptx')
    const session = await blankSession(from)
    const stored = setSelection(AURORA)
    saveDialogPath = join(root, 'elsewhere', 'copy.pptx')
    const r = await call<Promise<{ ok: boolean; path?: string }>>('slides:save-as', 'copy.pptx')
    expect(r).toMatchObject({ ok: true, path: saveDialogPath })
    expect(session.path).toBe(saveDialogPath)
    expect(getSelection()).toEqual(stored)
    expect(onDisk(saveDialogPath)).toEqual(stored)
    expect(onDisk(from)).toEqual(stored)
  })

  it('Save As of a document never saved before writes what the window remembered', async () => {
    await blankSession('')
    const stored = setSelection(AURORA)
    saveDialogPath = join(root, 'elsewhere', 'named.pptx')
    expect((await call<Promise<{ ok: boolean }>>('slides:save-as', 'named.pptx')).ok).toBe(true)
    expect(getSelection()).toEqual(stored)
    expect(onDisk(saveDialogPath)).toEqual(stored)
  })

  it('a save by an external tool to another path behaves like Save As', async () => {
    const from = join(root, 'elsewhere', 'tool-source.pptx')
    const session = await blankSession(from)
    const stored = setSelection(AURORA)
    const to = join(root, 'elsewhere', 'tool', 'target.pptx')
    await saveSessionDeckTo(session, to)
    expect(session.path).toBe(to)
    expect(getSelection()).toEqual(stored)
    expect(onDisk(to)).toEqual(stored)
    expect(onDisk(from)).toEqual(stored)
  })

  it('AI generation that replaces the deck: an unsaved deck keeps the selection, nothing is written', async () => {
    const from = join(root, 'elsewhere', 'my-own-file.pptx')
    const old = await blankSession(from)
    const stored = setSelection(AURORA)
    const markers = [await generatedPage('One'), await generatedPage('Two')]
    const r = await call<Promise<{ path?: string; error?: string }>>(
      'slides:land-generated-pages',
      markers,
      FIT,
      'replace',
      undefined,
      'Quarterly plan',
    )
    expect(r.error).toBeUndefined()
    // the window now holds a new unsaved deck, not the user's file; no draft file was written
    const session = sessions.get(WC)!
    expect(session).not.toBe(old)
    expect(session.path).toBe('')
    expect(r.path).toBe('')
    expect(session.firstSaveName).toBe('Quarterly plan.pptx')
    expect(decksUnder(join(root, 'documents'))).toEqual([])
    expect(getSelection()).toEqual(stored)
    expect(onDisk(from)).toEqual(stored)
    // its first save asks where and carries the selection along
    saveDialogPath = join(root, 'elsewhere', 'quarterly.pptx')
    expect((await call<Promise<{ ok: boolean }>>('slides:save')).ok).toBe(true)
    expect(session.path).toBe(saveDialogPath)
    expect(onDisk(saveDialogPath)).toEqual(stored)
  })

  it('AI generation appended to the user’s own file: the tab stays on that file, unsaved, and keeps the selection', async () => {
    const from = join(root, 'elsewhere', 'append-into.pptx')
    const session = await blankSession(from)
    const stored = setSelection(AURORA)
    const before = readFileSync(from)
    const r = await call<Promise<{ path?: string; error?: string }>>(
      'slides:land-generated-pages',
      [await generatedPage('Appended')],
      FIT,
      'append',
      undefined,
      'Appended deck',
    )
    expect(r.error).toBeUndefined()
    expect(session.path).toBe(from)
    expect(readFileSync(from)).toEqual(before)
    expect(session.metaDirty).toBe(true)
    expect(getSelection()).toEqual(stored)
    expect(onDisk(from)).toEqual(stored)
  })

  it('AI generation in a document never saved: no file appears, the selection reaches its first save', async () => {
    await blankSession('')
    const stored = setSelection(AURORA)
    const r = await call<Promise<{ path?: string; error?: string }>>(
      'slides:land-generated-pages',
      [await generatedPage('Fresh')],
      FIT,
      'replace',
    )
    expect(r.error).toBeUndefined()
    expect(r.path).toBe('')
    expect(decksUnder(join(root, 'documents'))).toEqual([])
    expect(getSelection()).toEqual(stored)
    saveDialogPath = join(root, 'elsewhere', 'fresh.pptx')
    expect((await call<Promise<{ ok: boolean }>>('slides:save')).ok).toBe(true)
    expect(onDisk(saveDialogPath)).toEqual(stored)
  })
})
