import { describe, expect, it, vi } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import type { OpenDocumentTab } from '../../src/shared/tabs-api'
import {
  createOpenDocumentsControl,
  createOpenTargetResolver,
} from '../../src/main/mcp/open-documents-bridge'
import type { OpenDocumentsBridgeDeps } from '../../src/main/mcp/open-documents-bridge'
import { createOpenDocumentTools } from '../../src/main/mcp/tools/open-documents-tools'

/**
 * `open_documents` close/read through the shell-side control.
 *
 * These exercise the wiring the tool-level tests stub out: which family writer a
 * close-save reaches, and what a discard is expected to clean up. The point is
 * the per-family branching, which is where the untitled-html crash and the
 * slides recovery leak lived.
 */

function tab(overrides: Partial<OpenDocumentTab> & { id: string }): OpenDocumentTab {
  return { kind: 'markdown', title: 'notes.md', active: false, dirty: true, ...overrides } as never
}

/** minimal stand-in for the WebContents the bridges address */
function contentsFor(): WebContents {
  return { id: 7, isDestroyed: () => false } as unknown as WebContents
}

async function controlWith(
  documents: OpenDocumentTab[],
  overrides: Partial<OpenDocumentsBridgeDeps> = {},
): Promise<{
  call: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  deps: OpenDocumentsBridgeDeps
}> {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-mcp-bridge-'))
  const deps: OpenDocumentsBridgeDeps = {
    list: async () => documents,
    webContentsFor: () => contentsFor(),
    closeTab: () => true,
    defaultSaveDir: () => dir,
    ...overrides,
  }
  const control = createOpenDocumentsControl(deps)
  const [tool] = createOpenDocumentTools({ control, defaultSaveDir: () => dir })
  return {
    deps,
    call: async (args) => {
      const result = await tool!.handler(args)
      return result as Record<string, unknown>
    },
  }
}

describe('open_documents close: untitled documents', () => {
  // Regression: an untitled html document threw "family \"html\" has no MCP
  // generation format" because the target extension was asked of the generation
  // registry, which only covers the three headless create_* families.
  it.each([
    ['docs', '.docx'],
    ['sheets', '.xlsx'],
    ['slides', '.pptx'],
    ['markdown', '.md'],
    ['html', '.html'],
    ['mindmap', '.xmind'],
  ] as const)('saves an untitled dirty %s tab before closing it', async (kind, ext) => {
    const doc = tab({ id: 't1', kind, title: `untitled ${kind}` })
    const { call } = await controlWith([doc], {
      docs: { openBlankTab: async () => 1, runCommand: async () => ({ ok: true }) },
      sheets: { openBlankTab: async () => 1, runCommand: async () => ({ ok: true }) },
      slides: {
        openBlankTab: async () => 1,
        runTxn: async () => ({}),
        readDeck: async () => ({}),
        saveDeck: async (_wcId, path) => ({ path }),
      },
      markdown: {
        read: async () => '',
        save: async () => undefined,
        discard: async () => undefined,
      },
      html: { read: async () => '', save: async () => undefined, discard: async () => undefined },
      mindmap: { read: async () => '', save: async () => undefined },
    })

    const result = await call({ action: 'close', target: 't1' })
    expect(result.closed).toBe(true)
    expect(String(result.savedTo).endsWith(ext)).toBe(true)
  })
})

describe('open_documents close: discard cleanup', () => {
  // Regression: discard cleaned markdown/html staged assets only. slides keeps
  // its own crash-recovery copy, so a discarded deck was offered back on the
  // next open.
  it('clears a slides document\u2019s recovery copies on discard', async () => {
    const discards: number[] = []
    const doc = tab({ id: 't3', kind: 'slides', title: 'deck.pptx', filePath: 'C:/docs/deck.pptx' })
    const { call } = await controlWith([doc], {
      slidesDiscard: () => discards.push(1),
    })

    const result = await call({ action: 'close', target: 't3', unsaved: 'discard' })
    expect(result.closed).toBe(true)
    expect(result.discardedUnsavedChanges).toBe(true)
    expect(discards).toHaveLength(1)
  })

  it('does not touch the recovery copy when the close saves instead', async () => {
    const discards: number[] = []
    const saved: string[] = []
    const doc = tab({ id: 't4', kind: 'slides', title: 'deck.pptx', filePath: 'C:/docs/deck.pptx' })
    const { call } = await controlWith([doc], {
      slidesDiscard: () => discards.push(1),
      slides: {
        openBlankTab: async () => 1,
        runTxn: async () => ({}),
        readDeck: async () => ({}),
        saveDeck: async (_wcId, path) => {
          saved.push(path)
          return { path }
        },
      },
    })

    const result = await call({ action: 'close', target: 't4' })
    expect(result.savedTo).toBe('C:/docs/deck.pptx')
    expect(saved).toEqual(['C:/docs/deck.pptx'])
    expect(discards).toEqual([])
  })

  it('still releases markdown staged assets on discard', async () => {
    const discard = vi.fn(async () => undefined)
    const doc = tab({ id: 't5', kind: 'markdown', title: 'notes.md', filePath: 'C:/docs/notes.md' })
    const { call } = await controlWith([doc], {
      markdown: { read: async () => '', save: async () => undefined, discard },
    })

    await call({ action: 'close', target: 't5', unsaved: 'discard' })
    expect(discard).toHaveBeenCalledTimes(1)
  })
})

describe('open_documents: restored tabs and recovery copies', () => {
  it.each(['docs', 'mindmap', 'hwp'] as const)(
    'drops a %s document’s recovery copy on discard, before the tab goes',
    async (kind) => {
      const order: string[] = []
      const doc = tab({ id: 't6', kind, title: `doc ${kind}` })
      const { call } = await controlWith([doc], {
        recoveryDiscard: (discarded) => void order.push(`discard:${discarded.kind}`),
        closeTab: () => {
          order.push('close')
          return true
        },
      })
      await call({ action: 'close', target: 't6', unsaved: 'discard' })
      expect(order).toEqual([`discard:${kind}`, 'close'])
    },
  )

  it('an untitled markdown discard still drops its copy (the editor hook runs without a path)', async () => {
    const discard = vi.fn(async () => undefined)
    const doc = tab({ id: 't7', kind: 'markdown', title: 'Untitled' })
    const { call } = await controlWith([doc], {
      markdown: { read: async () => '', save: async () => undefined, discard },
    })
    await call({ action: 'close', target: 't7', unsaved: 'discard' })
    expect(discard).toHaveBeenCalledTimes(1)
  })

  it('closes a restored tab that never loaded without loading it or touching its copy', async () => {
    const webContentsFor = vi.fn(() => contentsFor())
    const recoveryDiscard = vi.fn()
    const closeTab = vi.fn(() => true)
    const doc = tab({
      id: 't8',
      kind: 'docs',
      title: 'a.docx',
      filePath: 'C:/a.docx',
      dirty: false,
    })
    const { call } = await controlWith([doc], {
      webContentsFor,
      recoveryDiscard,
      closeTab,
      isUnloaded: (id) => id === 't8',
    })
    await call({ action: 'close', target: 't8', unsaved: 'discard' })
    expect(closeTab).toHaveBeenCalledWith('t8')
    expect(webContentsFor).not.toHaveBeenCalled()
    expect(recoveryDiscard).not.toHaveBeenCalled()
  })

  it('reads a restored tab through an asynchronous (loading) lookup', async () => {
    const read = vi.fn(async () => 'text')
    const doc = tab({ id: 't9', kind: 'markdown', title: 'notes.md', filePath: 'C:/notes.md' })
    const control = createOpenDocumentsControl({
      list: async () => [doc],
      webContentsFor: async () => contentsFor(),
      closeTab: () => true,
      defaultSaveDir: () => 'C:/',
      markdown: { read, save: async () => undefined, discard: async () => undefined },
    })
    expect(await control.read(doc)).toBe('text')
  })

  it('passes the "open it in the app first" failure through for a document waiting on the user', async () => {
    const doc = tab({ id: 't10', kind: 'markdown', title: 'notes.md', filePath: 'C:/notes.md' })
    const failure = new Error(
      '"notes.md" has recovered changes to decide on: the user must open this document in the app first',
    )
    const control = createOpenDocumentsControl({
      list: async () => [doc],
      webContentsFor: async () => {
        throw failure
      },
      closeTab: () => true,
      defaultSaveDir: () => 'C:/',
      markdown: {
        read: async () => 'x',
        save: async () => undefined,
        discard: async () => undefined,
      },
    })
    await expect(control.read(doc)).rejects.toThrow(
      'the user must open this document in the app first',
    )
    const word = tab({ id: 't11', kind: 'docs', title: 'a.docx', filePath: 'C:/a.docx' })
    const resolve = createOpenTargetResolver({
      list: async () => [word],
      webContentsFor: async () => {
        throw failure
      },
    })
    await expect(resolve('t11', 'docx')).rejects.toThrow(failure.message)
  })
})

describe('open_documents on a mind map tab', () => {
  const mapDoc = (dirty: boolean): OpenDocumentTab =>
    tab({ id: 't8', kind: 'mindmap', title: 'plan.xmind', filePath: 'C:/maps/plan.xmind', dirty })

  it('reads through the mind map reader and saves through the editor save', async () => {
    const read = vi.fn(async () => '# Sheet 1\n\n- Plan\n')
    const save = vi.fn(async () => undefined)
    const { call } = await controlWith([mapDoc(true)], { mindmap: { read, save } })

    expect((await call({ action: 'read', target: 't8' })).content).toBe('# Sheet 1\n\n- Plan\n')
    const closed = await call({ action: 'close', target: 't8' })
    expect(closed.savedTo).toBe('C:/maps/plan.xmind')
    expect(save).toHaveBeenCalledWith(expect.anything(), 'C:/maps/plan.xmind')
  })

  it('a clean map closes without a save, and a discard never saves', async () => {
    const save = vi.fn(async () => undefined)
    const clean = await controlWith([mapDoc(false)], { mindmap: { read: async () => '', save } })
    expect(await clean.call({ action: 'close', target: 't8' })).not.toHaveProperty('savedTo')
    const dirty = await controlWith([mapDoc(true)], { mindmap: { read: async () => '', save } })
    await dirty.call({ action: 'close', target: 't8', unsaved: 'discard' })
    expect(save).not.toHaveBeenCalled()
  })

  it('a refused save keeps the tab open', async () => {
    const closeTab = vi.fn(() => true)
    const { call } = await controlWith([mapDoc(true)], {
      closeTab,
      mindmap: {
        read: async () => '',
        save: async () => {
          throw new Error('the file did not open, so there is no map to save')
        },
      },
    })
    await expect(call({ action: 'close', target: 't8' })).rejects.toThrow(/did not open/)
    expect(closeTab).not.toHaveBeenCalled()
  })

  it('names the missing editor instead of failing silently', async () => {
    const { call } = await controlWith([mapDoc(true)])
    await expect(call({ action: 'read', target: 't8' })).rejects.toThrow(/mind map editor/)
  })
})

describe('open_documents close: PDF guard', () => {
  it('refuses to close a PDF tab, naming the reason', async () => {
    const doc = tab({ id: 't6', kind: 'pdf', title: 'six.pdf', filePath: 'C:/docs/six.pdf' })
    const { call } = await controlWith([doc])
    await expect(call({ action: 'close', target: 't6' })).rejects.toThrow(/viewer/)
  })
})

describe('open target resolver: focusing the document the agent edits', () => {
  it('activates the named tab and reveals the window', async () => {
    const activate = vi.fn()
    const revealWindow = vi.fn()
    const doc = tab({
      id: 't9',
      kind: 'sheets',
      title: 'book.xlsx',
      filePath: 'C:/docs/book.xlsx',
      active: false,
    })
    const resolve = createOpenTargetResolver({
      list: async () => [doc],
      webContentsFor: () => contentsFor(),
      activate,
      revealWindow,
    })

    await expect(resolve('t9', 'xlsx', { focus: true })).resolves.toBe(7)
    expect(activate).toHaveBeenCalledWith('t9')
    expect(revealWindow).toHaveBeenCalledTimes(1)
  })

  it('leaves the UI alone for a read, and for a tab already in front', async () => {
    const activate = vi.fn()
    const revealWindow = vi.fn()
    const back = tab({ id: 't1', kind: 'sheets', title: 'back.xlsx', active: false })
    const front = tab({ id: 't2', kind: 'sheets', title: 'front.xlsx', active: true })
    const resolve = createOpenTargetResolver({
      list: async () => [back, front],
      webContentsFor: () => contentsFor(),
      activate,
      revealWindow,
    })

    // read tools pass no focus option
    await resolve('t1', 'xlsx')
    expect(activate).not.toHaveBeenCalled()

    // an already-active tab needs no switch
    await resolve('t2', 'xlsx', { focus: true })
    expect(activate).not.toHaveBeenCalled()
    expect(revealWindow).not.toHaveBeenCalled()
  })

  it('still resolves the edit when the UI call fails', async () => {
    const doc = tab({ id: 't3', kind: 'xlsx' as never, title: 'x.xlsx', active: false })
    const resolve = createOpenTargetResolver({
      list: async () => [{ ...doc, kind: 'sheets' }],
      webContentsFor: () => contentsFor(),
      activate: () => {
        throw new Error('no such tab')
      },
    })
    // showing the tab is a courtesy: the caller's edit must still go through
    await expect(resolve('t3', 'xlsx', { focus: true })).resolves.toBe(7)
  })

  it('refuses a document of the wrong family', async () => {
    const doc = tab({ id: 't4', kind: 'docs', title: 'doc.docx', active: false })
    const resolve = createOpenTargetResolver({
      list: async () => [doc],
      webContentsFor: () => contentsFor(),
    })
    await expect(resolve('t4', 'xlsx', { focus: true })).rejects.toThrow(/Word document/)
  })
})
