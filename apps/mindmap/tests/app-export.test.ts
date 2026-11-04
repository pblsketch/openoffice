/**
 * Export, print and the preview picture from the whole editor screen, against
 * a fake preload API: what the exports hand the main process, and what a save
 * writes when no preview picture can be made.
 *
 * jsdom lays nothing out, so here a picture or a page of a sheet cannot be
 * made; the real run (`real-run/export-run.ts`) makes them in the built app.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import JSZip from 'jszip'
import type { Lang } from '@genoffice/i18n'
import { openXmind, sheetsToOutline } from '@genoffice/xmind-engine'
import App from '../src/renderer/App'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { setThumbnailProvider, thumbnailForSave } from '../src/renderer/document/thumbnail'
import type {
  ExportFormat,
  MindmapApi,
  OpenFileResult,
  SaveMindmapRequest,
} from '../src/shared/ipc'
import {
  documentOf,
  documentWithEntries,
  IDS,
  plainSheet,
  richSheet,
  TINY_PNG,
} from './helpers/fixtures'
import { mapLoaded, until } from './helpers/wait'

interface Fake {
  api: MindmapApi
  saves: SaveMindmapRequest[]
  /** what the exports and print handed the main process */
  exports: Array<{ kind: string; request: Record<string, unknown> }>
  emitExport(format: ExportFormat): void
  emitPrint(): void
}

function fakeApi(path: string | null, file: OpenFileResult): Fake {
  const handlers: Record<string, ((...args: never[]) => void) | undefined> = {}
  const on =
    (name: string) =>
    (handler: (...args: never[]) => void): (() => void) => {
      handlers[name] = handler
      return () => {
        handlers[name] = undefined
      }
    }
  const exported =
    (kind: string, path: string | null) => async (request: Record<string, unknown>) => {
      fake.exports.push({ kind, request })
      return path ? { ok: true, path } : { ok: true }
    }
  const fake: Fake = {
    saves: [],
    exports: [],
    emitExport: (format) => (handlers.export as ((format: string) => void) | undefined)?.(format),
    emitPrint: () => (handlers.print as (() => void) | undefined)?.(),
    api: {
      consumePending: async () => path,
      openFile: async () => file,
      save: async (request: SaveMindmapRequest) => {
        fake.saves.push(request)
        return { ok: true, path: path ?? 'C:/maps/new.xmind' }
      },
      setDirty: () => {},
      onSaveRequest: on('save'),
      sendSaveRequestAck: () => {},
      onCloseSaveRequest: on('close'),
      sendCloseSaveResult: () => {},
      onFileRenamed: on('renamed'),
      openLink: async () => true,
      onMenuCommand: on('menu'),
      getLanguage: async () => 'en' as Lang,
      onLanguageChanged: on('language'),
      getTheme: async () => 'system' as const,
      onThemeChanged: on('theme'),
      getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
      onAutoSaveDefaultChanged: on('autosave'),
      onChromePressed: on('chrome'),
      onOutlineRequest: on('outline'),
      sendOutlineResult: () => {},
      onBytesRequest: on('bytes'),
      sendBytesResult: () => {},
      onExportRequest: on('export'),
      onPrintRequest: on('print'),
      exportPng: exported('png', 'C:/out/map.png'),
      exportSvg: exported('svg', 'C:/out/map.svg'),
      exportPdf: exported('pdf', 'C:/out/map.pdf'),
      exportMarkdown: exported('markdown', 'C:/out/map.md'),
      print: exported('print', null),
    } as unknown as MindmapApi,
  }
  return fake
}

let container: HTMLElement
let unmount: () => void = () => {}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
})
afterEach(() => {
  unmount()
  unmount = () => {}
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function settle(): Promise<void> {
  for (let turn = 0; turn < 8; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mountWith(
  bytes: Uint8Array,
  path: string | null = 'C:/maps/test.xmind',
): Promise<Fake> {
  const fake = fakeApi(path, { status: 'ok', bytes })
  ;(window as unknown as { mindmapApi: MindmapApi }).mindmapApi = fake.api
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(LocaleProvider, { initial: 'en', children: createElement(App) }))
  })
  unmount = () => act(() => root.unmount())
  await until(() => mapLoaded(container), 'the file to open')
  await settle()
  return fake
}

const click = async (selector: string): Promise<void> => {
  const element = container.ownerDocument.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`nothing matches ${selector}`)
  await act(async () => {
    element.click()
  })
  await settle()
}

async function pressOnMap(key: string): Promise<void> {
  const map = container.querySelector<HTMLElement>('.map-container')!
  await act(async () => {
    map.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
  await settle()
}

async function selectOnMap(id: string): Promise<void> {
  await act(async () => {
    container
      .querySelector<HTMLElement>(`[data-nodeid="me${id}"]`)!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
  })
  await settle()
}

/** Starts typing a new title for a topic and leaves it in the edit box. */
async function typeTitle(id: string, title: string): Promise<void> {
  await selectOnMap(id)
  await pressOnMap('F2')
  container.querySelector<HTMLElement>('#input-box')!.textContent = title
}

const status = (): string => container.querySelector('.mm-save-status')!.textContent ?? ''

describe('the export button', () => {
  it('offers the four exports, and no print; Escape closes it', async () => {
    await mountWith(await (await documentOf(plainSheet())).save())
    await click('[data-action="export"]')
    const items = [...container.querySelectorAll<HTMLElement>('[data-export]')]
    expect(items.map((item) => item.dataset.export)).toEqual(['png', 'svg', 'pdf', 'markdown'])
    expect(items.map((item) => item.textContent)).toEqual([
      'Export as Image (PNG)…',
      'Export as Image (SVG)…',
      'Export as PDF…',
      'Export as Markdown Outline…',
    ])
    expect(container.querySelector('[data-action="print"]')).toBeNull()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('[data-export]')).toBeNull()
  })
})

describe('the Markdown outline', () => {
  it("is exactly the engine's outline of the map as it stands: an unsaved edit in, a folded branch in full, every sheet", async () => {
    const bytes = await (await documentOf(richSheet(), plainSheet('Second'))).save()
    const fake = await mountWith(bytes)
    // the topic under the folded branch is not drawn
    expect(container.querySelector(`[data-nodeid="me${IDS.b1}"]`)).toBeNull()
    await typeTitle(IDS.c, '아직 저장하지 않은 제목')

    await click('[data-action="export"]')
    await click('[data-export="markdown"]')
    expect(fake.exports.map((each) => each.kind)).toEqual(['markdown'])
    const { text, suggestedName } = fake.exports[0]!.request as {
      text: string
      suggestedName: string
    }
    expect(suggestedName).toBe('test')
    expect(status()).toBe('Exported')

    // what the save right after it writes, read back with the engine
    await click('[data-action="save"]')
    await until(() => fake.saves.length > 0, 'the save')
    const saved = await openXmind(fake.saves.at(-1)!.bytes)
    if (saved.status !== 'ok') throw new Error('did not open')
    expect(text).toBe(sheetsToOutline(saved.document.sheets))
    expect(text).toContain('아직 저장하지 않은 제목')
    expect(text).toContain('# Second')
    const folded = saved.document.sheets[0]!.rootTopic.children!.attached!.find(
      (each) => each.id === IDS.b,
    )!
    expect(folded.branch).toBe('folded')
    expect(text).toContain(String(folded.children!.attached![0]!.title))
  })

  it('a new map whose central topic still has its first title is offered as untitled', async () => {
    const fake = await mountWith(new Uint8Array(), null)
    await act(async () => fake.emitExport('markdown'))
    await settle()
    expect((fake.exports[0]!.request as { suggestedName: string }).suggestedName).toBe('Untitled')
  })

  it('the menu asks the same way, and a request waits for the one before it instead of being lost', async () => {
    const fake = await mountWith(await (await documentOf(plainSheet())).save())
    await act(async () => {
      fake.emitExport('markdown')
      fake.emitExport('markdown')
    })
    await settle()
    expect(fake.exports.map((each) => each.kind)).toEqual(['markdown', 'markdown'])
  })
})

describe('a picture or a page that cannot be made', () => {
  it('is not handed over, and the user is told', async () => {
    // jsdom lays nothing out, so no sheet here can be measured
    const fake = await mountWith(await (await documentOf(plainSheet())).save())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => fake.emitExport('png'))
    await settle()
    expect(fake.exports).toEqual([])
    expect(status()).toBe('Could not export')
    await act(async () => fake.emitPrint())
    await settle()
    expect(fake.exports).toEqual([])
    expect(status()).toBe('Could not print')
  })
})

describe('Save As with an export type', () => {
  it('writes that export to the picked path, and the map keeps its file and its unsaved edit', async () => {
    const fake = await mountWith(await (await documentOf(plainSheet())).save())
    await typeTitle(plainSheet().rootTopic.children!.attached![0]!.id, 'Changed')
    // the main process answers Save As with the export type picked in its dialog
    fake.api.save = async (request: SaveMindmapRequest) => {
      fake.saves.push(request)
      return { ok: true, export: { format: 'markdown', path: 'C:/out/copy.md' } }
    }
    await click('[data-action="save-as"]')
    await until(() => fake.exports.length === 1, 'the export')
    expect(fake.saves.map((save) => save.mode)).toEqual(['saveAs'])
    expect(fake.exports[0]!.kind).toBe('markdown')
    expect(fake.exports[0]!.request.path).toBe('C:/out/copy.md')
    await until(() => status() === 'Exported', 'the export message')
    // nothing was saved: the edit is still unsaved, and Save goes to the map's own file
    expect(container.querySelector('.mm-save-status')!.getAttribute('data-dirty')).toBe('true')
    fake.api.save = async (request: SaveMindmapRequest) => {
      fake.saves.push(request)
      return { ok: true, path: 'C:/maps/test.xmind' }
    }
    await click('[data-action="save"]')
    await until(() => fake.saves.length === 2, 'the save')
    expect(fake.saves[1]!.mode).toBe('save')
    expect(fake.exports).toHaveLength(1)
  })

  it('a picture picked in Save As goes to the export of the sheet on screen with that path', async () => {
    const fake = await mountWith(await (await documentOf(plainSheet())).save())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.api.save = async (request: SaveMindmapRequest) => {
      fake.saves.push(request)
      return { ok: true, export: { format: 'svg', path: 'C:/out/copy.svg' } }
    }
    await click('[data-action="save-as"]')
    // jsdom draws no sheet, so the picture cannot be made here; it is the export that failed
    await until(() => status() === 'Could not export', 'the export')
    expect(fake.saves).toHaveLength(1)
    expect(fake.exports).toEqual([])
  })
})

describe('the preview picture of a save', () => {
  it('when none can be made, the changed save completes and the file keeps its old picture', async () => {
    const old = new Uint8Array([...TINY_PNG, 1, 2, 3])
    const document = await documentWithEntries([plainSheet()], {
      'Thumbnails/thumbnail.png': old,
    })
    const fake = await mountWith(await document.save())
    await typeTitle(plainSheet().rootTopic.children!.attached![0]!.id, 'Changed')
    await click('[data-action="save"]')
    await until(() => status() === 'Saved', 'the save')
    expect(fake.saves).toHaveLength(1)
    const zip = await JSZip.loadAsync(fake.saves[0]!.bytes)
    const kept = await zip.file('Thumbnails/thumbnail.png')!.async('uint8array')
    expect([...kept]).toEqual([...old])
    const saved = await openXmind(fake.saves[0]!.bytes)
    if (saved.status !== 'ok') throw new Error('did not open')
    expect(saved.document.sheets[0]!.rootTopic.children!.attached![0]!.title).toBe('Changed')
  })

  it('a provider that fails costs the picture, never the save; the engine then keeps the old picture byte for byte', async () => {
    const old = new Uint8Array([...TINY_PNG, 9, 9])
    const document = await documentWithEntries([plainSheet()], {
      'Thumbnails/thumbnail.png': old,
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setThumbnailProvider(async () => {
      throw new Error('no picture today')
    })
    try {
      const picture = await thumbnailForSave()
      expect(picture).toBeNull()
      document.sheets[0]!.title = 'Changed sheet'
      const bytes = await document.save({ thumbnail: picture })
      const zip = await JSZip.loadAsync(bytes)
      const kept = await zip.file('Thumbnails/thumbnail.png')!.async('uint8array')
      expect([...kept]).toEqual([...old])
    } finally {
      setThumbnailProvider(null)
    }
  })
})
