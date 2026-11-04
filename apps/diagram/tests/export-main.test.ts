// @vitest-environment node
/**
 * Print and PDF in the main process: a closed print dialog is a quiet cancel,
 * a real failure keeps its reason, and no hidden print window outlives its
 * job (printed, failed, or not even loaded).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

interface FakeWindow {
  destroyed: boolean
  loadFails: boolean
  printOutcome: [boolean, string]
  webContents: Record<string, unknown>
  isDestroyed(): boolean
  destroy(): void
  loadURL(url: string): Promise<void>
  show(): void
  focus(): void
}
const windows: FakeWindow[] = []
let nextLoadFails = false
let nextPrint: [boolean, string] = [true, '']

vi.mock('electron', () => {
  class BrowserWindow {
    static fromWebContents = () => null
    static getFocusedWindow = () => null
    destroyed = false
    loadFails = nextLoadFails
    printOutcome = nextPrint
    webContents = {
      setWindowOpenHandler: () => {},
      on: () => {},
      getURL: () => '',
      executeJavaScript: async () => {},
      print: (_options: unknown, done: (success: boolean, reason: string) => void) =>
        done(...this.printOutcome),
      printToPDF: async () => Buffer.from('%PDF-1.4'),
    }
    constructor() {
      windows.push(this as unknown as FakeWindow)
    }
    isDestroyed() {
      return this.destroyed
    }
    destroy() {
      this.destroyed = true
    }
    async loadURL() {
      if (this.loadFails) throw new Error('ERR_FAILED')
    }
    show() {}
    focus() {}
  }
  return {
    BrowserWindow,
    app: { getPath: () => '', on: vi.fn() },
    dialog: { showMessageBox: vi.fn(), showSaveDialog: vi.fn() },
    ipcMain: { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) },
  }
})
vi.mock('@genoffice/electron-utils', () => ({
  configuredDefaultSaveDir: () => '',
  showSaveDialogWithMemory: vi.fn(),
}))
vi.mock('@genoffice/electron-utils/print-window', () => ({ PRINT_READY_SCRIPT: '' }))
vi.mock('@genoffice/electron-utils/atomic-write', () => ({ atomicWriteFile: vi.fn() }))

import { registerDiagramExportIpc, renderPdf } from '../src/main/export-main'
import { DIAGRAM_CHANNELS } from '../src/shared/ipc'

const page = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
  width: 10,
  height: 10,
  pageWidth: 827,
  pageHeight: 1169,
}
const print = () =>
  handlers.get(DIAGRAM_CHANNELS.print)!({ sender: {} }, { pages: [page], title: 'x' })

beforeEach(() => {
  windows.length = 0
  nextLoadFails = false
  nextPrint = [true, '']
  if (!handlers.size) registerDiagramExportIpc({ filePathOf: () => undefined })
})

describe('print', () => {
  it('is a quiet cancel when the person closes the print dialog', async () => {
    nextPrint = [false, 'cancelled']
    expect(await print()).toEqual({ ok: true, canceled: true })
    nextPrint = [false, 'Print job canceled']
    expect(await print()).toEqual({ ok: true, canceled: true })
    expect(windows.every((w) => w.destroyed)).toBe(true)
  })

  it('keeps the reason of a real failure', async () => {
    nextPrint = [false, 'failed']
    expect(await print()).toEqual({ ok: false, error: 'failed' })
    expect(windows.every((w) => w.destroyed)).toBe(true)
  })

  it('leaves no hidden window when the print document does not load', async () => {
    nextLoadFails = true
    expect(await print()).toEqual({ ok: false, error: 'ERR_FAILED' })
    expect(windows).toHaveLength(1)
    expect(windows[0]!.destroyed).toBe(true)
  })
})

describe('PDF', () => {
  it('destroys its hidden window once the PDF is made', async () => {
    const pdf = await renderPdf([page], 'x')
    expect(new TextDecoder().decode(pdf)).toBe('%PDF-1.4')
    expect(windows).toHaveLength(1)
    expect(windows[0]!.destroyed).toBe(true)
  })
})
