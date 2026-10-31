/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import type {
  AiSettings,
  AiSubscriptionState,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import { aiSubscriptionText } from '@genoffice/ui'
import type { HomeApi } from '../src/shared/home-api'
import {
  FirstConnectionDialog,
  useFirstConnectionNotice,
} from '../src/renderer/src/FirstConnectionNotice'
import { LocaleProvider } from '../src/renderer/src/locale'
import { CODEX_MAY_KEEP_HISTORY } from '../src/renderer/src/settings-ai'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let stored: AiSettings
let setAiSettings: ReturnType<typeof vi.fn>
let settingsListeners: Array<() => void> = []

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  settingsListeners = []
  stored = defaultAiSettings()
  setAiSettings = vi.fn(async (next: AiSettings) => {
    stored = next
    for (const listener of settingsListeners) listener()
  })
  window.aiOffice = {
    getAiSettings: async () => stored,
    setAiSettings,
    onAiSettingsChanged: (handler: () => void) => {
      settingsListeners.push(handler)
      return () => {
        settingsListeners = settingsListeners.filter((listener) => listener !== handler)
      }
    },
  } as unknown as HomeApi
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function statuses(claude: AiSubscriptionState, codex: AiSubscriptionState): SubscriptionStatusMap {
  return {
    'claude-code': { provider: 'claude-code', state: claude, meteredAccepted: false },
    codex: { provider: 'codex', state: codex, meteredAccepted: false },
  }
}

/** the way the app frame uses the two: the dialog is up exactly while the notice is due */
function Harness({ map }: { map: SubscriptionStatusMap }) {
  const notice = useFirstConnectionNotice(map)
  return notice.due
    ? createElement(FirstConnectionDialog, { onAcknowledge: notice.acknowledge })
    : null
}

async function render(map: SubscriptionStatusMap): Promise<void> {
  await act(async () => {
    root.render(createElement(LocaleProvider, { initial: 'en' }, createElement(Harness, { map })))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const dialog = (): HTMLElement | null => host.querySelector<HTMLElement>('.first-notice')

describe('first-connection notice', () => {
  it('stays away until a subscription can be used', async () => {
    await render(statuses('signed-out', 'not-installed'))
    expect(dialog()).toBeNull()
  })

  it('comes up the moment a subscription becomes usable, with all four statements', async () => {
    await render(statuses('signed-out', 'signed-out'))
    expect(dialog()).toBeNull()

    await render(statuses('signed-out', 'ready'))
    const lines = Array.from(dialog()!.querySelectorAll('li')).map((li) => li.textContent)
    expect(lines).toEqual([
      aiSubscriptionText('en', 'noticeSend'),
      aiSubscriptionText('en', 'noticeTraining'),
      aiSubscriptionText('en', 'noticePdfWholeDocument'),
      aiSubscriptionText('en', 'noticeCodexHistory'),
    ])
    expect(dialog()!.getAttribute('role')).toBe('dialog')
    expect(dialog()!.getAttribute('aria-label')).toBe(aiSubscriptionText('en', 'noticeTitle'))
  })

  it('is acknowledged once: the flag is stored and the notice does not return', async () => {
    await render(statuses('ready', 'signed-out'))
    await act(async () => {
      dialog()!.querySelector<HTMLButtonElement>('.ai-sub-btn')!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(setAiSettings).toHaveBeenCalledTimes(1)
    expect(stored.subscriptionNoticeSeen).toBe(true)
    expect(dialog()).toBeNull()

    // a later connection of the other provider is not a first connection
    await render(statuses('ready', 'ready'))
    expect(dialog()).toBeNull()
  })

  it('does not show when it was acknowledged elsewhere (an editor AI panel)', async () => {
    stored = { ...defaultAiSettings(), subscriptionNoticeSeen: true }
    await render(statuses('ready', 'ready'))
    expect(dialog()).toBeNull()
  })

  it('closes when another window acknowledges it meanwhile', async () => {
    await render(statuses('ready', 'signed-out'))
    expect(dialog()).not.toBeNull()
    await act(async () => {
      stored = { ...stored, subscriptionNoticeSeen: true }
      for (const listener of settingsListeners) listener()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(dialog()).toBeNull()
  })
})

describe('the Codex sentence of the notice', () => {
  it('is shown, and says history is off while diagnostic logs may remain', () => {
    // T4: threads are ephemeral and history persistence is off, but Codex still
    // writes its own diagnostic log database on this PC
    expect(CODEX_MAY_KEEP_HISTORY).toBe(true)
    const en = aiSubscriptionText('en', 'noticeCodexHistory')
    expect(en).toMatch(/turns off conversation history/)
    expect(en).toMatch(/diagnostic logs on this PC/)
    expect(en).not.toMatch(/keep conversation content/)
    const ko = aiSubscriptionText('ko', 'noticeCodexHistory')
    expect(ko).toMatch(/대화 기록 저장을 꺼/)
    expect(ko).toMatch(/진단 로그/)
    expect(ko).not.toMatch(/대화 내용을 이 PC에 남길/)
  })
})
