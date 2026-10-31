import { vi } from 'vitest'
import type {
  AppendProjectChatArgs,
  ProjectChatAppendedEvent,
  ProjectChatMessage,
  ProjectContextBundle,
  ProjectSelection,
} from '@genoffice/project-store'

/**
 * A fake `window.projectFolderApi` for AI panel tests: every call is a mock,
 * nothing touches a folder. `state` changes the answers; `emitAppended` plays
 * main's "another window recorded a message" event.
 */
export function installProjectFolderBridge(
  init: {
    selection?: ProjectSelection
    context?: Partial<ProjectContextBundle>
    chats?: Record<string, ProjectChatMessage[]>
  } = {},
) {
  const state = {
    selection: init.selection ?? { projectId: null, initialChatId: null },
    chats: init.chats ?? ({} as Record<string, ProjectChatMessage[]>),
    seq: 100,
    nextChatId: 1,
  }
  const context = (projectId: string): ProjectContextBundle => ({
    projectId,
    name: 'Report 2026',
    trust: 'use',
    instructions: { text: 'Write in short bullet points.', sources: ['instructions'] },
    memory: { text: '<!-- header -->\n- The deadline is Friday. (2026-10-20)', chars: 50 },
    files: [{ relPath: 'notes.md', ext: 'md', sizeBytes: 10, mtimeMs: 0, cloudOnly: false }],
    filesOmitted: 0,
    canRemember: true,
    notices: [],
    ...init.context,
  })
  const order: string[] = []
  const appended: AppendProjectChatArgs[] = []
  let appendedListener: ((e: ProjectChatAppendedEvent) => void) | null = null
  let readContextGate: Promise<void> | null = null
  const bridge = {
    listProjects: vi.fn(async () => [
      {
        id: 'p1',
        name: 'Report 2026',
        path: 'C:/work/report',
        pinned: false,
        lastUsedAt: '2026-10-29T00:00:00.000Z',
        missing: false,
        unwritable: false,
        syncFolder: false,
      },
    ]),
    addFolder: vi.fn(async () => ({ status: 'cancelled' as const, stage: 'dialog' as const })),
    getDefaultParentFolder: vi.fn(async () => 'C:/Users/me/Documents/IeumOffice'),
    createProject: vi.fn(async () => ({ status: 'invalid-name' as const })),
    removeFromList: vi.fn(async () => undefined),
    setPinned: vi.fn(async () => undefined),
    relocateProject: vi.fn(async () => ({
      status: 'cancelled' as const,
      stage: 'dialog' as const,
    })),
    openInFileManager: vi.fn(async () => undefined),
    getSelection: vi.fn(async () => state.selection),
    setSelection: vi.fn(async ({ projectId }: { projectId: string | null }) => {
      state.selection = { projectId, initialChatId: null }
      return state.selection
    }),
    adoptFolderHint: vi.fn(async () => ({
      status: 'cancelled' as const,
      stage: 'dialog' as const,
    })),
    readContext: vi.fn(async ({ projectId }: { projectId: string }) => {
      order.push('readContext')
      if (readContextGate) await readContextGate
      return { status: 'ok' as const, context: context(projectId) }
    }),
    openScope: vi.fn(async ({ projectId }: { projectId: string }) => {
      order.push('openScope')
      return `scope-${projectId}`
    }),
    closeScope: vi.fn(async () => {
      order.push('closeScope')
    }),
    listFiles: vi.fn(async () => ({ files: [], total: 0 })),
    search: vi.fn(async () => ({ hits: [], total: 0 })),
    read: vi.fn(async () => ({ status: 'ok' as const, text: '', totalChars: 0, offset: 0 })),
    remember: vi.fn(async ({ change }: { change: unknown }) => ({ status: 'ok' as const, change })),
    editMemory: vi.fn(async ({ change }: { change: unknown }) => ({
      status: 'ok' as const,
      change,
    })),
    listChats: vi.fn(async () => ({
      chats: Object.keys(state.chats).map((id) => ({
        id,
        title: `chat ${id}`,
        updatedAt: '2026-10-29T00:00:00.000Z',
        lastEditor: 'docs' as const,
        foreign: false,
      })),
      legacy: null,
    })),
    newChat: vi.fn(async () => ({ chatId: `new${state.nextChatId++}` })),
    openChat: vi.fn(async ({ projectId, chatId }: { projectId: string; chatId: string }) => {
      const messages = state.chats[chatId]
      if (!messages) return { status: 'not-found' as const }
      return {
        status: 'ok' as const,
        info: {
          version: 1 as const,
          id: chatId,
          projectId,
          title: 'An earlier chat',
          createdAt: '2026-10-29T00:00:00.000Z',
          updatedAt: '2026-10-29T00:00:00.000Z',
          origin: 'install-a',
          lastEditor: 'docs' as const,
          documents: [],
        },
        messages,
        foreign: false,
      }
    }),
    appendChat: vi.fn(async (args: AppendProjectChatArgs) => {
      appended.push(args)
      return {
        status: 'saved' as const,
        message: projectMessage({ seq: ++state.seq, role: args.role, text: args.text }),
      }
    }),
    renameChat: vi.fn(async () => ({ status: 'ok' as const })),
    deleteChat: vi.fn(async () => ({ status: 'ok' as const })),
    attachDocument: vi.fn(async () => ({ status: 'ok' as const })),
    onChatMessageAppended: vi.fn((listener: (e: ProjectChatAppendedEvent) => void) => {
      appendedListener = listener
      return () => {
        appendedListener = null
      }
    }),
    onOpenChat: vi.fn(() => () => undefined),
    openProjectScreen: vi.fn(async () => undefined),
    getProjectDetail: vi.fn(),
    applyMemoryConsolidation: vi.fn(),
    undoMemoryConsolidation: vi.fn(),
  }
  Object.defineProperty(window, 'projectFolderApi', { configurable: true, value: bridge })
  return {
    bridge,
    state,
    order,
    appended,
    /** hold `readContext` until the returned function is called */
    holdReadContext(): () => void {
      let release!: () => void
      readContextGate = new Promise<void>((resolve) => {
        release = () => {
          readContextGate = null
          resolve()
        }
      })
      return release
    },
    emitAppended: (e: ProjectChatAppendedEvent) => appendedListener?.(e),
  }
}

/** A fake per-document chat store (`window.projectApi`), recording what it is given */
export function installDocumentChatStore(stored: ProjectChatMessage[] = []) {
  const store = {
    resolveChat: vi.fn(async () => ({ projectId: 'doc-project', chatId: 'doc-chat' })),
    loadChat: vi.fn(async () => stored),
    appendChat: vi.fn<(args: { role: string; text: string }) => Promise<void>>(
      async () => undefined,
    ),
    rebindChat: vi.fn(async () => null),
  }
  Object.defineProperty(window, 'projectApi', { configurable: true, value: store })
  return store
}

export function removeProjectFolderBridge(): void {
  Object.defineProperty(window, 'projectFolderApi', { configurable: true, value: undefined })
}

export function projectMessage(patch: Partial<ProjectChatMessage> = {}): ProjectChatMessage {
  return {
    seq: 1,
    ts: '2026-10-29T00:00:00.000Z',
    role: 'user',
    text: 'hello',
    editor: 'docs',
    origin: 'install-a',
    ...patch,
  }
}
