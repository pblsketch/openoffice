/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import type { AiSettings, AiStreamRequest, SubscriptionStatusMap } from '@genoffice/ai-provider'
import type { HomeApi } from '../src/shared/home-api'
import { KbAskPanel } from '../src/renderer/src/KbAskPanel'
import { LocaleProvider } from '../src/renderer/src/locale'
import type { SubscriptionConnection } from '../src/renderer/src/subscription-client'

/**
 * The home ask panel calls skills with `/` like the editors: the chosen
 * skill's text goes to the model with the question, the question keeps the
 * chip, and agent-only skills are not offered.
 */

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let aiStream: ReturnType<typeof vi.fn<(request: AiStreamRequest) => Promise<void>>>
const stored: AiSettings = defaultAiSettings()

const skillView = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  source: 'app',
  name: id.split(':')[1],
  title,
  description: '',
  enabled: true,
  hidden: false,
  agentOnly: false,
  hasScripts: false,
  template: undefined,
  templateExists: false,
  ...over,
})

beforeEach(() => {
  Element.prototype.scrollTo = () => undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  aiStream = vi.fn(async () => undefined)
  window.aiOffice = {
    kbList: async () => [
      { path: '/kb/lease.docx', folder: 'kb', name: 'lease.docx', ext: 'docx', sizeBytes: 10 },
    ],
    kbSearch: async () => [],
    kbRead: async () => ({ text: '', nextOffset: null }),
    aiGetSettings: async () => stored,
    getAiSettings: async () => stored,
    setAiSettings: async () => undefined,
    aiStream,
    aiStreamCancel: async () => undefined,
    onAiStream: () => () => undefined,
  } as unknown as HomeApi
  ;(globalThis as Record<string, unknown>).aiOfficeUserSkills = {
    list: async () => [
      skillView('app:lease-check', 'Lease checklist'),
      skillView('builtin:find-skills', 'Find skills', { source: 'builtin', agentOnly: true }),
    ],
    aiRead: async (id: string) => ({
      ok: true,
      skill: {
        id,
        name: 'lease-check',
        title: 'Lease checklist',
        body: 'CHECK PETS FIRST',
        files: [],
      },
    }),
    openSettings: async () => undefined,
    onChanged: () => () => undefined,
  }
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

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

const composer = (): HTMLTextAreaElement => host.querySelector<HTMLTextAreaElement>('textarea')!

async function type(text: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(composer(), text)
    composer().setSelectionRange(text.length, text.length)
    composer().dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
  })
}

async function press(key: string): Promise<void> {
  await act(async () => {
    composer().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await settle()
  })
}

describe('ask panel skills', () => {
  it('sends the chosen skill text with the question and keeps the chip on it', async () => {
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
    await type('/')
    const rows = [...host.querySelectorAll('.ai-skill-picker-row')].map((r) => r.textContent)
    // rows show the skill name, not its title
    expect(rows.some((r) => r?.includes('lease-check'))).toBe(true)
    expect(rows.some((r) => r?.includes('Lease checklist'))).toBe(false)
    expect(rows.some((r) => r?.includes('find-skills'))).toBe(false)

    await press('Enter')
    expect(host.querySelector('.ai-skill-chips .ai-skill-chip-title')?.textContent).toBe(
      'lease-check',
    )
    await type('Pets allowed?')
    await press('Enter')

    expect(aiStream).toHaveBeenCalledTimes(1)
    const sent = JSON.stringify(aiStream.mock.calls[0]![0].messages)
    expect(sent).toContain('Pets allowed?')
    expect(sent).toContain('CHECK PETS FIRST')
    const question = host.querySelector('.kb-ask-user')!
    expect(question.textContent).toContain('Pets allowed?')
    expect(question.textContent).not.toContain('CHECK PETS FIRST')
    expect(question.querySelector('.ai-skill-chip-title')?.textContent).toBe('lease-check')
    // the chip left the composer with the question
    expect(host.querySelector('.ai-skill-chips')).toBeNull()
  })
})
