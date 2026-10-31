// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDF_CHANNELS } from '../src/shared/ipc'
import type { PdfApi } from '../src/shared/ipc'

const invoke = vi.fn()
const listeners = new Map<string, (event: unknown, ...args: unknown[]) => void>()
const removed: string[] = []
const exposed = new Map<string, unknown>()
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => exposed.set(name, api),
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => invoke(...args),
    send: vi.fn(),
    on: (channel: string, fn: (event: unknown, ...args: unknown[]) => void) =>
      listeners.set(channel, fn),
    removeListener: (channel: string) => removed.push(channel),
  },
}))
vi.mock('@genoffice/electron-utils/drop-open', () => ({ installDropOpenBridge: vi.fn() }))

describe('pdf preload: structure jobs and result store', () => {
  let api: PdfApi

  beforeEach(async () => {
    invoke.mockReset()
    listeners.clear()
    removed.length = 0
    await import('../src/preload/index')
    api = exposed.get('pdfApi') as PdfApi
  })

  it('sends each call to its channel', async () => {
    invoke.mockResolvedValue({ ok: true })
    const source = { jobId: 'j1', path: 'C:\\docs\\a.pdf' }
    await api.structure.tree(source)
    expect(invoke).toHaveBeenLastCalledWith(PDF_CHANNELS.structureTree, source)
    await api.structure.text(source)
    expect(invoke).toHaveBeenLastCalledWith(PDF_CHANNELS.structureText, source)
    const convert = { ...source, format: 'md' as const, outPath: 'C:\\docs\\a.md' }
    await api.structure.convert(convert)
    expect(invoke).toHaveBeenLastCalledWith(PDF_CHANNELS.structureConvert, convert)
    await api.structure.extractImages({ ...source, outDir: 'C:\\out' })
    expect(invoke).toHaveBeenLastCalledWith(PDF_CHANNELS.structureExtractImages, {
      ...source,
      outDir: 'C:\\out',
    })
    await api.structure.writeBack({ ...source, outPath: 'C:\\b.pdf', payload: 1 })
    expect(invoke).toHaveBeenLastCalledWith(PDF_CHANNELS.structureWriteBack, {
      ...source,
      outPath: 'C:\\b.pdf',
      payload: 1,
    })
    await api.store.translation('h', 'en')
    expect(invoke).toHaveBeenLastCalledWith(PDF_CHANNELS.storeTranslation, 'h', 'en')
    await api.store.migrate({ path: source.path, oldDocHash: 'h' })
    expect(invoke).toHaveBeenLastCalledWith(PDF_CHANNELS.storeMigrate, {
      path: source.path,
      oldDocHash: 'h',
    })
    await api.store.deleteDocument('h')
    expect(invoke).toHaveBeenLastCalledWith(PDF_CHANNELS.storeDeleteDocument, 'h')
  })

  it('reads a missing handler (standalone pdf) as a failure, never a throw', async () => {
    invoke.mockRejectedValue(new Error("No handler registered for 'pdf:structure-tree'"))
    await expect(api.structure.tree({ jobId: 'j', path: 'a.pdf' })).resolves.toMatchObject({
      ok: false,
      error: 'not-available',
    })
    await expect(api.store.docHash('a.pdf')).resolves.toMatchObject({
      ok: false,
      error: 'not-available',
    })
    await expect(api.structure.pickTarget({ kind: 'md', path: 'a.pdf' })).resolves.toBeNull()
    await expect(api.structure.cancel('j')).resolves.toBe(false)
  })

  it('forwards progress events and unsubscribes', () => {
    const seen: unknown[] = []
    const off = api.structure.onProgress((p) => seen.push(p))
    listeners.get(PDF_CHANNELS.structureProgress)!({}, { jobId: 'j', done: 1, total: 4 })
    expect(seen).toEqual([{ jobId: 'j', done: 1, total: 4 }])
    off()
    expect(removed).toEqual([PDF_CHANNELS.structureProgress])
  })

  it('accepts a conversion request and only a Markdown preset target', () => {
    const seen: unknown[] = []
    const off = api.onConvertDialogRequest((request) => seen.push(request))
    const listener = listeners.get(PDF_CHANNELS.convertDialogRequest)!
    listener({}, { format: 'md', outPath: 'C:\\docs\\a.md' })
    listener({}, { format: 'md' })
    // dropped: an EPUB target, the old bare-format shape, an unknown format,
    // an empty path and a non-string path
    listener({}, { format: 'epub', outPath: 'C:\\docs\\a.epub' })
    listener({}, 'md')
    listener({}, { format: 'pdf' })
    listener({}, { format: 'md', outPath: '' })
    listener({}, { format: 'md', outPath: 7 })
    expect(seen).toEqual([{ format: 'md', outPath: 'C:\\docs\\a.md' }, { format: 'md' }])
    off()
    expect(removed).toEqual([PDF_CHANNELS.convertDialogRequest])
  })
})
