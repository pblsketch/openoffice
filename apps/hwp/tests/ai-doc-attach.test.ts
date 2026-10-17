/** @vitest-environment jsdom */
// The HWP AI panel's "attach from an IeumOffice document" button. The shell's
// document picker (window.aiOfficeDocs) hands back paths, and they enter the
// composer's attachment list through the same path a Drive pick takes. The
// panel's editor bridge is never really present here, so its polling simply
// fails and is swallowed (that is how the panel behaves before the editor is
// ready); no provider is ever reached.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { defaultAiSettings } from '@genoffice/ai-provider'
import { DOC_ATTACH_BRIDGE_KEY } from '@genoffice/electron-utils/doc-attach-channels'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import type { AgentBridge } from '../src/renderer/ai/agent-bridge'

let container: HTMLElement
let root: Root | null = null

function hwpApiStub(added: string[][]) {
  return {
    getAiSettings: async () => defaultAiSettings(),
    setAiSettings: async () => undefined,
    onAiSettingsChanged: () => () => undefined,
    openAiModelSettings: vi.fn(async () => undefined),
    setAiPanelPrefs: vi.fn(async () => ({})),
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
    addPastedImage: async () => ({ accepted: [], rejected: [] }),
    getPathForFile: () => '',
    readAttachmentImage: async () => ({ ok: false }),
    onAiStream: () => () => undefined,
    aiStream: async () => undefined,
    aiStreamCancel: async () => undefined,
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Element.prototype.scrollTo = () => undefined
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  container.remove()
  delete (window as { hwpApi?: unknown }).hwpApi
  delete (window as Record<string, unknown>)[DOC_ATTACH_BRIDGE_KEY]
  vi.unstubAllGlobals()
})

async function settle(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

describe('hwp AI panel: attach from a document', () => {
  it('attaches the picked paths through the same path a Drive pick takes', async () => {
    const added: string[][] = []
    Object.assign(window, { hwpApi: hwpApiStub(added) })
    ;(window as Record<string, unknown>)[DOC_ATTACH_BRIDGE_KEY] = {
      available: async () => true,
      pick: async () => ({ ok: true, paths: ['C:/hwp/report.txt'] }),
    }
    root = createRoot(container)
    await act(async () => {
      root!.render(
        createElement(AiPanel, {
          bridge: {} as AgentBridge,
          filePath: null,
          onCollapse: () => undefined,
        }),
      )
    })
    await settle()

    const button = container.querySelector<HTMLButtonElement>('.ai-doc-attach-btn')
    expect(button).not.toBeNull()
    await act(async () => {
      button!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await settle()

    expect(added).toEqual([['C:/hwp/report.txt']])
    const chips = [...container.querySelectorAll('.ai-attachments .ai-attachment-card-name')]
    expect(chips.map((chip) => chip.textContent)).toEqual(['report.txt'])
  })
})
