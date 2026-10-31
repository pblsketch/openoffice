import { describe, expect, it, vi } from 'vitest'
import {
  defaultAiSettings,
  type AiSettings,
  type AiSubscriptionProviderId,
  type AiSubscriptionState,
  type AiSubscriptionStatus,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider'
import {
  AI_SUBSCRIPTION_NOTICE_VERSION,
  aiConnectPromptChoice,
  aiHeldRequestStep,
  aiHoldReason,
  aiSendGate,
  changeStoredAiSettings,
  withAiContinueProvider,
  withAiSubscriptionNoticeSeen,
  type AiSendGate,
} from '../src/ai-send-gate'

const status = (
  provider: AiSubscriptionProviderId,
  state: AiSubscriptionState,
  extra: Partial<AiSubscriptionStatus> = {},
): AiSubscriptionStatus => ({ provider, state, meteredAccepted: false, ...extra })

const statuses = (
  claude: AiSubscriptionState,
  codex: AiSubscriptionState,
): AiSubscriptionStatuses => ({
  'claude-code': status('claude-code', claude),
  // the direct ChatGPT connection answers at once and is signed out unless a test says so
  chatgpt: status('chatgpt', 'signed-out'),
  codex: status('codex', codex),
})

const settingsWith = (patch: Partial<AiSettings> = {}): AiSettings => ({
  ...defaultAiSettings(),
  ...patch,
})

const seen = (patch: Partial<AiSettings> = {}) =>
  settingsWith({ subscriptionNoticeSeen: true, ...patch })

describe('aiSendGate', () => {
  it('waits while the settings have not been read', () => {
    expect(aiSendGate(null, statuses('ready', 'ready'))).toEqual({ kind: 'checking' })
    expect(aiSendGate(undefined, {})).toEqual({ kind: 'checking' })
  })

  it('waits while no status has been read at all', () => {
    expect(aiSendGate(seen(), null).kind).toBe('checking')
    expect(aiSendGate(seen(), undefined).kind).toBe('checking')
    expect(aiSendGate(seen(), {}).kind).toBe('checking')
  })

  it('auto: waits while a check that could still connect is running', () => {
    expect(aiSendGate(seen(), statuses('checking', 'checking')).kind).toBe('checking')
    expect(aiSendGate(seen(), statuses('signed-out', 'checking')).kind).toBe('checking')
    expect(aiSendGate(seen(), statuses('checking', 'not-installed')).kind).toBe('checking')
    // a provider that has not reported at all is still being checked
    expect(aiSendGate(seen(), { 'claude-code': status('claude-code', 'error') }).kind).toBe(
      'checking',
    )
  })

  it('auto: runs on a ready Claude even while Codex is checked', () => {
    expect(aiSendGate(seen(), statuses('ready', 'checking'))).toEqual({
      kind: 'run',
      choice: { connected: true, provider: 'claude-code', metered: false },
    })
  })

  // Codex answering first must not take a request that Claude would have run
  it('auto: holds the request while Claude is checked, even with Codex ready', () => {
    const pending = aiSendGate(seen(), statuses('checking', 'ready'))
    expect(pending).toEqual({
      kind: 'checking',
      choice: {
        connected: false,
        selection: 'auto',
        reason: 'no-subscription',
        errorKind: 'not-connected',
      },
    })
    expect(aiHoldReason(pending)).toBe('checking')
    expect(aiSendGate(seen(), { codex: status('codex', 'ready') }).kind).toBe('checking')
    // the held request starts on whichever provider the answer leaves
    const claude = aiSendGate(seen(), statuses('ready', 'ready'))
    expect(claude).toMatchObject({ kind: 'run', choice: { provider: 'claude-code' } })
    expect(aiHeldRequestStep('checking', claude)).toEqual({ action: 'start' })
    const codex = aiSendGate(seen(), statuses('signed-out', 'ready'))
    expect(codex).toMatchObject({ kind: 'run', choice: { provider: 'codex' } })
    expect(aiHeldRequestStep('checking', codex)).toEqual({ action: 'start' })
  })

  it('auto: asks to connect once both checks answered and neither is ready', () => {
    const gate = aiSendGate(seen(), statuses('signed-out', 'not-installed'))
    expect(gate.kind).toBe('connect')
    expect(gate.kind === 'connect' && gate.choice.reason).toBe('no-subscription')
    // a metered login is never picked on the user's behalf
    expect(aiSendGate(seen(), statuses('metered', 'error')).kind).toBe('connect')
  })

  it('a selected subscription waits for its own check only', () => {
    const codex = seen({ provider: 'codex' })
    expect(aiSendGate(codex, statuses('ready', 'checking')).kind).toBe('checking')
    expect(aiSendGate(codex, { 'claude-code': status('claude-code', 'ready') }).kind).toBe(
      'checking',
    )
    // the other provider still being checked changes nothing: there is no fallback to it
    const gate = aiSendGate(codex, statuses('checking', 'signed-out'))
    expect(gate.kind).toBe('connect')
    expect(gate.kind === 'connect' && gate.choice.reason).toBe('signed-out')
  })

  it('a key provider waits for no check', () => {
    const unfinished = seen({ provider: 'openai' })
    expect(aiSendGate(unfinished, statuses('checking', 'checking')).kind).toBe('connect')
    const configured = seen({ provider: 'openai' })
    configured.providers.openai = { apiKey: 'k', model: 'm' }
    expect(aiSendGate(configured, statuses('checking', 'checking'))).toEqual({
      kind: 'run',
      choice: { connected: true, provider: 'openai', metered: false },
    })
  })

  it('puts the first-connection notice in front of the first run on a subscription', () => {
    const gate = aiSendGate(settingsWith(), statuses('ready', 'ready'))
    expect(gate).toEqual({
      kind: 'notice',
      provider: 'claude-code',
      choice: { connected: true, provider: 'claude-code', metered: false },
    })
    expect(aiSendGate(seen(), statuses('ready', 'ready')).kind).toBe('run')
  })

  it('asks for the notice on an accepted metered login too', () => {
    const settings = settingsWith({ provider: 'codex', meteredAccepted: { codex: true } })
    const gate = aiSendGate(settings, {
      codex: status('codex', 'metered', { meteredAccepted: true }),
    })
    expect(gate.kind).toBe('notice')
  })

  it('never asks for the notice on a key provider', () => {
    const settings = settingsWith({ provider: 'openai' })
    settings.providers.openai = { apiKey: 'k', model: 'm' }
    expect(aiSendGate(settings, statuses('ready', 'ready')).kind).toBe('run')
  })

  it('carries what the connect prompt would show while a check runs', () => {
    const gate = aiSendGate(seen(), statuses('checking', 'checking'))
    expect(gate.kind === 'checking' && gate.choice?.reason).toBe('no-subscription')
  })
})

describe('held requests', () => {
  const run = aiSendGate(seen(), statuses('ready', 'ready'))
  const checking = aiSendGate(seen(), statuses('checking', 'checking'))
  const notice = aiSendGate(settingsWith(), statuses('ready', 'ready'))
  const connect = aiSendGate(seen(), statuses('signed-out', 'signed-out'))

  it('a request is held in front of a running check and in front of the notice only', () => {
    expect(aiHoldReason(run)).toBeNull()
    expect(aiHoldReason(connect)).toBeNull()
    expect(aiHoldReason(checking)).toBe('checking')
    expect(aiHoldReason(notice)).toBe('notice')
  })

  it('held for the check: starts once a provider can run', () => {
    expect(aiHeldRequestStep('checking', checking)).toEqual({ action: 'keep', reason: 'checking' })
    expect(aiHeldRequestStep('checking', run)).toEqual({ action: 'start' })
  })

  it('held for the check: is dropped when the answer is "not connected"', () => {
    expect(aiHeldRequestStep('checking', connect)).toEqual({ action: 'drop' })
  })

  it('held for the check: moves behind the notice when the answer is a first-time subscription', () => {
    expect(aiHeldRequestStep('checking', notice)).toEqual({ action: 'keep', reason: 'notice' })
  })

  it('held for the notice: stays while the notice is up', () => {
    expect(aiHeldRequestStep('notice', notice)).toEqual({ action: 'keep', reason: 'notice' })
  })

  it('held for the notice: never starts by the gate opening some other way', () => {
    // the panel starts it itself on acknowledgement; here the notice went away without one
    expect(aiHeldRequestStep('notice', run)).toEqual({ action: 'drop' })
    expect(aiHeldRequestStep('notice', connect)).toEqual({ action: 'drop' })
    expect(aiHeldRequestStep('notice', checking)).toEqual({ action: 'drop' })
  })

  it('a request dropped in front of "not connected" does not start after a later sign-in', () => {
    // the whole life of one request: asked during the check, answered "not connected", then signed in
    let held = aiHoldReason(checking)
    const gates: AiSendGate[] = [checking, connect, run]
    const actions: string[] = []
    for (const gate of gates) {
      if (!held) break
      const step = aiHeldRequestStep(held, gate)
      actions.push(step.action)
      held = step.action === 'keep' ? step.reason : null
    }
    expect(actions).toEqual(['keep', 'drop'])
  })
})

describe('aiConnectPromptChoice', () => {
  const connect = aiSendGate(seen(), statuses('signed-out', 'signed-out'))
  const checking = aiSendGate(seen(), statuses('checking', 'checking'))

  it('shows the prompt whenever nothing can run', () => {
    expect(aiConnectPromptChoice(connect, false)?.reason).toBe('no-subscription')
    expect(aiConnectPromptChoice(connect, true)?.reason).toBe('no-subscription')
  })

  it('during a check shows it only while a request waits for the answer', () => {
    expect(aiConnectPromptChoice(checking, false)).toBeNull()
    expect(aiConnectPromptChoice(checking, true)?.reason).toBe('no-subscription')
    // nothing to show before the settings are read
    expect(aiConnectPromptChoice(aiSendGate(null, {}), true)).toBeNull()
  })

  it('shows nothing once a provider can run or the notice is up', () => {
    expect(aiConnectPromptChoice(aiSendGate(seen(), statuses('ready', 'ready')), true)).toBeNull()
    expect(
      aiConnectPromptChoice(aiSendGate(settingsWith(), statuses('ready', 'ready')), true),
    ).toBeNull()
  })
})

describe('notice versions', () => {
  it('an old boolean-only acknowledgement reads as the previous version and shows the addition once', () => {
    const old = settingsWith({ subscriptionNoticeSeen: true, subscriptionNoticeVersion: 1 })
    expect(aiSendGate(old, statuses('ready', 'ready'))).toMatchObject({ kind: 'notice' })
    const acked = withAiSubscriptionNoticeSeen(old)
    expect(aiSendGate(acked, statuses('ready', 'ready'))).toMatchObject({ kind: 'run' })
  })

  it('a raw seen boolean without a version is current, as it was before versions existed', () => {
    expect(aiSendGate(seen(), statuses('ready', 'ready'))).toMatchObject({ kind: 'run' })
  })
})

describe('settings changes from the panel', () => {
  it('acknowledging the notice touches nothing else', () => {
    const before = settingsWith({ provider: 'codex' })
    const after = withAiSubscriptionNoticeSeen(before)
    expect(after).toEqual({
      ...before,
      subscriptionNoticeSeen: true,
      subscriptionNoticeVersion: AI_SUBSCRIPTION_NOTICE_VERSION,
    })
    expect(before.subscriptionNoticeSeen).not.toBe(true)
  })

  it('"continue with" stores that provider as the selection, on the model it last used', () => {
    const before = settingsWith()
    before.providers.codex = { apiKey: '', model: 'gpt-next' }
    const after = withAiContinueProvider(before, 'codex')
    expect(after.provider).toBe('codex')
    expect(after.providers.codex.model).toBe('gpt-next')
    expect(
      withAiContinueProvider(settingsWith(), 'claude-code').providers['claude-code'].model,
    ).toBe('')
    expect(before.provider).toBe('auto')
  })
})

describe('changeStoredAiSettings', () => {
  it('applies the change to what is stored now, not to the copy the panel holds', async () => {
    // another window picked a model and filled in a key since this panel read the settings
    const stale = settingsWith()
    const stored = settingsWith({ provider: 'openai' })
    stored.providers.openai = { apiKey: 'k', model: 'm' }
    const setSettings = vi.fn(async () => {})
    const written = await changeStoredAiSettings(
      { getSettings: async () => stored, setSettings },
      withAiSubscriptionNoticeSeen,
      stale,
    )
    expect(setSettings).toHaveBeenCalledExactlyOnceWith({
      ...stored,
      subscriptionNoticeSeen: true,
      subscriptionNoticeVersion: AI_SUBSCRIPTION_NOTICE_VERSION,
    })
    expect(written?.provider).toBe('openai')
    expect(written?.providers.openai).toEqual({ apiKey: 'k', model: 'm' })
  })

  it('reads before it writes', async () => {
    const order: string[] = []
    await changeStoredAiSettings(
      {
        getSettings: async () => {
          order.push('read')
          return settingsWith()
        },
        setSettings: async () => {
          order.push('write')
        },
      },
      (s) => withAiContinueProvider(s, 'codex'),
    )
    expect(order).toEqual(['read', 'write'])
  })

  it('falls back to the known copy only when the stored settings cannot be read', async () => {
    const known = settingsWith({ provider: 'codex' })
    for (const getSettings of [
      async () => {
        throw new Error('no handler')
      },
      async () => null,
    ]) {
      const setSettings = vi.fn(async () => {})
      const written = await changeStoredAiSettings(
        { getSettings, setSettings },
        withAiSubscriptionNoticeSeen,
        known,
      )
      expect(written).toEqual({
        ...known,
        subscriptionNoticeSeen: true,
        subscriptionNoticeVersion: AI_SUBSCRIPTION_NOTICE_VERSION,
      })
      expect(setSettings).toHaveBeenCalledExactlyOnceWith(written)
    }
  })

  it('writes nothing when there is nothing to apply the change to', async () => {
    const setSettings = vi.fn(async () => {})
    const written = await changeStoredAiSettings(
      { getSettings: async () => undefined, setSettings },
      withAiSubscriptionNoticeSeen,
    )
    expect(written).toBeNull()
    expect(setSettings).not.toHaveBeenCalled()
  })

  it('still answers with the change when the write fails', async () => {
    const written = await changeStoredAiSettings(
      {
        getSettings: async () => settingsWith(),
        setSettings: async () => {
          throw new Error('disk full')
        },
      },
      withAiSubscriptionNoticeSeen,
    )
    expect(written?.subscriptionNoticeSeen).toBe(true)
  })
})
