/** @vitest-environment jsdom */
// The split pane's role wiring (decision 0036): a secondary pane folds the AI
// panel to its rail while the panel stays mounted, a click on the rail asks the
// shell to focus this pane (this editor has no ribbon, so the rail is the only
// way into the assistant) and remembers the panel as open, and the screen root
// reports focus pings. Everything external is faked: no editor is started and
// no provider program can be reached.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { defaultAiSettings } from '@genoffice/ai-provider'
import type { SplitPaneRole } from '@genoffice/ui'
import App from '../src/renderer/App'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { HwpAiDock } from '../src/renderer/ai/AiDock'
import type { AgentBridge } from '../src/renderer/ai/agent-bridge'
import type { HwpApi } from '../src/shared/ipc'

interface FakeSplit {
  getRole: ReturnType<typeof vi.fn>
  requestFocus: ReturnType<typeof vi.fn>
  reportFocus: ReturnType<typeof vi.fn>
  bridge: {
    getRole: () => Promise<SplitPaneRole | null>
    onRoleChanged: (handler: (role: SplitPaneRole | null) => void) => () => void
    requestFocus: () => void
    reportFocus: () => void
  }
  /** the shell moves this view to another role: every listener hears the new one */
  push(role: SplitPaneRole | null): void
}

function fakeSplit(initial: SplitPaneRole | null): FakeSplit {
  let role = initial
  const listeners = new Set<(role: SplitPaneRole | null) => void>()
  const getRole = vi.fn(async () => role)
  const requestFocus = vi.fn()
  const reportFocus = vi.fn()
  return {
    getRole,
    requestFocus,
    reportFocus,
    bridge: {
      getRole,
      requestFocus,
      reportFocus,
      onRoleChanged: (handler) => {
        listeners.add(handler)
        return () => listeners.delete(handler)
      },
    },
    push(next) {
      role = next
      for (const handler of listeners) handler(next)
    },
  }
}

/**
 * The AI panel's outbound calls, faked. The editor bridge is never present, so
 * its selection polling fails and is swallowed (that is how the panel behaves
 * before the editor is ready), and the subscription reads as still checking.
 */
function hwpApiStub(): HwpApi {
  return {
    onLanguageChanged: () => () => undefined,
    onMemoBlocked: () => () => undefined,
    getAiSettings: async () => defaultAiSettings(),
    setAiSettings: async () => undefined,
    onAiSettingsChanged: () => () => undefined,
    openAiModelSettings: async () => undefined,
    setAiPanelPrefs: async () => ({}),
    pickAttachments: async () => ({ accepted: [], rejected: [] }),
    addAttachmentPaths: async () => ({ accepted: [], rejected: [] }),
    addPastedImage: async () => ({ accepted: [], rejected: [] }),
    getPathForFile: () => '',
    readAttachmentImage: async () => ({ ok: false }),
    onAiStream: () => () => undefined,
    aiStream: async () => undefined,
    aiStreamCancel: async () => undefined,
  } as unknown as HwpApi
}

let container: HTMLElement
let root: Root | null = null

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
  vi.unstubAllGlobals()
})

async function settle(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/** The dock with its open state held, the way the app holds it. */
function DockHarness({ initialOpen }: { initialOpen: boolean }): ReactElement {
  const [open, setOpen] = useState(initialOpen)
  return createElement(HwpAiDock, {
    open,
    setOpen,
    bridge: {} as AgentBridge,
    filePath: null,
  })
}

async function mountDock(split: FakeSplit, initialOpen: boolean): Promise<void> {
  vi.stubGlobal('aiOfficeSplit', split.bridge)
  Object.assign(window, { hwpApi: hwpApiStub() })
  root = createRoot(container)
  await act(async () => {
    root!.render(
      createElement(LocaleProvider, {
        initial: 'en',
        children: createElement(DockHarness, { initialOpen }),
      }),
    )
  })
  await settle()
}

const dock = () => container.querySelector<HTMLElement>('.ai-dock')!
const rail = () => container.querySelector<HTMLButtonElement>('.ai-rail')

describe('the split pane role', () => {
  it('folds the panel to its rail in a secondary pane, and the panel stays mounted', async () => {
    await mountDock(fakeSplit('secondary'), true)
    expect(dock().classList.contains('collapsed')).toBe(true)
    expect(rail()).not.toBeNull()
    // folded, not unmounted: a run in flight and its chat survive
    expect(container.querySelector('.ai-input-box textarea')).not.toBeNull()
  })

  it('asks the shell to focus this pane from the rail, and the panel shows once focus arrives', async () => {
    const split = fakeSplit('secondary')
    await mountDock(split, false)
    expect(dock().classList.contains('collapsed')).toBe(true)

    act(() => rail()!.click())
    expect(split.requestFocus).toHaveBeenCalledTimes(1)
    // the shell has not moved focus yet: the panel stays folded
    expect(dock().classList.contains('collapsed')).toBe(true)

    act(() => split.push('focus'))
    expect(dock().classList.contains('collapsed')).toBe(false)
    expect(rail()).toBeNull()
  })

  it('reports this view gaining focus from the screen root', async () => {
    const split = fakeSplit(null)
    vi.stubGlobal('aiOfficeSplit', split.bridge)
    // the first boot read never answers, so the editor never starts: this is
    // about the screen root alone, before the dock can even appear
    Object.assign(window, {
      hwpApi: {
        consumePending: () => new Promise<null>(() => {}),
        getTheme: async () => 'system',
        getLanguage: async () => 'en',
        onLanguageChanged: () => () => undefined,
        onMemoBlocked: () => () => undefined,
        onThemeChanged: () => () => undefined,
        onSaveRequest: () => () => undefined,
        onCloseSaveRequest: () => () => undefined,
        onPrintRequest: () => () => undefined,
        onPreviewRequest: () => () => undefined,
        onReadBytesRequest: () => () => undefined,
      } as unknown as HwpApi,
    })
    root = createRoot(container)
    await act(async () => {
      root!.render(createElement(LocaleProvider, { initial: 'en', children: createElement(App) }))
    })
    await settle()
    act(() => window.dispatchEvent(new Event('focus')))
    expect(split.reportFocus).toHaveBeenCalledTimes(1)
  })
})
