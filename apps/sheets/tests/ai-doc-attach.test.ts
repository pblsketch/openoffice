/** @vitest-environment jsdom */
/**
 * The sheets AI panel's "attach from an IeumOffice document" button: the
 * shell's document picker (window.aiOfficeDocs) hands back paths, and the
 * panel turns them into the same `onDrivePicked` call the Drive button makes.
 * (The picked paths then travel through App.tsx's `handleDrivePicked`, which is
 * not exported; this pins the panel's side of that contract.)
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeAiSettings,
  type AiSettings,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider/browser'
import { aiConnectPromptChoice, aiSendGate } from '@genoffice/ui'
import { DOC_ATTACH_BRIDGE_KEY } from '@genoffice/electron-utils/doc-attach-channels'
import { AiChatPanel, type AiPanelSubscription } from '../src/renderer/ai/AiChatPanel'

const settings = (): AiSettings =>
  normalizeAiSettings({ providers: {}, subscriptionNoticeSeen: true })

const bothReady: AiSubscriptionStatuses = {
  'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
  codex: { provider: 'codex', state: 'ready', meteredAccepted: false },
}

function subscriptionOf(stored: AiSettings, known: AiSubscriptionStatuses): AiPanelSubscription {
  const gate = aiSendGate(stored, known)
  return {
    settings: stored,
    statuses: known,
    connectChoice: aiConnectPromptChoice(gate, false),
    connectAttention: 0,
    noticeDue: gate.kind === 'notice',
    admitQueued: () => gate.kind === 'run',
    busy: false,
    actions: {
      onInstall: vi.fn(),
      onLogin: vi.fn(),
      onRecheck: vi.fn(),
      onAcceptMetered: vi.fn(),
      onOpenInstallHelp: vi.fn(),
    },
    refresh: vi.fn(),
    usage: [],
    inputTruncated: false,
    onDismissTruncated: vi.fn(),
    onAcknowledgeNotice: vi.fn(),
    onContinueWith: vi.fn(),
  }
}

let host: HTMLDivElement
let root: Root

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
  delete (window as { desktopApi?: unknown }).desktopApi
  delete (window as unknown as Record<string, unknown>)[DOC_ATTACH_BRIDGE_KEY]
  vi.unstubAllGlobals()
})

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('sheets AI panel: attach from a document', () => {
  it('reports the picked paths through onDrivePicked, like the Drive button', async () => {
    const onDrivePicked = vi.fn()
    ;(window as unknown as Record<string, unknown>)[DOC_ATTACH_BRIDGE_KEY] = {
      available: async () => true,
      pick: async () => ({ ok: true, paths: ['C:/book/report.xlsx'] }),
    }
    act(() =>
      root.render(
        createElement(AiChatPanel, {
          isOpen: true,
          hasContent: false,
          chat: [],
          attachments: [],
          attachNotice: null,
          onPickAttachments: () => undefined,
          onAddAttachmentPaths: () => undefined,
          onAddPastedImage: () => undefined,
          onRemoveAttachment: () => undefined,
          prompt: '',
          preview: null,
          aiBusy: false,
          subscription: subscriptionOf(settings(), bothReady),
          onPromptChange: () => undefined,
          onSend: () => undefined,
          onSendQueued: () => true,
          onStop: () => undefined,
          onNewChat: () => undefined,
          onUndo: () => undefined,
          scopeRange: null,
          scopeColumns: null,
          scopeLocked: false,
          onScopeDismiss: () => undefined,
          onCitation: () => undefined,
          onExpand: () => undefined,
          onCollapse: () => undefined,
          onDrivePicked,
        }),
      ),
    )
    await settle()
    await settle()

    const button = host.querySelector<HTMLButtonElement>('.ai-doc-attach-btn')
    expect(button).not.toBeNull()
    await act(async () => {
      button!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await settle()

    expect(onDrivePicked).toHaveBeenCalledWith({ paths: ['C:/book/report.xlsx'], notes: [] })
  })
})
