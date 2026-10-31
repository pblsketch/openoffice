/** @vitest-environment jsdom */
/**
 * The Excel AI panel with the project folder (spec 5). App.tsx owns the loop
 * and builds the project parts with `useProjectPanel`; the panel draws them.
 * The first part drives the real hook and the real panel against a fake
 * bridge (chip under the input, chat menu, notices of a send, persistence,
 * memory lines, "new chat"). The second pins App.tsx's wiring of the loop,
 * whose workbook runtime cannot be mounted here.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiSettings } from '@genoffice/ai-provider/browser'
import {
  AiChatPanel,
  type AiChatMessage,
  type AiPanelSubscription,
} from '../src/renderer/ai/AiChatPanel'
import { useProjectPanel, type ProjectPanel } from '@genoffice/ui'
import { t } from '../src/renderer/i18n/locale'
import { fakeProjectFolder, type FakeProjectFolder } from './fake-project-folder'

const subscription: AiPanelSubscription = {
  settings: null as AiSettings | null,
  statuses: {},
  connectChoice: null,
  connectAttention: 0,
  noticeDue: false,
  admitQueued: () => true,
  busy: false,
  actions: {
    onInstall: vi.fn(),
    onLogin: vi.fn(),
    onRecheck: vi.fn(),
    onAcceptMetered: vi.fn(),
    onOpenInstallHelp: vi.fn(),
  },
  refresh: vi.fn(),
  usage: [],
  inputTruncated: false,
  onDismissTruncated: vi.fn(),
  onAcknowledgeNotice: vi.fn(),
  onContinueWith: vi.fn(),
}

/** a reply whose run remembered one entry (the record `project_remember` leaves) */
const remembered: AiChatMessage = {
  role: 'assistant',
  text: 'Noted.',
  tools: [
    {
      name: 'project_remember',
      summary: 'Remembered',
      isError: false,
      output: 'Memory updated: {"op":"add","text":"Reports are due on Fridays (2026-10-29)"}',
    },
  ],
}

let host: HTMLDivElement
let root: Root
let panelNow: ProjectPanel | null = null

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Element.prototype.scrollTo = () => undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  panelNow = null
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete (window as unknown as Record<string, unknown>).projectFolderApi
  vi.unstubAllGlobals()
})

/** App.tsx's side, reduced to the project parts: the hook, handed to the real panel */
function Harness({
  chat,
  onNewChat,
}: {
  chat: readonly AiChatMessage[]
  onNewChat: () => void
}): React.JSX.Element {
  const project = useProjectPanel({
    editor: 'sheets',
    lang: 'en',
    busy: false,
    loop: () => ({ busy: false, appendHistory: () => 0 }),
    consolidation: () => null,
    onOpen: () => undefined,
    onRemoteMessages: () => undefined,
    onNewChat,
  })
  useEffect(() => {
    panelNow = project
  })
  return createElement(AiChatPanel, {
    isOpen: true,
    hasContent: true,
    chat,
    attachments: [],
    attachNotice: null,
    onPickAttachments: () => undefined,
    onAddAttachmentPaths: () => undefined,
    onAddPastedImage: () => undefined,
    onRemoveAttachment: () => undefined,
    prompt: '',
    preview: null,
    aiBusy: false,
    subscription,
    onPromptChange: () => undefined,
    onSend: () => undefined,
    onStop: () => undefined,
    onNewChat,
    onUndo: () => undefined,
    scopeRange: null,
    scopeColumns: null,
    scopeLocked: false,
    onScopeDismiss: () => undefined,
    onCitation: () => undefined,
    onExpand: () => undefined,
    onCollapse: () => undefined,
    project,
  })
}

async function settle(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mount(
  folder: FakeProjectFolder,
  chat: readonly AiChatMessage[] = [],
  onNewChat = vi.fn(),
) {
  Object.assign(window, { projectFolderApi: folder.api })
  await act(async () => root.render(createElement(Harness, { chat, onNewChat })))
  await settle()
  return onNewChat
}

describe('sheets AI panel: project folder parts', () => {
  it('puts the project chip on the row under the input and the chat menu in the header', async () => {
    await mount(fakeProjectFolder('p1'))
    expect(host.querySelector('.ai-input-below .ai-project-chip')).not.toBeNull()
    expect(host.querySelector('.ai-panel-header .ai-project-chat-button')).not.toBeNull()
  })

  it('reads the context of a send and shows its notices; records go to the project chat', async () => {
    const folder = fakeProjectFolder('p1')
    await mount(folder)
    await act(async () => {
      await panelNow!.prepareSend()
    })
    expect(folder.calls).toEqual(expect.arrayContaining(['readContext', 'openScope']))
    expect(host.querySelector('[data-notice="memory-long"]')).not.toBeNull()
    expect(panelNow!.chat.persist({ role: 'user', text: 'Sum column B' })).toBe(true)
    await act(async () => {
      panelNow!.finishSend()
      await panelNow!.chat.settled()
    })
    expect(folder.appended).toEqual([
      expect.objectContaining({ projectId: 'p1', chatId: 'c1', role: 'user' }),
    ])
    expect(folder.calls).toContain('closeScope')
  })

  it('without a project: no chat menu, nothing recorded in a project, the old store applies', async () => {
    const folder = fakeProjectFolder(null)
    await mount(folder)
    expect(host.querySelector('.ai-input-below .ai-project-chip')).not.toBeNull()
    expect(host.querySelector('.ai-project-chat-button')).toBeNull()
    let prepared = false
    await act(async () => {
      await panelNow!.prepareSend()
      prepared = true
    })
    expect(prepared).toBe(true)
    expect(folder.calls).not.toContain('readContext')
    expect(panelNow!.chat.persist({ role: 'user', text: 'Sum column B' })).toBe(false)
    expect(folder.appended).toEqual([])
  })

  it('shows a remembered entry under its reply, and [Remove] takes it out of the memory', async () => {
    const folder = fakeProjectFolder('p1')
    await mount(folder, [{ role: 'user', text: 'Note it', tools: [] }, remembered])
    const line = host.querySelector('[data-memory-op="add"]')
    expect(line?.textContent).toContain('Reports are due on Fridays')
    await act(async () => line!.querySelector<HTMLButtonElement>('button')!.click())
    await settle()
    expect(folder.calls).toContain('editMemory')
  })

  it('the panel’s "new chat" goes to App’s handler', async () => {
    const onNewChat = await mount(fakeProjectFolder('p1'), [
      { role: 'user', text: 'hi', tools: [] },
    ])
    await act(async () =>
      host.querySelector<HTMLButtonElement>(`button[aria-label="${t('aiNewChat')}"]`)!.click(),
    )
    expect(onNewChat).toHaveBeenCalledTimes(1)
  })
})

describe('sheets App wiring of the project folder', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8')
  const shell = readFileSync(resolve(process.cwd(), 'src/renderer/ExcelShell.tsx'), 'utf8')

  it('puts the project skill in the same skill list as the person’s skills', () => {
    const list = app.slice(app.indexOf("composeWithDrive('sheets+files'"))
    // the list ends where the loop's events begin
    const end = list.indexOf('events: {')
    expect(list.indexOf('...panelUserSkills(')).toBeGreaterThan(0)
    expect(list.indexOf('...panelProjectSkill({ run: project.chat.run')).toBeGreaterThan(0)
    expect(list.indexOf('...panelProjectSkill(')).toBeLessThan(end)
  })

  it('awaits the project context right before every run and ends it after', () => {
    const runAgent = app.slice(app.indexOf('function runAgent('))
    const body = runAgent.slice(0, runAgent.indexOf('\n  }\n'))
    const prepare = body.indexOf('await projectRef.current?.prepareSend()')
    expect(prepare).toBeGreaterThan(0)
    expect(body.indexOf('loop.run(', prepare)).toBeGreaterThan(prepare)
    expect(body.slice(0, prepare)).not.toContain('loop.run(')
    expect(app.match(/projectRef\.current\?\.finishSend\(\)/g)?.length).toBe(2)
  })

  it('records in the project first and falls back to the workbook’s own chat', () => {
    const persist = app.slice(app.indexOf('const persistChatMessage = ('))
    const body = persist.slice(0, persist.indexOf('\n  }\n'))
    const project = body.indexOf('if (projectRef.current?.chat.persist(record)) return true')
    expect(project).toBeGreaterThan(0)
    expect(body.indexOf('api.appendChat(', project)).toBeGreaterThan(project)
  })

  it('"new chat" starts a project chat and otherwise resets as before', () => {
    const handler = app.slice(app.indexOf('function handleNewChat(): void {'))
    const body = handler.slice(0, handler.indexOf('\n  }\n'))
    expect(body).toContain('resetConversation()')
    expect(body).toContain(
      'if (projectRef.current?.chat.projectId) void projectRef.current.chat.newChat()',
    )
  })

  it('hands the project parts to the panel', () => {
    expect(app).toContain('aiProject={project}')
    expect(shell).toContain('project={aiProject}')
  })
})
