/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import type { AiSettings } from '@genoffice/ai-provider'
import type { AgentStreamRequest, AgentTransport } from '@genoffice/agent-core'
import type {
  OpenProjectScreenEvent,
  ProjectChangedEvent,
  ProjectChatListItem,
  ProjectDetail,
  ProjectFileEntry,
  ProjectFolderApi,
  ProjectListItem,
} from '@genoffice/project-store'
import {
  projectFilePath,
  ProjectsPanel,
  subscribeProjectScreen,
  type ProjectScreenRequest,
  type ProjectsPanelProps,
} from '../src/renderer/src/ProjectsPanel'
import { LocaleProvider } from '../src/renderer/src/locale'

/**
 * The home project screen (spec 5.12) against a fake project folder bridge:
 * every button calls the bridge method the spec names, with the project's id,
 * and an AI panel's "[view]" opens the screen at the asked section.
 */

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function item(patch: Partial<ProjectListItem> & Pick<ProjectListItem, 'id' | 'name'>) {
  return {
    path: `D:\\work\\${patch.name}`,
    pinned: false,
    lastUsedAt: '2026-10-01T00:00:00.000Z',
    missing: false,
    unwritable: false,
    syncFolder: false,
    ...patch,
  } satisfies ProjectListItem
}

const PROJECTS: ProjectListItem[] = [
  item({ id: 'old', name: 'Old report', lastUsedAt: '2026-09-01T00:00:00.000Z' }),
  item({ id: 'pin-b', name: 'Budget', pinned: true }),
  item({ id: 'new', name: 'New plan', lastUsedAt: '2026-10-20T00:00:00.000Z' }),
  item({ id: 'pin-a', name: 'Annual', pinned: true }),
]

function detailOf(project: ProjectListItem, patch: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    project,
    trust: 'use',
    settings: { memoryEnabled: true, readAgentsFiles: true },
    instructions: 'Write formally.',
    agents: null,
    claude: null,
    memory:
      '<!-- memory -->\n- The deadline is Friday. (2026-10-20)\n- Use bullets. (2026-10-02)\n',
    memoryEntries: ['The deadline is Friday. (2026-10-20)', 'Use bullets. (2026-10-02)'],
    memoryChars: 80,
    memoryConflictCopies: [],
    ...patch,
  }
}

const FILES: ProjectFileEntry[] = [
  { relPath: 'plan.docx', ext: 'docx', sizeBytes: 20480, mtimeMs: 2, cloudOnly: false },
  { relPath: 'cloud/notes.pdf', ext: 'pdf', sizeBytes: 4096, mtimeMs: 1, cloudOnly: true },
]

const IGNORED: ProjectFileEntry[] = [
  { relPath: 'secret.xlsx', ext: 'xlsx', sizeBytes: 1024, mtimeMs: 3, cloudOnly: false },
]

const CHATS: ProjectChatListItem[] = [
  {
    id: 'c1',
    title: 'Plan review',
    updatedAt: '2026-10-29T10:00:00.000Z',
    lastEditor: 'docs',
    foreign: false,
  },
  {
    id: 'c2',
    title: 'Asked at home',
    updatedAt: '2026-10-28T10:00:00.000Z',
    lastEditor: 'home',
    foreign: true,
  },
]

type FakeBridge = { [K in keyof ProjectFolderApi]: ReturnType<typeof vi.fn> }

function fakeBridge(
  detail: (id: string) => ProjectDetail = (id) =>
    detailOf(PROJECTS.find((p) => p.id === id) ?? PROJECTS[0]!),
) {
  const screenListeners: Array<(event: OpenProjectScreenEvent) => void> = []
  const changeListeners: Array<(event: ProjectChangedEvent) => void> = []
  const bridge = {
    listProjects: vi.fn(async () => PROJECTS),
    addFolder: vi.fn(async () => ({ status: 'cancelled', stage: 'dialog' })),
    getDefaultParentFolder: vi.fn(async () => 'C:\\Users\\me\\Documents\\IeumOffice'),
    createProject: vi.fn(async ({ name }: { name: string }) => ({
      status: 'created',
      project: item({ id: 'made', name }),
    })),
    removeFromList: vi.fn(async () => undefined),
    setPinned: vi.fn(async () => undefined),
    renameProject: vi.fn(async () => ({ status: 'ok' })),
    relocateProject: vi.fn(async () => ({ status: 'cancelled', stage: 'dialog' })),
    openInFileManager: vi.fn(async () => undefined),
    retryUnwritable: vi.fn(async () => ({ status: 'ok' })),
    getSelection: vi.fn(),
    setSelection: vi.fn(),
    adoptFolderHint: vi.fn(),
    readContext: vi.fn(),
    openScope: vi.fn(async () => 'scope-1'),
    closeScope: vi.fn(async () => undefined),
    listFiles: vi.fn(async () => ({ files: FILES, total: FILES.length })),
    search: vi.fn(),
    read: vi.fn(),
    remember: vi.fn(),
    editMemory: vi.fn(async ({ change }: { change: unknown }) => ({ status: 'ok', change })),
    saveMemory: vi.fn(async () => ({ status: 'ok' })),
    applyMemoryConsolidation: vi.fn(async () => ({
      status: 'ok',
      before: 2,
      after: 1,
      backupName: 'memory.20261030-101500.bak.md',
    })),
    undoMemoryConsolidation: vi.fn(async () => ({ status: 'ok', entries: 2 })),
    listChats: vi.fn(async () => ({ chats: CHATS, legacy: null })),
    newChat: vi.fn(),
    openChat: vi.fn(),
    appendChat: vi.fn(),
    renameChat: vi.fn(async () => ({ status: 'ok' })),
    deleteChat: vi.fn(async () => ({ status: 'ok' })),
    attachDocument: vi.fn(),
    openDocumentChat: vi.fn(async () => undefined),
    onChatMessageAppended: vi.fn(() => () => undefined),
    onOpenChat: vi.fn(() => () => undefined),
    getProjectDetail: vi.fn(async ({ projectId }: { projectId: string }) => detail(projectId)),
    getSettings: vi.fn(),
    setSettings: vi.fn(async ({ settings }: { settings: object }) => ({
      memoryEnabled: true,
      readAgentsFiles: true,
      ...settings,
    })),
    decideTrust: vi.fn(async () => ({ status: 'ok', trust: 'use' })),
    saveInstructions: vi.fn(async () => ({ status: 'ok' })),
    addIgnore: vi.fn(async () => ({ status: 'ok' })),
    removeIgnore: vi.fn(async () => ({ status: 'ok' })),
    listIgnoredFiles: vi.fn(async () => IGNORED),
    openProjectScreen: vi.fn(),
    onOpenProjectScreen: vi.fn((listener: (event: OpenProjectScreenEvent) => void) => {
      screenListeners.push(listener)
      return () => undefined
    }),
    onProjectChanged: vi.fn((listener: (event: ProjectChangedEvent) => void) => {
      changeListeners.push(listener)
      return () => {
        changeListeners.splice(changeListeners.indexOf(listener), 1)
      }
    }),
  } satisfies FakeBridge
  /** main says a window of the app wrote part of a project */
  const announce = async (event: ProjectChangedEvent): Promise<void> => {
    await act(async () => {
      for (const listener of [...changeListeners]) listener(event)
    })
    await flush()
  }
  return { bridge, api: bridge as unknown as ProjectFolderApi, screenListeners, announce }
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve()
  })
}

async function render(props: Partial<ProjectsPanelProps> & { bridge: ProjectFolderApi }) {
  const all: ProjectsPanelProps = {
    aiSettings: null,
    statuses: {},
    noticeDue: false,
    onOpenAiSettings: vi.fn(),
    onOpenHomeAsk: vi.fn(),
    ...props,
  }
  await act(async () => {
    root.render(createElement(LocaleProvider, { initial: 'en' }, createElement(ProjectsPanel, all)))
  })
  await flush()
  return all
}

function buttons(): HTMLButtonElement[] {
  return [...host.querySelectorAll('button')]
}

function buttonNamed(name: string, within: ParentNode = host): HTMLButtonElement {
  const found = [...within.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === name || b.getAttribute('aria-label') === name,
  )
  if (!found) {
    throw new Error(
      `no button "${name}" among: ${buttons()
        .map((b) => b.getAttribute('aria-label') ?? b.textContent)
        .join(' | ')}`,
    )
  }
  return found
}

async function click(button: HTMLElement): Promise<void> {
  await act(async () => button.click())
  await flush()
}

/** Set a controlled input's value the way React notices */
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function rowOf(attr: string, value: string): HTMLElement {
  const row = [...host.querySelectorAll<HTMLElement>(`[${attr}]`)].find(
    (el) => el.getAttribute(attr) === value,
  )
  if (!row) throw new Error(`no row ${attr}=${value}`)
  return row
}

async function openProject(name: string): Promise<void> {
  const main = [...host.querySelectorAll<HTMLButtonElement>('.projects-row-main')].find((b) =>
    b.textContent?.includes(name),
  )
  if (!main) throw new Error(`no project row ${name}`)
  await click(main)
}

async function openTab(name: string): Promise<void> {
  const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (b) => b.textContent === name,
  )
  if (!tab) throw new Error(`no tab ${name}`)
  await click(tab)
}

function selectedTab(): string | null | undefined {
  return host.querySelector('[role="tab"][aria-selected="true"]')?.textContent
}

describe('project list', () => {
  it('shows pinned projects first in name order, then the rest by last use', async () => {
    const { api } = fakeBridge()
    await render({ bridge: api })
    const names = [...host.querySelectorAll('.projects-row-name')].map((n) => n.textContent)
    expect(names).toEqual(['Annual', 'Budget', 'New plan', 'Old report'])
    const groups = [...host.querySelectorAll('.projects-group-title')].map((n) => n.textContent)
    expect(groups).toEqual(['Pinned', 'Recent'])
  })

  it('offers pin, open folder and remove as buttons on every row (keyboard reachable)', async () => {
    const { bridge, api } = fakeBridge()
    await render({ bridge: api })
    const row = rowOf('data-project-id', 'new')
    const actions = [...row.querySelectorAll('.projects-row-actions button')]
    expect(actions.length).toBe(3)
    for (const action of actions) expect((action as HTMLButtonElement).tabIndex).toBe(0)

    await click(buttonNamed('Pin: New plan', row))
    expect(bridge.setPinned).toHaveBeenCalledWith({ projectId: 'new', pinned: true })
    await click(buttonNamed('Unpin: Annual', rowOf('data-project-id', 'pin-a')))
    expect(bridge.setPinned).toHaveBeenCalledWith({ projectId: 'pin-a', pinned: false })
    await click(buttonNamed('Open in File Explorer: New plan', rowOf('data-project-id', 'new')))
    expect(bridge.openInFileManager).toHaveBeenCalledWith({ projectId: 'new' })
    await click(buttonNamed('Remove from list: New plan', rowOf('data-project-id', 'new')))
    expect(bridge.removeFromList).toHaveBeenCalledWith({ projectId: 'new' })
  })

  it('creates a project under the default folder or somewhere else, then opens it', async () => {
    const { bridge, api } = fakeBridge()
    await render({ bridge: api })
    await click(buttonNamed('New project'))
    const input = host.querySelector<HTMLInputElement>('.projects-create input')!
    await type(input, '  Thesis  ')
    expect(host.querySelector('.projects-location')?.textContent).toContain(
      'C:\\Users\\me\\Documents\\IeumOffice\\Thesis',
    )
    await click(buttonNamed('Create somewhere else…'))
    expect(bridge.createProject).toHaveBeenLastCalledWith({ name: 'Thesis', otherPlace: true })
    // the created project opens at once
    expect(bridge.getProjectDetail).toHaveBeenCalledWith({ projectId: 'made' })

    await click(buttonNamed('All projects'))
    await click(buttonNamed('New project'))
    await type(host.querySelector<HTMLInputElement>('.projects-create input')!, 'Thesis')
    await click(buttonNamed('Create'))
    expect(bridge.createProject).toHaveBeenLastCalledWith({ name: 'Thesis' })
  })

  it('says why a folder was refused', async () => {
    const { bridge, api } = fakeBridge()
    bridge.addFolder.mockResolvedValue({ status: 'refused', reason: 'user-home' })
    await render({ bridge: api })
    await click(buttonNamed('Use an existing folder'))
    expect(bridge.addFolder).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('user folder')
  })

  it('offers to choose a missing folder again instead of opening it', async () => {
    const { bridge, api } = fakeBridge()
    bridge.listProjects.mockResolvedValue([item({ id: 'gone', name: 'Gone', missing: true })])
    await render({ bridge: api })
    await openProject('Gone')
    expect(bridge.relocateProject).toHaveBeenCalledWith({ projectId: 'gone' })
    expect(bridge.getProjectDetail).not.toHaveBeenCalled()
  })
})

describe('project header', () => {
  it('renames in project.json only, through renameProject', async () => {
    const { bridge, api } = fakeBridge()
    await render({ bridge: api })
    await openProject('New plan')
    const name = host.querySelector<HTMLInputElement>('.projects-name-field input')!
    expect(name.value).toBe('New plan')
    await type(name, 'Spring plan')
    await click(buttonNamed('Save name'))
    expect(bridge.renameProject).toHaveBeenCalledWith({ projectId: 'new', name: 'Spring plan' })
  })

  it('offers "Use instructions too" when used without them, and retry when unwritable', async () => {
    const { bridge, api } = fakeBridge((id) =>
      detailOf(item({ id, name: 'Shared', unwritable: true }), { trust: 'without' }),
    )
    bridge.listProjects.mockResolvedValue([item({ id: 'sh', name: 'Shared', unwritable: true })])
    await render({ bridge: api })
    await openProject('Shared')
    expect(host.querySelector('.projects-trust-state')?.textContent).toBe(
      'Status: using without instructions',
    )
    await click(buttonNamed('Use instructions too'))
    expect(bridge.decideTrust).toHaveBeenCalledWith({ projectId: 'sh', decision: 'use' })
    await click(buttonNamed('Try again'))
    expect(bridge.retryUnwritable).toHaveBeenCalledWith({ projectId: 'sh' })
    await click(buttonNamed('Open in File Explorer'))
    expect(bridge.openInFileManager).toHaveBeenCalledWith({ projectId: 'sh' })
  })
})

describe('instructions', () => {
  it('saves the edited text and switches the root AGENTS.md / CLAUDE.md reading', async () => {
    const { bridge, api } = fakeBridge((id) =>
      detailOf(item({ id, name: 'New plan' }), { agents: '# Agents rules', claude: null }),
    )
    await render({ bridge: api })
    await openProject('New plan')
    expect(selectedTab()).toBe('Instructions')
    const text = host.querySelector<HTMLTextAreaElement>('.projects-textarea')!
    expect(text.value).toBe('Write formally.')
    await type(text, 'Write formally. Use metric units.')
    await click(buttonNamed('Save'))
    expect(bridge.saveInstructions).toHaveBeenCalledWith({
      projectId: 'new',
      text: 'Write formally. Use metric units.',
    })
    expect(host.textContent).toContain('# Agents rules')
    const toggle = host.querySelector<HTMLInputElement>('.projects-also input[type="checkbox"]')!
    expect(toggle.checked).toBe(true)
    await click(toggle)
    expect(bridge.setSettings).toHaveBeenCalledWith({
      projectId: 'new',
      settings: { readAgentsFiles: false },
    })
  })
})

describe('memory', () => {
  it('deletes one entry as the person, saves an edit of all, and switches memory off', async () => {
    const { bridge, api } = fakeBridge()
    await render({ bridge: api })
    await openProject('New plan')
    await openTab('Memory')
    expect(host.textContent).toContain('2 entries · 80 characters')
    await click(buttonNamed('Delete this memory: Use bullets. (2026-10-02)'))
    expect(bridge.editMemory).toHaveBeenCalledWith({
      projectId: 'new',
      change: { op: 'remove', text: 'Use bullets. (2026-10-02)' },
    })

    await click(buttonNamed('Edit all'))
    const all = host.querySelector<HTMLTextAreaElement>('.projects-textarea')!
    await type(all, '- Only this. (2026-10-30)\n')
    await click(buttonNamed('Save'))
    expect(bridge.saveMemory).toHaveBeenCalledWith({
      projectId: 'new',
      text: '- Only this. (2026-10-30)\n',
    })

    await click(host.querySelector<HTMLInputElement>('.projects-switch input')!)
    expect(bridge.setSettings).toHaveBeenCalledWith({
      projectId: 'new',
      settings: { memoryEnabled: false },
    })
  })

  it('shows sync conflict copies', async () => {
    const { api } = fakeBridge((id) =>
      detailOf(item({ id, name: 'New plan' }), {
        memoryConflictCopies: ['memory-DESKTOP-1.md'],
      }),
    )
    await render({ bridge: api })
    await openProject('New plan')
    await openTab('Memory')
    expect(host.textContent).toContain('There are sync conflict copies: memory-DESKTOP-1.md')
  })

  it('tidies up through the transport only on the click, then undoes it', async () => {
    const { bridge, api } = fakeBridge()
    const settings: AiSettings = { ...defaultAiSettings(), subscriptionNoticeSeen: true }
    const requests: AgentStreamRequest[] = []
    const transport: AgentTransport = {
      stream: vi.fn((request: AgentStreamRequest, cb) => {
        requests.push(request)
        queueMicrotask(() => {
          cb.onDelta('- The deadline is Friday. (2026-10-20)')
          cb.onDone()
        })
        return { cancel: () => undefined }
      }),
    }
    await render({
      bridge: api,
      aiSettings: settings,
      statuses: {
        'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
      },
      readSettings: async () => settings,
      createTransport: () => transport,
    })
    await openProject('New plan')
    await openTab('Memory')
    expect(transport.stream).not.toHaveBeenCalled()
    await click(buttonNamed('Tidy up'))
    await flush()
    expect(transport.stream).toHaveBeenCalledTimes(1)
    expect(requests[0]?.tools ?? []).toEqual([])
    expect(bridge.applyMemoryConsolidation).toHaveBeenCalledWith({
      projectId: 'new',
      entries: ['The deadline is Friday. (2026-10-20)'],
    })
    expect(host.textContent).toContain('(2 → 1')
    await click(buttonNamed('Undo'))
    expect(bridge.undoMemoryConsolidation).toHaveBeenCalledWith({
      projectId: 'new',
      backupName: 'memory.20261030-101500.bak.md',
    })
    expect(host.textContent).toContain('Back to how it was before tidying up.')
  })

  it('sends nothing while nothing is connected and points to the AI settings', async () => {
    const { bridge, api } = fakeBridge()
    const consolidate = vi.fn(async (options: { gate: () => { kind: string } }) => {
      const gate = options.gate()
      return gate.kind === 'run'
        ? ({ status: 'nothing' } as const)
        : ({ status: 'not-ready', gate } as never)
    })
    const onOpenAiSettings = vi.fn()
    const settings = defaultAiSettings()
    await render({
      bridge: api,
      aiSettings: settings,
      statuses: {
        'claude-code': { provider: 'claude-code', state: 'not-installed', meteredAccepted: false },
        codex: { provider: 'codex', state: 'not-installed', meteredAccepted: false },
      },
      readSettings: async () => settings,
      consolidate: consolidate as never,
      onOpenAiSettings,
    })
    await openProject('New plan')
    await openTab('Memory')
    await click(buttonNamed('Tidy up'))
    expect(consolidate).toHaveBeenCalledTimes(1)
    expect(bridge.applyMemoryConsolidation).not.toHaveBeenCalled()
    await click(buttonNamed('Open AI settings'))
    expect(onOpenAiSettings).toHaveBeenCalledTimes(1)
  })

  it('waits behind the first-connection notice without running', async () => {
    const { api } = fakeBridge()
    const consolidate = vi.fn()
    const onNoticeNeeded = vi.fn()
    await render({ bridge: api, noticeDue: true, consolidate, onNoticeNeeded })
    await openProject('New plan')
    await openTab('Memory')
    await click(buttonNamed('Tidy up'))
    expect(consolidate).not.toHaveBeenCalled()
    expect(onNoticeNeeded).toHaveBeenCalledTimes(1)
  })
})

describe('files', () => {
  it('lists what the AI sees through a scope, hides one, and restores an ignored one', async () => {
    const { bridge, api } = fakeBridge()
    await render({ bridge: api })
    await openProject('New plan')
    await openTab('Files')
    expect(bridge.openScope).toHaveBeenCalledWith({ projectId: 'new' })
    expect(bridge.listFiles).toHaveBeenCalledWith({ scope: 'scope-1', offset: 0, limit: 200 })
    expect(bridge.closeScope).toHaveBeenCalledWith({ scope: 'scope-1' })
    const cloud = rowOf('data-rel-path', 'cloud/notes.pdf')
    expect(cloud.textContent).toContain('Not on this PC')
    expect(cloud.textContent).toContain('PDF')
    expect(rowOf('data-rel-path', 'plan.docx').textContent).toContain('20 KB')

    await click(buttonNamed('Hide from AI: plan.docx'))
    expect(bridge.addIgnore).toHaveBeenCalledWith({ projectId: 'new', relPath: 'plan.docx' })

    const ignored = host.querySelector('.projects-ignored-list')!
    expect(ignored.textContent).toContain('secret.xlsx')
    await click(buttonNamed('Undo: secret.xlsx'))
    expect(bridge.removeIgnore).toHaveBeenCalledWith({ projectId: 'new', relPath: 'secret.xlsx' })
  })

  it('reads the next page on "Show more"', async () => {
    const { bridge, api } = fakeBridge()
    bridge.listFiles.mockResolvedValueOnce({ files: FILES, total: 3 }).mockResolvedValueOnce({
      files: [{ relPath: 'z.md', ext: 'md', sizeBytes: 10, mtimeMs: 0, cloudOnly: false }],
      total: 3,
    })
    await render({ bridge: api })
    await openProject('New plan')
    await openTab('Files')
    await click(buttonNamed('Show more'))
    expect(bridge.listFiles).toHaveBeenLastCalledWith({ scope: 'scope-1', offset: 2, limit: 200 })
    expect(host.querySelectorAll('.projects-file-list .projects-row').length).toBe(3)
  })
})

describe('chats', () => {
  it('opens a chat through openDocumentChat; a home chat also shows the ask panel', async () => {
    const { bridge, api } = fakeBridge()
    const props = await render({ bridge: api })
    await openProject('New plan')
    await openTab('Chats')
    expect(bridge.listChats).toHaveBeenCalledWith({ projectId: 'new' })
    const home = rowOf('data-chat-id', 'c2')
    expect(home.textContent).toContain('Other PC')
    expect(home.textContent).toContain('Home')

    await click(rowOf('data-chat-id', 'c1').querySelector<HTMLButtonElement>('.projects-row-main')!)
    expect(bridge.openDocumentChat).toHaveBeenCalledWith({ projectId: 'new', chatId: 'c1' })
    expect(props.onOpenHomeAsk).not.toHaveBeenCalled()

    await click(home.querySelector<HTMLButtonElement>('.projects-row-main')!)
    expect(bridge.openDocumentChat).toHaveBeenCalledWith({ projectId: 'new', chatId: 'c2' })
    expect(props.onOpenHomeAsk).toHaveBeenCalledTimes(1)
    expect(props.onOpenHomeAsk).toHaveBeenCalledWith({ projectId: 'new', chatId: 'c2' })
  })

  it('shows the ask panel when main hands an editor chat to the home window', async () => {
    const { bridge, api } = fakeBridge()
    // main finds no document to open the chat in and hands it here while the call runs
    let listener: ((event: { projectId: string; chatId: string }) => void) | null = null
    bridge.onOpenChat.mockImplementation((next: typeof listener) => {
      listener = next
      return () => {
        listener = null
      }
    })
    bridge.openDocumentChat.mockImplementation(
      async (ref: { projectId: string; chatId: string }) => {
        listener?.(ref)
      },
    )
    const props = await render({ bridge: api })
    await openProject('New plan')
    await openTab('Chats')
    await click(rowOf('data-chat-id', 'c1').querySelector<HTMLButtonElement>('.projects-row-main')!)
    expect(props.onOpenHomeAsk).toHaveBeenCalledWith({ projectId: 'new', chatId: 'c1' })
    // it listened only while asking
    expect(listener).toBeNull()
  })

  it('renames a chat and deletes one only after the confirm', async () => {
    const { bridge, api } = fakeBridge()
    await render({ bridge: api })
    await openProject('New plan')
    await openTab('Chats')
    await click(buttonNamed('Rename: Plan review'))
    const input = host.querySelector<HTMLInputElement>('.projects-inline-input')!
    await type(input, 'Plan, second pass')
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()
    expect(bridge.renameChat).toHaveBeenCalledWith({
      projectId: 'new',
      chatId: 'c1',
      title: 'Plan, second pass',
    })

    await click(buttonNamed('Delete: Plan review'))
    expect(bridge.deleteChat).not.toHaveBeenCalled()
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.textContent).toContain('Plan review')
    await click(buttonNamed('Cancel', dialog))
    expect(bridge.deleteChat).not.toHaveBeenCalled()
    await click(buttonNamed('Delete: Plan review'))
    await click(buttonNamed('Delete', host.querySelector('[role="dialog"]')!))
    expect(bridge.deleteChat).toHaveBeenCalledWith({ projectId: 'new', chatId: 'c1' })
  })
})

describe('"show the project screen" requests', () => {
  it('turns each onOpenProjectScreen event into a numbered request', () => {
    const { api, screenListeners } = fakeBridge()
    const seen: ProjectScreenRequest[] = []
    subscribeProjectScreen(api, (request) => seen.push(request))
    screenListeners[0]!({ projectId: 'new', section: 'memory' })
    screenListeners[0]!({ projectId: 'new' })
    expect(seen).toEqual([
      { projectId: 'new', section: 'memory', seq: 1 },
      { projectId: 'new', seq: 2 },
    ])
    expect(subscribeProjectScreen(null, () => undefined)).toBeTypeOf('function')
  })

  it('opens the asked project at the asked section', async () => {
    const { bridge, api } = fakeBridge()
    await render({ bridge: api, request: { projectId: 'old', section: 'memory', seq: 1 } })
    expect(bridge.getProjectDetail).toHaveBeenCalledWith({ projectId: 'old' })
    expect(host.querySelector<HTMLInputElement>('.projects-name-field input')?.value).toBe(
      'Old report',
    )
    expect(selectedTab()).toBe('Memory')
    expect(host.querySelector('[role="tabpanel"]')?.getAttribute('data-section')).toBe('memory')

    // a later request for the same project moves to the other section
    await render({ bridge: api, request: { projectId: 'old', section: 'instructions', seq: 2 } })
    expect(selectedTab()).toBe('Instructions')
  })
})

describe('the screen follows the folder (no stale text, no silent overwrite)', () => {
  it('reads the project again for a new [View] request and shows what changed outside', async () => {
    let instructions = 'Write formally.'
    const { bridge, api } = fakeBridge((id) =>
      detailOf(item({ id, name: 'Old report' }), { instructions }),
    )
    await render({ bridge: api, request: { projectId: 'old', section: 'instructions', seq: 1 } })
    const box = () => host.querySelector<HTMLTextAreaElement>('.projects-textarea')!
    expect(box().value).toBe('Write formally.')
    instructions = 'Write formally.\nDates as 2026. 10. 30.'
    const reads = bridge.getProjectDetail.mock.calls.length
    await render({ bridge: api, request: { projectId: 'old', section: 'instructions', seq: 2 } })
    expect(bridge.getProjectDetail.mock.calls.length).toBeGreaterThan(reads)
    expect(box().value).toBe('Write formally.\nDates as 2026. 10. 30.')
  })

  it('shows memory another window wrote without leaving the screen', async () => {
    let entries = ['The deadline is Friday. (2026-10-20)']
    const { api, announce } = fakeBridge((id) =>
      detailOf(item({ id, name: 'New plan' }), { memoryEntries: entries }),
    )
    await render({ bridge: api })
    await openProject('New plan')
    await openTab('Memory')
    entries = [...entries, 'Approvals on Tuesday. (2026-10-30)']
    await announce({ projectId: 'other', part: 'memory' })
    expect(host.querySelector('.projects-memory-list')?.textContent).not.toContain('Tuesday')
    await announce({ projectId: 'new', part: 'memory' })
    expect(host.querySelector('.projects-memory-list')?.textContent).toContain('Tuesday')
  })

  it('reads again when the window comes back to the front', async () => {
    const { bridge, api } = fakeBridge()
    await render({ bridge: api })
    await openProject('New plan')
    const reads = bridge.getProjectDetail.mock.calls.length
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await flush()
    expect(bridge.getProjectDetail.mock.calls.length).toBe(reads + 1)
  })

  it('keeps an edited draft when the file changes, and asks before writing over it', async () => {
    let instructions = 'Write formally.'
    const { bridge, api, announce } = fakeBridge((id) =>
      detailOf(item({ id, name: 'New plan' }), { instructions }),
    )
    await render({ bridge: api })
    await openProject('New plan')
    const box = host.querySelector<HTMLTextAreaElement>('.projects-textarea')!
    await type(box, 'Write formally. Use tables.')
    // someone changes the file meanwhile; the edited draft stays as typed
    instructions = 'Write formally. Dates as 2026. 10. 30.'
    await announce({ projectId: 'new', part: 'instructions' })
    expect(box.value).toBe('Write formally. Use tables.')
    await click(buttonNamed('Save'))
    expect(bridge.saveInstructions).not.toHaveBeenCalled()
    expect(host.textContent).toContain('This file changed elsewhere while you were editing it.')

    await click(buttonNamed('Reload'))
    expect(host.querySelector<HTMLTextAreaElement>('.projects-textarea')!.value).toBe(
      'Write formally. Dates as 2026. 10. 30.',
    )
    expect(bridge.saveInstructions).not.toHaveBeenCalled()

    await type(host.querySelector<HTMLTextAreaElement>('.projects-textarea')!, 'Mine.')
    instructions = 'Theirs.'
    await click(buttonNamed('Save'))
    await click(buttonNamed('Save anyway'))
    expect(bridge.saveInstructions).toHaveBeenCalledWith({ projectId: 'new', text: 'Mine.' })
  })

  it('saves at once when the file did not change, and follows the file while the draft is untouched', async () => {
    let instructions = 'Write formally.'
    const { bridge, api, announce } = fakeBridge((id) =>
      detailOf(item({ id, name: 'New plan' }), { instructions }),
    )
    await render({ bridge: api })
    await openProject('New plan')
    instructions = 'Changed outside.'
    await announce({ projectId: 'new', part: 'instructions' })
    const box = host.querySelector<HTMLTextAreaElement>('.projects-textarea')!
    expect(box.value).toBe('Changed outside.')
    await type(box, 'Changed outside. Plus mine.')
    await click(buttonNamed('Save'))
    expect(bridge.saveInstructions).toHaveBeenCalledWith({
      projectId: 'new',
      text: 'Changed outside. Plus mine.',
    })
  })

  it('asks before an "edit all" of the memory writes over a change made meanwhile', async () => {
    let memory = '- a (2026-10-30)\n'
    const { bridge, api } = fakeBridge((id) =>
      detailOf(item({ id, name: 'New plan' }), { memory, memoryEntries: ['a (2026-10-30)'] }),
    )
    await render({ bridge: api })
    await openProject('New plan')
    await openTab('Memory')
    await click(buttonNamed('Edit all'))
    await type(host.querySelector<HTMLTextAreaElement>('.projects-textarea')!, '- mine\n')
    memory = '- a (2026-10-30)\n- b (2026-10-30)\n'
    await click(buttonNamed('Save'))
    expect(bridge.saveMemory).not.toHaveBeenCalled()
    await click(buttonNamed('Save anyway'))
    expect(bridge.saveMemory).toHaveBeenCalledWith({ projectId: 'new', text: '- mine\n' })
  })
})

describe('the rest of the first-use fixes', () => {
  it('opens a project the create or add led to that was already listed, and says so', async () => {
    const { bridge, api } = fakeBridge()
    bridge.createProject.mockResolvedValueOnce({
      status: 'added',
      project: item({ id: 'old', name: 'Old report' }),
      identity: 'existing',
      notices: [],
    } as never)
    await render({ bridge: api })
    await click(buttonNamed('New project'))
    await type(host.querySelector<HTMLInputElement>('.projects-create input')!, 'Old report')
    await click(buttonNamed('Create'))
    expect(host.querySelector<HTMLInputElement>('.projects-name-field input')?.value).toBe(
      'Old report',
    )
    expect(host.textContent).toContain('This project is already in the list')
  })

  it('opens a file of the file list in the app', async () => {
    const { api } = fakeBridge()
    const onOpenPath = vi.fn()
    await render({ bridge: api, onOpenPath })
    await openProject('New plan')
    await openTab('Files')
    await click(buttonNamed('Open in the app: cloud/notes.pdf'))
    expect(onOpenPath).toHaveBeenCalledWith('D:\\work\\New plan\\cloud\\notes.pdf')
  })

  it('builds a file path from the folder and the relative path', () => {
    expect(projectFilePath('D:\\work\\P', 'a/b.md')).toBe('D:\\work\\P\\a\\b.md')
    expect(projectFilePath('/home/me/P/', 'a/../b.md')).toBe('/home/me/P/a/b.md')
  })

  it('says the trust state as a status line', async () => {
    const { api } = fakeBridge()
    await render({ bridge: api })
    await openProject('New plan')
    expect(host.querySelector('.projects-trust-state')?.textContent).toBe(
      'Status: sending instructions and memory to the AI',
    )
  })
})
