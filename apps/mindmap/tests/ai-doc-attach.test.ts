/**
 * The mindmap AI panel's "attach from an IeumOffice document" button: the
 * shell's document picker (window.aiOfficeDocs) hands back paths, and they
 * enter the composer's attachment list through the same path a Drive pick
 * takes (mindmapApi.addAttachmentPaths). No provider is ever reached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  defaultAiSettings,
  type AiStreamChunk,
  type AiStreamRequest,
  type AiSubscriptionState,
} from '@genoffice/ai-provider'
import type { SubscriptionStatusMap } from '@genoffice/ai-provider/browser'
import type { Lang } from '@genoffice/i18n'
import { DOC_ATTACH_BRIDGE_KEY } from '@genoffice/electron-utils/doc-attach-channels'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import type { MapAiHost } from '../src/renderer/ai/map-tools'
import { newMap } from '../src/renderer/document/open'
import type { AttachmentMeta, MindmapApi } from '../src/shared/ipc'

const statusMap = (
  claude: AiSubscriptionState,
  codex: AiSubscriptionState,
): SubscriptionStatusMap => ({
  'claude-code': { provider: 'claude-code', state: claude, meteredAccepted: false },
  codex: { provider: 'codex', state: codex, meteredAccepted: false },
})

function fakeApi() {
  const handlers: Record<string, ((...args: never[]) => void) | undefined> = {}
  const on =
    (name: string) =>
    (handler: (...args: never[]) => void): (() => void) => {
      handlers[name] = handler
      return () => {
        handlers[name] = undefined
      }
    }
  const added: string[][] = []
  const attachment = (path: string): AttachmentMeta => ({
    path,
    name: path.split('/').pop()!,
    ext: path.split('.').pop()!,
    sizeBytes: 10,
  })
  const api = {
    consumePending: async () => null,
    openFile: async () => ({ status: 'unreadable' }),
    save: async () => ({ ok: true, path: 'C:/maps/new.xmind' }),
    setDirty: () => {},
    onSaveRequest: on('save'),
    sendSaveRequestAck: () => {},
    onCloseSaveRequest: on('close'),
    sendCloseSaveResult: () => {},
    onFileRenamed: on('renamed'),
    openLink: async () => true,
    onMenuCommand: on('menu'),
    onExportRequest: on('export'),
    onPrintRequest: on('print'),
    getLanguage: async () => 'en' as Lang,
    onLanguageChanged: on('language'),
    getTheme: async () => 'system' as const,
    onThemeChanged: on('theme'),
    getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
    onAutoSaveDefaultChanged: on('autosave'),
    onChromePressed: on('chrome'),
    onOutlineRequest: on('outline'),
    sendOutlineResult: () => {},
    onBytesRequest: on('bytes'),
    sendBytesResult: () => {},
    // ---- the AI bridge ----
    getAiSettings: async () => ({ ...defaultAiSettings(), subscriptionNoticeSeen: true }),
    setAiSettings: async () => {},
    onAiSettingsChanged: () => () => {},
    openAiModelSettings: async () => {},
    getAiPanelPrefs: async () => ({}),
    onAiPanelPrefsChanged: () => () => {},
    setProvisionalTitle: () => {},
    addAttachmentPaths: async (paths: string[]) => {
      added.push(paths)
      return { accepted: paths.map(attachment), rejected: [] }
    },
    readAttachmentImage: async () => ({ ok: false }),
    subscription: {
      statuses: vi.fn(async () => statusMap('ready', 'ready')),
      recheck: vi.fn(async () => statusMap('ready', 'ready')),
      login: vi.fn(async () => ({ ok: true })),
      install: vi.fn(async () => ({ ok: true })),
      setMeteredAccepted: vi.fn(async () => ({ ok: true })),
      onChanged: () => () => {},
      openInstallHelp: vi.fn(async () => undefined),
    },
    onAiStream: (_listener: (chunk: AiStreamChunk) => void) => () => {},
    aiStream: async (_request: AiStreamRequest) => undefined,
    aiStreamCancel: async () => {},
  }
  return { api: api as unknown as MindmapApi, added }
}

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
  delete (window as { mindmapApi?: unknown }).mindmapApi
  delete (window as Record<string, unknown>)[DOC_ATTACH_BRIDGE_KEY]
  vi.unstubAllGlobals()
})

async function settle(turns = 12): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

describe('mindmap AI panel: attach from a document', () => {
  it('attaches the picked paths through the same path a Drive pick takes', async () => {
    const fake = fakeApi()
    ;(window as unknown as { mindmapApi: MindmapApi }).mindmapApi = fake.api
    ;(window as Record<string, unknown>)[DOC_ATTACH_BRIDGE_KEY] = {
      available: async () => true,
      pick: async () => ({ ok: true, paths: ['C:/maps/report.txt'] }),
    }
    const session = await newMap({ sheetTitle: 'Sheet 1', rootTitle: 'Central Topic' })
    const host: MapAiHost = {
      session: () => session,
      activeSheetKey: () => session.tabs()[0]!.key,
      controllerOf: () => null,
      showSheet: () => {},
      flush: () => {},
      isUntitled: () => true,
      newSheetNames: (n) => ({ title: `Sheet ${n}`, rootTitle: 'Central Topic' }),
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        createElement(
          LocaleProvider,
          { initial: 'en' },
          createElement(AiPanel, {
            host,
            filePath: null,
            onCollapse: () => {},
          }),
        ),
      )
    })
    unmount = () => act(() => root.unmount())
    await settle()

    const button = container.querySelector<HTMLButtonElement>('.ai-doc-attach-btn')
    expect(button).not.toBeNull()
    await act(async () => {
      button!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await settle()

    expect(fake.added).toEqual([['C:/maps/report.txt']])
    const chips = [...container.querySelectorAll('.ai-attachments .ai-attachment-card-name')]
    expect(chips.map((chip) => chip.textContent)).toEqual(['report.txt'])
  })
})
