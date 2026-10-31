import { vi } from 'vitest'
import type {
  AppendProjectChatArgs,
  ProjectChangedEvent,
  ProjectChatAppendedEvent,
  ProjectChatInfo,
  ProjectChatMessage,
  ProjectContextBundle,
  ProjectFolderApi,
  ProjectSelection,
  OpenProjectChatEvent,
} from '@genoffice/project-store'

/** A project context bundle with sensible defaults */
export function contextBundle(patch: Partial<ProjectContextBundle> = {}): ProjectContextBundle {
  return {
    projectId: 'p1',
    name: 'Report 2026',
    trust: 'use',
    instructions: { text: 'Write in short bullet points.', sources: ['instructions'] },
    memory: {
      text: '<!-- header -->\n- The deadline is Friday. (2026-10-20)',
      chars: 50,
    },
    files: [
      {
        relPath: 'notes.md',
        ext: 'md',
        sizeBytes: 1200,
        mtimeMs: Date.UTC(2026, 9, 28),
        cloudOnly: false,
      },
      {
        relPath: 'docs/plan.docx',
        ext: 'docx',
        sizeBytes: 9000,
        mtimeMs: Date.UTC(2026, 9, 1),
        cloudOnly: true,
      },
    ],
    filesOmitted: 0,
    canRemember: true,
    notices: [],
    ...patch,
  }
}

export function chatInfo(patch: Partial<ProjectChatInfo> = {}): ProjectChatInfo {
  return {
    version: 1,
    id: 'c1',
    projectId: 'p1',
    title: 'First chat',
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
    origin: 'install-a',
    lastEditor: 'docs',
    documents: [],
    ...patch,
  }
}

export function chatMessage(patch: Partial<ProjectChatMessage> = {}): ProjectChatMessage {
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

/**
 * A bridge whose every call is a mock; tests change the answers through the
 * returned `state` and fire main's events through `emitAppended` / `emitOpenChat`.
 */
export function fakeProjectBridge(
  init: {
    selection?: ProjectSelection
    context?: ProjectContextBundle
    chats?: Record<string, ProjectChatMessage[]>
  } = {},
) {
  const state = {
    selection: init.selection ?? { projectId: null, initialChatId: null },
    context: init.context ?? contextBundle(),
    chats: init.chats ?? ({} as Record<string, ProjectChatMessage[]>),
    appendStatus: 'saved' as 'saved' | 'pending' | 'unwritable',
    seq: 100,
    nextChatId: 1,
  }
  const appended: AppendProjectChatArgs[] = []
  let appendedListener: ((e: ProjectChatAppendedEvent) => void) | null = null
  let openChatListener: ((e: OpenProjectChatEvent) => void) | null = null
  let changedListener: ((e: ProjectChangedEvent) => void) | null = null
  let scopes = 0
  const bridge = {
    listProjects: vi.fn(async () => []),
    addFolder: vi.fn(),
    getDefaultParentFolder: vi.fn(async () => ''),
    createProject: vi.fn(),
    removeFromList: vi.fn(async () => undefined),
    setPinned: vi.fn(async () => undefined),
    renameProject: vi.fn(async () => ({ status: 'ok' as const })),
    relocateProject: vi.fn(),
    openInFileManager: vi.fn(async () => undefined),
    retryUnwritable: vi.fn(async () => ({ status: 'ok' as const })),
    getSelection: vi.fn(async () => state.selection),
    setSelection: vi.fn(async ({ projectId }: { projectId: string | null }) => {
      state.selection = { projectId, initialChatId: null }
      return state.selection
    }),
    adoptFolderHint: vi.fn(),
    readContext: vi.fn(async ({ projectId }: { projectId: string }) => ({
      status: 'ok' as const,
      context: { ...state.context, projectId },
    })),
    openScope: vi.fn(
      async ({ projectId }: { projectId: string }) => `scope-${projectId}-${++scopes}`,
    ),
    closeScope: vi.fn(async () => undefined),
    listFiles: vi.fn(async () => ({
      files: state.context.files,
      total: state.context.files.length,
    })),
    search: vi.fn(async () => ({
      hits: [
        {
          relPath: 'notes.md',
          name: 'notes.md',
          ext: 'md',
          mtimeMs: Date.UTC(2026, 9, 28),
          cloudOnly: false,
          snippet: 'the deadline is Friday',
        },
      ],
      total: 1,
    })),
    read: vi.fn(async () => ({
      status: 'ok' as const,
      text: 'file body',
      totalChars: 9,
      offset: 0,
    })),
    remember: vi.fn(async ({ change }: { change: unknown }) => ({ status: 'ok' as const, change })),
    editMemory: vi.fn(async ({ change }: { change: unknown }) => ({
      status: 'ok' as const,
      change,
    })),
    saveMemory: vi.fn(async () => ({ status: 'ok' as const })),
    applyMemoryConsolidation: vi.fn(async ({ entries }: { entries: string[] }) => ({
      status: 'ok' as const,
      before: 3,
      after: entries.length,
      backupName: 'memory.20261029-101010.bak.md',
    })),
    undoMemoryConsolidation: vi.fn(async () => ({ status: 'ok' as const, entries: 3 })),
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
        info: chatInfo({ id: chatId, projectId }),
        messages,
        foreign: false,
      }
    }),
    appendChat: vi.fn(async (args: AppendProjectChatArgs) => {
      appended.push(args)
      if (state.appendStatus === 'unwritable') return { status: 'unwritable' as const }
      const message = chatMessage({
        seq: ++state.seq,
        role: args.role,
        text: args.text,
        ...(args.tools ? { tools: args.tools } : {}),
      })
      return { status: state.appendStatus, message }
    }),
    renameChat: vi.fn(async () => ({ status: 'ok' as const })),
    deleteChat: vi.fn(async () => ({ status: 'ok' as const })),
    openDocumentChat: vi.fn(async () => undefined),
    onChatMessageAppended: vi.fn((listener: (e: ProjectChatAppendedEvent) => void) => {
      appendedListener = listener
      return () => {
        appendedListener = null
      }
    }),
    onOpenChat: vi.fn((listener: (e: OpenProjectChatEvent) => void) => {
      openChatListener = listener
      return () => {
        openChatListener = null
      }
    }),
    getProjectDetail: vi.fn(),
    getSettings: vi.fn(),
    setSettings: vi.fn(),
    decideTrust: vi.fn(),
    saveInstructions: vi.fn(),
    addIgnore: vi.fn(),
    removeIgnore: vi.fn(),
    listIgnoredFiles: vi.fn(async () => []),
    openProjectScreen: vi.fn(async () => undefined),
    onOpenProjectScreen: vi.fn(() => () => undefined),
    onProjectChanged: vi.fn((listener: (e: ProjectChangedEvent) => void) => {
      changedListener = listener
      return () => {
        changedListener = null
      }
    }),
  }
  return {
    bridge: bridge as unknown as ProjectFolderApi & typeof bridge,
    state,
    appended,
    emitAppended: (e: ProjectChatAppendedEvent) => appendedListener?.(e),
    emitOpenChat: (e: OpenProjectChatEvent) => openChatListener?.(e),
    emitProjectChanged: (e: ProjectChangedEvent) => changedListener?.(e),
    get listening() {
      return appendedListener !== null
    },
  }
}

export const flush = () => new Promise((r) => setTimeout(r, 0))
