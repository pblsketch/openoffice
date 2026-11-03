/**
 * The diagram's AI panel against a scripted main process and a fake draw.io:
 * the model's answers are written out here as stream chunks, so no provider
 * is ever reached. The settings resolve to a subscription provider (Claude is
 * `ready`), which is exactly why the stream channel below is a fake: nothing
 * in these tests can start a `claude` or `codex` program.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  defaultAiSettings,
  type AiSettings,
  type AiStreamChunk,
  type AiStreamRequest,
} from '@genoffice/ai-provider'
import type { SubscriptionStatusMap } from '@genoffice/ai-provider/browser'
import { LANGS, PRODUCT_NAME, type Lang } from '@genoffice/i18n'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { aiStrings } from '../src/renderer/i18n/strings-ai'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import { diagramAiHost } from '../src/renderer/ai/AiDock'
import type { DiagramApi } from '../src/shared/ipc'
import { fakeFrame } from './helpers/fake-drawio'

const statuses: SubscriptionStatusMap = {
  'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
  codex: { provider: 'codex', state: 'ready', meteredAccepted: false },
}

const ready = (): AiSettings => ({ ...defaultAiSettings(), subscriptionNoticeSeen: true })

type Reply = (request: AiStreamRequest, nth: number) => Array<Partial<AiStreamChunk>>

function fakeApi(reply: Reply) {
  let streamListener: ((chunk: AiStreamChunk) => void) | null = null
  const requests: AiStreamRequest[] = []
  const titles: string[] = []
  const api = {
    getLanguage: async () => 'en' as Lang,
    onLanguageChanged: () => () => {},
    getAiSettings: async () => ready(),
    setAiSettings: async () => {},
    onAiSettingsChanged: () => () => {},
    openAiModelSettings: async () => {},
    getAiPanelPrefs: async () => ({}),
    onAiPanelPrefsChanged: () => () => {},
    setProvisionalTitle: (title: string) => void titles.push(title),
    addAttachmentPaths: async () => ({ accepted: [], rejected: [] }),
    readAttachmentImage: async () => ({ ok: false }),
    subscription: {
      statuses: vi.fn(async () => statuses),
      recheck: vi.fn(async () => statuses),
      login: vi.fn(async () => ({ ok: true })),
      install: vi.fn(async () => ({ ok: true })),
      setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses })),
      onChanged: () => () => {},
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
      for (const chunk of reply(request, requests.length)) {
        streamListener?.({ requestId: request.requestId, ...chunk } as AiStreamChunk)
      }
    },
    aiStreamCancel: async () => {},
  }
  return { api: api as unknown as DiagramApi, requests, titles }
}

const toolCall = (name: string, input: Record<string, unknown>) => [
  { type: 'tool-call', toolCall: { id: 'call-1', name, input } },
  { type: 'done' },
]

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
  delete (window as { diagramApi?: unknown }).diagramApi
  vi.unstubAllGlobals()
})

async function settle(turns = 16): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mount(api: DiagramApi, fake: ReturnType<typeof fakeFrame>): Promise<void> {
  ;(window as unknown as { diagramApi: DiagramApi }).diagramApi = api
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const host = diagramAiHost({ client: () => fake.frame, ready: () => true })
  await act(async () => {
    root.render(
      createElement(LocaleProvider, {
        initial: 'en',
        children: createElement(AiPanel, { host, filePath: null, onCollapse: () => {} }),
      }),
    )
  })
  unmount = () => act(() => root.unmount())
  await settle()
}

async function sendMessage(text: string): Promise<void> {
  const box = container.querySelector<HTMLTextAreaElement>('.ai-input-box textarea')!
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(box, text)
    box.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => container.querySelector<HTMLButtonElement>('.ai-send-btn')!.click())
  await settle(24)
}

describe('a run', () => {
  it('sends the page on screen as text with the diagram tools, and no picture', async () => {
    const drawio = fakeFrame()
    drawio.drawio.selected = ['a']
    const { api, requests, titles } = fakeApi(() => [
      { type: 'delta', text: 'Two shapes.' },
      { type: 'done' },
    ])
    await mount(api, drawio)
    await sendMessage('what is on this page?')
    expect(requests).toHaveLength(1)
    const request = requests[0] as AiStreamRequest & {
      system: string
      tools: Array<{ name: string }>
      messages: Array<{ role: string; content?: unknown; images?: unknown }>
    }
    expect(request.tools.map((tool) => tool.name).sort()).toEqual(
      ['apply_diagram_ops', 'read_attachment', 'read_diagram', 'read_url', 'web_search'].sort(),
    )
    expect(request.system).toContain(`${PRODUCT_NAME} Diagram`)
    const sent = JSON.stringify(request.messages)
    expect(sent).toContain('<diagram_page>')
    expect(sent).toContain('Selected: a')
    expect(sent).toContain('a | Start')
    // the model never gets a picture of the diagram
    expect(request.messages.some((message) => message.images !== undefined)).toBe(false)
    expect(sent).not.toMatch(/data:image|"type":"image"/)
    // an untitled diagram takes its tab name from the first request
    expect(titles).toEqual(['what is on this page?'])
  })

  it('applies a mixed call as one bridge request, and the turn is taken back in one go', async () => {
    const drawio = fakeFrame()
    const before = drawio.drawio.snapshot()
    const { api, requests } = fakeApi((_request, nth) =>
      nth === 1
        ? toolCall('apply_diagram_ops', {
            ops: [
              { op: 'insert_mermaid', text: 'graph LR\n  Go --> Stop' },
              { op: 'update', id: 'a', label: 'Begin' },
            ],
          })
        : [{ type: 'delta', text: 'Drew it.' }, { type: 'done' }],
    )
    await mount(api, drawio)
    await sendMessage('draw a flow')
    expect(requests).toHaveLength(2)
    expect(drawio.calls.filter((op) => op === 'applyBatch')).toHaveLength(1)
    expect(drawio.drawio.history).toHaveLength(1)
    expect(JSON.stringify(requests[1]!.messages)).toContain('Applied 2 op(s) as one undo step.')
    expect(container.textContent).toContain('Drew a Mermaid diagram')

    const undo = container.querySelector<HTMLButtonElement>('[data-action="ai-turn-undo"]')
    expect(undo).not.toBeNull()
    await act(async () => undo!.click())
    await settle()
    expect(drawio.drawio.snapshot()).toBe(before)
    expect(container.querySelector('[data-action="ai-turn-undo"]')).toBeNull()
  })

  it('reports a refused call to the model and leaves the diagram as it was', async () => {
    const drawio = fakeFrame()
    const before = drawio.drawio.snapshot()
    const { api, requests } = fakeApi((_request, nth) =>
      nth === 1
        ? toolCall('apply_diagram_ops', {
            ops: [
              { op: 'add_shape', label: 'Fine', x: 0, y: 200 },
              { op: 'delete', ids: ['nope'] },
            ],
          })
        : [{ type: 'delta', text: 'One op was refused.' }, { type: 'done' }],
    )
    await mount(api, drawio)
    await sendMessage('change it')
    expect(JSON.stringify(requests[1]!.messages)).toContain('Nothing was changed')
    expect(drawio.calls).not.toContain('applyBatch')
    expect(drawio.drawio.snapshot()).toBe(before)
    expect(container.textContent).toContain('The diagram was not changed')
    expect(container.querySelector('[data-action="ai-turn-undo"]')).toBeNull()
  })
})

describe('the panel strings', () => {
  it('has the same keys in all 21 languages, filled and translated', () => {
    const keys = Object.keys(aiStrings.zh).sort()
    expect(Object.keys(aiStrings)).toHaveLength(21)
    for (const lang of LANGS) {
      expect(Object.keys(aiStrings[lang]).sort(), lang).toEqual(keys)
      for (const key of keys) {
        expect(aiStrings[lang][key as keyof typeof aiStrings.zh], `${lang}.${key}`).not.toBe('')
      }
      if (lang !== 'en') {
        expect(aiStrings[lang].aiEmptyBody, lang).not.toBe(aiStrings.en.aiEmptyBody)
        expect(aiStrings[lang].aiToolApplyOpsFailed, lang).not.toBe(
          aiStrings.en.aiToolApplyOpsFailed,
        )
      }
    }
  })
})
