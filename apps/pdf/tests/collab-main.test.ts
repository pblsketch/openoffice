import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

/**
 * Co-editing in the PDF main process: a guest view never saves, a menu Save
 * reaches its renderer (which says why), and only a guest's own untitled copy
 * takes the file the host saved.
 */

type IpcHandler = (event: { sender: { id: number } }, ...args: unknown[]) => unknown
const handlers = new Map<string, IpcHandler>()

interface FakeWebContents {
  id: number
  listeners: Map<string, () => void>
  once: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  setWindowOpenHandler: ReturnType<typeof vi.fn>
  loadURL: ReturnType<typeof vi.fn>
  isDestroyed: () => boolean
  send: ReturnType<typeof vi.fn>
}

let nextWcId = 1
let lastWebContents: FakeWebContents

function makeFakeWebContents(): FakeWebContents {
  const listeners = new Map<string, () => void>()
  const wc: FakeWebContents = {
    id: nextWcId++,
    listeners,
    once: vi.fn((event: string, handler: () => void) => listeners.set(event, handler)),
    on: vi.fn((event: string, handler: () => void) => listeners.set(event, handler)),
    setWindowOpenHandler: vi.fn(),
    loadURL: vi.fn(),
    isDestroyed: () => false,
    send: vi.fn(),
  }
  lastWebContents = wc
  return wc
}

vi.mock('electron', () => ({
  app: { on: vi.fn(), whenReady: vi.fn(() => new Promise(() => {})), getPath: () => tmpdir() },
  dialog: {},
  shell: {},
  BrowserWindow: class {},
  WebContentsView: class {
    webContents = makeFakeWebContents()
  },
  webContents: { fromId: () => undefined },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)),
    on: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)),
    removeHandler: vi.fn(),
  },
}))

import type { WebContents } from 'electron'
import { PDF_CHANNELS } from '../src/shared/ipc'
import { createPdfView, flushPdfSave, markPdfUntitledCopy } from '../src/main/pdf-main'
import { collabCopyBytesOf } from '../src/main/collab'

const PDF = '%PDF-1.4\n%%EOF\n'

function pdfFile(name = 'copy.pdf', text = PDF): string {
  const path = join(mkdtempSync(join(tmpdir(), 'pdf-collab-')), name)
  writeFileSync(path, text)
  return path
}

function view(path: string): FakeWebContents {
  createPdfView(path)
  return lastWebContents
}

const call = (channel: string, wc: FakeWebContents, ...args: unknown[]) =>
  handlers.get(channel)?.({ sender: { id: wc.id } }, ...args)

const setGuest = (wc: FakeWebContents, guest: boolean) => call(PDF_CHANNELS.collabGuest, wc, guest)

// what IPC hands the main process: plain Uint8Arrays of this realm
const bytes = (text: string) => new Uint8Array(Buffer.from(text))
const saved = bytes('%PDF-1.7\n% saved by the host\n%%EOF\n')

describe('pdf co-editing in the main process', () => {
  it('writes the host’s saved file into a guest’s own untitled copy only', async () => {
    const copy = pdfFile()
    markPdfUntitledCopy(copy)
    const guest = view(copy)

    // not a guest (yet): nothing is written
    expect(await call(PDF_CHANNELS.collabReplaceCopy, guest, copy, saved)).toBe(false)
    setGuest(guest, true)
    expect(await call(PDF_CHANNELS.collabReplaceCopy, guest, copy, new Uint8Array([1, 2]))).toBe(
      false,
    )
    expect(await call(PDF_CHANNELS.collabReplaceCopy, guest, `${copy}.x`, saved)).toBe(false)
    expect(await call(PDF_CHANNELS.collabReplaceCopy, guest, copy, saved)).toBe(true)
    expect(readFileSync(copy, 'utf8')).toContain('saved by the host')

    // a file the person opened is never overwritten this way
    const own = pdfFile('mine.pdf')
    const other = view(own)
    setGuest(other, true)
    expect(await call(PDF_CHANNELS.collabReplaceCopy, other, own, saved)).toBe(false)
    expect(readFileSync(own, 'utf8')).toBe(PDF)
  })

  it('refuses a guest’s save and lets its renderer answer a menu Save', async () => {
    const copy = pdfFile()
    markPdfUntitledCopy(copy)
    const guest = view(copy)
    setGuest(guest, true)
    const result = await call(PDF_CHANNELS.save, guest, {
      path: copy,
      markups: [],
      drawings: [],
      formValues: [],
      stamps: [],
    })
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('guest') })

    // a clean guest still hears about the menu Save: its renderer shows why nothing is saved
    const asked = flushPdfSave(guest as unknown as WebContents)
    expect(guest.send).toHaveBeenCalledWith(PDF_CHANNELS.closeSaveRequest, { flushAll: false })
    call(PDF_CHANNELS.closeSaveResult, guest, false)
    await expect(asked).resolves.toBe(false)

    // after the session the copy is the person's own document again
    setGuest(guest, false)
    guest.send.mockClear()
    await expect(flushPdfSave(guest as unknown as WebContents)).resolves.toBe(true)
    expect(guest.send).not.toHaveBeenCalled()
  })

  it('forgets a guest when its view reloads', async () => {
    const copy = pdfFile()
    markPdfUntitledCopy(copy)
    const guest = view(copy)
    setGuest(guest, true)
    guest.listeners.get('did-start-loading')?.()
    expect(await call(PDF_CHANNELS.collabReplaceCopy, guest, copy, saved)).toBe(false)
  })

  it('takes only PDF bytes', () => {
    expect(collabCopyBytesOf(saved)).toBe(saved)
    expect(collabCopyBytesOf(bytes(`junk\n${PDF}`))).not.toBeNull()
    expect(collabCopyBytesOf(bytes('<html>'))).toBeNull()
    expect(collabCopyBytesOf('%PDF-')).toBeNull()
  })
})
