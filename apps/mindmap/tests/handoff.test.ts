/**
 * A request handed over by the shell (spec 8.5), in the whole editor against
 * a scripted main process. The take behaves like the main side: the first
 * call gets the request, every later one (a reload) gets nothing. The model's
 * answers are written out here as stream chunks and the subscription
 * statuses are fakes, so nothing can start a `claude` or `codex` program.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  defaultAiSettings,
  type AiStreamChunk,
  type AiStreamRequest,
  type AiSubscriptionState,
} from '@genoffice/ai-provider'
import type { SubscriptionStatusMap } from '@genoffice/ai-provider/browser'
import type { Lang } from '@genoffice/i18n'
import App from '../src/renderer/App'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import type { MindmapAiRequest } from '../src/renderer/ai/AiPanel'
import { useMapHandoff } from '../src/renderer/ai/use-handoff'
import type {
  AttachmentMeta,
  HandoffRunStarted,
  MindmapApi,
  MindmapHandoff,
  SaveIntoProjectRequest,
  SaveIntoProjectResult,
} from '../src/shared/ipc'
import { documentOf, plainSheet } from './helpers/fixtures'
import { mapLoaded, until } from './helpers/wait'

const statusMap = (
  claude: AiSubscriptionState,
  codex: AiSubscriptionState,
): SubscriptionStatusMap => ({
  'claude-code': { provider: 'claude-code', state: claude, meteredAccepted: false },
  codex: { provider: 'codex', state: codex, meteredAccepted: false },
})
const CONNECTED = statusMap('ready', 'ready')
const NOT_CONNECTED = statusMap('signed-out', 'not-installed')

type Reply = (request: AiStreamRequest, nth: number) => Array<Partial<AiStreamChunk>>

const HANDOFF: MindmapHandoff = {
  id: 'handoff-1',
  sourcePaths: ['C:/notes/plan.docx', 'C:/notes/old.xmind'],
  prompt: 'Make a mind map from these notes',
}

interface FakeOptions {
  pending: string | null
  bytes?: Uint8Array
  statuses: SubscriptionStatusMap
  /** what the main process holds for this tab; taken by the first call only */
  handoff: MindmapHandoff | null
  reply?: Reply
  /** the main side of the project save (spec 6); absent: an older preload without it */
  saveIntoProject?: (request: SaveIntoProjectRequest) => Promise<SaveIntoProjectResult>
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
  let statusListener: ((statuses: SubscriptionStatusMap) => void) | null = null
  let statuses = options.statuses
  let queued = options.handoff
  const requests: AiStreamRequest[] = []
  const added: string[][] = []
  const reports: HandoffRunStarted[] = []
  const takeHandoff = vi.fn(async () => {
    const taken = queued
    queued = null
    return taken
  })
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
    // ---- the hand-off ----
    takeHandoff,
    notifyHandoffRunStarted: (report: HandoffRunStarted) => void reports.push(report),
    // ---- the AI bridge ----
    getAiSettings: async () => ({ ...defaultAiSettings(), subscriptionNoticeSeen: true }),
    setAiSettings: async () => {},
    onAiSettingsChanged: () => () => {},
    openAiModelSettings: async () => {},
    getAiPanelPrefs: async () => ({}),
    onAiPanelPrefsChanged: () => () => {},
    setProvisionalTitle: () => {},
    addAttachmentPaths: async (paths: string[]) => {
      added.push(paths)
      return { accepted: paths.map(attachment), rejected: [] }
    },
    readAttachmentImage: async () => ({ ok: false }),
    ...(options.saveIntoProject ? { saveIntoProject: options.saveIntoProject } : {}),
    subscription: {
      statuses: vi.fn(async () => statuses),
      recheck: vi.fn(async () => statuses),
      login: vi.fn(async () => ({ ok: true })),
      install: vi.fn(async () => ({ ok: true })),
      setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses })),
      onChanged: (listener: (next: SubscriptionStatusMap) => void) => {
        statusListener = listener
        return () => {
          statusListener = null
        }
      },
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
  /** the user signs in somewhere: the statuses change and the panel hears about it */
  const connect = () => {
    statuses = CONNECTED
    statusListener?.(statuses)
  }
  return { api: api as unknown as MindmapApi, requests, added, reports, takeHandoff, connect }
}

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

async function settle(turns = 16): Promise<void> {
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

/** the tab is reloaded: the page goes and comes back against the same main process */
async function reload(fake: ReturnType<typeof fakeApi>): Promise<void> {
  unmount()
  unmount = () => {}
  document.body.innerHTML = ''
  await mountApp(fake)
}

const composer = () => container.querySelector<HTMLTextAreaElement>('.ai-input-box textarea')!
const chips = () =>
  [...container.querySelectorAll('.ai-attachments .ai-attachment-card-name')].map(
    (chip) => chip.textContent,
  )
const aiOpen = () => container.querySelector('.ai-dock')?.getAttribute('data-ai-open')
const sheetCount = () => container.querySelectorAll('.mm-sheet-host').length
const drawnTitles = (): string[] =>
  [...container.querySelectorAll<HTMLElement>('.mm-sheet-host:not([hidden]) me-tpc')].map(
    (topic) => topic.querySelector('.text')?.textContent ?? topic.textContent ?? '',
  )

async function clickSend(): Promise<void> {
  act(() => container.querySelector<HTMLButtonElement>('.ai-send-btn')!.click())
  await settle()
}

describe('a new map tab takes the handed-over request', () => {
  it('attaches the files, fills the composer, opens the panel and starts one run', async () => {
    const fake = fakeApi({ pending: null, statuses: CONNECTED, handoff: HANDOFF })
    await mountApp(fake)
    expect(fake.takeHandoff).toHaveBeenCalledTimes(1)
    expect(aiOpen()).toBe('true')
    // the files went the usual way (the main side's checks), in the order handed over
    expect(fake.added).toEqual([['C:/notes/plan.docx', 'C:/notes/old.xmind']])
    expect(fake.requests).toHaveLength(1)
    const sent = JSON.stringify(fake.requests[0]!.messages)
    expect(sent).toContain('Make a mind map from these notes')
    expect(sent).toContain('plan.docx')
    expect(sent).toContain('old.xmind')
    // the run took the files with it, and was reported once with them
    const user = container.querySelector('.ai-msg-attachments')
    expect(user?.textContent).toContain('plan.docx')
    expect(fake.reports).toEqual([
      {
        id: 'handoff-1',
        attachedSources: 2,
        attachedPaths: ['C:/notes/plan.docx', 'C:/notes/old.xmind'],
      },
    ])
  })

  it('when nothing is connected: no run, the text and the files stay in the panel', async () => {
    const fake = fakeApi({ pending: null, statuses: NOT_CONNECTED, handoff: HANDOFF })
    await mountApp(fake)
    expect(fake.requests).toHaveLength(0)
    expect(fake.reports).toEqual([])
    expect(aiOpen()).toBe('true')
    expect(composer().value).toBe('Make a mind map from these notes')
    expect(chips()).toEqual(['plan.docx', 'old.xmind'])
    // the connect prompt says what to do
    expect(container.querySelector('.ai-sub-prompt')).not.toBeNull()
  })

  it('after connecting in that tab, nothing starts by itself; the user’s own send counts as the start', async () => {
    const fake = fakeApi({ pending: null, statuses: NOT_CONNECTED, handoff: HANDOFF })
    await mountApp(fake)
    await act(async () => fake.connect())
    await settle()
    expect(fake.requests).toHaveLength(0)
    expect(fake.reports).toEqual([])
    expect(composer().value).toBe('Make a mind map from these notes')

    await clickSend()
    expect(fake.requests).toHaveLength(1)
    expect(fake.reports).toEqual([
      {
        id: 'handoff-1',
        attachedSources: 2,
        attachedPaths: ['C:/notes/plan.docx', 'C:/notes/old.xmind'],
      },
    ])
  })

  it('a run with only some of the files counts, with just those files', async () => {
    const fake = fakeApi({ pending: null, statuses: NOT_CONNECTED, handoff: HANDOFF })
    await mountApp(fake)
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '.ai-attachments .ai-attachment-card[title="C:/notes/old.xmind"] .ai-attachment-thumb-remove',
        )!
        .click(),
    )
    expect(chips()).toEqual(['plan.docx'])
    await act(async () => fake.connect())
    await settle()
    await clickSend()
    expect(fake.requests).toHaveLength(1)
    expect(fake.reports).toEqual([
      { id: 'handoff-1', attachedSources: 1, attachedPaths: ['C:/notes/plan.docx'] },
    ])
  })

  it('a run with every handed-over file removed is not reported as the start', async () => {
    const fake = fakeApi({ pending: null, statuses: NOT_CONNECTED, handoff: HANDOFF })
    await mountApp(fake)
    for (const button of container.querySelectorAll<HTMLButtonElement>(
      '.ai-attachments .ai-attachment-thumb-remove',
    )) {
      act(() => button.click())
    }
    expect(chips()).toEqual([])
    await act(async () => fake.connect())
    await settle()
    await clickSend()
    // the run itself goes ahead; it just is not the hand-off's run
    expect(fake.requests).toHaveLength(1)
    expect(fake.reports).toEqual([])
  })

  it('a reload takes nothing and runs nothing', async () => {
    const fake = fakeApi({ pending: null, statuses: CONNECTED, handoff: HANDOFF })
    await mountApp(fake)
    expect(fake.requests).toHaveLength(1)
    await reload(fake)
    expect(fake.takeHandoff).toHaveBeenCalledTimes(2)
    // still the one run from before the reload
    expect(fake.requests).toHaveLength(1)
    expect(fake.added).toHaveLength(1)
    expect(composer().value).toBe('')
    expect(chips()).toEqual([])
  })

  it('a reload of a blocked tab does not run the request either', async () => {
    const fake = fakeApi({ pending: null, statuses: NOT_CONNECTED, handoff: HANDOFF })
    await mountApp(fake)
    fake.connect()
    await reload(fake)
    expect(fake.requests).toHaveLength(0)
    expect(fake.reports).toEqual([])
  })

  it('a tab opened on a file never takes', async () => {
    const bytes = await (await documentOf(plainSheet())).save()
    const fake = fakeApi({
      pending: 'C:/maps/a.xmind',
      bytes,
      statuses: CONNECTED,
      handoff: HANDOFF,
    })
    await mountApp(fake)
    expect(fake.takeHandoff).not.toHaveBeenCalled()
    expect(fake.requests).toHaveLength(0)
    expect(fake.added).toEqual([])
  })

  it('without a shell (no take channel) a new map simply starts empty', async () => {
    const fake = fakeApi({ pending: null, statuses: CONNECTED, handoff: null })
    const api = fake.api as unknown as Record<string, unknown>
    delete api.takeHandoff
    delete api.notifyHandoffRunStarted
    await mountApp(fake)
    expect(fake.requests).toHaveLength(0)
    expect(composer().value).toBe('')
  })

  it('the map writing of the run fills the blank new map’s sheet instead of adding one', async () => {
    const fake = fakeApi({
      pending: null,
      statuses: CONNECTED,
      handoff: HANDOFF,
      reply: (_request, nth) =>
        nth === 1
          ? [
              {
                type: 'tool-call',
                toolCall: {
                  id: 'call-1',
                  name: 'write_map',
                  input: { outline: '# Plan\n\n- Plan\n  - Goals\n  - Steps\n' },
                },
              },
              { type: 'done' },
            ]
          : [{ type: 'delta', text: 'Wrote the map.' }, { type: 'done' }],
    })
    await mountApp(fake)
    expect(fake.requests).toHaveLength(2)
    // one sheet: the blank one, filled and named after the outline (no second sheet)
    expect(sheetCount()).toBe(1)
    expect(
      [...container.querySelectorAll('.mm-sheets .mm-sheet-name')].map((tab) => tab.textContent),
    ).toEqual(['Plan'])
    expect(drawnTitles().sort()).toEqual(['Goals', 'Plan', 'Steps'].sort())
  })
})

describe('the hand-off hook', () => {
  it('shows the request to the panel for one render only', async () => {
    const seen: Array<MindmapAiRequest | null> = []
    let opened = 0
    let setReady: (ready: boolean) => void = () => {}
    const fake = fakeApi({ pending: null, statuses: CONNECTED, handoff: HANDOFF })
    ;(window as unknown as { mindmapApi: MindmapApi }).mindmapApi = fake.api
    function Probe() {
      const [ready, set] = useState(false)
      setReady = set
      const handoff = useMapHandoff({ ready, untitled: true, openPanel: () => opened++ })
      seen.push(handoff.request)
      return null
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => root.render(createElement(Probe)))
    unmount = () => act(() => root.unmount())
    expect(fake.takeHandoff).not.toHaveBeenCalled()
    await act(async () => setReady(true))
    await settle()
    // later renders (any reason) never bring it back
    await act(async () => setReady(false))
    await act(async () => setReady(true))
    await settle()
    const shown = seen.filter((request) => request !== null)
    expect(shown).toEqual([
      {
        nonce: 1,
        text: 'Make a mind map from these notes',
        attachmentPaths: ['C:/notes/plan.docx', 'C:/notes/old.xmind'],
      },
    ])
    expect(seen.at(-1)).toBeNull()
    expect(fake.takeHandoff).toHaveBeenCalledTimes(1)
    expect(opened).toBe(1)
  })
})

describe('the map a create flow handed over goes into the project (spec 6)', () => {
  const status = () => container.querySelector('.mm-save-status')?.textContent ?? ''
  const isXmind = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b

  it('with a project: saved once the handed-over run ended well, and the map adopts the file', async () => {
    const saveIntoProject = vi.fn(async (): Promise<SaveIntoProjectResult> => ({
      ok: true,
      path: 'D:/Plan/Map (2).xmind',
    }))
    const fake = fakeApi({ pending: null, statuses: CONNECTED, handoff: HANDOFF, saveIntoProject })
    await mountApp(fake)
    expect(fake.requests).toHaveLength(1)
    await until(() => saveIntoProject.mock.calls.length > 0, 'the project save')
    expect(saveIntoProject).toHaveBeenCalledTimes(1)
    // the renderer sends the map's bytes only; main picks the folder and the name
    const request = (saveIntoProject.mock.calls[0] as unknown as [SaveIntoProjectRequest])[0]
    expect(isXmind(request.bytes)).toBe(true)
    expect(Object.keys(request).filter((key) => key !== 'defaultName')).toEqual(['bytes'])
    await settle()
    expect(status()).toBe('Saved')
    // a later run is the person's own: no second save into the project
    act(() => {
      const box = composer()
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(box, 'One more branch')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await clickSend()
    expect(fake.requests).toHaveLength(2)
    expect(saveIntoProject).toHaveBeenCalledTimes(1)
  })

  it('without a project nothing is written and the map stays untitled, as before', async () => {
    const saveIntoProject = vi.fn(async (): Promise<SaveIntoProjectResult> => ({
      ok: false,
      skipped: true,
    }))
    const fake = fakeApi({ pending: null, statuses: CONNECTED, handoff: HANDOFF, saveIntoProject })
    await mountApp(fake)
    await until(() => saveIntoProject.mock.calls.length > 0, 'the project save')
    await settle()
    expect(status()).not.toBe('Saved')
    expect(status()).not.toContain('project folder')
  })

  it('a refused write keeps the map untitled and says why', async () => {
    const saveIntoProject = vi.fn(async (): Promise<SaveIntoProjectResult> => ({
      ok: false,
      error: 'EACCES: denied',
    }))
    const fake = fakeApi({ pending: null, statuses: CONNECTED, handoff: HANDOFF, saveIntoProject })
    await mountApp(fake)
    await until(() => saveIntoProject.mock.calls.length > 0, 'the project save')
    await settle()
    expect(status()).toContain('Could not save it in the project folder')
    expect(status()).toContain('EACCES: denied')
  })

  it('a failed run writes nothing', async () => {
    const saveIntoProject = vi.fn(async (): Promise<SaveIntoProjectResult> => ({
      ok: true,
      path: 'D:/Plan/Map.xmind',
    }))
    const fake = fakeApi({
      pending: null,
      statuses: CONNECTED,
      handoff: HANDOFF,
      saveIntoProject,
      reply: () => [{ type: 'error', error: 'the model failed' }],
    })
    await mountApp(fake)
    expect(fake.requests).toHaveLength(1)
    await settle()
    expect(saveIntoProject).not.toHaveBeenCalled()
  })

  it('a map nobody handed a request to never asks', async () => {
    const saveIntoProject = vi.fn(async (): Promise<SaveIntoProjectResult> => ({
      ok: true,
      path: 'D:/Plan/Map.xmind',
    }))
    const fake = fakeApi({ pending: null, statuses: CONNECTED, handoff: null, saveIntoProject })
    await mountApp(fake)
    act(() => {
      const box = composer()
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(box, 'Make a map')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await clickSend()
    expect(fake.requests).toHaveLength(1)
    await settle()
    expect(saveIntoProject).not.toHaveBeenCalled()
  })
})
