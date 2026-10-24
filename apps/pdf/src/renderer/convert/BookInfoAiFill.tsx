/**
 * The AI side of "Fill with AI": mounted only once the button was pressed, so
 * opening the dialog checks no connection and sends nothing. Each press asks
 * the shared send gate (`useAiSendGate`) like the AI panel does: a press during
 * the status check or in front of the first-connection notice is held and
 * starts once the way is clear, a press in front of "not connected" shows the
 * connect prompt and sends nothing. A run is one tool-less request
 * (`streamText`) over the panel's own IPC transport.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { streamText } from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider/browser'
import type { Lang } from '@genoffice/i18n'
import {
  AiConnectPrompt,
  AiFirstConnectionNotice,
  useAiSendGate,
  type AiModelPickerBridge,
} from '@genoffice/ui'
import type { TFunc } from '../i18n/locale'
import { createElectronTransport } from '../ai/transport'
import { useSubscriptionConnection } from '../ai/useSubscriptionConnection'
import {
  AI_FILL_REPLY_MAX_CHARS,
  BOOK_INFO_SYSTEM,
  bookInfoUserMessage,
  parseBookInfoReply,
  type BookInfoSuggestion,
} from './book-info-ai'

const SETTINGS_BRIDGE: AiModelPickerBridge = {
  getSettings: () => window.pdfApi.getAiSettings(),
  setSettings: (settings) => window.pdfApi.setAiSettings(settings),
  onSettingsChanged: (handler) => window.pdfApi.onAiSettingsChanged(handler),
  openModelSettings: () => window.pdfApi.openAiModelSettings().catch(() => {}),
}

export type BookInfoFillState =
  { kind: 'idle' } | { kind: 'running' } | { kind: 'filled' } | { kind: 'error'; message: string }

export function BookInfoAiFill({
  press,
  lang,
  t,
  collectText,
  onSuggest,
  onStateChange,
}: {
  /** counts the presses of the button; each new value asks to send once */
  press: number
  lang: Lang
  t: TFunc
  /** the text of the first pages; '' when they have none */
  collectText: () => Promise<string>
  onSuggest: (suggestion: BookInfoSuggestion) => void
  onStateChange: (state: BookInfoFillState) => void
}): ReactElement {
  const connection = useSubscriptionConnection()
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const runningRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const langRef = useRef(lang)
  langRef.current = lang
  const propsRef = useRef({ collectText, onSuggest, onStateChange, t })
  propsRef.current = { collectText, onSuggest, onStateChange, t }

  useEffect(() => {
    let alive = true
    const refresh = () => {
      void window.pdfApi
        ?.getAiSettings()
        .then((next) => {
          if (alive) setSettings(next)
        })
        .catch(() => {})
    }
    refresh()
    const off = window.pdfApi?.onAiSettingsChanged(refresh)
    return () => {
      alive = false
      off?.()
      abortRef.current?.abort()
    }
  }, [])

  const run = async (): Promise<void> => {
    if (runningRef.current) return
    runningRef.current = true
    const {
      collectText: collect,
      onSuggest: suggest,
      onStateChange: report,
      t: tr,
    } = propsRef.current
    report({ kind: 'running' })
    const abort = new AbortController()
    abortRef.current = abort
    try {
      const text = await collect()
      if (abort.signal.aborted) return
      if (!text) {
        report({ kind: 'error', message: tr('cvAiNoText') })
        return
      }
      // the stored settings as they are now: the provider the gate just let through
      const current = await window.pdfApi.getAiSettings()
      const outcome = await streamText({
        transport: createElectronTransport(() => current, {
          lang: () => langRef.current,
          // a one-off request: cancelling it must not end the chat's media calls
          cancelScope: 'request',
        }),
        system: BOOK_INFO_SYSTEM,
        user: bookInfoUserMessage(text),
        signal: abort.signal,
        maxChars: AI_FILL_REPLY_MAX_CHARS,
        extract: (raw) => ({ text: raw }),
      })
      if (abort.signal.aborted) return
      if (outcome.status === 'empty') {
        report({ kind: 'error', message: outcome.error || tr('cvAiUnreadable') })
        return
      }
      const suggestion = outcome.status === 'complete' ? parseBookInfoReply(outcome.text) : null
      if (!suggestion) {
        report({ kind: 'error', message: tr('cvAiUnreadable') })
        return
      }
      suggest(suggestion)
      report({ kind: 'filled' })
    } catch (err) {
      if (!abort.signal.aborted) {
        report({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      runningRef.current = false
      if (abortRef.current === abort) abortRef.current = null
    }
  }
  const runRef = useRef(run)
  runRef.current = run

  const sendGate = useAiSendGate<number>({
    settings,
    statuses: connection.statuses,
    store: SETTINGS_BRIDGE,
    start: () => void runRef.current(),
    onSettingsSaved: (next) => setSettings(next),
  })

  // one ask per press; nothing is sent before the first press (this component is not mounted then)
  useEffect(() => {
    if (press <= 0 || runningRef.current) return
    if (sendGate.admit(press)) void runRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per press
  }, [press])

  return (
    <>
      {sendGate.connectChoice && (
        <AiConnectPrompt
          choice={sendGate.connectChoice}
          statuses={connection.statuses}
          lang={lang}
          disabled={connection.busy}
          attention={sendGate.connectAttention}
          onOpenSettings={() => void window.pdfApi.openAiModelSettings().catch(() => {})}
          onInstall={connection.install}
          onUpdate={connection.update}
          onCancelLogin={connection.cancelLogin}
          onLogin={connection.login}
          onRecheck={connection.recheck}
          onAcceptMetered={connection.acceptMetered}
          onOpenInstallHelp={connection.openInstallHelp}
          onOpenConnectHelp={connection.openConnectHelp}
        />
      )}
      {sendGate.noticeDue && (
        <AiFirstConnectionNotice
          lang={lang}
          codexKeepsHistory
          sendsWholeDocument
          onAcknowledge={sendGate.acknowledgeNotice}
        />
      )}
    </>
  )
}
