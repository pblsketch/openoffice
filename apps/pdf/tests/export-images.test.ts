import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: { sender: { id: number } }, request: unknown) => unknown
const handlers = new Map<string, IpcHandler>()
const state = vi.hoisted(() => ({
  senderId: 1,
  showOpenDialog: vi.fn(),
  showItemInFolder: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: vi.fn(() => new Promise(() => {})),
    getPath: vi.fn(() => process.cwd()),
  },
  dialog: { showOpenDialog: state.showOpenDialog },
  shell: { showItemInFolder: state.showItemInFolder },
  BrowserWindow: class {
    static fromWebContents = vi.fn(() => null)
    static getFocusedWindow = vi.fn(() => null)
  },
  WebContentsView: class {
    webContents = {
      id: state.senderId,
      once: vi.fn(),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      loadURL: vi.fn(),
      loadFile: vi.fn(),
    }
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler)
    }),
    on: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  },
}))

import type { WebContents } from 'electron'
import { buildExportImagePaths, buildSaveAsImagePaths } from '../src/main/export-images'
import { createPdfView, requestPdfPageImages } from '../src/main/pdf-main'
import { PDF_CHANNELS } from '../src/shared/ipc'
import type { ExportImagesResult } from '../src/shared/ipc'

let dir = ''

function invoke(request: unknown): Promise<ExportImagesResult> {
  return handlers.get(PDF_CHANNELS.exportImages)!(
    { sender: { id: state.senderId } },
    request,
  ) as Promise<ExportImagesResult>
}

beforeAll(() => {
  createPdfView()
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pdf-export-images-'))
  state.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [dir] })
  state.showItemInFolder.mockReset()
  state.showOpenDialog.mockClear()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('PDF image export paths', () => {
  it('rejects traversal page numbers before opening a destination dialog', async () => {
    const result = await invoke({
      images: ['YQ=='],
      pageNumbers: ['../../../../clobbered'],
      baseName: 'page',
    })

    expect(result).toEqual({ ok: false, error: 'pdf: invalid page numbers' })
    expect(state.showOpenDialog).not.toHaveBeenCalled()
  })

  it('writes valid sparse page numbers as direct children and reveals the first', async () => {
    const result = await invoke({
      images: ['YQ==', 'Yg=='],
      pageNumbers: [2, 7],
      baseName: 'page',
    })

    expect(result).toEqual({ ok: true, savedDir: dir, count: 2 })
    expect(readdirSync(dir).sort()).toEqual(['page-p2.png', 'page-p7.png'])
    expect(readFileSync(join(dir, 'page-p2.png'), 'utf8')).toBe('a')
    expect(state.showItemInFolder).toHaveBeenCalledWith(join(resolve(dir), 'page-p2.png'))
  })

  it('rejects a malformed trailing page number before writing any image', async () => {
    const result = await invoke({
      images: ['YQ==', 'Yg=='],
      pageNumbers: [1, '../escape'],
      baseName: 'page',
    })

    expect(result).toEqual({ ok: false, error: 'pdf: invalid page numbers' })
    expect(readdirSync(dir)).toEqual([])
    expect(state.showOpenDialog).not.toHaveBeenCalled()
  })

  it('rejects unsafe page values in the path builder', () => {
    expect(() => buildExportImagePaths(resolve(dir), 'page', ['../escape'], 'png')).toThrow(
      /invalid page numbers/,
    )
  })

  it('writes jpg files when the request asks for jpg', async () => {
    const result = await invoke({
      images: ['YQ=='],
      pageNumbers: [3],
      baseName: 'page',
      format: 'jpg',
    })

    expect(result).toEqual({ ok: true, savedDir: dir, count: 1 })
    expect(readdirSync(dir)).toEqual(['page-p3.jpg'])
    expect(readFileSync(join(dir, 'page-p3.jpg'), 'utf8')).toBe('a')
    expect(state.showItemInFolder).toHaveBeenCalledWith(join(resolve(dir), 'page-p3.jpg'))
  })

  it('builds jpg paths in the path builder', () => {
    expect(buildExportImagePaths(resolve(dir), 'page', [3], 'jpg')).toEqual([
      join(resolve(dir), 'page-p3.jpg'),
    ])
  })

  it('treats any format other than jpg as png', async () => {
    const result = await invoke({
      images: ['Yg=='],
      pageNumbers: [1],
      baseName: 'page',
      format: 'gif',
    })

    expect(result).toEqual({ ok: true, savedDir: dir, count: 1 })
    expect(readdirSync(dir)).toEqual(['page-p1.png'])
  })

  it('rejects duplicate page numbers regardless of format', async () => {
    const result = await invoke({
      images: ['YQ==', 'Yg=='],
      pageNumbers: [3, 3],
      baseName: 'page',
      format: 'jpg',
    })

    expect(result).toEqual({ ok: false, error: 'pdf: invalid page numbers' })
    expect(state.showOpenDialog).not.toHaveBeenCalled()
  })
})

describe('Save As › PNG page images', () => {
  const send = vi.fn()
  const view = (id = state.senderId) =>
    ({ id, isDestroyed: () => false, send }) as unknown as WebContents

  beforeEach(() => send.mockClear())

  it('asks the view to draw its pages for a picked .png name only', () => {
    expect(requestPdfPageImages(view(), join(dir, 'scan.png'))).toBe(true)
    expect(send).toHaveBeenCalledWith(PDF_CHANNELS.exportImagesRequest)
    send.mockClear()
    expect(requestPdfPageImages(view(), join(dir, 'scan.pdf'))).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('writes numbered pages beside the picked name without a folder dialog', async () => {
    requestPdfPageImages(view(), join(dir, 'scan.png'))
    const result = await invoke({
      images: ['YQ==', 'Yg==', 'Yw=='],
      pageNumbers: [1, 2, 3],
      baseName: 'ignored',
      format: 'png',
      saveAs: true,
    })

    expect(result).toEqual({ ok: true, savedDir: dir, count: 3 })
    expect(readdirSync(dir).sort()).toEqual(['scan-01.png', 'scan-02.png', 'scan-03.png'])
    expect(readFileSync(join(dir, 'scan-03.png'), 'utf8')).toBe('c')
    expect(state.showOpenDialog).not.toHaveBeenCalled()
    expect(state.showItemInFolder).toHaveBeenCalledWith(join(dir, 'scan-01.png'))
  })

  it('keeps the typed name for a one-page document', async () => {
    requestPdfPageImages(view(), join(dir, 'scan.png'))
    const result = await invoke({
      images: ['YQ=='],
      pageNumbers: [1],
      baseName: 'ignored',
      format: 'png',
      saveAs: true,
    })

    expect(result).toEqual({ ok: true, savedDir: dir, count: 1 })
    expect(readdirSync(dir)).toEqual(['scan.png'])
  })

  it('uses a picked name once and refuses a Save As export nobody picked', async () => {
    requestPdfPageImages(view(), join(dir, 'scan.png'))
    const request = {
      images: ['YQ=='],
      pageNumbers: [1],
      baseName: 'p',
      format: 'png',
      saveAs: true,
    }
    expect(await invoke(request)).toMatchObject({ ok: true })
    expect(await invoke(request)).toEqual({
      ok: false,
      error: 'pdf: target not picked for this view',
    })
    // another view's pick is not this view's
    requestPdfPageImages(view(state.senderId + 1), join(dir, 'other.png'))
    expect(await invoke(request)).toMatchObject({ ok: false })
    expect(readdirSync(dir)).toEqual(['scan.png'])
    expect(state.showOpenDialog).not.toHaveBeenCalled()
  })

  it('refuses JPEG pages for a .png name', async () => {
    requestPdfPageImages(view(), join(dir, 'scan.png'))
    const result = await invoke({
      images: ['YQ=='],
      pageNumbers: [1],
      baseName: 'p',
      format: 'jpg',
      saveAs: true,
    })
    expect(result).toMatchObject({ ok: false })
    expect(readdirSync(dir)).toEqual([])
  })

  it('accepts only an absolute .png name in the path builder', () => {
    expect(buildSaveAsImagePaths('scan.png', 2)).toBeNull()
    expect(buildSaveAsImagePaths(join(dir, 'scan.jpg'), 2)).toBeNull()
    expect(buildSaveAsImagePaths(join(dir, 'scan.png'), 2)).toEqual([
      join(dir, 'scan-01.png'),
      join(dir, 'scan-02.png'),
    ])
  })
})
