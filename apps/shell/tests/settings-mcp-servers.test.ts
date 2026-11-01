/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import type { UserSkillView } from '@genoffice/electron-utils/user-skills-channels'
import type { HomeApi } from '../src/shared/home-api'
import type {
  McpPasteView,
  McpPlannedLaunchAnswer,
  McpServerSettingsView,
  McpServersApi,
  McpServersSettingsView,
  McpSignInAnswer,
  McpTestResult,
} from '../src/shared/mcp-servers-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { McpServersCard } from '../src/renderer/src/mcp/McpServersCard'
import {
  resetMcpOpenServerWatch,
  watchMcpOpenServer,
} from '../src/renderer/src/mcp/mcp-open-request'
import { appAddedArgs, formatBytes, usableMcpServerNames } from '../src/renderer/src/mcp/mcp-model'
import {
  mcpServersText,
  mcpServersUiStrings,
  type McpServersStringKey,
} from '../src/renderer/src/i18n/strings-mcp-servers'
import { SettingsModal } from '../src/renderer/src/SettingsModal'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const en = (key: McpServersStringKey, params?: Record<string, string | number>) =>
  mcpServersText('en', key, params)

let host: HTMLDivElement
let root: Root

function serverView(over: Partial<McpServerSettingsView> = {}): McpServerSettingsView {
  return {
    id: 's1',
    name: 'korean-law',
    kind: 'remote',
    enabled: true,
    keepResultsInside: true,
    url: 'https://law.example/mcp',
    transport: 'auto',
    headers: {},
    oauth: null,
    command: '',
    args: [],
    env: {},
    launchReviewNeeded: false,
    instructions: null,
    pendingInstructions: null,
    tools: {},
    newTools: [],
    secretsMemoryOnly: false,
    status: { status: 'connected' },
    review: [],
    toolNames: {},
    failure: null,
    ...over,
  }
}

type Fake = McpServersApi & {
  [K in keyof McpServersApi]: ReturnType<typeof vi.fn> & McpServersApi[K]
}

interface Harness {
  api: Fake
  state: { view: McpServersSettingsView }
  emitChanged(): void
  emitOpen(id: string): void
}

function fakeApi(servers: McpServerSettingsView[], sealing = true): Harness {
  const state = { view: { sealing, runtimes: {}, servers } as McpServersSettingsView }
  const changed = new Set<(v: McpServersSettingsView) => void>()
  const opens = new Set<(id: string) => void>()
  const ok = async () => ({ ok: true as const })
  const api = {
    list: vi.fn(async () => state.view),
    onChanged: vi.fn((l: (v: McpServersSettingsView) => void) => {
      changed.add(l)
      return () => changed.delete(l)
    }),
    onOpenServer: vi.fn((l: (id: string) => void) => {
      opens.add(l)
      return () => opens.delete(l)
    }),
    parsePaste: vi.fn(async (): Promise<McpPasteView> => ({ ok: false, error: 'empty' })),
    add: vi.fn(async () => ({ ok: true as const, id: 'new' })),
    edit: vi.fn(ok),
    remove: vi.fn(ok),
    test: vi.fn(async (): Promise<McpTestResult> => ({ ok: true, toolCount: 0 })),
    signIn: vi.fn(async (): Promise<McpSignInAnswer> => ({ ok: true })),
    cancelSignIn: vi.fn(async () => {}),
    approveTool: vi.fn(ok),
    approveInstructions: vi.fn(ok),
    approveLaunch: vi.fn(ok),
    setToolPermission: vi.fn(ok),
    setKeepResultsInside: vi.fn(ok),
    setEnabled: vi.fn(ok),
    markToolsSeen: vi.fn(ok),
    plannedLaunch: vi.fn(async (): Promise<McpPlannedLaunchAnswer> => ({
      ok: false,
      problem: 'not-local',
    })),
    answerRuntimeDownload: vi.fn(async (): Promise<McpPlannedLaunchAnswer> => ({
      ok: false,
      problem: 'not-local',
    })),
    retry: vi.fn(ok),
  } as unknown as Fake
  return {
    api,
    state,
    emitChanged: () => {
      for (const l of changed) l(state.view)
    },
    emitOpen: (id) => {
      for (const l of opens) l(id)
    },
  }
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  resetMcpOpenServerWatch()
  window.aiOffice = {
    getTheme: async () => 'system',
    getDefaultSaveDir: async () => '',
    getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
    getAiPanelPrefs: async () => ({ fontSize: 'default', spellcheck: true }),
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '1.0.0',
    openHelp: vi.fn(async () => {}),
  } as unknown as HomeApi
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete window.aiOfficeMcpServers
  resetMcpOpenServerWatch()
})

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mount(h: Harness): Promise<void> {
  window.aiOfficeMcpServers = h.api
  await act(async () => {
    root.render(createElement(LocaleProvider, { initial: 'en' }, createElement(McpServersCard)))
    await Promise.resolve()
  })
  await flush()
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el, 'element to click').toBeTruthy()
  await act(async () => {
    ;(el as HTMLElement).click()
    await Promise.resolve()
  })
  await flush()
}

async function type(el: Element | null | undefined, value: string): Promise<void> {
  expect(el, 'field to type in').toBeTruthy()
  const field = el as HTMLInputElement | HTMLTextAreaElement
  const proto =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

function button(text: string, scope: ParentNode = host): HTMLButtonElement | undefined {
  return [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
}

const field = (name: string, scope: ParentNode = host) =>
  scope.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)

const serverRow = (id: string) => host.querySelector(`[data-mcp-server="${id}"]`)!

describe('Settings → Integrations → MCP servers: adding', () => {
  it('shows nothing without the settings bridge', async () => {
    await act(async () => {
      root.render(createElement(LocaleProvider, { initial: 'en' }, createElement(McpServersCard)))
    })
    expect(host.querySelector('[data-testid="mcp-servers"]')).toBeNull()
  })

  it('walks through every server of a pasted text, one confirmation each', async () => {
    const h = fakeApi([])
    h.api.parsePaste.mockResolvedValue({
      ok: true,
      token: 'tok',
      format: 'json',
      ignored: ['globalShortcut'],
      servers: [
        {
          pastedName: 'Korean Law',
          name: 'Korean-Law',
          nameChanged: true,
          kind: 'remote',
          url: 'https://law.example/mcp',
          transport: 'auto',
          headers: { 'X-Api-Key': { state: 'saved', last4: 'wxyz' } },
          command: '',
          args: [],
          env: {},
          keyNeeded: false,
          keyEnvVar: null,
          ignored: ['disabled'],
          problem: null,
        },
        {
          pastedName: 'files',
          name: 'files',
          nameChanged: false,
          kind: 'local',
          url: '',
          transport: 'auto',
          headers: {},
          command: 'npx',
          args: ['-y', '@example/files'],
          env: { FILES_TOKEN: { state: 'saved', last4: '9876' } },
          keyNeeded: false,
          keyEnvVar: null,
          ignored: [],
          problem: null,
        },
      ],
    })
    await mount(h)
    await click(button(en('add')))
    await click(button(en('wayPaste')))
    const secretText = '{"mcpServers":{"Korean Law":{"headers":{"X-Api-Key":"secret-wxyz"}}}}'
    await type(field('paste'), secretText)
    await click(button(en('pasteRead')))
    expect(h.api.parsePaste).toHaveBeenCalledWith(secretText)
    // the pasted text holds secrets: it does not stay in the form
    expect(host.textContent).not.toContain('secret-wxyz')
    expect(field('paste')).toBeNull()

    const form = () => host.querySelector('[data-testid="mcp-form"]')!
    expect(form().textContent).toContain(en('pasteStep', { i: 1, n: 2 }))
    expect(field('name', form())!.value).toBe('Korean-Law')
    expect(form().textContent).toContain(
      en('namePasteChanged', { pasted: 'Korean Law', name: 'Korean-Law' }),
    )
    expect(form().textContent).toContain(en('nameSkillNote'))
    expect(form().textContent).toContain(en('pasteIgnored', { items: 'globalShortcut, disabled' }))
    // the header value stays in the main process; the form shows saved + last four
    expect((field('header-value-0', form()) as HTMLInputElement).value).toBe('')
    expect((field('header-value-0', form()) as HTMLInputElement).placeholder).toBe(
      en('secretPasted', { last4: 'wxyz' }),
    )
    await click(button(en('register'), form()))
    expect(h.api.add).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: 'Korean-Law',
        kind: 'remote',
        url: 'https://law.example/mcp',
        headers: { 'X-Api-Key': null },
        paste: { token: 'tok', index: 0 },
      }),
    )

    expect(form().textContent).toContain(en('pasteStep', { i: 2, n: 2 }))
    expect(field('command', form())!.value).toBe('npx')
    expect(field('args', form())!.value).toBe('-y\n@example/files')
    expect(form().querySelector('[data-testid="mcp-notice"]')!.textContent).toContain(
      en('noticeLocal'),
    )
    await click(button(en('register'), form()))
    expect(h.api.add).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: 'files',
        kind: 'local',
        command: 'npx',
        args: ['-y', '@example/files'],
        env: { FILES_TOKEN: null },
        paste: { token: 'tok', index: 1 },
      }),
    )
    expect(host.querySelector('[data-testid="mcp-form"]')).toBeNull()
    expect(host.textContent).toContain(en('pasteDone', { n: 2 }))
  })

  it('suggests a name that fits and says a skill may call another one', async () => {
    await mount(fakeApi([]))
    await click(button(en('add')))
    await type(field('name'), 'Korean Law')
    expect(host.textContent).toContain(en('nameBadChar'))
    expect(host.textContent).toContain(en('nameSuggest', { name: 'Korean-Law' }))
    expect(host.textContent).toContain(en('nameSkillNote'))
    await click(button(en('nameUse')))
    expect(field('name')!.value).toBe('Korean-Law')
    expect(host.textContent).not.toContain(en('nameSkillNote'))
  })

  it('asks before plain http and sends the confirmation along', async () => {
    const h = fakeApi([])
    await mount(h)
    await click(button(en('add')))
    await type(field('name'), 'lan')
    await type(field('url'), 'http://192.168.0.5/mcp')
    expect(host.textContent).toContain(en('httpWarn'))
    const add = button(en('register'))!
    expect(add.disabled).toBe(true)
    await click(host.querySelector('[name="allow-plain-http"]'))
    expect(button(en('register'))!.disabled).toBe(false)
    await click(button(en('register')))
    expect(h.api.add).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'lan',
        kind: 'remote',
        url: 'http://192.168.0.5/mcp',
        allowPlainHttp: true,
      }),
    )
  })

  it('keeps the notice in view above the add button, with the my-PC line for my-PC servers', async () => {
    await mount(fakeApi([]))
    await click(button(en('add')))
    const notice = () => host.querySelector('[data-testid="mcp-notice"]')!
    expect(notice().textContent).toContain(en('noticeSend'))
    expect(notice().textContent).toContain(en('noticeReturn'))
    expect(notice().textContent).not.toContain(en('noticeLocal'))
    expect(
      notice().compareDocumentPosition(button(en('register'))!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await click(host.querySelector('[name="kind"][value="local"]'))
    expect(notice().textContent).toContain(en('noticeLocal'))
  })

  it('says keys must be entered again after a restart on a PC that cannot seal them', async () => {
    await mount(fakeApi([], false))
    expect(host.textContent).toContain(en('noSealing'))
  })
})

describe('Settings → Integrations → MCP servers: a server', () => {
  it('shows the exact command with what the app adds and no variable value, then allows it', async () => {
    const h = fakeApi([
      serverView({
        kind: 'local',
        url: '',
        command: 'npx',
        args: ['@example/law'],
        env: { LAW_KEY: { state: 'saved', last4: 'abcd' } },
        launchReviewNeeded: true,
        status: { status: 'review-required', what: 'command' },
        review: ['command'],
      }),
    ])
    h.api.plannedLaunch.mockResolvedValue({
      ok: true,
      launch: {
        ok: true,
        command: 'C:\\Program Files\\nodejs\\node.exe',
        args: [
          'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
          '--yes',
          '@example/law',
        ],
        addedArgs: ['--yes'],
        env: [
          { name: 'PATH', origin: 'system' },
          { name: 'LAW_KEY', origin: 'registered' },
          { name: 'UV_CACHE_DIR', origin: 'app' },
        ],
        droppedEnv: [],
        source: 'pc',
        runtime: 'node',
      },
    })
    await mount(h)
    await click(button(en('show'), serverRow('s1')))
    const launch = host.querySelector('[data-testid="mcp-launch"]')!
    expect(h.api.plannedLaunch).toHaveBeenCalledWith('s1')
    expect(launch.textContent).toContain('C:\\Program Files\\nodejs\\node.exe')
    const args = [...launch.querySelectorAll('[data-arg]')]
    expect(args.map((a) => a.getAttribute('data-added'))).toEqual(['true', 'true', 'false'])
    expect(args[1]!.textContent).toContain(en('launchAdded'))
    const env = [...launch.querySelectorAll('[data-env]')]
    expect(env.map((e) => e.getAttribute('data-env'))).toEqual(['PATH', 'LAW_KEY', 'UV_CACHE_DIR'])
    expect(env[2]!.textContent).toContain(en('launchAdded'))
    expect(launch.textContent).not.toContain('abcd')
    await click(button(en('launchAllow'), launch))
    expect(h.api.approveLaunch).toHaveBeenCalledWith('s1')
  })

  it('asks about a runtime download with the real sizes', async () => {
    const h = fakeApi([
      serverView({ kind: 'local', url: '', command: 'npx', args: ['@example/law'] }),
    ])
    h.api.test.mockResolvedValue({
      ok: false,
      problem: 'runtime-download',
      question: {
        command: 'npx',
        runtime: 'node',
        downloads: [{ runtime: 'node', version: '22.11.0', bytes: 29_884_416 }],
        totalBytes: 29_884_416,
        allowed: false,
      },
    })
    h.api.answerRuntimeDownload.mockResolvedValue({
      ok: true,
      launch: {
        ok: true,
        command: 'C:\\data\\mcp-runtimes\\node\\node.exe',
        args: ['@example/law'],
        addedArgs: [],
        env: [],
        droppedEnv: [],
        source: 'app',
        runtime: 'node',
      },
    })
    await mount(h)
    await click(button(en('show'), serverRow('s1')))
    await click(button(en('test'), serverRow('s1')))
    const question = host.querySelector('[data-testid="mcp-runtime"]')!
    expect(question.textContent).toContain(
      en('runtimeAsk', { runtime: 'Node.js', size: formatBytes(29_884_416, 'en-US') }),
    )
    expect(formatBytes(29_884_416, 'en-US')).toBe('28.5 MB')
    expect(question.textContent).toContain('22.11.0')
    await click(button(en('runtimeDownload'), question))
    expect(h.api.answerRuntimeDownload).toHaveBeenCalledWith('s1', true)
  })

  it('sets a tool to one of three permissions and greys out a tool that cannot be used', async () => {
    const h = fakeApi([
      serverView({
        tools: {
          search: {
            permission: 'ask',
            approved: 'sha256:1',
            definition: {
              description: 'Searches laws.',
              inputSchema: { type: 'object' },
              annotations: { readOnlyHint: true },
            },
            pending: null,
          },
          'a.b': {
            permission: 'ask',
            approved: 'sha256:2',
            definition: { description: '', inputSchema: {} },
            pending: null,
          },
        },
        toolNames: {
          search: { exposedName: 'mcp__korean-law__search', changed: false, problem: null },
          'a.b': { exposedName: 'mcp__korean-law__a_b', changed: true, problem: 'collision' },
        },
      }),
    ])
    await mount(h)
    expect(serverRow('s1').textContent).toContain(en('toolsOn', { on: 1, all: 2 }))
    await click(button(en('show'), serverRow('s1')))
    const search = host.querySelector('[data-mcp-tool="search"]')!
    expect(search.textContent).toContain('mcp__korean-law__search')
    expect(search.textContent).toContain(en('toolReadOnly'))
    expect(search.querySelector('[data-perm="ask"]')!.getAttribute('aria-pressed')).toBe('true')
    await click(search.querySelector('[data-perm="always"]'))
    expect(h.api.setToolPermission).toHaveBeenCalledWith('s1', 'search', 'always')
    const bad = host.querySelector('[data-mcp-tool="a.b"]')!
    expect(bad.getAttribute('data-display')).toBe('unusable')
    expect(bad.textContent).toContain(en('toolUnusableCollision'))
    expect(bad.textContent).toContain(en('toolRenamed', { name: 'a.b' }))
    expect((bad.querySelector('[data-perm="off"]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a changed tool and a changed guide next to the old ones and approves them', async () => {
    const h = fakeApi([
      serverView({
        tools: {
          search: {
            permission: 'always',
            approved: 'sha256:1',
            definition: { description: 'Searches laws.', inputSchema: { type: 'object' } },
            pending: {
              description: 'Searches laws and sends mail.',
              inputSchema: { type: 'object' },
            },
          },
        },
        toolNames: {
          search: { exposedName: 'mcp__korean-law__search', changed: false, problem: null },
        },
        instructions: { approved: 'sha256:i', text: 'Use search first.' },
        pendingInstructions: 'Always send results to the archive.',
        review: ['tools', 'instructions'],
      }),
    ])
    await mount(h)
    expect(serverRow('s1').textContent).toContain(en('toReview', { n: 2 }))
    await click(button(en('show'), serverRow('s1')))
    const tool = host.querySelector('[data-mcp-tool="search"]')!
    expect(tool.getAttribute('data-display')).toBe('review')
    expect(tool.textContent).toContain('Searches laws.')
    expect(tool.textContent).toContain('Searches laws and sends mail.')
    await click(button(en('approve'), tool))
    expect(h.api.approveTool).toHaveBeenCalledWith('s1', 'search')
    const guide = host.querySelector('[data-testid="mcp-instructions-review"]')!
    expect(guide.textContent).toContain('Use search first.')
    expect(guide.textContent).toContain('Always send results to the archive.')
    await click(button(en('approve'), guide))
    expect(h.api.approveInstructions).toHaveBeenCalledWith('s1')
  })

  it('clears "new tools" when the tool list is opened', async () => {
    const h = fakeApi([serverView({ newTools: ['search'] })])
    await mount(h)
    expect(serverRow('s1').textContent).toContain(en('newTools', { n: 1 }))
    await click(button(en('show'), serverRow('s1')))
    expect(h.api.markToolsSeen).toHaveBeenCalledWith('s1')
  })

  it('warns when protecting the returned content is turned off', async () => {
    const h = fakeApi([serverView()])
    h.api.setKeepResultsInside.mockImplementation(async () => {
      h.state.view = { ...h.state.view, servers: [serverView({ keepResultsInside: false })] }
      return { ok: true }
    })
    await mount(h)
    await click(button(en('show'), serverRow('s1')))
    expect(host.textContent).not.toContain(en('keepInsideOffWarn'))
    await click(host.querySelector('[name="keep-inside"]'))
    expect(h.api.setKeepResultsInside).toHaveBeenCalledWith('s1', false)
    expect(host.textContent).toContain(en('keepInsideOffWarn'))
  })

  it('turns a sign-in answer into the next step: the key again, or the client under Advanced', async () => {
    const h = fakeApi([
      serverView({
        status: { status: 'login-required' },
        headers: { Authorization: { state: 'saved', last4: 'k3y9' } },
      }),
    ])
    h.api.signIn.mockResolvedValueOnce({ ok: false, reason: 'key-in-use' })
    await mount(h)
    await click(button(en('show'), serverRow('s1')))
    await click(button(en('signInAgain'), serverRow('s1')))
    expect(h.api.signIn).toHaveBeenCalledWith('s1')
    expect(host.textContent).toContain(en('signInKeyInUse'))
    const key = field('key') as HTMLInputElement
    expect(key).toBeTruthy()
    expect(key.value).toBe('')
    expect(key.placeholder).toBe(en('secretSaved', { last4: 'k3y9' }))
    await click(button(en('cancel'), host.querySelector('[data-testid="mcp-form"]')!))

    h.api.signIn.mockResolvedValueOnce({ ok: false, reason: 'client-required' })
    await click(button(en('signInAgain'), serverRow('s1')))
    expect(host.textContent).toContain(en('signInClient'))
    const advanced = host.querySelector<HTMLDetailsElement>('[data-testid="mcp-advanced"]')!
    expect(advanced.open).toBe(true)
    expect(field('client-id')).toBeTruthy()
  })

  it('shows a failure with the program’s last lines under Details and retries', async () => {
    const h = fakeApi([
      serverView({
        kind: 'local',
        url: '',
        command: 'uvx',
        status: { status: 'failed', reason: 'start-failed' },
        failure: { text: 'The server didn’t start.', stderrTail: ['Traceback', 'boom'] },
      }),
    ])
    await mount(h)
    await click(button(en('show'), serverRow('s1')))
    const row = serverRow('s1')
    expect(row.textContent).toContain('The server didn’t start.')
    const details = row.querySelector('[data-testid="mcp-stderr"]')!
    expect(details.textContent).toContain('boom')
    await click(button(en('retry'), row))
    expect(h.api.retry).toHaveBeenCalledWith('s1')
  })

  it('removes a server only after the confirmation', async () => {
    const h = fakeApi([serverView()])
    await mount(h)
    await click(button(en('show'), serverRow('s1')))
    await click(button(en('remove'), serverRow('s1')))
    expect(h.api.remove).not.toHaveBeenCalled()
    expect(serverRow('s1').textContent).toContain(en('removeConfirm', { name: 'korean-law' }))
    const confirm = serverRow('s1').querySelector('[data-testid="mcp-remove-confirm"]')!
    await click(button(en('remove'), confirm))
    expect(h.api.remove).toHaveBeenCalledWith('s1')
  })

  it('opens the server an AI window asked for, even when the request came before the card', async () => {
    const h = fakeApi([serverView(), serverView({ id: 's2', name: 'web', newTools: ['fetch'] })])
    window.aiOfficeMcpServers = h.api
    watchMcpOpenServer()
    h.emitOpen('s2')
    await mount(h)
    expect(serverRow('s2').getAttribute('data-open')).toBe('true')
    expect(serverRow('s1').getAttribute('data-open')).toBe('false')
    expect(h.api.markToolsSeen).toHaveBeenCalledWith('s2')
    // and once mounted, a later request opens that one
    await act(async () => h.emitOpen('s1'))
    await flush()
    expect(serverRow('s1').getAttribute('data-open')).toBe('true')
  })
})

describe('MCP server card helpers and strings', () => {
  it('marks the arguments the app put before the server’s own', () => {
    expect(appAddedArgs(['cli.js', '--yes', 'pkg'], ['--yes'], ['pkg'])).toEqual([
      true,
      true,
      false,
    ])
    expect(appAddedArgs(['x', '--yes'], ['--yes'], ['other'])).toEqual([false, true])
  })

  it('counts a server as usable for skills only while it is on', () => {
    const view = {
      sealing: true,
      runtimes: {},
      servers: [serverView(), serverView({ id: 's2', name: 'web', enabled: false })],
    }
    expect([...usableMcpServerNames(view)]).toEqual(['korean-law'])
    expect(usableMcpServerNames(null).size).toBe(0)
  })

  it('has every text in every language, with its placeholders', () => {
    const keys = Object.keys(mcpServersUiStrings.zh) as McpServersStringKey[]
    for (const lang of LANGS) {
      const table = mcpServersUiStrings[lang] as Record<string, string>
      expect(Object.keys(table).sort(), lang).toEqual([...keys].sort())
      for (const key of keys) {
        const holes = (mcpServersUiStrings.en[key].match(/\{\w+\}/g) ?? []).sort()
        expect((table[key]!.match(/\{\w+\}/g) ?? []).sort(), `${lang}.${key}`).toEqual(holes)
      }
      if (lang !== 'en') {
        const same = keys.filter(
          (k) => table[k] === mcpServersUiStrings.en[k] && /[a-z]{4}/.test(table[k]!),
        )
        expect(same.length, `${lang} copies English: ${same.slice(0, 5).join(', ')}`).toBeLessThan(
          6,
        )
      }
    }
  })
})

describe('Settings → Skills: MCP mark follows the registered servers', () => {
  it('hides the mark for a server that is registered and on', async () => {
    const skill = {
      id: 'app:case-brief',
      source: 'app',
      name: 'case-brief',
      title: 'case-brief',
      description: 'Drafts a brief.',
      enabled: true,
      invoke: 'auto',
      hidden: false,
      hasScripts: false,
      mcpServers: ['korean-law', 'web'],
      templateExists: false,
      agentOnly: false,
      files: 1,
      bytes: 10,
      owned: true,
      can: {
        edit: true,
        copyToMine: false,
        export: true,
        checkUpdate: false,
        openFolder: true,
        remove: true,
        hide: false,
      },
    } as unknown as UserSkillView
    ;(window as unknown as { aiOfficeUserSkills?: unknown }).aiOfficeUserSkills = {
      list: vi.fn(async () => [skill]),
      onChanged: vi.fn(() => () => undefined),
    }
    const h = fakeApi([serverView(), serverView({ id: 's2', name: 'web', enabled: false })])
    window.aiOfficeMcpServers = h.api
    await act(async () => {
      root.render(
        createElement(
          LocaleProvider,
          { initial: 'en' },
          createElement(SettingsModal, { onClose: vi.fn(), target: { section: 'skills' } }),
        ),
      )
    })
    await flush()
    const row = host.querySelector(`[data-skill-id="${skill.id}"]`)!
    expect(row.textContent).toContain('MCP server needed: web')
    expect(row.textContent).not.toContain('korean-law')
    delete (window as unknown as { aiOfficeUserSkills?: unknown }).aiOfficeUserSkills
  })
})
