/**
 * Agent sessions in the shell (decision 0032): which folders may be a project,
 * what a session starts with, who may drive it, and what the window is shown.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionOptions,
  AgentSkillEntry,
} from '@genoffice/ai-provider/agent-session'
import type { AiSettings, AiSubscriptionStatus } from '@genoffice/ai-provider'
import { normalizeAiSettings } from '@genoffice/ai-provider'
import {
  agentInstructions,
  agentProtectedPaths,
  createAgentManager,
  openableProjectFile,
  projectFolderProblem,
} from '../../src/main/agent/agent-sessions'
import {
  AGENT_RECENT_LIMIT,
  normalizeAgentPrefs,
  withRecentFolder,
} from '../../src/shared/agent-api'
import {
  EMPTY_AGENT_LOG,
  agentLogAfterAnswer,
  agentLogAfterSend,
  agentLogWith,
  coveredBySessionAllow,
} from '../../src/renderer/src/agent/agent-log'

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: {},
  ipcMain: { handle: vi.fn() },
  shell: {},
}))
const { agentConnections, agentEventView } = await import('../../src/main/agent/agent-window')

const roots: string[] = []
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-shell-test-'))
  roots.push(dir)
  return dir
}
/** managers made by a test: their sessions end after it, removing their session folders */
const managers: Array<{ stopAll(): void }> = []
afterEach(() => {
  for (const m of managers.splice(0)) m.stopAll()
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const ready = (provider: 'claude-code' | 'codex'): AiSubscriptionStatus =>
  ({ provider, state: 'ready', meteredAccepted: false }) as AiSubscriptionStatus

describe('project folders', () => {
  it('takes a folder of the person’s work', () => {
    const home = temp()
    const project = join(home, 'Documents', 'Report')
    mkdirSync(project, { recursive: true })
    expect(
      projectFolderProblem(
        project,
        home,
        agentProtectedPaths(home, join(home, 'AppData', 'IeumOffice')),
      ),
    ).toBeUndefined()
  })

  it('refuses a drive root, the home folder, a parent of a protected folder, and a protected folder', () => {
    const home = temp()
    const userData = join(home, 'AppData', 'IeumOffice')
    mkdirSync(join(home, '.codex'), { recursive: true })
    mkdirSync(userData, { recursive: true })
    const guards = agentProtectedPaths(home, userData)
    expect(projectFolderProblem(join(home, '..', '..').slice(0, 3), home, guards)).toBeDefined()
    expect(projectFolderProblem(home, home, guards)).toBe('home-folder')
    expect(projectFolderProblem(join(home, 'AppData'), home, guards)).toBe('protected')
    expect(projectFolderProblem(join(home, '.codex'), home, guards)).toBe('protected')
  })

  it('refuses a relative path, a missing folder and a file', () => {
    const home = temp()
    writeFileSync(join(home, 'a.txt'), 'x')
    expect(projectFolderProblem('relative', home, [])).toBe('not-absolute')
    expect(projectFolderProblem(join(home, 'missing'), home, [])).toBe('missing')
    expect(projectFolderProblem(join(home, 'a.txt'), home, [])).toBe('not-a-folder')
  })

  it('opens only existing files inside the project', () => {
    const project = temp()
    writeFileSync(join(project, 'out.pptx'), 'x')
    expect(openableProjectFile(project, 'out.pptx')).toBe(join(project, 'out.pptx'))
    expect(openableProjectFile(project, join(project, '..', 'elsewhere.pptx'))).toBeUndefined()
    expect(openableProjectFile(project, 'missing.pptx')).toBeUndefined()
  })
})

describe('instructions', () => {
  it('adds the project notes for Claude, and only CLAUDE.md for Codex (it reads AGENTS.md itself)', async () => {
    const project = temp()
    writeFileSync(join(project, 'CLAUDE.md'), 'Use formal Korean.')
    writeFileSync(join(project, 'AGENTS.md'), 'Agents file.')
    const claude = await agentInstructions('claude-code', project, 'ko', true)
    expect(claude).toContain('Use formal Korean.')
    expect(claude).toContain('Agents file.')
    expect(claude).toContain('ieumoffice-editor')
    expect(claude).toContain('"ko"')
    const codex = await agentInstructions('codex', project, 'ko', false)
    expect(codex).toContain('Use formal Korean.')
    expect(codex).not.toContain('Agents file.')
    expect(codex).not.toContain('ieumoffice-editor')
  })

  it('points to the two skill tools only when the app tools are there', async () => {
    const project = temp()
    for (const provider of ['claude-code', 'codex'] as const) {
      const withTools = await agentInstructions(provider, project, 'ko', true)
      expect(withTools).toMatch(/call propose_skill:/)
      expect(withTools).toMatch(/propose_skill_install/)
      expect(withTools).toMatch(/never install skills with a command/)
      expect(await agentInstructions(provider, project, 'ko', false)).not.toMatch(/propose_skill/)
    }
  })

  it('lists the skills of the copy for Codex, with their SKILL.md and whether they wait to be called', async () => {
    const project = temp()
    const skills: AgentSkillEntry[] = [
      {
        id: 'app:home-letter',
        name: 'home-letter',
        source: 'app',
        plugin: undefined,
        title: '가정통신문',
        description: 'Writes a letter\nto families.',
        invoke: 'auto',
        skillMd: join(project, 'bundle', 'skills', 'home-letter', 'SKILL.md'),
      },
      {
        id: 'user:review',
        name: 'review--user',
        source: 'user',
        plugin: undefined,
        title: 'review',
        description: 'Reviews a draft.',
        invoke: 'manual',
        skillMd: join(project, 'bundle', 'skills', 'review--user', 'SKILL.md'),
      },
    ]
    const codex = await agentInstructions('codex', project, 'ko', false, skills)
    expect(codex).toContain('read its SKILL.md first and follow it')
    expect(codex).toContain('only when the person asks for it')
    expect(codex).toContain(
      `- home-letter (id: app:home-letter; title: 가정통신문): Writes a letter to families.; SKILL.md: ${skills[0]!.skillMd}`,
    )
    expect(codex).toContain(
      `- review--user (id: user:review; title: review): Reviews a draft.; SKILL.md: ${skills[1]!.skillMd}; manual: only when the person asks`,
    )
    expect(codex).not.toMatch(/home-letter[^\n]*manual/)
    // Claude finds them in its plugin; no list for it, and none when there are no skills
    expect(await agentInstructions('claude-code', project, 'ko', false, skills)).not.toContain(
      'SKILL.md',
    )
    expect(await agentInstructions('codex', project, 'ko', false, [])).not.toContain('SKILL.md')
  })
})

function fakeSession(): AgentSession & { sent: string[]; stopped: number } {
  return {
    provider: 'claude-code',
    sent: [],
    stopped: 0,
    async send(text) {
      this.sent.push(text)
    },
    answer: vi.fn(),
    setOpenDocuments: vi.fn(),
    stop() {
      this.stopped++
    },
  }
}

function manager(
  overrides: {
    statuses?: Record<string, AiSubscriptionStatus>
    settings?: Partial<AiSettings>
    openDocuments?: () => string[]
  } = {},
) {
  const home = temp()
  const project = join(home, 'Project')
  mkdirSync(project)
  const session = fakeSession()
  const claude = vi.fn(
    async (_options: AgentSessionOptions, _onEvent: (e: AgentSessionEvent) => void) => session,
  )
  const codex = vi.fn(async (_options: AgentSessionOptions & { meteredAccepted: boolean }) => ({
    ...session,
    provider: 'codex' as const,
  }))
  const emitted: Array<[number, string, AgentSessionEvent]> = []
  const mcpStop = vi.fn(async () => undefined)
  const startAppMcp = vi.fn(
    async (_root: string, _session: { ownerId: number; sessionId: string }) => ({
      url: 'http://127.0.0.1:5/mcp',
      token: 't',
      stop: mcpStop,
    }),
  )
  const m = createAgentManager({
    runners: { claude, codex },
    statuses: () =>
      overrides.statuses ?? { 'claude-code': ready('claude-code'), codex: ready('codex') },
    aiSettings: () => ({ ...normalizeAiSettings({ providers: {} }), ...overrides.settings }),
    openDocuments: overrides.openDocuments ?? (() => [join(project, 'open.docx')]),
    userData: join(home, 'AppData', 'IeumOffice'),
    homeDir: home,
    language: () => 'ko',
    startAppMcp,
    buildSkills: async () => ({
      dir: join(home, 'skills'),
      skills: [
        {
          id: 'app:deck',
          name: 'deck',
          source: 'app' as const,
          plugin: undefined,
          title: 'Deck',
          description: 'Makes a deck.',
          invoke: 'auto' as const,
          skillMd: join(home, 'skills', 'skills', 'deck', 'SKILL.md'),
        },
      ],
      skipped: [],
    }),
    emit: (owner, id, event) => emitted.push([owner, id, event]),
  })
  managers.push(m)
  return { m, project, home, session, claude, codex, emitted, mcpStop, startAppMcp }
}

describe('starting a session', () => {
  it('starts Claude in the project with skills, the app MCP server and the protected folders', async () => {
    const { m, project, home, claude } = manager()
    const result = await m.start(1, {
      provider: 'claude-code',
      projectRoot: project,
      mode: 'ask-commands',
    })
    expect(result.ok).toBe(true)
    const options = claude.mock.calls[0]![0]
    expect(options).toMatchObject({
      projectRoot: project,
      mode: 'ask-commands',
      skillBundleDir: join(home, 'skills'),
      appMcp: { url: 'http://127.0.0.1:5/mcp', token: 't' },
      openDocuments: [join(project, 'open.docx')],
    })
    expect(options.protectedPaths).toContain(join(home, '.codex'))
    expect(options.protectedPaths).toContain(join(home, 'AppData', 'IeumOffice'))
  })

  it('names the window and session the MCP server’s skill tools answer to, and gives the window the session’s skills', async () => {
    const { m, project, home, startAppMcp } = manager()
    const result = await m.start(4, {
      provider: 'claude-code',
      projectRoot: project,
      mode: 'ask-commands',
    })
    if (!result.ok) throw new Error('not started')
    expect(startAppMcp.mock.calls[0]![1]).toEqual({ ownerId: 4, sessionId: result.sessionId })
    expect(result.skills).toEqual([
      expect.objectContaining({
        id: 'app:deck',
        name: 'deck',
        skillMd: join(home, 'skills', 'skills', 'deck', 'SKILL.md'),
        template: undefined,
      }),
    ])
  })

  it('gives Codex the same skill copy, listed in its instructions, and passes on a metered login the person accepted', async () => {
    const { m, project, home, codex } = manager({
      statuses: {
        codex: {
          provider: 'codex',
          state: 'metered',
          meteredAccepted: true,
        } as AiSubscriptionStatus,
      },
      settings: { meteredAccepted: { codex: true } },
    })
    await m.start(1, { provider: 'codex', projectRoot: project, mode: 'trust-project' })
    const options = codex.mock.calls[0]![0]
    expect(options).toMatchObject({
      meteredAccepted: true,
      skillBundleDir: join(home, 'skills'),
    })
    expect(options.instructions).toContain(
      `- deck (id: app:deck; title: Deck): Makes a deck.; SKILL.md: ${join(home, 'skills', 'skills', 'deck', 'SKILL.md')}`,
    )
  })

  it('refuses a program that is not connected, and a metered login only half accepted', async () => {
    const signedOut = manager({ statuses: {} })
    expect(
      await signedOut.m.start(1, {
        provider: 'claude-code',
        projectRoot: signedOut.project,
        mode: 'ask-commands',
      }),
    ).toEqual({ ok: false, reason: 'not-connected' })
    const half = manager({
      statuses: {
        codex: {
          provider: 'codex',
          state: 'metered',
          meteredAccepted: true,
        } as AiSubscriptionStatus,
      },
      settings: { meteredAccepted: {} },
    })
    expect(
      await half.m.start(1, { provider: 'codex', projectRoot: half.project, mode: 'ask-commands' }),
    ).toEqual({
      ok: false,
      reason: 'not-connected',
    })
    expect(half.codex).not.toHaveBeenCalled()
  })

  it('refuses a folder that cannot be a project before anything starts', async () => {
    const { m, home, claude } = manager()
    expect(
      await m.start(1, { provider: 'claude-code', projectRoot: home, mode: 'ask-commands' }),
    ).toEqual({
      ok: false,
      reason: 'bad-folder',
    })
    expect(claude).not.toHaveBeenCalled()
  })

  it('reports a runner that fails and cleans up after it', async () => {
    const { m, project, claude, mcpStop } = manager()
    claude.mockRejectedValueOnce(Object.assign(new Error('nope'), { kind: 'unsafe-tools' }))
    const result = await m.start(1, {
      provider: 'claude-code',
      projectRoot: project,
      mode: 'ask-commands',
    })
    expect(result).toMatchObject({ ok: false, reason: 'start-failed', kind: 'unsafe-tools' })
    expect(mcpStop).toHaveBeenCalled()
  })
})

describe('driving a session', () => {
  it('lets only its window send, answer and stop', async () => {
    const { m, project, session } = manager()
    const result = await m.start(1, {
      provider: 'claude-code',
      projectRoot: project,
      mode: 'ask-commands',
    })
    if (!result.ok) throw new Error('did not start')
    await expect(m.send(2, result.sessionId, 'hi')).rejects.toThrow()
    m.stop(2, result.sessionId)
    expect(session.stopped).toBe(0)
    await m.send(1, result.sessionId, 'hi')
    expect(session.sent).toEqual(['hi'])
    expect(session.setOpenDocuments).toHaveBeenCalled()
  })

  it('warns once about documents opened after the session started', async () => {
    let open = [join(temp(), 'at-start.docx')]
    const atStart = open[0]!
    const home = temp()
    const project = join(home, 'Project')
    mkdirSync(project, { recursive: true })
    const later = join(project, 'opened-later.docx')
    open = [atStart]
    const { m, session, emitted } = manager({ openDocuments: () => open })
    const result = await m.start(1, {
      provider: 'claude-code',
      projectRoot: join(home, 'Project'),
      mode: 'ask-commands',
    })
    if (!result.ok) throw new Error('did not start')

    open = [atStart, later]
    await m.send(1, result.sessionId, 'one')
    await m.send(1, result.sessionId, 'two')

    const warnings = emitted.filter(([, , event]) => event.type === 'documents-unprotected')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]![2]).toEqual({ type: 'documents-unprotected', paths: [later] })
    // the app-level policy still learns about it for the permission requests
    expect(session.setOpenDocuments).toHaveBeenLastCalledWith([atStart, later])
  })

  it('keeps the skills the session got, for its window only', async () => {
    const { m, project } = manager()
    const result = await m.start(1, {
      provider: 'claude-code',
      projectRoot: project,
      mode: 'ask-commands',
    })
    if (!result.ok) throw new Error('did not start')
    expect(m.skillsOf(1, result.sessionId).map((skill) => [skill.id, skill.name])).toEqual([
      ['app:deck', 'deck'],
    ])
    expect(m.skillsOf(2, result.sessionId)).toEqual([])
  })

  it('forwards events to its window and cleans up when the session ends', async () => {
    const { m, project, claude, emitted, mcpStop } = manager()
    const result = await m.start(7, {
      provider: 'claude-code',
      projectRoot: project,
      mode: 'ask-commands',
    })
    if (!result.ok) throw new Error('did not start')
    const onEvent = claude.mock.calls[0]![1]
    onEvent({ type: 'text', text: 'hello' })
    onEvent({ type: 'ended' })
    expect(emitted.map(([owner, , event]) => [owner, event.type])).toEqual([
      [7, 'text'],
      [7, 'ended'],
    ])
    expect(mcpStop).toHaveBeenCalled()
    expect(m.projectRootOf(7, result.sessionId)).toBeUndefined()
  })

  it('ends a window’s sessions when the window goes', async () => {
    const { m, project, session } = manager()
    await m.start(3, { provider: 'claude-code', projectRoot: project, mode: 'ask-commands' })
    m.stopOwner(3)
    expect(session.stopped).toBe(1)
  })

  it('removes the session folder before the app quits', async () => {
    const { m, project, claude } = manager()
    await m.start(3, { provider: 'claude-code', projectRoot: project, mode: 'ask-commands' })
    const { sessionDir } = claude.mock.calls[0]![0]
    expect(existsSync(sessionDir)).toBe(true)
    m.stopAll()
    expect(existsSync(sessionDir)).toBe(false)
  })
})

describe('what the window is shown', () => {
  it('drops error messages and the provider of a request', () => {
    expect(
      agentEventView({ type: 'error', kind: 'rate-limit', message: 'C:\\Users\\me secret' }),
    ).toEqual({
      type: 'error',
      kind: 'rate-limit',
    })
    expect(
      agentEventView({
        type: 'permission',
        request: {
          id: 'r',
          provider: 'codex',
          kind: 'command',
          tool: 'x',
          command: 'dir',
          paths: [],
        },
      }),
    ).toEqual({
      type: 'permission',
      id: 'r',
      action: { kind: 'command', tool: 'x', command: 'dir', paths: [] },
    })
    expect(
      agentEventView({ type: 'started', provider: 'claude-code', skills: ['a', 'b'] }),
    ).toMatchObject({ skills: 2 })
  })

  it('offers a program only when it is ready or a metered login is fully accepted', () => {
    const metered = {
      provider: 'claude-code',
      state: 'metered',
      meteredAccepted: true,
    } as AiSubscriptionStatus
    expect(
      agentConnections({ 'claude-code': metered }, { 'claude-code': false })['claude-code'],
    ).toBe('unavailable')
    expect(
      agentConnections({ 'claude-code': metered }, { 'claude-code': true })['claude-code'],
    ).toBe('metered-accepted')
    expect(agentConnections({ 'claude-code': ready('claude-code') }, {})['claude-code']).toBe(
      'ready',
    )
    expect(agentConnections({}, {})['claude-code']).toBe('checking')
  })

  it('offers Codex now that its sessions are contained, and blocks a program on the block list', () => {
    expect(agentConnections({ codex: ready('codex') }, {}).codex).toBe('ready')
    expect(agentConnections({ codex: ready('codex') }, {}, ['codex']).codex).toBe('blocked')
    expect(agentConnections({}, {}, ['codex']).codex).toBe('blocked')
  })
})

describe('preferences', () => {
  it('reads unknown values as defaults and keeps the recent list short and unique', () => {
    expect(
      normalizeAgentPrefs({
        provider: 'gpt',
        mode: 'yolo',
        recentFolders: ['a', 'a', 3],
        warningAccepted: 1.5,
      }),
    ).toEqual({
      provider: 'claude-code',
      mode: 'ask-commands',
      recentFolders: ['a'],
      warningAccepted: 0,
    })
    let prefs = normalizeAgentPrefs({})
    for (let i = 0; i < AGENT_RECENT_LIMIT + 3; i++) prefs = withRecentFolder(prefs, `C:\\p${i}`)
    prefs = withRecentFolder(prefs, 'c:\\P5')
    expect(prefs.recentFolders).toHaveLength(AGENT_RECENT_LIMIT)
    expect(prefs.recentFolders[0]).toBe('c:\\P5')
    expect(prefs.recentFolders.filter((f) => f.toLowerCase() === 'c:\\p5')).toHaveLength(1)
  })
})

describe('the window log', () => {
  it('replaces a running tool line with its outcome and drops answered requests', () => {
    const action = { kind: 'command' as const, tool: 'Bash', command: 'dir', paths: [] }
    let log = agentLogAfterSend(EMPTY_AGENT_LOG, 'go')
    log = agentLogWith(log, { type: 'tool', action, status: 'running' })
    log = agentLogWith(log, { type: 'permission', id: 'p1', action })
    log = agentLogAfterAnswer(log, 'p1')
    log = agentLogWith(log, { type: 'tool', action, status: 'done' })
    log = agentLogWith(log, { type: 'turn-done', ok: true })
    expect(log.entries).toEqual([
      { kind: 'you', text: 'go' },
      { kind: 'tool', action, status: 'done' },
    ])
    expect(log.pending).toEqual([])
    expect(log.busy).toBe(false)
  })

  it('shows the search words a finished search names when its start had none', () => {
    const started = { kind: 'web-search' as const, tool: 'webSearch', paths: [] }
    let log = agentLogAfterSend(EMPTY_AGENT_LOG, 'go')
    log = agentLogWith(log, { type: 'tool', action: started, status: 'running' })
    log = agentLogWith(log, {
      type: 'tool',
      action: { ...started, target: 'pblsketch openoffice' },
      status: 'done',
    })
    expect(log.entries[1]).toEqual({
      kind: 'tool',
      action: { ...started, target: 'pblsketch openoffice' },
      status: 'done',
    })
  })

  it('lets a session-wide allowance answer the same kind of request still waiting', () => {
    const search = (target: string) => ({
      kind: 'web-search' as const,
      tool: 'WebSearch',
      paths: [],
      target,
    })
    const fetch = (host: string) => ({
      kind: 'web-fetch' as const,
      tool: 'WebFetch',
      paths: [],
      host,
    })
    let log = agentLogAfterSend(EMPTY_AGENT_LOG, 'go')
    log = agentLogWith(log, { type: 'permission', id: 's1', action: search('a') })
    log = agentLogWith(log, { type: 'permission', id: 's2', action: search('b') })
    log = agentLogWith(log, { type: 'permission', id: 'f1', action: fetch('example.com') })
    log = agentLogWith(log, { type: 'permission', id: 'f2', action: fetch('example.com') })
    log = agentLogWith(log, { type: 'permission', id: 'f3', action: fetch('other.org') })
    log = agentLogWith(log, {
      type: 'permission',
      id: 'c1',
      action: { kind: 'command' as const, tool: 'Bash', command: 'dir', paths: [] },
    })
    expect(coveredBySessionAllow(log, 's1')).toEqual(['s2'])
    expect(coveredBySessionAllow(log, 'f1')).toEqual(['f2'])
    expect(coveredBySessionAllow(log, 'c1')).toEqual([])
    expect(coveredBySessionAllow(log, 'gone')).toEqual([])
  })

  it('marks a failed turn and the end', () => {
    let log = agentLogWith(EMPTY_AGENT_LOG, { type: 'turn-done', ok: false })
    log = agentLogWith(log, { type: 'ended' })
    expect(log.entries.map((entry) => entry.kind)).toEqual(['turn-failed', 'ended'])
    expect(log.ended).toBe(true)
  })
})
