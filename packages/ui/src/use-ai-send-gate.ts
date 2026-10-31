import { useEffect, useRef, useState } from 'react'
import type {
  AiProviderChoice,
  AiSettings,
  AiSubscriptionProviderId,
  AiSubscriptionStatuses,
} from '@genoffice/ai-provider/browser'
import {
  aiConnectPromptChoice,
  aiHeldRequestStep,
  aiHoldReason,
  aiSendGate,
  changeStoredAiSettings,
  withAiContinueProvider,
  withAiSubscriptionNoticeSeen,
  type AiHeldReason,
  type AiSendGate,
  type AiSettingsStore,
} from './ai-send-gate'

export interface AiSendGateArgs<R, S extends AiSettings = AiSettings> {
  /** the AI settings as the app holds them; null until they are read */
  readonly settings: S | null | undefined
  /** the connection statuses; null until a first answer */
  readonly statuses: AiSubscriptionStatuses | null | undefined
  /** where the settings are stored: writes read the stored copy first */
  readonly store: AiSettingsStore<S>
  /**
   * Start a request that was held (the status check answered, or the notice
   * was acknowledged). It goes through the panel's own send path, which asks
   * `admit` again.
   */
  readonly start: (request: R) => void
  /** a send was answered by the connect prompt: a good moment to read the statuses again */
  readonly onNotConnected?: (() => void) | undefined
  /** the panel wrote the settings: lets an app that keeps its own copy update it at once */
  readonly onSettingsSaved?: ((settings: S) => void) | undefined
  /**
   * Saved together with the first-connection acknowledgement. The PDF editor
   * uses it for its own sentence, which may already be due when the general
   * notice is shown there.
   */
  readonly acknowledgeNoticeExtra?: ((settings: S) => S) | undefined
}

export interface AiSendGateController<R, S extends AiSettings = AiSettings> {
  /** the gate for what is on screen */
  readonly gate: AiSendGate
  /** the settings the gate was decided on: the app's copy, or a change this panel just saved */
  readonly settings: S | null
  /** `choice` for <AiConnectPrompt>; null while the prompt is not shown */
  readonly connectChoice: Extract<AiProviderChoice, { connected: false }> | null
  /** `attention` for <AiConnectPrompt>: counts the sends it answered */
  readonly connectAttention: number
  /** whether <AiFirstConnectionNotice> is shown */
  readonly noticeDue: boolean
  /**
   * Ask to send. True: send now. False: nothing goes out now and the composer
   * must keep its text — the request is held (a status check is still running,
   * or the first-connection notice is unread) and comes back through `start`,
   * or nothing can run and the connect prompt answers instead.
   */
  readonly admit: (request: R) => boolean
  /**
   * The same question for a message waiting in the queue. In front of a running
   * check or the notice it waits its turn (false, ask again); in front of "not
   * connected" `pauseQueue` is called, so nothing starts by itself after a sign-in.
   */
  readonly admitQueued: (pauseQueue: () => void) => boolean
  /** the gate right now, for callbacks that outlive a render */
  readonly peek: () => AiSendGate
  /** "Got it" on the first-connection notice: remember it, then start the held request */
  readonly acknowledgeNotice: () => void
  /**
   * "Continue with <provider>" on a blocked run: store that provider as the
   * selection, then run `rerun` (the last user message with its attachments).
   */
  readonly continueWith: (provider: AiSubscriptionProviderId, rerun: () => void) => void
  /** forget a held request (new chat, panel reset) */
  readonly reset: () => void
}

/**
 * The send gate of an AI panel, wired: holds a request while a status check
 * runs or the first-connection notice is unread, starts it when the way is
 * clear, refuses in front of "not connected", and writes the panel's settings
 * changes onto the stored settings. Every editor's panel uses this one hook, so
 * they all behave the same; see `ai-send-gate.ts` for the rules.
 */
export function useAiSendGate<R, S extends AiSettings = AiSettings>(
  args: AiSendGateArgs<R, S>,
): AiSendGateController<R, S> {
  const { settings, statuses } = args
  const argsRef = useRef(args)
  argsRef.current = args

  // A change this panel just saved applies at once; the app's own copy catches
  // up when the settings file is read again (its identity changes then).
  const savedRef = useRef<{ base: S | null | undefined; next: S } | null>(null)
  if (savedRef.current && savedRef.current.base !== settings) savedRef.current = null
  const live = savedRef.current?.next ?? settings ?? null
  const liveRef = useRef(live)
  liveRef.current = live
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses
  const [, rerender] = useState(0)

  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const heldRef = useRef<{ reason: AiHeldReason; request: R } | null>(null)
  const [requestHeld, setRequestHeld] = useState(false)
  const [connectAttention, setConnectAttention] = useState(0)

  const gate = aiSendGate(live, statuses)
  const peek = (): AiSendGate => aiSendGate(liveRef.current, statusesRef.current)

  const refuse = () => {
    setConnectAttention((n) => n + 1)
    argsRef.current.onNotConnected?.()
  }

  const admit = (request: R): boolean => {
    const now = peek()
    const reason = aiHoldReason(now)
    heldRef.current = reason ? { reason, request } : null
    setRequestHeld(reason !== null)
    if (now.kind === 'connect') refuse()
    return now.kind === 'run'
  }

  const admitQueued = (pauseQueue: () => void): boolean => {
    const now = peek()
    if (now.kind === 'connect') {
      pauseQueue()
      refuse()
    }
    return now.kind === 'run'
  }

  // The gate moved: start the request that waited in front of it, or drop it.
  useEffect(() => {
    const held = heldRef.current
    if (!held) return
    const step = aiHeldRequestStep(held.reason, gate)
    if (step.action === 'keep') {
      held.reason = step.reason
      return
    }
    heldRef.current = null
    setRequestHeld(false)
    if (step.action === 'start') argsRef.current.start(held.request)
    // the check answered "not connected": the prompt takes over, in view
    else if (gate.kind === 'connect') refuse()
    // only a move of the gate matters: the request and the callbacks are read from refs
  }, [gate.kind])

  const apply = (next: S) => {
    savedRef.current = { base: argsRef.current.settings, next }
    liveRef.current = next
    if (aliveRef.current) rerender((n) => n + 1)
  }

  /** Write a change onto the stored settings; the panel shows it at once */
  const saveChange = async (change: (latest: S) => S): Promise<S | null> => {
    const known = liveRef.current
    if (known) apply(change(known))
    const next = await changeStoredAiSettings(argsRef.current.store, change, known)
    if (!next || !aliveRef.current) return null
    apply(next)
    argsRef.current.onSettingsSaved?.(next)
    return next
  }

  const acknowledgeNotice = () => {
    // taken before the save moves the gate, so only this acknowledgement starts it
    const held = heldRef.current
    heldRef.current = null
    setRequestHeld(false)
    void saveChange((latest) => {
      const seen = withAiSubscriptionNoticeSeen(latest)
      return argsRef.current.acknowledgeNoticeExtra?.(seen) ?? seen
    }).then((saved) => {
      if (saved && held) argsRef.current.start(held.request)
    })
  }

  const continueWith = (provider: AiSubscriptionProviderId, rerun: () => void) => {
    void saveChange((latest) => withAiContinueProvider(latest, provider)).then((saved) => {
      if (saved) rerun()
    })
  }

  const reset = () => {
    heldRef.current = null
    setRequestHeld(false)
  }

  return {
    gate,
    settings: live,
    connectChoice: aiConnectPromptChoice(gate, requestHeld),
    connectAttention,
    noticeDue: gate.kind === 'notice',
    admit,
    admitQueued,
    peek,
    acknowledgeNotice,
    continueWith,
    reset,
  }
}
