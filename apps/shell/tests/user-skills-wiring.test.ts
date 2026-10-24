import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  USER_SKILLS_BRIDGE_KEY,
  USER_SKILLS_CHANNELS,
} from '@genoffice/electron-utils/user-skills-channels'

/**
 * How the skills bridge reaches every window: one name in the nine editors'
 * preloads and the shell's, the agent window's own part with the same channel
 * names (it may not share a bundled module with the shell preload), the
 * gateway registered once in main, and the agent warning's first acceptance
 * recording the skills notice.
 */

const src = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const valueImports = (text: string) =>
  [...text.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+'([^']+)'/gm)].map((m) => m[1])

const bundled = (specs: string[]) => specs.filter((s) => s !== 'electron' && !s.startsWith('node:'))

const electronMocks = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => electronMocks.exposed.set(name, api),
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
}))

beforeEach(() => {
  electronMocks.invoke.mockReset()
  electronMocks.invoke.mockResolvedValue(undefined)
})

describe('the skills bridge in every window', () => {
  it.each(['docs', 'sheets', 'slides', 'pdf', 'markdown', 'html', 'mindmap', 'hwp', 'epub'])(
    'is exposed by the %s editor preload under the shared name',
    (editor) => {
      const preload = src(`../../${editor}/src/preload/index.ts`)
      expect(preload).toMatch(/exposeInMainWorld\(USER_SKILLS_BRIDGE_KEY, userSkillsBridge\(\)\)/)
      expect(preload).toContain("from '@genoffice/electron-utils/user-skills-bridge'")
    },
  )

  it('is exposed by the shell preload (settings and the home AI question)', () => {
    expect(src('../src/preload/index.ts')).toMatch(
      /exposeInMainWorld\(USER_SKILLS_BRIDGE_KEY, userSkillsBridge\(\)\)/,
    )
  })

  it('gives the agent window its part without sharing a bundled module with the shell preload', () => {
    const home = bundled(valueImports(src('../src/preload/index.ts')))
    const agent = bundled(valueImports(src('../src/preload/agent.ts')))
    expect(home.filter((path) => agent.includes(path))).toEqual([])
    expect(src('../src/preload/agent.ts')).toContain(`'${USER_SKILLS_BRIDGE_KEY}'`)
  })

  it('uses the shared channel names in the agent window', async () => {
    await import('../src/preload/agent')
    const api = electronMocks.exposed.get(USER_SKILLS_BRIDGE_KEY) as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >
    const calls: Array<[string, unknown[]]> = [
      ['list', []],
      ['read', ['app:a']],
      ['suggestName', ['T']],
      ['checkName', ['n']],
      ['saveFromCard', [{}]],
      ['openSettings', []],
      ['agentNotice', []],
      ['markAgentNoticeSeen', []],
    ]
    const expected = [
      USER_SKILLS_CHANNELS.list,
      USER_SKILLS_CHANNELS.read,
      USER_SKILLS_CHANNELS.suggestName,
      USER_SKILLS_CHANNELS.checkName,
      USER_SKILLS_CHANNELS.saveFromCard,
      USER_SKILLS_CHANNELS.openSettings,
      USER_SKILLS_CHANNELS.agentNotice,
      USER_SKILLS_CHANNELS.agentNoticeSeen,
    ]
    for (const [method, args] of calls) await api[method]!(...args)
    expect(electronMocks.invoke.mock.calls.map((call) => call[0])).toEqual(expected)
    const off = (api.onChanged as unknown as (l: () => void) => () => void)(() => undefined)
    expect(electronMocks.on.mock.calls.at(-1)![0]).toBe(USER_SKILLS_CHANNELS.changed)
    off()
  })

  it('gives the agent window the install preview and the template preview calls under the shared names', async () => {
    await import('../src/preload/agent')
    const api = electronMocks.exposed.get(USER_SKILLS_BRIDGE_KEY) as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >
    await api.importGitHub!('a/b@c')
    await api.cancelImport!('tok')
    await api.install!('tok', ['k'])
    await api.focusTab!('tab-1')
    expect(electronMocks.invoke.mock.calls).toEqual([
      [USER_SKILLS_CHANNELS.importGitHub, 'a/b@c'],
      [USER_SKILLS_CHANNELS.cancelImport, 'tok'],
      [USER_SKILLS_CHANNELS.install, { token: 'tok', selected: ['k'], onCollision: {} }],
      [USER_SKILLS_CHANNELS.focusTab, 'tab-1'],
    ])
    const listener = vi.fn()
    const off = (api.onPreviewEnded as unknown as (l: (e: unknown) => void) => () => void)(listener)
    const [channel, handler] = electronMocks.on.mock.calls.at(-1)! as [
      string,
      (event: unknown, raw: unknown) => void,
    ]
    expect(channel).toBe(USER_SKILLS_CHANNELS.previewEnded)
    handler({}, { previewId: 'p', outcome: 'saved', skillId: 'app:x', title: 'X' })
    handler({}, { previewId: 'p', outcome: 'bogus' })
    expect(listener.mock.calls).toEqual([
      [{ previewId: 'p', outcome: 'saved', skillId: 'app:x', title: 'X' }],
    ])
    off()
  })
})

describe('the agent window and the management gate', () => {
  const index = src('../src/main/index.ts')

  it('lets the agent window through the gate only by the install-preview channel set', () => {
    expect(index).toMatch(/canManage: userSkillsManageGate\(\{/)
    expect(index).toMatch(/isAgentWindow: \(sender\) => isAgentWindowContents\(sender\)/)
    expect(src('../src/main/user-skills/user-skills-ipc.ts')).toMatch(
      /deps\.canManage\(event\.sender, channel\)/,
    )
  })
})

describe('the main process wiring', () => {
  const index = src('../src/main/index.ts')

  it('registers the gateway once', () => {
    expect(index.match(/registerUserSkillsIpc\(/g)).toHaveLength(1)
    expect(index.match(/createUserSkillsService\(/g)).toHaveLength(1)
  })

  it('opens the settings on the skills page', () => {
    expect(index).toMatch(/HOME_CHANNELS\.openSettings, \{ section: 'skills' \}/)
  })

  it('registers the template flow once, reading templates through the service', () => {
    expect(index.match(/registerTemplateTabsIpc\(/g)).toHaveLength(1)
    expect(index.match(/createTemplateTabs\(/g)).toHaveLength(1)
    expect(index).toMatch(/templateFileOf: \(id\) => userSkills\.templateFile\(id\)/)
    // copies go to a temp folder of their own, never next to the skill
    expect(index).toMatch(/'ieumoffice-template-copies'/)
    // sheets opens its copy like "New spreadsheet": a backing workbook, first save asks
    expect(index).toMatch(/markSheetsUnsavedNew\(backingPath, suggestedPath, tempDir\)/)
  })

  it('stores the agent preferences through the helper that records the notice', () => {
    expect(index).toMatch(
      /writePrefs: \(prefs\) => writeAgentPrefs\(APP_SETTINGS_PATH\(\), prefs\)/,
    )
  })
})
