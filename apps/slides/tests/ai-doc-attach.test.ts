// Slides: the AI panel's "attach from an IeumOffice document" button. The
// shell's document picker (window.aiOfficeDocs) hands back paths, and they
// enter the composer's attachment list through the same path a Drive pick takes.
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DOC_ATTACH_BRIDGE_KEY } from '@genoffice/electron-utils/doc-attach-channels'

// react-konva's node entry requires the native 'canvas' package; nothing here draws
vi.mock('react-konva', () => {
  const stub = () => null
  return {
    Stage: stub,
    Layer: stub,
    Rect: stub,
    Group: stub,
    Transformer: stub,
    Line: stub,
    Arrow: stub,
    Text: stub,
    Ellipse: stub,
    Image: stub,
    Path: stub,
    Circle: stub,
    Arc: stub,
  }
})

import { AiPanel } from '../src/renderer/ai/AiPanel'
import { AI_PROVIDERS, type AiSettings } from '../src/shared/ipc'

const settings: AiSettings = {
  provider: 'anthropic',
  providers: Object.fromEntries(
    AI_PROVIDERS.map((p) => [p.id, { apiKey: '', model: p.defaultModel }]),
  ) as AiSettings['providers'],
}

function mount(element: React.ReactElement): {
  container: HTMLElement
  root: Root
  cleanup: () => void
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(element))
  return {
    container,
    root,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function panelProps(overrides: Record<string, unknown> = {}) {
  return {
    slides: [],
    current: 0,
    selectedIds: [],
    images: new Map<string, HTMLImageElement>(),
    applySlide: () => {},
    applyDeck: () => {},
    fitWidthPx: 960,
    settings,
    open: true,
    onExpand: () => {},
    onCollapse: () => {},
    ...overrides,
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

afterEach(() => {
  delete (window as { desktop?: unknown }).desktop
  delete (window as unknown as Record<string, unknown>)[DOC_ATTACH_BRIDGE_KEY]
})

describe('slides AI panel: attach from a document', () => {
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
    Object.assign(window, {
      desktop: {
        pickAttachments: async () => ({ accepted: [], rejected: [] }),
        addAttachmentPaths: added,
        readAttachmentImage: async () => ({ ok: false }),
        getPathForFile: () => '',
      },
    })
    ;(window as unknown as Record<string, unknown>)[DOC_ATTACH_BRIDGE_KEY] = {
      available: async () => true,
      pick: async () => ({ ok: true, paths: ['/deck/report.txt'] }),
    }

    const { container, cleanup } = mount(createElement(AiPanel, panelProps()))
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

      expect(added).toHaveBeenCalledWith(['/deck/report.txt'])
      const chips = [...container.querySelectorAll('.ai-attachments .ai-attachment-card-name')]
      expect(chips.map((chip) => chip.textContent)).toEqual(['report.txt'])
    } finally {
      cleanup()
    }
  })
})
