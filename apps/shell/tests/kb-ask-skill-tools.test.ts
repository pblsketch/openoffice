/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import type { AiSettings, AiStreamRequest, SubscriptionStatusMap } from '@genoffice/ai-provider'
import type { IpcStreamChunk } from '@genoffice/agent-core'
import type { HomeApi } from '../src/shared/home-api'
import { KbAskPanel } from '../src/renderer/src/KbAskPanel'
import { LocaleProvider } from '../src/renderer/src/locale'
import type { SubscriptionConnection } from '../src/renderer/src/subscription-client'

/**
 * The home ask panel's skill tools: the app defines and runs use_skill,
 * read_skill_file and propose_skill; a proposal shows a card and nothing is
 * written before its Save; a used skill shows "<title> skill used".
 */

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const stored: AiSettings = defaultAiSettings()
let listener: ((chunk: IpcStreamChunk) => void) | null = null
let requests: Array<AiStreamRequest & { requestId: string }> = []
/** what the model answers, one turn per request */
let script: Array<(requestId: string) => IpcStreamChunk[]> = []
let bridge: Record<string, ReturnType<typeof vi.fn>>

const view = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  source: id.split(':')[0],
  name: id.split(':')[1],
  title,
  description: `About ${title}`,
  enabled: true,
  invoke: 'auto',
  hidden: false,
  agentOnly: false,
  hasScripts: false,
  template: undefined,
  templateExists: false,
  owned: id.startsWith('app:'),
  ...over,
})

beforeEach(() => {
  Element.prototype.scrollTo = () => undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  requests = []
  script = []
  listener = null
  window.aiOffice = {
    kbList: async () => [
      { path: '/kb/lease.docx', folder: 'kb', name: 'lease.docx', ext: 'docx', sizeBytes: 10 },
    ],
    kbSearch: async () => [],
    kbRead: async () => ({ text: '', nextOffset: null }),
    aiGetSettings: async () => stored,
    getAiSettings: async () => stored,
    setAiSettings: async () => undefined,
    aiStream: async (request: AiStreamRequest & { requestId: string }) => {
      requests.push(request)
      const turn = script.shift()
      const chunks = turn
        ? turn(request.requestId)
        : [{ requestId: request.requestId, type: 'done' as const }]
      setTimeout(() => chunks.forEach((chunk) => listener?.(chunk)), 0)
    },
    aiStreamCancel: async () => undefined,
    onAiStream: (l: (chunk: IpcStreamChunk) => void) => {
      listener = l
      return () => (listener = null)
    },
  } as unknown as HomeApi
  bridge = {
    list: vi.fn(async () => [
      view('app:lease-check', 'Lease checklist'),
      view('user:manual-one', 'Manual one', { invoke: 'manual' }),
      view('builtin:find-skills', 'Find skills', { agentOnly: true }),
    ]),
    aiRead: vi.fn(async (id: string) => ({
      ok: true,
      skill: {
        id,
        name: 'lease-check',
        title: 'Lease checklist',
        body: 'CHECK PETS FIRST',
        files: [],
      },
    })),
    aiReadFile: vi.fn(async () => ({ ok: true, text: 'file' })),
    openSettings: vi.fn(async () => undefined),
    onChanged: vi.fn(() => () => undefined),
    suggestName: vi.fn(async () => 'lease-review'),
    checkName: vi.fn(async () => ({ ok: true })),
    saveFromCard: vi.fn(async () => ({ ok: true, id: 'app:lease-review' })),
  }
  ;(globalThis as Record<string, unknown>).aiOfficeUserSkills = bridge
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete (globalThis as Record<string, unknown>).aiOfficeUserSkills
})

const ready: SubscriptionStatusMap = {
  'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
  codex: { provider: 'codex', state: 'signed-out', meteredAccepted: false },
}

const connection = {
  statuses: ready,
  busy: false,
  failed: {},
  codexImageAvailable: false,
  install: vi.fn(),
  login: vi.fn(),
  switchAccount: vi.fn(),
  logout: vi.fn(),
  recheck: vi.fn(),
  refresh: vi.fn(),
  acceptMetered: vi.fn(async () => undefined),
  openInstallHelp: vi.fn(),
} as SubscriptionConnection

const settle = async (ms = 0) => {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, ms))
}

const composer = (): HTMLTextAreaElement => host.querySelector<HTMLTextAreaElement>('textarea')!

async function ask(text: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(composer(), text)
    composer().setSelectionRange(text.length, text.length)
    composer().dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
  })
  await act(async () => {
    composer().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await settle()
  })
}

function toolTurn(name: string, input: Record<string, unknown>) {
  return (requestId: string): IpcStreamChunk[] => [
    { requestId, type: 'tool-call', toolCall: { id: `call-${name}`, name, input } },
    { requestId, type: 'done' },
  ]
}

function textTurn(text: string) {
  return (requestId: string): IpcStreamChunk[] => [
    { requestId, type: 'delta', text },
    { requestId, type: 'done' },
  ]
}

async function mount(): Promise<void> {
  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(KbAskPanel, {
          connection,
          aiSettings: stored,
          noticeDue: false,
          onOpenAiSettings: vi.fn(),
          onOpenPath: vi.fn(),
          onGoToRecents: vi.fn(),
        }),
      ),
    )
    await settle()
  })
}

describe('ask panel skill tools', () => {
  it('offers the three app tools and lists only the skills used on their own', async () => {
    await mount()
    await ask('Check this lease')
    const request = requests[0]!
    expect(request.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['use_skill', 'read_skill_file', 'propose_skill']),
    )
    // the prompt lists a skill by its name, as the lists show it
    expect(request.system).toContain('app:lease-check | lease-check')
    expect(request.system).not.toContain('user:manual-one')
    expect(request.system).not.toContain('builtin:find-skills')
  })

  it('a used skill shows "<name> skill used"', async () => {
    script = [toolTurn('use_skill', { id: 'app:lease-check' }), textTurn('Done.')]
    await mount()
    await ask('Check this lease')
    await act(async () => settle(5))
    expect(bridge.aiRead).toHaveBeenCalledWith('app:lease-check')
    expect(host.textContent).toContain('Used the lease-check skill')
    expect(JSON.stringify(requests[1]!.messages)).toContain('CHECK PETS FIRST')
  })

  it('a proposal shows the card, writes nothing, and saves only on Save', async () => {
    script = [
      toolTurn('propose_skill', {
        name: 'lease-review',
        description: 'Reviews a lease the way we do.',
        body: '1. Pets\n2. Deposit',
      }),
      textTurn('Check the card.'),
    ]
    await mount()
    await ask('Save this as a skill')
    await act(async () => settle(40))
    expect(host.querySelector('.ai-skill-card')).not.toBeNull()
    expect(host.textContent).not.toContain('Save this document along as a template')
    expect(bridge.saveFromCard).not.toHaveBeenCalled()
    const save = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Save')!
    await act(async () => {
      save.click()
      await settle()
    })
    // the model gave no title: the card saves the name with an empty title
    expect(bridge.saveFromCard).toHaveBeenCalledWith({
      title: '',
      name: 'lease-review',
      description: 'Reviews a lease the way we do.',
      body: '1. Pets\n2. Deposit',
      invoke: 'auto',
    })
    expect(host.textContent).toContain('Saved · lease-review')
  })
})
