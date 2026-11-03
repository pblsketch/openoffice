/**
 * The in-app MCP server on a diagram tab, through the shell's controls and the
 * diagram editor's real main-process modules (`diagram-main.ts` for saving,
 * `mcp-queries.ts` for the questions). Only Electron and the diagram renderer
 * are stand-ins: the renderer is a fake WebContents that answers the read and
 * apply questions and runs the editor's two-step save the way the real one
 * does (ask for a target, hand back the bytes; the main module writes them).
 *
 * What is pinned here: `open_documents` lists a diagram as kind "diagram",
 * reads every page with the unsaved edits, saves through the editor's own save
 * (nothing written when unchanged, an untitled diagram as a fresh `.drawio` in
 * the default folder); `read_diagram` takes the diagram in front or a named
 * one and refuses with the open diagrams listed; `apply_diagram_ops` asks the
 * editor once, reports per-op results and created ids, and turns a refused
 * plan into an error with nothing changed.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

interface FakeContents {
  id: number
  sent: Array<[string, ...unknown[]]>
  destroyed: boolean
  /** the fake renderer: what it does when the main process sends it something */
  onSend: (channel: string, ...args: unknown[]) => void
  isDestroyed(): boolean
  setWindowOpenHandler(): void
  loadURL(): Promise<void>
  getURL(): string
  send(channel: string, ...args: unknown[]): void
  on(): void
  once(): void
  reload(): void
}

let nextId = 300
function fakeContents(): FakeContents {
  const contents: FakeContents = {
    id: nextId++,
    sent: [],
    destroyed: false,
    onSend: () => {},
    isDestroyed: () => contents.destroyed,
    setWindowOpenHandler: () => {},
    loadURL: async () => {},
    getURL: () => '',
    send: (channel, ...args) => {
      contents.sent.push([channel, ...args])
      contents.onSend(channel, ...args)
    },
    on: () => {},
    once: () => {},
    reload: () => {},
  }
  return contents
}

const showSaveDialog = vi.fn()

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) => join(tmpdir(), `shell-diagram-mcp-test-${name}`),
    getLocale: () => 'en-US',
    isPackaged: false,
  },
  dialog: {
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
    showMessageBox: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  session: {
    fromPartition: () => ({
      protocol: { handle: vi.fn() },
      webRequest: { onBeforeRequest: vi.fn() },
      setSpellCheckerEnabled: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    }),
  },
  nativeTheme: { themeSource: 'system' },
  net: {},
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  WebContentsView: class {
    webContents = fakeContents()
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: (channel: string, fn: Handler) => handlers.set(channel, fn),
    removeHandler: vi.fn(),
  },
}))

import type { WebContents } from 'electron'
import {
  configureDiagramRuntime,
  createDiagramView,
  diagramIsDirty,
  diagramSaveToPath,
} from '../../../diagram/src/main/diagram-main'
import {
  diagramApplyOps,
  diagramReadPage,
  diagramReadText,
} from '../../../diagram/src/main/mcp-queries'
import {
  DIAGRAM_CHANNELS,
  type DiagramApplyQuery,
  type DiagramReadQuery,
  type SaveTargetResult,
} from '../../../diagram/src/shared/ipc'
import type { OpenDocumentTab } from '../../src/shared/tabs-api'
import { createOpenDocumentsControl } from '../../src/main/mcp/open-documents-bridge'
import { createDiagramControl } from '../../src/main/mcp/diagram-bridge'
import { createOpenDocumentTools } from '../../src/main/mcp/tools/open-documents-tools'
import { createDiagramTools } from '../../src/main/mcp/tools/diagram-tools'

const fixtures = join(__dirname, '../../../../packages/drawio-model/tests/fixtures')

let dir: string
let saveDir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-mcp-diagram-'))
  saveDir = mkdtempSync(join(tmpdir(), 'genoffice-mcp-diagram-default-'))
  configureDiagramRuntime({
    preloadPath: join(dir, 'out', 'preload', 'index.js'),
    rendererFile: join(dir, 'out', 'renderer', 'index.html'),
    packaged: true,
  })
  showSaveDialog.mockReset()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(saveDir, { recursive: true, force: true })
})

const call = <T>(channel: string, contents: FakeContents, ...args: unknown[]): T =>
  handlers.get(channel)!({ sender: contents }, ...args) as T

const fixture = (name: string): Buffer => readFileSync(join(fixtures, name))

function copyFixture(name: string, as = name): string {
  const path = join(dir, as)
  writeFileSync(path, fixture(name))
  return path
}

/** a diagram tab as the renderer leaves it after opening its file (or a new one) */
async function openedView(path?: string): Promise<FakeContents> {
  const contents = createDiagramView(path ?? null).webContents as unknown as FakeContents
  if (path) await call(DIAGRAM_CHANNELS.openFile, contents, path)
  return contents
}

function markDirty(contents: FakeContents): void {
  call(DIAGRAM_CHANNELS.dirtyChanged, contents, true)
}

interface Renderer {
  reads: DiagramReadQuery[]
  applies: DiagramApplyQuery[]
  saves: unknown[]
}

/**
 * The fake renderer: answers reads with a text naming what was asked, applies
 * with `applyResult`, and saves with `bytes` through the editor's save channels.
 */
function renderer(
  contents: FakeContents,
  options: {
    bytes?: Uint8Array
    applyResult?: (ops: unknown[]) => unknown
    /** reads go unanswered while this is true (draw.io still starting) */
    loading?: () => boolean
  } = {},
): Renderer {
  const seen: Renderer = { reads: [], applies: [], saves: [] }
  contents.onSend = (channel, payload) => {
    if (channel === DIAGRAM_CHANNELS.readRequest) {
      const query = payload as DiagramReadQuery
      seen.reads.push(query)
      if (options.loading?.()) return
      const text = query.page
        ? `Pages: ...\npage ${query.page}`
        : query.current
          ? 'Pages: ...\ncurrent page'
          : 'Pages: ...\nevery page'
      // a one-page read also carries the table as values, as the editor's does
      const read = query.page || query.current ? pageTable(query.page ?? 'p1') : undefined
      call(DIAGRAM_CHANNELS.readResult, contents, { id: query.id, text, ...(read ? { read } : {}) })
    } else if (channel === DIAGRAM_CHANNELS.applyRequest) {
      const query = payload as DiagramApplyQuery
      seen.applies.push(query)
      const result = options.applyResult?.(query.ops) ?? { status: 'ok', results: [] }
      // answered after the next tick, as the real executor is asynchronous
      setTimeout(
        () => call(DIAGRAM_CHANNELS.applyResult, contents, { id: query.id, ok: true, result }),
        0,
      )
    } else if (channel === DIAGRAM_CHANNELS.saveRequest) {
      seen.saves.push(payload)
      void (async () => {
        const target = await call<Promise<SaveTargetResult>>(
          DIAGRAM_CHANNELS.saveTarget,
          contents,
          {
            mode: payload,
          },
        )
        if (!target.ok || 'canceled' in target) {
          call(DIAGRAM_CHANNELS.saveRequestAck, contents, false)
          return
        }
        await call(DIAGRAM_CHANNELS.save, contents, {
          token: target.token,
          bytes: options.bytes ?? new Uint8Array(fixture('sample.drawio')),
        })
      })()
    }
  }
  return seen
}

/** the one-page table the fake renderer answers with */
function pageTable(pageId: string) {
  return {
    pages: [
      { id: 'p1', name: 'Page-1', current: true as const },
      { id: pageId, name: pageId },
    ],
    page: {
      id: pageId,
      name: pageId,
      shapes: [
        { id: 'a', label: 'Start', shape: 'rounded', x: 40, y: 40, width: 120, height: 60 },
        { id: 'b', label: 'End', shape: 'ellipse', x: 240, y: 40, width: 80, height: 80 },
      ],
      edges: [{ id: 'e', label: '', source: 'a', target: 'b' }],
      ...(pageId === 'p1' ? { selected: ['a'] } : {}),
    },
  }
}

function diagramTab(overrides: Partial<OpenDocumentTab> = {}): OpenDocumentTab {
  return {
    id: 't7',
    kind: 'diagram',
    title: 'flow.drawio',
    active: true,
    dirty: true,
    ...overrides,
  }
}

/** open_documents over the real editor modules */
function openDocuments(
  byTab: Record<string, FakeContents>,
  tabs: OpenDocumentTab[],
): {
  run: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  closed: string[]
} {
  const closed: string[] = []
  const control = createOpenDocumentsControl({
    list: async () => tabs,
    webContentsFor: (id) => byTab[id] as unknown as WebContents,
    closeTab: (id) => {
      closed.push(id)
      return true
    },
    defaultSaveDir: () => saveDir,
    diagram: { read: diagramReadText, save: diagramSaveToPath },
  })
  const [tool] = createOpenDocumentTools({ control, defaultSaveDir: () => saveDir })
  return { run: async (args) => (await tool!.handler(args)) as Record<string, unknown>, closed }
}

/** the two diagram tools over the real editor questions */
function diagramTools(
  byTab: Record<string, FakeContents>,
  tabs: OpenDocumentTab[],
  extra: { isDetached?: (id: string) => boolean; activated?: string[] } = {},
): {
  read: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  apply: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
} {
  const control = createDiagramControl({
    list: async () => tabs,
    webContentsFor: (id) => byTab[id] as unknown as WebContents,
    ...(extra.isDetached ? { isDetached: extra.isDetached } : {}),
    activate: (id) => extra.activated?.push(id),
    readPage: diagramReadPage,
    applyOps: diagramApplyOps,
  })
  const [read, apply] = createDiagramTools({ control })
  return {
    read: async (args) => (await read!.handler(args)) as Record<string, unknown>,
    apply: async (args) => (await apply!.handler(args)) as Record<string, unknown>,
  }
}

describe('open_documents on a diagram: list and read', () => {
  it('lists the tab with kind diagram, type "diagram" and its file format', async () => {
    const svg = copyFixture('out.drawio.svg')
    const untitled = await openedView()
    const saved = await openedView(svg)
    const { run } = openDocuments({ t7: untitled, t8: saved }, [
      diagramTab({ title: 'Untitled diagram', dirty: false }),
      diagramTab({ id: 't8', title: 'out.drawio.svg', filePath: svg, active: false, dirty: false }),
    ])
    expect(await run({ action: 'list' })).toEqual({
      documents: [
        {
          id: 't7',
          type: 'diagram',
          kind: 'diagram',
          format: 'drawio',
          title: 'Untitled diagram',
          path: null,
          saved: false,
          dirty: false,
          active: true,
        },
        {
          id: 't8',
          type: 'diagram',
          kind: 'diagram',
          format: 'drawio.svg',
          title: 'out.drawio.svg',
          path: svg,
          saved: true,
          dirty: false,
          active: false,
        },
      ],
    })
  })

  it('reads every page the renderer holds now, unsaved edits included, and writes nothing', async () => {
    const path = copyFixture('out.drawio')
    const contents = await openedView(path)
    markDirty(contents)
    const seen = renderer(contents)
    const { run } = openDocuments({ t7: contents }, [diagramTab({ filePath: path })])
    const result = await run({ action: 'read', target: path })
    expect(result).toEqual({
      id: 't7',
      type: 'diagram',
      kind: 'diagram',
      title: 'flow.drawio',
      path,
      dirty: true,
      content: 'Pages: ...\nevery page',
    })
    // the whole diagram: neither one page nor the page on screen
    expect(seen.reads[0]).not.toHaveProperty('page')
    expect(seen.reads[0]).not.toHaveProperty('current')
    expect(seen.saves).toEqual([])
    expect(readFileSync(path)).toEqual(fixture('out.drawio'))
  })

  it('asks again while draw.io is still starting, then takes the answer', async () => {
    const contents = await openedView()
    let asked = 0
    renderer(contents, { loading: () => ++asked < 3 })
    const { run } = openDocuments({ t7: contents }, [diagramTab()])
    expect((await run({ action: 'read', target: 't7' })).content).toBe('Pages: ...\nevery page')
    expect(asked).toBeGreaterThanOrEqual(3)
  })

  it('turns the renderer’s error into a failed read', async () => {
    const contents = await openedView()
    contents.onSend = (channel, query) => {
      if (channel === DIAGRAM_CHANNELS.readRequest) {
        call(DIAGRAM_CHANNELS.readResult, contents, {
          id: (query as DiagramReadQuery).id,
          error: 'the file did not open, so there is no diagram to read',
        })
      }
    }
    const { run } = openDocuments({ t7: contents }, [diagramTab()])
    await expect(run({ action: 'read', target: 't7' })).rejects.toThrow(/did not open/)
  })

  it('ignores an answer from another view', async () => {
    vi.useFakeTimers()
    try {
      const contents = await openedView()
      const other = await openedView()
      contents.onSend = (channel, query) => {
        if (channel === DIAGRAM_CHANNELS.readRequest) {
          call(DIAGRAM_CHANNELS.readResult, other, {
            id: (query as DiagramReadQuery).id,
            text: 'not yours',
          })
        }
      }
      const reading = diagramReadText(contents as unknown as WebContents)
      const failed = expect(reading).rejects.toThrow(/timed out reading the diagram/)
      await vi.advanceTimersByTimeAsync(30_000)
      await failed
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('open_documents on a diagram: save and close', () => {
  it('saves a changed diagram to its own file through the editor’s save, tab left open', async () => {
    const path = copyFixture('out.drawio', 'flow.drawio')
    const contents = await openedView(path)
    markDirty(contents)
    const seen = renderer(contents)
    const { run, closed } = openDocuments({ t7: contents }, [diagramTab({ filePath: path })])

    const result = await run({ action: 'save', target: path })
    expect(result).toMatchObject({ saved: true, type: 'diagram', path, savedTo: path })
    // the editor's normal save of its own file, never a mode of our own
    expect(seen.saves).toEqual(['save'])
    expect(readFileSync(path)).toEqual(fixture('sample.drawio'))
    expect(diagramIsDirty(contents.id)).toBe(false)
    expect(showSaveDialog).not.toHaveBeenCalled()
    expect(closed).toEqual([])
  })

  it('writes nothing for an unchanged diagram', async () => {
    const path = copyFixture('out.drawio', 'flow.drawio')
    const contents = await openedView(path)
    const seen = renderer(contents)
    const before = statSync(path).mtimeMs
    const { run } = openDocuments({ t7: contents }, [diagramTab({ filePath: path, dirty: false })])

    expect(await run({ action: 'save', target: 't7' })).toMatchObject({
      saved: true,
      savedTo: path,
    })
    expect(seen.saves).toEqual([])
    expect(statSync(path).mtimeMs).toBe(before)
    expect(readFileSync(path)).toEqual(fixture('out.drawio'))
  })

  it('saves an untitled diagram into the default folder as .drawio, never over an existing file', async () => {
    writeFileSync(join(saveDir, 'Untitled diagram.drawio'), 'someone else’s file')
    const contents = await openedView()
    markDirty(contents)
    const seen = renderer(contents)
    const { run, closed } = openDocuments({ t7: contents }, [
      diagramTab({ title: 'Untitled diagram' }),
    ])

    const result = await run({ action: 'close', target: 't7' })
    const savedTo = String(result.savedTo)
    expect(savedTo.startsWith(saveDir)).toBe(true)
    expect(savedTo.endsWith('.drawio')).toBe(true)
    expect(savedTo).not.toBe(join(saveDir, 'Untitled diagram.drawio'))
    expect(readFileSync(savedTo)).toEqual(fixture('sample.drawio'))
    expect(readFileSync(join(saveDir, 'Untitled diagram.drawio'), 'utf8')).toBe(
      'someone else’s file',
    )
    // the editor's retarget save: written there now, changed or not
    expect(seen.saves).toEqual(['retarget'])
    expect(showSaveDialog).not.toHaveBeenCalled()
    expect(closed).toEqual(['t7'])
  })

  it('discards: closes the tab and writes nothing', async () => {
    const path = copyFixture('out.drawio', 'flow.drawio')
    const contents = await openedView(path)
    markDirty(contents)
    const seen = renderer(contents)
    const { run, closed } = openDocuments({ t7: contents }, [diagramTab({ filePath: path })])

    const result = await run({ action: 'close', target: 't7', unsaved: 'discard' })
    expect(result).toMatchObject({ closed: true, discardedUnsavedChanges: true })
    expect(result).not.toHaveProperty('savedTo')
    expect(seen.saves).toEqual([])
    expect(readFileSync(path)).toEqual(fixture('out.drawio'))
    expect(closed).toEqual(['t7'])
  })

  it('never writes a diagram whose file did not open', async () => {
    const path = join(dir, 'broken.drawio')
    writeFileSync(path, 'not xml at all')
    const contents = await openedView(path)
    markDirty(contents)
    const seen = renderer(contents)
    const { run, closed } = openDocuments({ t7: contents }, [
      diagramTab({ title: 'broken.drawio', filePath: path }),
    ])

    await expect(run({ action: 'close', target: 't7' })).rejects.toThrow(/did not open/)
    expect(seen.saves).toEqual([])
    expect(readFileSync(path, 'utf8')).toBe('not xml at all')
    expect(readdirSync(saveDir)).toEqual([])
    expect(closed).toEqual([])
  })
})

describe('read_diagram', () => {
  it('reads the page on screen of the diagram in front when no document or page is given', async () => {
    const front = await openedView()
    const back = await openedView()
    const frontSeen = renderer(front)
    const backSeen = renderer(back)
    const { read } = diagramTools({ t7: front, t8: back }, [
      diagramTab({ id: 't8', title: 'back.drawio', active: false }),
      diagramTab({ title: 'Untitled diagram', dirty: false }),
    ])
    // the same table as text (content) and as values (pages, page), spec 8.1
    expect(await read({})).toEqual({
      id: 't7',
      title: 'Untitled diagram',
      path: null,
      dirty: false,
      content: 'Pages: ...\ncurrent page',
      ...pageTable('p1'),
    })
    expect(frontSeen.reads[0]).toMatchObject({ current: true })
    expect(backSeen.reads).toEqual([])
  })

  it('reads a named page of a named diagram, by id or by path', async () => {
    const path = copyFixture('out.drawio', 'flow.drawio')
    const front = await openedView()
    const named = await openedView(path)
    const seen = renderer(named)
    renderer(front)
    const tabs = [
      diagramTab({ title: 'Untitled diagram' }),
      diagramTab({ id: 't8', filePath: path, active: false }),
    ]
    const { read } = diagramTools({ t7: front, t8: named }, tabs)
    const second = await read({ document: path, page: 'Page-2' })
    expect(second.content).toBe('Pages: ...\npage Page-2')
    expect(second.page).toEqual(pageTable('Page-2').page)
    expect(second.pages).toEqual(pageTable('Page-2').pages)
    expect((await read({ document: 't8' })).content).toBe('Pages: ...\ncurrent page')
    expect(seen.reads.map((q) => q.page ?? (q.current ? '(current)' : '(all)'))).toEqual([
      'Page-2',
      '(current)',
    ])
  })

  it('gives the text alone when the editor sends no table (an older editor build)', async () => {
    const contents = await openedView()
    contents.onSend = (channel, payload) => {
      if (channel !== DIAGRAM_CHANNELS.readRequest) return
      const query = payload as DiagramReadQuery
      call(DIAGRAM_CHANNELS.readResult, contents, {
        id: query.id,
        text: 'Pages: ...',
        read: { pages: 'not a list' },
      })
    }
    const { read } = diagramTools({ t7: contents }, [diagramTab()])
    const answer = await read({})
    expect(answer.content).toBe('Pages: ...')
    expect(answer).not.toHaveProperty('page')
    expect(answer).not.toHaveProperty('pages')
  })

  it('takes the diagram in a focused detached window over the shell’s active tab', async () => {
    const shellTab = await openedView()
    const detached = await openedView()
    renderer(shellTab)
    renderer(detached)
    const { read } = diagramTools(
      { t7: shellTab, 'detached:9': detached },
      [diagramTab(), diagramTab({ id: 'detached:9', title: 'Popped out' })],
      { isDetached: (id) => id.startsWith('detached:') },
    )
    expect((await read({})).id).toBe('detached:9')
  })

  it('without a diagram in front, refuses and lists the open diagrams', async () => {
    const contents = await openedView()
    renderer(contents)
    const { read } = diagramTools({ t8: contents }, [
      { id: 't1', kind: 'docs', title: 'report.docx', active: true, dirty: false },
      diagramTab({ id: 't8', title: 'back.drawio', filePath: '/x/back.drawio', active: false }),
    ])
    const failure = read({})
    await expect(failure).rejects.toThrow(/no diagram is in front/)
    await expect(failure).rejects.toThrow(/t8\s+\/x\/back\.drawio\s+— back\.drawio/)
    await expect(failure).rejects.not.toThrow(/report\.docx/)
  })

  it('with no diagram open at all, says so', async () => {
    const { read } = diagramTools({}, [
      { id: 't1', kind: 'docs', title: 'report.docx', active: true, dirty: false },
    ])
    await expect(read({})).rejects.toThrow(/no diagram is open/)
  })

  it('refuses a document that is not a diagram', async () => {
    const { read } = diagramTools({}, [
      { id: 't1', kind: 'docs', title: 'report.docx', active: true, dirty: false },
    ])
    await expect(read({ document: 't1' })).rejects.toThrow(
      /"report\.docx" is a Word document, but this tool edits diagram documents/,
    )
  })
})

describe('apply_diagram_ops', () => {
  const ops = [
    { op: 'add_shape', id: 'a', label: 'Start', x: 0, y: 0 },
    { op: 'add_shape', id: 'b', label: 'End', x: 200, y: 0 },
    { op: 'add_edge', source: 'a', target: 'b' },
  ]

  it('hands the whole list to the editor once and reports per-op results and created ids', async () => {
    const contents = await openedView()
    const seen = renderer(contents, {
      applyResult: (given) => ({
        status: 'ok',
        changed: true,
        primitives: [{ kind: 'internal' }],
        state: { pages: ['the whole diagram'] },
        token: 'undo-1',
        applied: ['a', 'b', 'e1'],
        created: ['a', 'b', 'e1'],
        results: (given as unknown[]).map((_, index) => ({
          index,
          op: (given[index] as { op: string }).op,
          status: 'ok',
          created: [['a', 'b', 'e1'][index]],
        })),
      }),
    })
    const { apply } = diagramTools({ t7: contents }, [diagramTab({ title: 'Untitled diagram' })])
    const result = await apply({ ops })
    expect(result).toEqual({
      id: 't7',
      title: 'Untitled diagram',
      path: null,
      status: 'ok',
      changed: true,
      created: ['a', 'b', 'e1'],
      results: [
        { index: 0, op: 'add_shape', status: 'ok', created: ['a'] },
        { index: 1, op: 'add_shape', status: 'ok', created: ['b'] },
        { index: 2, op: 'add_edge', status: 'ok', created: ['e1'] },
      ],
    })
    // one request with the list as given: one undo step in the editor
    expect(seen.applies).toHaveLength(1)
    expect(seen.applies[0]!.ops).toEqual(ops)
    // asked only after the editor answered a read (it is up and listening)
    const order = contents.sent.map(([channel]) => channel)
    expect(order.indexOf(DIAGRAM_CHANNELS.readRequest)).toBeLessThan(
      order.indexOf(DIAGRAM_CHANNELS.applyRequest),
    )
  })

  it('a refused plan is an error with every op’s outcome, and nothing is changed', async () => {
    const contents = await openedView()
    renderer(contents, {
      applyResult: () => ({
        status: 'rejected',
        changed: false,
        created: [],
        results: [
          { index: 0, op: 'add_shape', status: 'ok', created: ['a'] },
          {
            index: 1,
            op: 'add_edge',
            status: 'failed',
            error: { code: 'target_not_found', message: 'no shape "zzz" on this page' },
          },
        ],
      }),
    })
    const { apply } = diagramTools({ t7: contents }, [diagramTab()])
    const failure = apply({
      ops: [
        { op: 'add_shape', id: 'a', label: 'A', x: 0, y: 0 },
        { op: 'add_edge', source: 'a', target: 'zzz' },
      ],
    })
    await expect(failure).rejects.toThrow(/Nothing was changed: 1 op\(s\) were refused/)
    await expect(failure).rejects.toThrow(
      /\n0 add_shape: ok \(not applied\)\n1 add_edge: FAILED target_not_found: no shape "zzz" on this page$/,
    )
  })

  it('never sends an apply twice, even when the answer takes a while', async () => {
    const contents = await openedView()
    const applies: DiagramApplyQuery[] = []
    contents.onSend = (channel, payload) => {
      if (channel === DIAGRAM_CHANNELS.readRequest) {
        call(DIAGRAM_CHANNELS.readResult, contents, {
          id: (payload as DiagramReadQuery).id,
          text: 'Pages: ...',
        })
      } else if (channel === DIAGRAM_CHANNELS.applyRequest) {
        const query = payload as DiagramApplyQuery
        applies.push(query)
        setTimeout(
          () =>
            call(DIAGRAM_CHANNELS.applyResult, contents, {
              id: query.id,
              ok: true,
              result: { status: 'ok', changed: true, created: [], results: [] },
            }),
          900,
        )
      }
    }
    const { apply } = diagramTools({ t7: contents }, [diagramTab()])
    await apply({ ops: [{ op: 'add_page', name: 'Two' }] })
    expect(applies).toHaveLength(1)
  })

  it('applies to one diagram run one after another', async () => {
    const contents = await openedView()
    const order: string[] = []
    contents.onSend = (channel, payload) => {
      if (channel === DIAGRAM_CHANNELS.readRequest) {
        call(DIAGRAM_CHANNELS.readResult, contents, {
          id: (payload as DiagramReadQuery).id,
          text: 'Pages: ...',
        })
      } else if (channel === DIAGRAM_CHANNELS.applyRequest) {
        const query = payload as DiagramApplyQuery
        const name = (query.ops[0] as { name: string }).name
        order.push(`start ${name}`)
        setTimeout(() => {
          order.push(`end ${name}`)
          call(DIAGRAM_CHANNELS.applyResult, contents, {
            id: query.id,
            ok: true,
            result: { status: 'ok', changed: true, created: [], results: [] },
          })
        }, 50)
      }
    }
    const { apply } = diagramTools({ t7: contents }, [diagramTab()])
    await Promise.all([
      apply({ ops: [{ op: 'add_page', name: 'One' }] }),
      apply({ ops: [{ op: 'add_page', name: 'Two' }] }),
    ])
    expect(order).toEqual(['start One', 'end One', 'start Two', 'end Two'])
  })

  it('brings a background diagram into view before changing it', async () => {
    const path = copyFixture('out.drawio', 'flow.drawio')
    const back = await openedView(path)
    renderer(back)
    const activated: string[] = []
    const { apply } = diagramTools(
      { t8: back },
      [diagramTab({ id: 't8', filePath: path, active: false })],
      { activated },
    )
    await apply({ document: path, ops: [{ op: 'add_page', name: 'Two' }] })
    expect(activated).toEqual(['t8'])
  })

  it('an editor error (the file did not open) rejects without applying anything', async () => {
    const contents = await openedView()
    const applies: unknown[] = []
    contents.onSend = (channel, payload) => {
      if (channel === DIAGRAM_CHANNELS.readRequest) {
        call(DIAGRAM_CHANNELS.readResult, contents, {
          id: (payload as DiagramReadQuery).id,
          error: 'the file did not open, so there is no diagram to read',
        })
      } else if (channel === DIAGRAM_CHANNELS.applyRequest) applies.push(payload)
    }
    const { apply } = diagramTools({ t7: contents }, [diagramTab()])
    await expect(apply({ ops: [{ op: 'add_page', name: 'Two' }] })).rejects.toThrow(/did not open/)
    expect(applies).toEqual([])
  })
})
