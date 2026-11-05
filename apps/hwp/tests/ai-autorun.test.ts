/** @vitest-environment jsdom */
// The HWP AI panel's requests handed over from elsewhere. One from the document check waits in
// the input box; one with autoRun (the editor's right-click 쉬운 말로 풀기) is sent at once,
// through the panel's usual gate: in front of "not connected" the gate answers with the connect
// prompt and the request waits in the input box, as a typed one would. No provider is reached.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { defaultAiSettings } from '@genoffice/ai-provider'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import type { AgentBridge } from '../src/renderer/ai/agent-bridge'
import { afterPrefillTaken, type AiPrefill } from '../src/renderer/ai/easy-words'

let container: HTMLElement
let root: Root | null = null
const streamed: unknown[] = []

function hwpApiStub() {
  return {
    getAiSettings: async () => defaultAiSettings(),
    setAiSettings: async () => undefined,
    onAiSettingsChanged: () => () => undefined,
    openAiModelSettings: vi.fn(async () => undefined),
    setAiPanelPrefs: vi.fn(async () => ({})),
    pickAttachments: async () => ({ accepted: [], rejected: [] }),
    addAttachmentPaths: async () => ({ accepted: [], rejected: [] }),
    addPastedImage: async () => ({ accepted: [], rejected: [] }),
    getPathForFile: () => '',
    readAttachmentImage: async () => ({ ok: false }),
    onAiStream: () => () => undefined,
    aiStream: async (...args: unknown[]) => {
      streamed.push(args)
    },
    aiStreamCancel: async () => undefined,
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Element.prototype.scrollTo = () => undefined
  container = document.createElement('div')
  document.body.appendChild(container)
  Object.assign(window, { hwpApi: hwpApiStub() })
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  container.remove()
  streamed.length = 0
  delete (window as { hwpApi?: unknown }).hwpApi
  vi.unstubAllGlobals()
})

async function settle(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(prefill: AiPrefill | null): Promise<void> {
  await act(async () => {
    root!.render(
      createElement(AiPanel, {
        bridge: {} as AgentBridge,
        filePath: null,
        onCollapse: () => undefined,
        prefill,
      }),
    )
  })
  await settle()
}

const composer = () => container.querySelector('textarea')?.value
/** the connect prompt: the gate's answer to a send in front of "not connected" */
const connectPrompt = () => container.querySelector('.ai-sub-prompt')

describe('hwp AI panel: requests handed over', () => {
  it('leaves a request of the document check in the input box, unsent', async () => {
    root = createRoot(container)
    await render(null)
    await render({ text: '쪽 번호를 고쳐 주세요.', nonce: 1 })
    expect(composer()).toBe('쪽 번호를 고쳐 주세요.')
    expect(connectPrompt()).toBeNull()
    expect(streamed).toEqual([])
  })

  it('sends an autoRun request at once, through the usual gate', async () => {
    root = createRoot(container)
    await render(null)
    expect(connectPrompt()).toBeNull()
    await render({ text: '쉬운 말로 풀어 주세요.', nonce: 2, autoRun: true })
    // nothing is connected here: the gate answers with the connect prompt, and the request
    // waits in the input box as a typed one would; nothing reached a provider
    expect(connectPrompt()).not.toBeNull()
    expect(composer()).toBe('쉬운 말로 풀어 주세요.')
    expect(streamed).toEqual([])
  })

  it('sends an autoRun request once: the panel mounting again (the print preview) does not resend it', async () => {
    // the app's side: it keeps the handed request, shows the panel only while the preview is
    // closed, and clears the request once the panel took it
    const host: {
      hand?: (prefill: AiPrefill | null) => void
      show?: (shown: boolean) => void
    } = {}
    function Host(): ReactElement | null {
      const [prefill, setPrefill] = useState<AiPrefill | null>(null)
      const [shown, setShown] = useState(true)
      host.hand = setPrefill
      host.show = setShown
      if (!shown) return null
      return createElement(AiPanel, {
        bridge: {} as AgentBridge,
        filePath: null,
        onCollapse: () => undefined,
        prefill,
        onPrefillTaken: (taken: AiPrefill) =>
          setPrefill((current) => afterPrefillTaken(current, taken)),
      })
    }
    root = createRoot(container)
    await act(async () => root!.render(createElement(Host)))
    await settle()
    expect(connectPrompt()).toBeNull()

    await act(async () => host.hand!({ text: '쉬운 말로 풀어 주세요.', nonce: 3, autoRun: true }))
    await settle()
    // sent once through the gate: the connect prompt answers it
    expect(connectPrompt()).not.toBeNull()
    expect(composer()).toBe('쉬운 말로 풀어 주세요.')

    // the print preview opens and closes: the panel unmounts and mounts again
    await act(async () => host.show!(false))
    await settle()
    expect(container.querySelector('textarea')).toBeNull()
    await act(async () => host.show!(true))
    await settle()
    // nothing was sent again: no gate answer, an empty input box
    expect(connectPrompt()).toBeNull()
    expect(composer()).toBe('')

    // a new click is a new request: it is sent
    await act(async () => host.hand!({ text: '다시 풀어 주세요.', nonce: 4, autoRun: true }))
    await settle()
    expect(connectPrompt()).not.toBeNull()
    expect(composer()).toBe('다시 풀어 주세요.')
    expect(streamed).toEqual([])
  })

  it('clears only the autoRun request that was taken', () => {
    const auto: AiPrefill = { text: 'a', nonce: 5, autoRun: true }
    const newer: AiPrefill = { text: 'b', nonce: 6, autoRun: true }
    const fill: AiPrefill = { text: 'c', nonce: 5 }
    expect(afterPrefillTaken(auto, auto)).toBeNull()
    expect(afterPrefillTaken(newer, auto)).toBe(newer)
    expect(afterPrefillTaken(fill, auto)).toBe(fill)
    expect(afterPrefillTaken(null, auto)).toBeNull()
  })
})
