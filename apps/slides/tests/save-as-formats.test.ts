/**
 * Save As lists every format the deck can be copied to: PowerPoint first,
 * then PDF and one PNG per slide. A copy pick writes no deck — the session
 * keeps its path, its unsaved changes and its recovery copy — and the PNG
 * name the person typed becomes `deck.png` (one slide) or `deck-01.png`,
 * `deck-02.png`, … beside it, accepted once for the tab that picked it.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  userDataDir: '',
  documentsDir: '',
  handlers: new Map<string, (...args: never[]) => unknown>(),
}))
const handlers = hoisted.handlers

const showSaveDialog = vi.fn(async (..._args: unknown[]) => ({
  canceled: true,
  filePath: undefined as string | undefined,
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'userData'
        ? hoisted.userDataDir
        : name === 'documents'
          ? hoisted.documentsDir
          : tmpdir(),
    getName: () => 'slides-test',
    getVersion: () => '0',
    getAppPath: () => tmpdir(),
    getLocale: () => 'en-US',
    getSystemLocale: () => 'en-US',
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: () => {},
    once: () => {},
  },
  dialog: {
    showMessageBox: async () => ({ response: 0 }),
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
  },
  clipboard: { writeBuffer: () => {} },
  ipcMain: {
    handle: (channel: string, fn: (...args: never[]) => unknown) =>
      hoisted.handlers.set(channel, fn),
    on: (channel: string, fn: (...args: never[]) => unknown) => hoisted.handlers.set(channel, fn),
    removeHandler: () => {},
  },
  BrowserWindow: class {
    static getFocusedWindow(): null {
      return null
    }
    static fromWebContents(): null {
      return null
    }
  },
  webContents: { getAllWebContents: () => [], fromId: () => null },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  session: {
    defaultSession: { protocol: { handle: () => {} }, setDisplayMediaRequestHandler: () => {} },
  },
  nativeImage: {},
  shell: {},
  desktopCapturer: { getSources: async () => [] },
  WebContentsView: class {},
}))

// The shaping chain loads a harfbuzz wasm that cannot resolve in the unit-test env.
vi.mock('../src/main/shaped-metrics', () => ({
  shapedMetricsReady: async () => {},
  refineComplexWidths: async () => false,
  complexScriptOf: () => null,
  initShapedMetrics: () => {},
  gtMeasure: (t: string) => ({ width: t.length * 8 }),
  shapedFamily: () => null,
  shapedMeasure: () => ({ width: 0 }),
}))

import { createBlankPptx } from '@genoffice/pptx-engine'
import { resetAppShuttingDown } from '@genoffice/electron-utils'
import { registerSlidesIpc, runSlidesRecoveryPass, slidesIsDirty } from '../src/main/slides-main'
import { sessions } from '../src/main/session-state'
import {
  resolveSlidesSaveAsPick,
  SaveAsImageTargets,
  slidesSaveAsFilters,
  slidesSaveAsSuggestion,
} from '../src/main/save-as-formats'

const FIT = 1280

class FakeContents {
  destroyed = false
  constructor(readonly id: number) {}
  isDestroyed(): boolean {
    return this.destroyed
  }
  once(): void {}
  on(): void {}
  send(): void {}
}

function call<T>(sender: FakeContents, channel: string, ...args: unknown[]): T {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`handler not registered: ${channel}`)
  return (fn as (...a: unknown[]) => T)({ sender }, ...args)
}

const PNG = Buffer.from('png-bytes').toString('base64')

let dir: string
let blankBytes: Uint8Array

beforeAll(async () => {
  registerSlidesIpc()
  blankBytes = await createBlankPptx()
})

beforeEach(() => {
  sessions.clear()
  dir = mkdtempSync(join(tmpdir(), 'genoffice-slides-save-as-'))
  hoisted.userDataDir = mkdtempSync(join(tmpdir(), 'genoffice-slides-save-as-user-'))
  hoisted.documentsDir = mkdtempSync(join(tmpdir(), 'genoffice-slides-save-as-docs-'))
  showSaveDialog.mockReset()
  showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
})

afterEach(() => {
  resetAppShuttingDown()
  rmSync(dir, { recursive: true, force: true })
  rmSync(hoisted.userDataDir, { recursive: true, force: true })
  rmSync(hoisted.documentsDir, { recursive: true, force: true })
})

/** an opened deck file with an unsaved change (one added slide) */
async function openEditedDeck(tab: FakeContents): Promise<string> {
  const path = join(dir, 'deck.pptx')
  writeFileSync(path, blankBytes)
  await call<Promise<unknown>>(tab, 'slides:open-path', path, FIT)
  call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
  expect(slidesIsDirty(tab.id)).toBe(true)
  return path
}

function pickInDialog(filePath: string): void {
  showSaveDialog.mockResolvedValue({ canceled: false, filePath })
}

function lastDialogOptions(): {
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
} {
  return showSaveDialog.mock.calls.at(-1)?.at(-1) as ReturnType<typeof lastDialogOptions>
}

describe('Save As format list', () => {
  it('offers PowerPoint first, then PDF and PNG images', () => {
    expect(slidesSaveAsFilters((key) => `<${key}>`)).toEqual([
      { name: 'PowerPoint', extensions: ['pptx'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: '<filterPngSlides>', extensions: ['png'] },
    ])
  })

  it('suggests the name without .pptx', () => {
    expect(slidesSaveAsSuggestion('/d/deck.pptx')).toBe('/d/deck')
    expect(slidesSaveAsSuggestion('/d/deck.PPTX')).toBe('/d/deck')
    expect(slidesSaveAsSuggestion('presentation.pptx')).toBe('presentation')
  })

  it('reads the pick from the extension; a bare name is the deck', () => {
    expect(resolveSlidesSaveAsPick('/d/a.pdf')).toEqual({ kind: 'pdf', path: '/d/a.pdf' })
    expect(resolveSlidesSaveAsPick('/d/a.PNG')).toEqual({ kind: 'png', path: '/d/a.PNG' })
    expect(resolveSlidesSaveAsPick('/d/a.pptx')).toEqual({ kind: 'pptx', path: '/d/a.pptx' })
    expect(resolveSlidesSaveAsPick('/d/a')).toEqual({ kind: 'pptx', path: '/d/a.pptx' })
    expect(resolveSlidesSaveAsPick('C:\\v1.2\\a')).toEqual({
      kind: 'pptx',
      path: 'C:\\v1.2\\a.pptx',
    })
  })

  it('numbers image targets per slide, once, for the tab that picked them', () => {
    const targets = new SaveAsImageTargets()
    targets.authorize(1, '/d/deck.png')
    expect(targets.take(2, '/d/deck.png', 3)).toBeNull()
    expect(targets.take(1, '/d/deck.png', 3)).toEqual([
      '/d/deck-01.png',
      '/d/deck-02.png',
      '/d/deck-03.png',
    ])
    expect(targets.take(1, '/d/deck.png', 3)).toBeNull()
    targets.authorize(1, '/d/one.png')
    expect(targets.take(1, '/d/one.png', 1)).toEqual(['/d/one.png'])
  })
})

describe('Save As in the deck tab', () => {
  it('shows every format with an extension-free suggestion', async () => {
    const tab = new FakeContents(301)
    await openEditedDeck(tab)

    await call<Promise<unknown>>(tab, 'slides:save-as', 'deck.pptx')

    expect(lastDialogOptions().defaultPath).toBe(join(dir, 'deck'))
    expect(lastDialogOptions().filters?.map((filter) => filter.extensions)).toEqual([
      ['pptx'],
      ['pdf'],
      ['png'],
    ])
  })

  it('a PDF pick writes no deck and leaves the session as it was', async () => {
    const tab = new FakeContents(302)
    const path = await openEditedDeck(tab)
    const target = join(dir, 'deck.pdf')
    pickInDialog(target)

    const r = await call<Promise<{ ok: boolean; exportAs?: string; path?: string }>>(
      tab,
      'slides:save-as',
      'deck.pptx',
    )

    expect(r).toEqual({ ok: false, exportAs: 'pdf', path: target })
    expect(sessions.get(tab.id)?.path).toBe(path)
    expect(slidesIsDirty(tab.id)).toBe(true)
    expect(readFileSync(path)).toEqual(Buffer.from(blankBytes))
    expect(existsSync(target)).toBe(false)
    // the recovery copy still belongs to the opened file
    await runSlidesRecoveryPass()
    const copy = join(
      hoisted.userDataDir,
      'slides-autosave',
      `${createHash('sha1').update(path).digest('hex').slice(0, 16)}.pptx`,
    )
    expect(existsSync(copy)).toBe(true)
  })

  it('a PNG pick writes one numbered image per slide beside the typed name', async () => {
    const tab = new FakeContents(303)
    const path = await openEditedDeck(tab)
    const target = join(dir, 'deck.png')
    pickInDialog(target)

    const r = await call<Promise<{ ok: boolean; exportAs?: string; path?: string }>>(
      tab,
      'slides:save-as',
      'deck.pptx',
    )
    expect(r).toEqual({ ok: false, exportAs: 'png', path: target })
    expect(sessions.get(tab.id)?.path).toBe(path)
    expect(slidesIsDirty(tab.id)).toBe(true)

    // another tab cannot write there
    const other = new FakeContents(304)
    expect(
      await call<Promise<{ ok: boolean }>>(other, 'slides:export-images', {
        dir: '',
        baseName: '',
        format: 'png',
        pngsBase64: [PNG, PNG],
        saveAsTarget: target,
      }),
    ).toMatchObject({ ok: false })

    const written = await call<Promise<{ ok: boolean; paths?: string[] }>>(
      tab,
      'slides:export-images',
      { dir, baseName: 'deck', format: 'png', pngsBase64: [PNG, PNG], saveAsTarget: target },
    )
    expect(written).toEqual({
      ok: true,
      paths: [join(dir, 'deck-01.png'), join(dir, 'deck-02.png')],
    })
    expect(readFileSync(join(dir, 'deck-02.png'), 'utf8')).toBe('png-bytes')
    expect(existsSync(target)).toBe(false)

    // the name is accepted once
    expect(
      await call<Promise<{ ok: boolean }>>(tab, 'slides:export-images', {
        dir,
        baseName: 'deck',
        format: 'png',
        pngsBase64: [PNG, PNG],
        saveAsTarget: target,
      }),
    ).toMatchObject({ ok: false })
    expect(readdirSync(dir).sort()).toEqual(['deck-01.png', 'deck-02.png', 'deck.pptx'])
  })

  it('a one-slide deck gets exactly the typed name', async () => {
    const tab = new FakeContents(305)
    await openEditedDeck(tab)
    const target = join(dir, 'single.png')
    pickInDialog(target)
    await call<Promise<unknown>>(tab, 'slides:save-as', 'deck.pptx')

    const written = await call<Promise<{ ok: boolean; paths?: string[] }>>(
      tab,
      'slides:export-images',
      { dir, baseName: 'deck', format: 'png', pngsBase64: [PNG], saveAsTarget: target },
    )

    expect(written).toEqual({ ok: true, paths: [target] })
  })

  it('the PowerPoint pick still saves and moves the deck to the new file', async () => {
    const tab = new FakeContents(306)
    const path = await openEditedDeck(tab)
    // a bare name (some Linux dialogs) becomes a .pptx
    pickInDialog(join(dir, 'Copy'))

    const r = await call<Promise<{ ok: boolean; path?: string }>>(
      tab,
      'slides:save-as',
      'deck.pptx',
    )

    expect(r.ok).toBe(true)
    expect(r.path).toBe(join(dir, 'Copy.pptx'))
    expect(sessions.get(tab.id)?.path).toBe(join(dir, 'Copy.pptx'))
    expect(existsSync(join(dir, 'Copy.pptx'))).toBe(true)
    expect(slidesIsDirty(tab.id)).toBe(false)
    expect(readFileSync(path)).toEqual(Buffer.from(blankBytes))
  })
})
