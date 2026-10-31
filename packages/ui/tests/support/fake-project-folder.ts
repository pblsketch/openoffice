// A fake `window.projectFolderApi` for the AI panel tests of the editors
// (docs, sheets, hwp): one project, one chat, an in-memory record of what the
// panel asked for. Nothing touches a real folder; every call is logged in
// `calls` in the order it was made.
import type {
  AppendProjectChatArgs,
  ProjectContextBundle,
  ProjectEditor,
  ProjectFolderApi,
  ProjectListItem,
} from '@genoffice/project-store'

export interface FakeProjectFolder {
  readonly api: ProjectFolderApi
  /** every bridge call by name, in order (plus whatever the test pushes) */
  readonly calls: string[]
  /** what the panel recorded in the project chat */
  readonly appended: AppendProjectChatArgs[]
  /** chat ids `newChat` handed out */
  readonly newChats: string[]
}

export const FAKE_PROJECT: ProjectListItem = {
  id: 'p1',
  name: 'Quarterly report',
  path: 'C:/work/quarterly',
  pinned: false,
  lastUsedAt: '2026-10-29T00:00:00.000Z',
  missing: false,
  unwritable: false,
  syncFolder: false,
}

const CONTEXT: ProjectContextBundle = {
  projectId: FAKE_PROJECT.id,
  name: FAKE_PROJECT.name,
  trust: 'use',
  instructions: { text: 'Write in plain words.', sources: ['instructions'] },
  memory: null,
  files: [],
  filesOmitted: 0,
  canRemember: true,
  notices: [{ kind: 'memory-long', chars: 9000, limit: 8000 }],
}

/**
 * `selected`: the project the window starts with (null: "no project");
 * `editor`: the editor its recorded messages name
 */
export function fakeProjectFolder(
  selected: string | null,
  editor: ProjectEditor = 'docs',
): FakeProjectFolder {
  const calls: string[] = []
  const appended: AppendProjectChatArgs[] = []
  const newChats: string[] = []
  let seq = 0
  const log =
    <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
    (...args: A): R => {
      calls.push(name)
      return fn(...args)
    }
  const unsubscribe = () => () => undefined
  const api = {
    listProjects: log('listProjects', async () => [FAKE_PROJECT]),
    addFolder: log('addFolder', async () => ({ status: 'cancelled', stage: 'dialog' }) as const),
    getDefaultParentFolder: log('getDefaultParentFolder', async () => 'C:/Users/me/Documents'),
    createProject: log('createProject', async () => ({ status: 'invalid-name' }) as const),
    removeFromList: log('removeFromList', async () => undefined),
    setPinned: log('setPinned', async () => undefined),
    renameProject: log('renameProject', async () => ({ status: 'ok' }) as const),
    relocateProject: log(
      'relocateProject',
      async () => ({ status: 'cancelled', stage: 'dialog' }) as const,
    ),
    openInFileManager: log('openInFileManager', async () => undefined),
    retryUnwritable: log('retryUnwritable', async () => ({ status: 'ok' }) as const),
    getSelection: log('getSelection', async () => ({ projectId: selected, initialChatId: null })),
    setSelection: log('setSelection', async ({ projectId }: { projectId: string | null }) => {
      selected = projectId
      return { projectId, initialChatId: null }
    }),
    adoptFolderHint: log(
      'adoptFolderHint',
      async () => ({ status: 'cancelled', stage: 'dialog' }) as const,
    ),
    readContext: log('readContext', async () => ({ status: 'ok', context: CONTEXT }) as const),
    openScope: log('openScope', async () => 'scope-1'),
    closeScope: log('closeScope', async () => undefined),
    listFiles: log('listFiles', async () => ({ files: [], total: 0 })),
    search: log('search', async () => ({ hits: [], total: 0 })),
    read: log('read', async () => ({ status: 'refused', reason: 'not-found' }) as const),
    remember: log('remember', async () => ({ status: 'refused', reason: 'disabled' }) as const),
    editMemory: log(
      'editMemory',
      async () => ({ status: 'refused', reason: 'not-found' }) as const,
    ),
    saveMemory: log('saveMemory', async () => ({ status: 'ok' }) as const),
    applyMemoryConsolidation: log(
      'applyMemoryConsolidation',
      async () => ({ status: 'unwritable' }) as const,
    ),
    undoMemoryConsolidation: log(
      'undoMemoryConsolidation',
      async () => ({ status: 'no-backup' }) as const,
    ),
    listChats: log('listChats', async () => ({ chats: [], legacy: null })),
    newChat: log('newChat', async () => {
      const chatId = `c${newChats.length + 1}`
      newChats.push(chatId)
      return { chatId }
    }),
    openChat: log('openChat', async () => ({ status: 'not-found' }) as const),
    appendChat: log('appendChat', async (args: AppendProjectChatArgs) => {
      appended.push(args)
      return {
        status: 'pending',
        message: {
          seq: ++seq,
          ts: '2026-10-29T00:00:00.000Z',
          role: args.role,
          text: args.text,
          editor,
          origin: 'this-pc',
        },
      } as const
    }),
    renameChat: log('renameChat', async () => ({ status: 'ok' }) as const),
    deleteChat: log('deleteChat', async () => ({ status: 'ok' }) as const),
    attachDocument: log('attachDocument', async () => ({ status: 'ok' }) as const),
    openDocumentChat: log('openDocumentChat', async () => undefined),
    onChatMessageAppended: unsubscribe,
    onOpenChat: unsubscribe,
    getProjectDetail: log('getProjectDetail', async () => {
      throw new Error('not in this test')
    }),
    getSettings: log('getSettings', async () => {
      throw new Error('not in this test')
    }),
    setSettings: log('setSettings', async () => {
      throw new Error('not in this test')
    }),
    decideTrust: log('decideTrust', async () => {
      throw new Error('not in this test')
    }),
    saveInstructions: log('saveInstructions', async () => ({ status: 'ok' }) as const),
    addIgnore: log('addIgnore', async () => ({ status: 'ok' }) as const),
    removeIgnore: log('removeIgnore', async () => ({ status: 'ok' }) as const),
    listIgnoredFiles: log('listIgnoredFiles', async () => []),
    openProjectScreen: log('openProjectScreen', async () => undefined),
    onOpenProjectScreen: unsubscribe,
  } as unknown as ProjectFolderApi
  return { api, calls, appended, newChats }
}
