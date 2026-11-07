import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AgentSandboxUnavailableError,
  AgentProgramError,
  type AgentSession,
} from '@genoffice/ai-provider/agent-session'
import { normalizeAiSettings, type AiSubscriptionStatus } from '@genoffice/ai-provider'
import { createAgentManager, type AgentManagerDeps } from '../../src/main/agent/agent-sessions'
import {
  AGENT_WARNING_VERSION,
  DEFAULT_AGENT_PREFS,
  type AgentStartResponse,
} from '../../src/shared/agent-api'
import { CRASH_LOG_FILE } from '../../src/main/crash-log'
import { agentStartErrorView } from '../../src/renderer/src/agent/start-error'
import { agentText } from '../../src/renderer/src/i18n/strings-agent'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0' },
  BrowserWindow: class {},
  dialog: {},
  ipcMain: { handle: vi.fn() },
  shell: {},
}))
const { startAgentForWindow } = await import('../../src/main/agent/agent-window')

const roots: string[] = []
const managers: Array<{ stopAll(): void }> = []
afterEach(() => {
  for (const m of managers.splice(0)) m.stopAll()
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const SECRET_PATH = '/Users/someone/Secret Project/[final].hwp'
const TOKEN = 'sk-live-0123456789abcdef'

const ready = (provider: 'claude-code' | 'codex'): AiSubscriptionStatus =>
  ({ provider, state: 'ready', meteredAccepted: false }) as AiSubscriptionStatus

function fakeSession(): AgentSession {
  return {
    provider: 'codex',
    send: async () => undefined,
    answer: () => undefined,
    setOpenDocuments: () => undefined,
    stop: () => undefined,
  }
}

function setup(overrides: Partial<AgentManagerDeps> = {}, warningAccepted = AGENT_WARNING_VERSION) {
  const home = mkdtempSync(join(tmpdir(), 'agent-start-failure-'))
  roots.push(home)
  const project = join(home, 'Project')
  mkdirSync(project)
  const userData = join(home, 'AppData', 'IeumOffice')
  mkdirSync(userData, { recursive: true })
  const codex = vi.fn(async () => fakeSession())
  const manager = createAgentManager({
    runners: { claude: async () => fakeSession(), codex },
    statuses: () => ({ 'claude-code': ready('claude-code'), codex: ready('codex') }),
    aiSettings: () => normalizeAiSettings({ providers: {} }),
    openDocuments: () => [],
    userData,
    homeDir: home,
    language: () => 'en',
    emit: () => undefined,
    ...overrides,
  })
  managers.push(manager)
  const window = {
    userData,
    readPrefs: () => ({ ...DEFAULT_AGENT_PREFS, warningAccepted }),
    writePrefs: vi.fn(),
    readProjectPrefs: () => ({}),
  }
  const start = (request: Record<string, unknown> = {}): Promise<AgentStartResponse> =>
    startAgentForWindow(window, manager, 1, {
      provider: 'codex',
      mode: 'ask-commands',
      folder: project,
      ...request,
    })
  const record = (): string => {
    const path = join(userData, CRASH_LOG_FILE)
    return existsSync(path) ? readFileSync(path, 'utf8') : ''
  }
  return { start, record, codex, window }
}

function shown(response: AgentStartResponse, lang: 'en' | 'ko' = 'en'): string {
  if (response.ok) throw new Error('the start did not fail')
  const view = agentStartErrorView(response.failure)
  return [
    agentText(lang, view.key),
    ...(view.code ? [agentText(lang, 'errCode', { code: view.code })] : []),
  ].join('\n')
}

function failingWith(error: unknown) {
  return setup({
    runners: {
      claude: async () => fakeSession(),
      codex: async () => {
        throw error
      },
    },
  })
}

describe('a start the program turns down', () => {
  it('names the step and code Codex refused, and records them without the error text', async () => {
    const { start, record } = failingWith(
      new AgentProgramError(
        { type: 'refused', step: 'thread/start', code: -32600 },
        `Codex app-server: filesystem glob path \`${SECRET_PATH}\` only supports deny; ${TOKEN}`,
      ),
    )
    const response = await start()
    expect(response).toEqual({
      ok: false,
      failure: {
        reason: 'program-problem',
        problem: { type: 'refused', step: 'thread/start', code: -32600 },
      },
    })
    expect(shown(response)).toBe(
      'The program did not accept the session settings. Update it, then try again.\n' +
        'If this keeps happening, include this code when you send feedback: refused thread.start -32600',
    )
    expect(shown(response, 'ko')).toContain('프로그램이 세션 설정을 받아들이지 않았습니다.')
    const lines = record().trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toMatchObject({
      kind: 'agent-start',
      program: 'codex',
      reason: 'refused thread.start -32600',
      cause: 'AgentProgramError',
    })
    expect(record()).not.toMatch(/Users|Secret|final|sk-live|glob|deny/)
  })

  it('records the exit code of a program that ended while starting', async () => {
    const { start, record } = failingWith(
      new AgentProgramError({ type: 'exited', exitCode: 2 }, `exited (2): ${SECRET_PATH}`),
    )
    const response = await start()
    expect(shown(response)).toBe(
      'The program closed while the session was starting. Update it, check that it opens in a terminal, then try again.\n' +
        'If this keeps happening, include this code when you send feedback: exited 2',
    )
    expect(JSON.parse(record())).toMatchObject({ reason: 'exited 2', exitCode: 2 })
  })

  it('names a step Codex did not answer in time', async () => {
    const { start } = failingWith(
      new AgentProgramError({ type: 'no-answer', step: 'thread/start' }, 'timed out'),
    )
    expect(shown(await start())).toBe(
      'The program did not answer in time while the session was starting. Try again.\n' +
        'If this keeps happening, include this code when you send feedback: no-answer thread.start',
    )
  })

  it('tells the person to rename a folder or close a document Codex reads as a pattern', async () => {
    const { start } = failingWith(new AgentProgramError({ type: 'unsupported-path' }, SECRET_PATH))
    expect(shown(await start())).toBe(
      'Codex cannot work with a folder or file whose name has [ ] * or ?. Rename the project folder, or close the documents with such a name, then start again.',
    )
  })

  it('points to the model setting when no model is set and Codex lists none', async () => {
    const { start } = failingWith(new AgentProgramError({ type: 'no-model' }, 'no model'))
    expect(shown(await start())).toBe(
      'The program offered no model to use. Choose a model under Settings → AI, then try again.',
    )
  })

  it('keeps the message of a run error the program reported', async () => {
    const { start, record } = failingWith(new AgentSandboxUnavailableError())
    const response = await start()
    expect(response).toEqual({
      ok: false,
      failure: { reason: 'run-error', kind: 'sandbox-unavailable' },
    })
    expect(shown(response)).toBe(agentText('en', 'errSandboxUnavailable'))
    expect(JSON.parse(record())).toMatchObject({
      reason: 'sandbox-unavailable',
      cause: 'AgentSandboxUnavailableError',
    })
  })

  it('records the class and code of an error nothing names, and shows a code to report', async () => {
    const { start, record } = failingWith(
      Object.assign(new Error(`EACCES: permission denied, spawn ${SECRET_PATH}`), {
        code: 'EACCES',
      }),
    )
    const response = await start()
    expect(response).toEqual({ ok: false, failure: { reason: 'unknown' } })
    expect(shown(response)).toBe(
      'Something went wrong. Try again.\n' +
        'If this keeps happening, include this code when you send feedback: unknown',
    )
    expect(JSON.parse(record())).toMatchObject({ reason: 'unknown', cause: 'Error:EACCES' })
    expect(record()).not.toMatch(/Users|Secret|permission denied/)
  })
})

describe('a start the app could not prepare', () => {
  it('names the step: the app tools, the person’s MCP servers, the skills', async () => {
    const cases: Array<[Partial<AgentManagerDeps>, string]> = [
      [
        {
          startAppMcp: async () => {
            throw Object.assign(new Error(`listen EADDRINUSE ${TOKEN}`), { code: 'EADDRINUSE' })
          },
        },
        'prepare app-tools',
      ],
      [
        {
          startRelays: async () => {
            throw new Error(`relay failed for ${SECRET_PATH}`)
          },
        },
        'prepare user-mcp',
      ],
      [
        {
          buildSkills: async () => {
            throw Object.assign(new Error(`ENOENT ${SECRET_PATH}`), { code: 'ENOENT' })
          },
        },
        'prepare skills',
      ],
    ]
    for (const [overrides, code] of cases) {
      const { start, record, codex } = setup(overrides)
      const response = await start()
      expect(shown(response)).toBe(
        'The app could not prepare the session. Try again.\n' +
          `If this keeps happening, include this code when you send feedback: ${code}`,
      )
      expect(JSON.parse(record())).toMatchObject({ kind: 'agent-start', reason: code })
      expect(record()).not.toMatch(/Users|Secret|sk-live/)
      expect(codex).not.toHaveBeenCalled()
    }
  })
})

describe('a start refused before anything runs', () => {
  it('says what to do, and leaves no line in the record', async () => {
    const notAccepted = setup({}, 0)
    expect(shown(await notAccepted.start())).toBe(agentText('en', 'errNotAccepted'))
    expect(notAccepted.record()).toBe('')

    const invalid = setup()
    expect(await invalid.start({ provider: 'chatgpt' })).toEqual({
      ok: false,
      failure: { reason: 'invalid-request' },
    })
    expect(invalid.record()).toBe('')

    const badFolder = setup()
    expect(shown(await badFolder.start({ folder: tmpdir().slice(0, 3) }))).toBe(
      agentText('en', 'errBadFolder'),
    )
    expect(badFolder.record()).toBe('')
    expect(badFolder.codex).not.toHaveBeenCalled()
  })

  it('starts, remembering the folder, when nothing fails', async () => {
    const { start, record, window } = setup()
    const response = await start()
    expect(response).toMatchObject({ ok: true })
    expect(window.writePrefs).toHaveBeenCalled()
    expect(record()).toBe('')
  })
})
