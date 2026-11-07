/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiSubscriptionStatus } from '@genoffice/ai-provider'

let AiSubscriptionCard: typeof import('../src/AiSubscriptionCard').AiSubscriptionCard

beforeAll(async () => {
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })
  ;({ AiSubscriptionCard } = await import('../src/AiSubscriptionCard'))
})

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const DESKTOP_NOTE = {
  en: 'The Claude desktop app is not Claude Code, which this app runs. Claude Code is a separate program used in a terminal, so installing or updating the desktop app does not change it.',
  ko: 'Claude 데스크톱 앱은 이 앱이 실행하는 Claude Code가 아닙니다. Claude Code는 터미널에서 쓰는 별도 프로그램이라, 데스크톱 앱을 설치하거나 업데이트해도 바뀌지 않습니다.',
} as const

function render(status: AiSubscriptionStatus, lang: 'en' | 'ko'): void {
  act(() =>
    root.render(
      createElement(AiSubscriptionCard, {
        status,
        lang,
        onInstall: vi.fn(),
        onLogin: vi.fn(),
        onRecheck: vi.fn(),
        onAcceptMetered: vi.fn(),
        onOpenInstallHelp: vi.fn(),
        onUpdate: vi.fn(),
      }),
    ),
  )
}

const textsOf = (selector: string) =>
  [...host.querySelectorAll(selector)].map((element) => element.textContent)
const actionsShown = () =>
  [...host.querySelectorAll<HTMLElement>('[data-action]')].map((element) => element.dataset.action)

function outdated(programPath: string): AiSubscriptionStatus {
  return {
    provider: 'claude-code',
    state: 'error',
    meteredAccepted: false,
    version: '2.1.97',
    error: 'needs-update: Claude Code 2.1.97 is too old; version 2.1.248 or newer is required',
    programPath,
  }
}

describe('the Claude card on a Mac', () => {
  it('not installed: the desktop app is not Claude Code, and the official guide is the way on', () => {
    for (const lang of ['en', 'ko'] as const) {
      render({ provider: 'claude-code', state: 'not-installed', meteredAccepted: false }, lang)
      expect(textsOf('.ai-sub-note')).toEqual([DESKTOP_NOTE[lang]])
      expect(actionsShown()).toEqual(['install-help'])
    }
  })

  it('too old, from a Homebrew cask: names the file and the Homebrew command', () => {
    const path = '/opt/homebrew/Caskroom/claude-code/2.1.97/claude'
    for (const lang of ['en', 'ko'] as const) {
      render(outdated(path), lang)
      expect(host.querySelector('.ai-sub-detail')!.textContent).toBe(
        {
          en: 'The Claude program on this PC (2.1.97) is too old; 2.1.248 or newer is needed. Run brew upgrade claude-code in a terminal, then check again.',
          ko: '이 PC의 Claude 프로그램(2.1.97)이 오래되었습니다. 2.1.248 이상이 필요합니다. 터미널에서 brew upgrade claude-code를 실행한 뒤 다시 확인하세요.',
        }[lang],
      )
      expect(host.querySelector('.ai-sub-path-value')!.textContent).toBe(path)
      expect(textsOf('.ai-sub-path-label')).toHaveLength(1)
      expect(textsOf('.ai-sub-note')).toEqual([DESKTOP_NOTE[lang]])
      expect(actionsShown()).toEqual(['recheck'])
    }
  })

  it("too old, from the vendor's installer: claude update", () => {
    render(outdated('/Users/me/.local/share/claude/versions/2.1.97'), 'en')
    expect(host.querySelector('.ai-sub-detail')!.textContent).toContain(
      'Run claude update in a terminal',
    )
  })
})
