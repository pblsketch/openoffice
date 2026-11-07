/**
 * An agent session with relays of the person's MCP servers (user MCP spec 9):
 * what the program is given, the start warning, the relay's question as the
 * window's card with three answers, and the relays' end with the session.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionOptions,
} from '@genoffice/ai-provider/agent-session'
import type { AiSubscriptionStatus } from '@genoffice/ai-provider'
import { normalizeAiSettings } from '@genoffice/ai-provider'
import { SKILL_SKIPPED_STEPS_SENTENCE } from '@genoffice/agent-core/skill-mcp-refs'
import { agentInstructions, createAgentManager } from '../../src/main/agent/agent-sessions'
import type {
  AgentMcpRelays,
  AgentRelayAnswer,
  AgentRelayAsk,
} from '../../src/main/agent/agent-mcp-relay'
import type { AgentActionView } from '../../src/shared/agent-api'
import { agentPermissionChoices, agentUserMcpTool } from '../../src/renderer/src/agent/agent-web'
import {
  EMPTY_AGENT_LOG,
  agentLogWith,
  coveredBySessionAllow,
} from '../../src/renderer/src/agent/agent-log'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0' },
  BrowserWindow: class {},
  dialog: {},
  ipcMain: { handle: vi.fn() },
  shell: {},
}))
const { agentEventView } = await import('../../src/main/agent/agent-window')

const roots: string[] = []
const managers: Array<{ stopAll(): void }> = []
afterEach(() => {
  for (const m of managers.splice(0)) m.stopAll()
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const ready = (provider: 'claude-code' | 'codex'): AiSubscriptionStatus =>
  ({ provider, state: 'ready', meteredAccepted: false }) as AiSubscriptionStatus

const RELAYS = [
  { name: 'law', url: 'http://127.0.0.1:4100/mcp', token: 'relay-tok', tools: ['search'] },
  { name: 'notes', url: 'http://127.0.0.1:4101/mcp', token: 'relay-tok-2', tools: ['find'] },
]

function setup(keepResultsInside: string[] = ['law']) {
  const home = mkdtempSync(join(tmpdir(), 'agent-relay-test-'))
  roots.push(home)
  const project = join(home, 'Project')
  mkdirSync(project)
  const session: AgentSession = {
    provider: 'claude-code',
    send: vi.fn(async () => undefined),
    answer: vi.fn(),
    setOpenDocuments: vi.fn(),
    stop: vi.fn(),
  }
  const runnerOptions: AgentSessionOptions[] = []
  const claude = vi.fn(async (options: AgentSessionOptions) => {
    runnerOptions.push(options)
    return session
  })
  const codex = vi.fn(async (options: AgentSessionOptions) => {
    runnerOptions.push(options)
    return { ...session, provider: 'codex' as const }
  })
  const relayStop = vi.fn(async () => undefined)
  let ask: AgentRelayAsk | undefined
  const startRelays = vi.fn(
    async (
      _session: { ownerId: number; sessionId: string },
      given: AgentRelayAsk,
    ): Promise<AgentMcpRelays> => {
      ask = given
      return { relays: RELAYS, keepResultsInside, stop: relayStop }
    },
  )
  const emitted: Array<[number, string, AgentSessionEvent]> = []
  const m = createAgentManager({
    runners: { claude, codex },
    statuses: () => ({ 'claude-code': ready('claude-code'), codex: ready('codex') }),
    aiSettings: () => normalizeAiSettings({ providers: {} }),
    openDocuments: () => [],
    userData: join(home, 'AppData', 'IeumOffice'),
    homeDir: home,
    language: () => 'ko',
    startRelays,
    emit: (owner, id, event) => emitted.push([owner, id, event]),
  })
  managers.push(m)
  return {
    m,
    project,
    session,
    runnerOptions,
    startRelays,
    relayStop,
    emitted,
    ask: () => ask!,
  }
}

const permissions = (emitted: Array<[number, string, AgentSessionEvent]>) =>
  emitted.flatMap(([, , event]) => (event.type === 'permission' ? [event.request] : []))

describe('a session with relays', () => {
  it('gives the program the relays and names the servers that keep content inside', async () => {
    for (const provider of ['claude-code', 'codex'] as const) {
      const s = setup()
      const result = await s.m.start(7, { provider, projectRoot: s.project, mode: 'ask-commands' })
      expect(result).toMatchObject({ ok: true, mcpKeepInside: ['law'] })
      expect(s.startRelays).toHaveBeenCalledWith(
        { ownerId: 7, sessionId: (result as { sessionId: string }).sessionId },
        expect.any(Function),
      )
      const options = s.runnerOptions[0]!
      expect(options.userMcpRelays).toEqual(RELAYS)
      expect(options.instructions).toContain('law, notes')
      expect(options.instructions).toContain(SKILL_SKIPPED_STEPS_SENTENCE)
    }
  })

  it('leaves the warning out when no attached server keeps content inside', async () => {
    const s = setup([])
    const result = await s.m.start(7, {
      provider: 'claude-code',
      projectRoot: s.project,
      mode: 'ask-commands',
    })
    expect(result.ok && 'mcpKeepInside' in result).toBe(false)
  })

  it('shows a relay’s question as a card and routes the answer to the relay, not the program', async () => {
    const s = setup()
    const started = await s.m.start(7, {
      provider: 'claude-code',
      projectRoot: s.project,
      mode: 'ask-commands',
    })
    const sessionId = (started as { sessionId: string }).sessionId
    const asked = (input: Record<string, unknown>) =>
      s.ask()(
        { server: 'law', exposedName: 'mcp__law__search', input },
        new AbortController().signal,
      )

    const answers: Promise<AgentRelayAnswer>[] = [asked({ q: 'a' }), asked({ q: 'b' }), asked({})]
    const cards = permissions(s.emitted)
    expect(cards).toHaveLength(3)
    expect(cards[0]).toMatchObject({
      provider: 'claude-code',
      kind: 'mcp-tool',
      tool: 'mcp__law__search',
      server: 'law',
      paths: [],
    })
    expect(cards[0]!.target).toContain('"q": "a"')
    const view = agentEventView({ type: 'permission', request: cards[0]! })
    expect(view.type === 'permission' && agentPermissionChoices(view.action)).toEqual([
      'deny',
      'allow-session',
      'allow',
    ])

    s.m.answer(7, sessionId, cards[0]!.id, { allow: false })
    s.m.answer(7, sessionId, cards[1]!.id, { allow: true, scope: 'session' })
    s.m.answer(7, sessionId, cards[2]!.id, { allow: true })
    expect(await Promise.all(answers)).toEqual([
      { allow: false },
      { allow: true, scope: 'session' },
      { allow: true, scope: 'once' },
    ])
    expect(s.session.answer).not.toHaveBeenCalled()
    // another window cannot answer
    const late = asked({})
    const card = permissions(s.emitted).at(-1)!
    s.m.answer(8, sessionId, card.id, { allow: true })
    expect(s.session.answer).not.toHaveBeenCalled()
    s.m.stop(7, sessionId)
    expect(await late).toEqual({ allow: false })
  })

  it('takes a cancelled call’s question as a refusal', async () => {
    const s = setup()
    await s.m.start(7, { provider: 'claude-code', projectRoot: s.project, mode: 'ask-commands' })
    const cancel = new AbortController()
    const answer = s.ask()(
      { server: 'law', exposedName: 'mcp__law__search', input: {} },
      cancel.signal,
    )
    cancel.abort()
    expect(await answer).toEqual({ allow: false })
  })

  it('closes the relays and refuses waiting questions when the session ends', async () => {
    const s = setup()
    const started = await s.m.start(7, {
      provider: 'claude-code',
      projectRoot: s.project,
      mode: 'ask-commands',
    })
    const waiting = s.ask()(
      { server: 'law', exposedName: 'mcp__law__search', input: {} },
      new AbortController().signal,
    )
    s.m.stop(7, (started as { sessionId: string }).sessionId)
    expect(await waiting).toEqual({ allow: false })
    expect(s.relayStop).toHaveBeenCalledTimes(1)
    // a question after the end is refused at once, with no card
    const count = permissions(s.emitted).length
    expect(
      await s.ask()(
        { server: 'law', exposedName: 'mcp__law__search', input: {} },
        new AbortController().signal,
      ),
    ).toEqual({ allow: false })
    expect(permissions(s.emitted)).toHaveLength(count)
  })

  it('closes the relays when the program fails to start', async () => {
    const s = setup()
    s.runnerOptions.length = 0
    const failing = createAgentManager({
      runners: {
        claude: async () => {
          throw new Error('no')
        },
        codex: async () => {
          throw new Error('no')
        },
      },
      statuses: () => ({ 'claude-code': ready('claude-code') }),
      aiSettings: () => normalizeAiSettings({ providers: {} }),
      openDocuments: () => [],
      userData: join(s.project, '..', 'AppData'),
      homeDir: join(s.project, '..'),
      language: () => 'ko',
      startRelays: s.startRelays,
      emit: () => undefined,
    })
    managers.push(failing)
    const result = await failing.start(1, {
      provider: 'claude-code',
      projectRoot: s.project,
      mode: 'ask-commands',
    })
    expect(result).toMatchObject({ ok: false, failure: { reason: 'unknown' } })
    expect(s.relayStop).toHaveBeenCalledTimes(1)
  })
})

describe('the instructions', () => {
  it('always carry the skipped-steps sentence, and name relays only when there are some', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agent-relay-test-'))
    roots.push(home)
    const plain = await agentInstructions('claude-code', home, 'ko', false)
    expect(plain).toContain(SKILL_SKIPPED_STEPS_SENTENCE)
    expect(plain).not.toContain('mcp__<server>__<tool>')
    const withRelays = await agentInstructions('codex', home, 'ko', true, [], ['law'])
    expect(withRelays).toContain('mcp__<server>__<tool>')
    expect(withRelays).toContain(': law.')
  })
})

describe('the window’s card and lines for MCP tools', () => {
  const card: AgentActionView = {
    kind: 'mcp-tool',
    tool: 'mcp__law__search',
    server: 'law',
    target: '{}',
    paths: [],
  }

  it('offers the three answers and names the server and tool', () => {
    expect(agentPermissionChoices(card)).toEqual(['deny', 'allow-session', 'allow'])
    expect(agentUserMcpTool(card)).toEqual({ server: 'law', tool: 'search' })
  })

  it('tells a person’s MCP tool line from the app’s own tools, in either program’s naming', () => {
    const line = (tool: string): AgentActionView => ({ kind: 'app-tool', tool, paths: [] })
    expect(agentUserMcpTool(line('mcp__law__search'))).toEqual({ server: 'law', tool: 'search' })
    expect(agentUserMcpTool(line('law:search'))).toEqual({ server: 'law', tool: 'search' })
    expect(agentUserMcpTool(line('mcp__ieumoffice-editor__read_document'))).toBeUndefined()
    expect(agentUserMcpTool(line('ieumoffice-editor:read_document'))).toBeUndefined()
    expect(agentUserMcpTool({ kind: 'command', tool: 'Bash', paths: [] })).toBeUndefined()
  })

  it('lets a session-wide allow answer the same tool’s other waiting cards only', () => {
    let log = EMPTY_AGENT_LOG
    log = agentLogWith(log, { type: 'permission', id: 'a', action: card })
    log = agentLogWith(log, { type: 'permission', id: 'b', action: card })
    log = agentLogWith(log, {
      type: 'permission',
      id: 'c',
      action: { ...card, tool: 'mcp__law__get_text' },
    })
    log = agentLogWith(log, {
      type: 'permission',
      id: 'd',
      action: { kind: 'web-search', tool: 'WebSearch', paths: [] },
    })
    expect(coveredBySessionAllow(log, 'a')).toEqual(['b'])
  })
})
