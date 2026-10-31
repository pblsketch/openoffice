/** @vitest-environment jsdom */
// The HWP AI panel with the project folder (spec 5): the project skill is in
// the loop's skill list, the project context is read before the run starts,
// messages go to the project chat (and to the document's own chat when no
// project is chosen), "new chat" starts a project chat, and the project chip
// sits on the row under the input. The model is a fake transport and the
// project folder a fake bridge; no provider and no folder is ever reached.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AgentStreamCallbacks, AgentStreamRequest } from '@genoffice/agent-core'
import { defaultAiSettings, type AiSettings } from '@genoffice/ai-provider'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import type { AgentBridge } from '../src/renderer/ai/agent-bridge'
import { t } from '../src/renderer/i18n/locale'
import { fakeProjectFolder, type FakeProjectFolder } from './fake-project-folder'

const model = vi.hoisted(() => ({
  calls: [] as string[],
  requests: [] as { system: string; tools: string[] }[],
}))

vi.mock('../src/renderer/ai/transport', () => ({
  createElectronTransport: () => ({
    stream: (request: AgentStreamRequest, callbacks: AgentStreamCallbacks) => {
      model.calls.push('stream')
      model.requests.push({ system: request.system, tools: request.tools.map((tool) => tool.name) })
      setTimeout(() => {
        callbacks.onDelta('Done.')
        callbacks.onDone()
      }, 0)
      return { cancel: () => undefined }
    },
  }),
}))

/** a key provider the person chose: the send gate lets it run (the transport is fake) */
function keySettings(): AiSettings {
  const settings = defaultAiSettings()
  return {
    ...settings,
    provider: 'openai',
    providers: { ...settings.providers, openai: { apiKey: 'sk-test', model: 'some-model' } },
  }
}

function hwpApiStub() {
  return {
    getAiSettings: async () => keySettings(),
    setAiSettings: async () => undefined,
    onAiSettingsChanged: () => () => undefined,
    openAiModelSettings: async () => undefined,
    setAiPanelPrefs: async () => ({}),
    pickAttachments: async () => ({ accepted: [], rejected: [] }),
    addAttachmentPaths: async () => ({ accepted: [], rejected: [] }),
    addPastedImage: async () => ({ accepted: [], rejected: [] }),
    getPathForFile: () => '',
    readAttachmentImage: async () => ({ ok: false }),
    aiToolCapabilities: async () => ({ imageGeneration: { available: false } }),
  }
}

/** the per-document chat store */
function projectApiStub() {
  return {
    resolveChat: vi.fn(async () => ({ projectId: 'doc-store', chatId: 'doc-chat' })),
    loadChat: vi.fn(async () => []),
    appendChat: vi.fn(async () => undefined),
    rebindChat: vi.fn(async () => null),
  }
}

/** an editor that is not there: every call fails, the panel swallows it */
const NO_EDITOR = new Proxy({} as AgentBridge, {
  get: () => () => Promise.reject(new Error('no editor in this test')),
})

let container: HTMLElement
let root: Root | null = null

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Element.prototype.scrollTo = () => undefined
  model.calls.length = 0
  model.requests.length = 0
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  container.remove()
  for (const key of ['hwpApi', 'projectApi', 'projectFolderApi']) {
    delete (window as unknown as Record<string, unknown>)[key]
  }
  vi.unstubAllGlobals()
})

async function settle(turns = 10): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mount(folder: FakeProjectFolder) {
  const projectApi = projectApiStub()
  Object.assign(window, { hwpApi: hwpApiStub(), projectApi, projectFolderApi: folder.api })
  // the model's request follows the bridge calls in one log
  const readContext = folder.api.readContext
  folder.api.readContext = (args) => {
    model.calls.push('readContext')
    return readContext(args)
  }
  root = createRoot(container)
  await act(async () => {
    root!.render(
      createElement(AiPanel, { bridge: NO_EDITOR, filePath: null, onCollapse: () => undefined }),
    )
  })
  await settle()
  return projectApi
}

/** a starter fills the input; the send button sends it */
async function sendStarter(): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLButtonElement>('.ai-starter')!.click()
  })
  await act(async () => {
    container.querySelector<HTMLButtonElement>('.ai-send-btn:not(.ai-stop-btn)')!.click()
  })
  await settle()
}

const newChatButton = () =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${t('aiNewChat')}"]`)

describe('hwp AI panel: project folder', () => {
  it('puts the project chip on the row under the input and the chat menu in the header', async () => {
    const folder = fakeProjectFolder('p1')
    await mount(folder)
    expect(container.querySelector('.ai-input-below .ai-project-chip')).not.toBeNull()
    expect(container.querySelector('.ai-panel-header .ai-project-chat-button')).not.toBeNull()
  })

  it('reads the project context before the run and sends the project skill with it', async () => {
    const folder = fakeProjectFolder('p1')
    const projectApi = await mount(folder)
    await sendStarter()

    expect(model.calls.indexOf('readContext')).toBeGreaterThanOrEqual(0)
    expect(model.calls.indexOf('readContext')).toBeLessThan(model.calls.indexOf('stream'))
    const request = model.requests[0]!
    expect(request.system).toContain('## Project folder')
    expect(request.system).toContain('Write in plain words.')
    expect(request.tools).toEqual(
      expect.arrayContaining(['project_list_files', 'project_search', 'project_read']),
    )
    // the run's scope was closed again
    expect(folder.calls).toContain('closeScope')
    // the question and the answer went to the project chat, not to the document's own chat
    expect(folder.appended.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(folder.appended[0]).toMatchObject({ projectId: 'p1', chatId: 'c1' })
    expect(projectApi.appendChat).not.toHaveBeenCalled()
    // the memory notice of the send shows above the input
    expect(container.querySelector('[data-notice="memory-long"]')).not.toBeNull()
  })

  it('keeps the document’s own chat when no project is chosen', async () => {
    const folder = fakeProjectFolder(null)
    const projectApi = await mount(folder)
    expect(container.querySelector('.ai-input-below .ai-project-chip')).not.toBeNull()
    expect(container.querySelector('.ai-project-chat-button')).toBeNull()
    await sendStarter()

    expect(folder.appended).toEqual([])
    expect(projectApi.appendChat).toHaveBeenCalledTimes(2)
    expect(projectApi.appendChat).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'doc-store', chatId: 'doc-chat', role: 'user' }),
    )
    const request = model.requests[0]!
    expect(request.system).not.toContain('## Project folder')
    expect(request.tools.some((name) => name.startsWith('project_'))).toBe(false)
  })

  it('"new chat" starts a new project chat when a project is chosen', async () => {
    const folder = fakeProjectFolder('p1')
    await mount(folder)
    await sendStarter()
    expect(folder.newChats).toEqual(['c1'])

    await act(async () => newChatButton()!.click())
    await settle()
    expect(folder.newChats).toEqual(['c1', 'c2'])
    expect(container.querySelectorAll('.ai-msg').length).toBe(0)
  })

  it('"new chat" without a project clears the chat as before', async () => {
    const folder = fakeProjectFolder(null)
    await mount(folder)
    await sendStarter()
    expect(container.querySelectorAll('.ai-msg').length).toBeGreaterThan(0)

    act(() => newChatButton()!.click())
    expect(container.querySelectorAll('.ai-msg').length).toBe(0)
    await settle()
    expect(folder.newChats).toEqual([])
  })
})
