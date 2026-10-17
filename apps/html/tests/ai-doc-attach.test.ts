import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  defaultAiSettings,
  type AiSettings,
  type AiStreamRequest,
} from '@genoffice/ai-provider'
import type { SubscriptionStatusMap } from '@genoffice/ai-provider/browser'
import { DOC_ATTACH_BRIDGE_KEY } from '@genoffice/electron-utils/doc-attach-channels'
import { AiPanel, type HtmlAiDeps } from '../src/renderer/ai/AiPanel'
import { buildParseMap, type ParseMap } from '../src/renderer/document/parse-map'

// The HTML panel's "attach from an IeumOffice document" button: the shell
// document picker (window.aiOfficeDocs) hands back paths, and they enter the
// composer's attachment list through the same path a Drive pick takes.

const DOC = '<!doctype html><html><head><title>T</title></head><body><h1>Hello</h1></body></html>'

const statuses: SubscriptionStatusMap = {
  'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
  codex: { provider: 'codex', state: 'ready', meteredAccepted: false },
}

function fakeMain() {
  const added: string[][] = []
  const htmlApi = {
    getAiSettings: async (): Promise<AiSettings> => defaultAiSettings(),
    setAiSettings: async () => undefined,
    onAiSettingsChanged: () => () => undefined,
    openAiModelSettings: vi.fn(async () => undefined),
    setAiPanelPrefs: vi.fn(async () => ({})),
    subscription: {
      statuses: vi.fn(async () => statuses),
      recheck: vi.fn(async () => statuses),
      login: vi.fn(async () => ({ ok: true })),
      install: vi.fn(async () => ({ ok: true })),
      setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses })),
      onChanged: () => () => undefined,
      openInstallHelp: vi.fn(async () => undefined),
    },
    onAiStream: () => () => undefined,
    aiStream: async (_request: AiStreamRequest) => undefined,
    aiStreamCancel: async () => undefined,
    pickAttachments: async () => ({ accepted: [], rejected: [] }),
    addAttachmentPaths: async (paths: string[]) => {
      added.push(paths)
      return {
        accepted: paths.map((path) => ({
          path,
          name: path.split('/').pop()!,
          ext: 'txt',
          sizeBytes: 12,
        })),
        rejected: [],
      }
    },
    getPathForFile: () => '',
    addPastedImage: async () => ({ accepted: [], rejected: [] }),
    readAttachmentImage: async () => ({ ok: false }),
  }
  return { htmlApi, added }
}

function fakeDeps(): HtmlAiDeps {
  let map: ParseMap | null = null
  return {
    access: {
      getText: () => DOC,
      getVersion: () => 1,
      getMap: () => (map ??= buildParseMap(DOC, 1, null)),
      getLastManualVersion: () => 0,
      getFilePath: () => null,
      getSelectedSid: () => null,
      applyOps: () => ({ ok: true, ranges: [] }),
      replaceAll: () => undefined,
    },
    getSnapshot: () => ({ text: DOC }),
    restoreSnapshot: () => undefined,
    onPrompt: () => undefined,
    onRunDone: () => undefined,
    clearHighlights: () => undefined,
    navigateTo: () => undefined,
    onBriefConfirmed: () => undefined,
    previewDraft: () => undefined,
  }
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Element.prototype.scrollTo = () => undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete (window as { htmlApi?: unknown }).htmlApi
  delete (window as Record<string, unknown>)[DOC_ATTACH_BRIDGE_KEY]
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  vi.unstubAllGlobals()
})

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

describe('html AI panel: attach from a document', () => {
  it('attaches the picked paths through the same path a Drive pick takes', async () => {
    const main = fakeMain()
    Object.assign(window, { htmlApi: main.htmlApi })
    ;(window as Record<string, unknown>)[DOC_ATTACH_BRIDGE_KEY] = {
      available: async () => true,
      pick: async () => ({ ok: true, paths: ['/site/report.txt'] }),
    }
    act(() =>
      root.render(
        createElement(AiPanel, {
          deps: fakeDeps(),
          filePath: null,
          editQueue: [],
          onQueueEditInstruction: () => undefined,
          onQueueRemove: () => undefined,
          onQueueClear: () => undefined,
          onQueueFocus: () => undefined,
          onQueueConsume: () => undefined,
          onCollapse: () => undefined,
        }),
      ),
    )
    await settle()

    const button = host.querySelector<HTMLButtonElement>('.ai-doc-attach-btn')
    expect(button).not.toBeNull()
    await act(async () => {
      button!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await settle()

    expect(main.added).toEqual([['/site/report.txt']])
    const chips = [...host.querySelectorAll('.ai-attachments .ai-attachment-card-name')]
    expect(chips.map((chip) => chip.textContent)).toEqual(['report.txt'])
  })
})
