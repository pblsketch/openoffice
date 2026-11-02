/**
 * The AI panel inside the whole editor, against a scripted main process: the
 * model's answers are written out here as stream chunks, so no provider is
 * ever reached. The settings resolve to a subscription provider (Claude is
 * `ready`), which is exactly why the stream channel below is a fake: nothing
 * in these tests can start a `claude` or `codex` program.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  defaultAiSettings,
  type AiSettings,
  type AiStreamChunk,
  type AiStreamRequest,
  type AiSubscriptionState,
} from '@genoffice/ai-provider'
import type { SubscriptionStatusMap } from '@genoffice/ai-provider/browser'
import { PRODUCT_NAME, UPSTREAM_PRODUCT_NAME, type Lang } from '@genoffice/i18n'
import App from '../src/renderer/App'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { AiPanel, type MindmapAiRequest, type MindmapAiRunStart } from '../src/renderer/ai/AiPanel'
import type { MapAiHost } from '../src/renderer/ai/map-tools'
import { newMap } from '../src/renderer/document/open'
import type { AttachmentMeta, MindmapApi } from '../src/shared/ipc'
import { documentOf, plainSheet } from './helpers/fixtures'
import { mapLoaded, until } from './helpers/wait'

const statusMap = (
  claude: AiSubscriptionState,
  codex: AiSubscriptionState,
): SubscriptionStatusMap => ({
  'claude-code': { provider: 'claude-code', state: claude, meteredAccepted: false },
  codex: { provider: 'codex', state: codex, meteredAccepted: false },
})

const ready = (patch: Partial<AiSettings> = {}): AiSettings => ({
  ...defaultAiSettings(),
  subscriptionNoticeSeen: true,
  ...patch,
})

type Reply = (request: AiStreamRequest, nth: number) => Array<Partial<AiStreamChunk>>

interface FakeOptions {
  pending: string | null
  bytes?: Uint8Array
  statuses: SubscriptionStatusMap
  reply?: Reply
}

function fakeApi(options: FakeOptions) {
  const handlers: Record<string, ((...args: never[]) => void) | undefined> = {}
  const on =
    (name: string) =>
    (handler: (...args: never[]) => void): (() => void) => {
      handlers[name] = handler
      return () => {
        handlers[name] = undefined
      }
    }
  let streamListener: ((chunk: AiStreamChunk) => void) | null = null
  const requests: AiStreamRequest[] = []
  const titles: string[] = []
  const added: string[][] = []
  const attachment = (path: string): AttachmentMeta => ({
    path,
    name: path.split('/').pop()!,
    ext: path.split('.').pop()!,
    sizeBytes: 10,
  })
  const api = {
    consumePending: async () => options.pending,
    openFile: async () =>
      options.bytes ? { status: 'ok', bytes: options.bytes } : { status: 'unreadable' },
    save: async () => ({ ok: true, path: 'C:/maps/new.xmind' }),
    setDirty: () => {},
    onSaveRequest: on('save'),
    sendSaveRequestAck: () => {},
    onCloseSaveRequest: on('close'),
    sendCloseSaveResult: () => {},
    onFileRenamed: on('renamed'),
    openLink: async () => true,
    onMenuCommand: on('menu'),
    onExportRequest: on('export'),
    onPrintRequest: on('print'),
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
    // ---- the AI bridge ----
    getAiSettings: async () => ready(),
    setAiSettings: async () => {},
    onAiSettingsChanged: () => () => {},
    openAiModelSettings: async () => {},
    getAiPanelPrefs: async () => ({}),
    onAiPanelPrefsChanged: () => () => {},
    setProvisionalTitle: (title: string) => void titles.push(title),
    addAttachmentPaths: async (paths: string[]) => {
      added.push(paths)
      return { accepted: paths.map(attachment), rejected: [] }
    },
    readAttachmentImage: async () => ({ ok: false }),
    subscription: {
      statuses: vi.fn(async () => options.statuses),
      recheck: vi.fn(async () => options.statuses),
      login: vi.fn(async () => ({ ok: true })),
      install: vi.fn(async () => ({ ok: true })),
      setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses: options.statuses })),
      onChanged: () => () => {},
      openInstallHelp: vi.fn(async () => undefined),
    },
    onAiStream: (listener: (chunk: AiStreamChunk) => void) => {
      streamListener = listener
      return () => {
        streamListener = null
      }
    },
    // the one way a run reaches a model: scripted here, no program is started
    aiStream: async (request: AiStreamRequest) => {
      requests.push(request)
      const chunks = options.reply?.(request, requests.length) ?? [
        { type: 'delta', text: 'ok' },
        { type: 'done' },
      ]
      for (const chunk of chunks) {
        streamListener?.({ requestId: request.requestId, ...chunk } as AiStreamChunk)
      }
    },
    aiStreamCancel: async () => {},
  }
  return { api: api as unknown as MindmapApi, requests, titles, added }
}

const toolCall = (name: string, input: Record<string, unknown>, id = 'call-1') => [
  { type: 'tool-call', toolCall: { id, name, input } },
  { type: 'done' },
]

let container: HTMLElement
let unmount: () => void = () => {}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  Element.prototype.scrollTo = () => undefined
})
afterEach(() => {
  unmount()
  unmount = () => {}
  document.body.innerHTML = ''
  delete (window as { mindmapApi?: unknown }).mindmapApi
  vi.unstubAllGlobals()
})

async function settle(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mountApp(fake: ReturnType<typeof fakeApi>): Promise<void> {
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
}

const composer = () => container.querySelector<HTMLTextAreaElement>('.ai-input-box textarea')!

async function sendMessage(text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(composer(), text)
    composer().dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => container.querySelector<HTMLButtonElement>('.ai-send-btn')!.click())
  await settle(16)
}

/** the titles of the topics drawn on the sheet on screen, in the order of the page (sides first) */
const drawnTitles = (): string[] =>
  [...container.querySelectorAll<HTMLElement>('.mm-sheet-host:not([hidden]) me-tpc')].map(
    (topic) => topic.querySelector('.text')?.textContent ?? topic.textContent ?? '',
  )

describe('the AI button and panel', () => {
  it('sits at the far end of the toolbar and opens the panel at the right of the map', async () => {
    const bytes = await (await documentOf(plainSheet())).save()
    await mountApp(
      fakeApi({ pending: 'C:/maps/a.xmind', bytes, statuses: statusMap('ready', 'ready') }),
    )
    const button = container.querySelector<HTMLButtonElement>('.mm-tools-end [data-action="ai"]')
    expect(button).not.toBeNull()
    expect(button!.textContent).toContain('AI')
    const stage = container.querySelector('.mm-stage')!
    // the dock is the last thing in the stage: the right end
    expect(stage.lastElementChild?.classList.contains('ai-dock')).toBe(true)
    // the theme panel and the AI panel take turns on that side
    act(() => container.querySelector<HTMLButtonElement>('[data-action="theme"]')!.click())
    expect(container.querySelector('.ai-dock')!.classList.contains('collapsed')).toBe(true)
    act(() => button!.click())
    expect(container.querySelector('.ai-dock')!.classList.contains('collapsed')).toBe(false)
    expect(container.querySelector('.mm-theme-panel')).toBeNull()
  })
})

describe('a run', () => {
  it('sends the map tools with a prompt that names this product', async () => {
    const bytes = await (await documentOf(plainSheet())).save()
    const fake = fakeApi({
      pending: 'C:/maps/a.xmind',
      bytes,
      statuses: statusMap('ready', 'ready'),
    })
    await mountApp(fake)
    await sendMessage('what is on the map?')
    expect(fake.requests).toHaveLength(1)
    const request = fake.requests[0]! as AiStreamRequest & {
      system: string
      tools: Array<{ name: string }>
    }
    expect(request.tools.map((tool) => tool.name).sort()).toEqual(
      [
        'edit_map',
        'image_search',
        'insert_image',
        'read_attachment',
        'read_map',
        'read_topic',
        'read_url',
        'web_search',
        'write_map',
      ].sort(),
    )
    expect(request.system).toContain(`${PRODUCT_NAME} Mind Map`)
    expect(request.system).not.toContain(UPSTREAM_PRODUCT_NAME)
    // the map reaches the model as data, marked as such
    expect(request.system).toMatch(/never instructions/)

    // the line format and relationships: the edits, their values, and what stays the user's
    const editTool = request.tools.find((tool) => tool.name === 'edit_map') as unknown as {
      description: string
      inputSchema: { properties: { edits: { items: { properties: Record<string, unknown> } } } }
    }
    const fields = editTool.inputSchema.properties.edits.items.properties
    expect((fields.op as { enum: string[] }).enum).toEqual(
      expect.arrayContaining([
        'set_line',
        'set_relationship_style',
        'set_summary_style',
        'set_boundary_style',
        'add_relationship',
        'delete_relationship',
      ]),
    )
    for (const field of ['shape', 'begin', 'end', 'width', 'pattern', 'fill', 'fromId', 'toId']) {
      expect(fields).toHaveProperty(field)
    }
    expect(editTool.description).toContain('curve|straight|elbow|roundedElbow|arrowedCurve|none')
    expect(editTool.description).toContain('curved|straight|angled|zigzag')
    expect(editTool.description).toContain(
      'none|normal|spearhead|triangle|dot|square|diamond|herringbone',
    )
    expect(editTool.description).toContain('curly|angle|square|round|bracket|sharp|fold|straight')
    expect(editTool.description).toContain(
      'rect|roundedRect|scallops|waves|tension|polygon|roundedPolygon',
    )
    expect(editTool.description).toContain('solid|dash|dot|dash-dot|dash-dot-dot|round-dot')
    expect(editTool.description).not.toMatch(/org\.xmind/)
    expect(request.system).toMatch(/set_line/)
    expect(request.system).toMatch(/cannot make or delete boundaries/)
    expect(request.system).not.toMatch(
      /the editor does not show \(floating topics, callouts, boundaries/,
    )
  })

  it('applies an edit batch from the model as one step: Ctrl+Z takes it back', async () => {
    const sheet = plainSheet()
    const bytes = await (await documentOf(sheet)).save()
    const rootId = sheet.rootTopic.id
    const fake = fakeApi({
      pending: 'C:/maps/a.xmind',
      bytes,
      statuses: statusMap('ready', 'ready'),
      reply: (_request, nth) =>
        nth === 1
          ? toolCall('edit_map', {
              edits: [
                { op: 'add', parentId: rootId, title: 'From the AI', ref: 'n' },
                { op: 'add', parentId: 'n', title: 'Below it' },
                { op: 'set_title', id: 'no-such-topic', title: 'x' },
              ],
            })
          : [
              {
                type: 'delta',
                text: 'Added two topics; one edit named a topic that is not there.',
              },
              { type: 'done' },
            ],
    })
    await mountApp(fake)
    await sendMessage('add a branch')
    expect(fake.requests).toHaveLength(2)
    const toolResult = JSON.stringify(fake.requests[1]!.messages)
    expect(toolResult).toContain('2 of 3 edit(s) applied')
    expect(toolResult).toContain('FAILED')
    expect(drawnTitles()).toEqual(expect.arrayContaining(['From the AI', 'Below it']))
    // the turn's undo point is listed
    expect(container.querySelector('[data-action="ai-turn-undo"]')).not.toBeNull()

    await act(async () => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
      )
    })
    await settle()
    expect(drawnTitles()).not.toContain('From the AI')
    expect(drawnTitles().sort()).toEqual(['Center', 'One', 'Two'].sort())
  })

  it('a turn that wrote a sheet is taken back with that sheet', async () => {
    const bytes = await (await documentOf(plainSheet())).save()
    const fake = fakeApi({
      pending: 'C:/maps/a.xmind',
      bytes,
      statuses: statusMap('ready', 'ready'),
      reply: (_request, nth) =>
        nth === 1
          ? toolCall('write_map', { outline: '# Ideas\n\n- Ideas\n  - First\n  - Second\n' })
          : [{ type: 'delta', text: 'Wrote a new sheet.' }, { type: 'done' }],
    })
    await mountApp(fake)
    await sendMessage('make a map of ideas')
    expect(container.querySelectorAll('.mm-sheet-host')).toHaveLength(2)
    expect(drawnTitles().sort()).toEqual(['Ideas', 'First', 'Second'].sort())

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="ai-turn-undo"]')!.click()
    })
    await settle()
    expect(container.querySelectorAll('.mm-sheet-host')).toHaveLength(1)
    expect(drawnTitles().sort()).toEqual(['Center', 'One', 'Two'].sort())
    expect(container.querySelector('[data-action="ai-turn-undo"]')).toBeNull()
  })

  it('fills a new untitled map and names its tab from the request', async () => {
    const fake = fakeApi({
      pending: null,
      statuses: statusMap('ready', 'ready'),
      reply: (_request, nth) =>
        nth === 1
          ? toolCall('write_map', { outline: '# Trip\n\n- Trip\n  - Where\n' })
          : [{ type: 'delta', text: 'Done.' }, { type: 'done' }],
    })
    await mountApp(fake)
    await sendMessage('A map for our summer trip\nwith details')
    expect(fake.titles).toEqual(['A map for our summer trip'])
    expect(container.querySelectorAll('.mm-sheet-host')).toHaveLength(1)
    expect(drawnTitles().sort()).toEqual(['Trip', 'Where'].sort())
  })
})

describe('a run asked for from outside the panel', () => {
  async function mountPanel(
    fake: ReturnType<typeof fakeApi>,
    request: MindmapAiRequest,
    starts: MindmapAiRunStart[],
  ): Promise<void> {
    ;(window as unknown as { mindmapApi: MindmapApi }).mindmapApi = fake.api
    const session = await newMap({ sheetTitle: 'Sheet 1', rootTitle: 'Central Topic' })
    const host: MapAiHost = {
      session: () => session,
      activeSheetKey: () => session.tabs()[0]!.key,
      controllerOf: () => null,
      showSheet: () => {},
      flush: () => {},
      isUntitled: () => true,
      newSheetNames: (n) => ({ title: `Sheet ${n}`, rootTitle: 'Central Topic' }),
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        createElement(
          LocaleProvider,
          { initial: 'en' },
          createElement(AiPanel, {
            host,
            filePath: null,
            request,
            onRunStart: (run) => starts.push(run),
            onCollapse: () => {},
          }),
        ),
      )
    })
    unmount = () => act(() => root.unmount())
    await settle(12)
  }

  const request: MindmapAiRequest = {
    nonce: 1,
    text: 'Make a map from these notes',
    attachmentPaths: ['C:/notes/a.docx', 'C:/notes/b.xmind'],
  }

  it('when nothing is connected, sends nothing and keeps the text and the files in the panel', async () => {
    const fake = fakeApi({ pending: null, statuses: statusMap('signed-out', 'not-installed') })
    const starts: MindmapAiRunStart[] = []
    await mountPanel(fake, request, starts)
    expect(fake.requests).toHaveLength(0)
    expect(starts).toEqual([])
    expect(fake.added).toEqual([['C:/notes/a.docx', 'C:/notes/b.xmind']])
    expect(composer().value).toBe('Make a map from these notes')
    const chips = [...container.querySelectorAll('.ai-attachments .ai-attachment-card-name')]
    expect(chips.map((chip) => chip.textContent)).toEqual(['a.docx', 'b.xmind'])
    expect(container.querySelector('.ai-sub-prompt')).not.toBeNull()
  })

  it('when connected, starts the run with the files and reports that it started', async () => {
    const fake = fakeApi({ pending: null, statuses: statusMap('ready', 'ready') })
    const starts: MindmapAiRunStart[] = []
    await mountPanel(fake, request, starts)
    expect(fake.requests).toHaveLength(1)
    expect(starts).toHaveLength(1)
    expect(starts[0]!.text).toBe('Make a map from these notes')
    expect(starts[0]!.attachments.map((a) => a.path)).toEqual([
      'C:/notes/a.docx',
      'C:/notes/b.xmind',
    ])
    // the files went with the run: the composer is empty again, the model sees the list
    expect(container.querySelector('.ai-attachments')).toBeNull()
    expect(JSON.stringify(fake.requests[0]!.messages)).toContain('b.xmind')
  })
})
