// The docs AI panel's "attach from an IeumOffice document" button: a shell
// document picker (window.aiOfficeDocs) hands back paths, and they enter the
// composer's attachment list through the same path a Drive pick takes.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DOC_ATTACH_BRIDGE_KEY } from '@genoffice/electron-utils/doc-attach-channels'

import { editorExtensions } from '../src/renderer/editor/extensions'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import { AI_PROVIDERS, type AiSettings } from '../src/shared/ipc'

const settings: AiSettings = {
  provider: 'anthropic',
  providers: Object.fromEntries(
    AI_PROVIDERS.map((p) => [p.id, { apiKey: '', model: p.defaultModel }]),
  ) as AiSettings['providers'],
}

function createEditor(): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [
        {
          type: 'docParagraph',
          attrs: { docxIndex: 0 },
          content: [{ type: 'text', text: 'annual report' }],
        },
      ],
    },
  })
}

function mount(element: React.ReactElement): { container: HTMLElement; cleanup: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => root.render(element))
  return {
    container,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeAll(() => {
  Element.prototype.scrollTo ??= () => {}
})

describe('docs AI panel: attach from a document', () => {
  it('attaches the picked paths through the same path a Drive pick takes', async () => {
    const added = vi.fn(async (paths: string[]) => ({
      accepted: paths.map((path) => ({
        path,
        name: path.split('/').pop()!,
        ext: 'txt',
        sizeBytes: 12,
      })),
      rejected: [],
    }))
    const win = window as unknown as {
      desktop?: unknown
      projectApi?: unknown
      [key: string]: unknown
    }
    const previousDesktop = win.desktop
    const previousProjectApi = win.projectApi
    win.desktop = {
      pickAttachments: vi.fn(async () => ({ accepted: [], rejected: [] })),
      addAttachmentPaths: added,
      readAttachmentImage: vi.fn(async () => ({ ok: false })),
    }
    win.projectApi = {
      resolveChat: vi.fn(async () => ({ projectId: 'p', chatId: 'c' })),
      loadChat: vi.fn(async () => []),
    }
    win[DOC_ATTACH_BRIDGE_KEY] = {
      available: async () => true,
      pick: async () => ({ ok: true, paths: ['/docs/report.txt'] }),
    }

    const editor = createEditor()
    try {
      const { container, cleanup } = mount(
        createElement(AiPanel, { editor, blocks: [], settings, open: true }),
      )
      try {
        await flush()
        await flush()
        const button = container.querySelector<HTMLButtonElement>('.ai-doc-attach-btn')
        expect(button).not.toBeNull()
        await act(async () => {
          button!.click()
          await new Promise((resolve) => setTimeout(resolve, 0))
        })
        await flush()

        expect(added).toHaveBeenCalledWith(['/docs/report.txt'])
        const chips = [
          ...container.querySelectorAll('.ai-attachments .ai-attachment-card-name'),
        ]
        expect(chips.map((chip) => chip.textContent)).toEqual(['report.txt'])
      } finally {
        cleanup()
      }
    } finally {
      editor.destroy()
      win.desktop = previousDesktop
      win.projectApi = previousProjectApi
      delete win[DOC_ATTACH_BRIDGE_KEY]
    }
  })
})
