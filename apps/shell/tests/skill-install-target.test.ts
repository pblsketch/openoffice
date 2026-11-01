import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guards for the skill-install IPC (apps/shell/src/main/integrations-ipc.ts):
 * a renderer-supplied `dir` may only be a directory the main process vouched
 * for, or a compromised renderer can make it write anywhere on disk.
 */
const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  installed: [] as string[],
  dialogResult: { canceled: true, filePaths: [] as string[] },
  /** SKILL.md paths the ledger says this app wrote */
  ledger: {} as Record<string, unknown>,
  /** skills dir → install status readInstallState reports */
  states: {} as Record<string, string>,
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => tmpdir() },
  clipboard: { writeText: () => {} },
  dialog: {
    showOpenDialog: async () => h.dialogResult,
    showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
  },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      h.handlers.set(channel, fn)
    },
  },
}))

vi.mock('@genoffice/cli/agent-skills', () => {
  const rows = {
    'claude-code': {
      id: 'claude-code',
      label: 'Claude Code',
      skillsDir: '/home/me/.claude/skills',
    },
    agents: { id: 'agents', label: 'Shared folder', skillsDir: '/home/me/.agents/skills' },
    codex: { id: 'codex', label: 'Codex', skillsDir: '/home/me/.codex/skills', legacy: true },
    cursor: { id: 'cursor', label: 'Cursor', skillsDir: '/home/me/.cursor/skills', legacy: true },
  } as Record<string, { id: string; label: string; skillsDir: string; legacy?: boolean }>
  const skillFilePath = (dir: string) => `${dir}/ieumoffice/SKILL.md`
  const legacy = () =>
    Object.values(rows).filter((r) => r.legacy && h.ledger[skillFilePath(r.skillsDir)])
  return {
    LEDGER_KEY: 'agentSkillInstalls',
    SHARED_AGENT_ID: 'agents',
    bundledSkillFrom: () => ({ name: 'ieumoffice', version: '1.0.0', text: 'x' }),
    buildSkillZip: async () => Buffer.alloc(0),
    detectAgents: () => [rows['claude-code'], rows.agents],
    skillRows: () => [rows['claude-code'], rows.agents, ...legacy()],
    legacySkillCopies: () => legacy(),
    agentTarget: (id: string) => rows[id] ?? null,
    skillFilePath,
    installSkill: (dir: string) => {
      h.installed.push(dir)
    },
    uninstallSkill: () => false,
    ledgerFromSettings: () => h.ledger,
    readInstallState: (dir: string) => ({
      status: h.states[dir] ?? 'missing',
      path: skillFilePath(dir),
    }),
  }
})

vi.mock('@genoffice/cli/install', () => ({
  CLI_COMMAND: 'ieumoffice',
  inspectCliLink: () => ({ linked: false }),
  launcherFileName: () => 'ieumoffice',
}))

import { registerIntegrationsIpc } from '../src/main/integrations-ipc'
import { INTEGRATIONS_CHANNELS } from '../src/shared/integrations-api'

const AGENT_SKILLS_DIR = '/home/me/.claude/skills'

function invoke(channel: string, ...args: unknown[]): unknown {
  const handler = h.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler(null, ...args)
}

let dir = ''

beforeEach(() => {
  h.handlers.clear()
  h.installed.length = 0
  h.dialogResult = { canceled: true, filePaths: [] }
  h.ledger = {}
  h.states = {}
  dir = mkdtempSync(join(tmpdir(), 'genoffice-integrations-'))
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: ieumoffice\n---\n')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.0.0' }))
  registerIntegrationsIpc({
    settingsPath: () => join(dir, 'app-settings.json'),
    window: () => null,
    cliDir: dir,
    skillPath: join(dir, 'SKILL.md'),
    cliPackageJson: join(dir, 'package.json'),
  })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('integrations:install-skill', () => {
  it('installs into an agent target resolved in the main process', () => {
    invoke(INTEGRATIONS_CHANNELS.installSkill, { agentId: 'claude-code' })
    expect(h.installed).toEqual([AGENT_SKILLS_DIR])
  })

  it('installs into a directory the user picked in the folder dialog', async () => {
    h.dialogResult = { canceled: false, filePaths: ['/Volumes/work/skills'] }
    const picked = await invoke(INTEGRATIONS_CHANNELS.pickSkillDir, 'Pick')
    expect(picked).toBe('/Volumes/work/skills')
    invoke(INTEGRATIONS_CHANNELS.installSkill, { dir: '/Volumes/work/skills' })
    expect(h.installed).toEqual(['/Volumes/work/skills'])
  })

  it('rejects a renderer-supplied directory the main process never vouched for', async () => {
    await expect(
      Promise.resolve().then(() =>
        invoke(INTEGRATIONS_CHANNELS.installSkill, { dir: '/etc/cron.d' }),
      ),
    ).rejects.toThrow('unknown skill target')
    expect(h.installed).toEqual([])
  })
})

describe('integrations:install-skill and the shared ~/.agents row', () => {
  const codexSkill = '/home/me/.codex/skills/ieumoffice/SKILL.md'

  it('refuses a new copy in the own folder of a tool the shared row serves', async () => {
    await expect(
      Promise.resolve().then(() =>
        invoke(INTEGRATIONS_CHANNELS.installSkill, { agentId: 'codex' }),
      ),
    ).rejects.toThrow('unknown skill target')
    expect(h.installed).toEqual([])
  })

  it('rewrites a copy this app wrote there before', () => {
    h.ledger[codexSkill] = { version: '0.9.0' }
    invoke(INTEGRATIONS_CHANNELS.installSkill, { agentId: 'codex' })
    expect(h.installed).toEqual(['/home/me/.codex/skills'])
  })

  it('brings plainly outdated older copies along with the shared row, and leaves edited ones', () => {
    h.ledger[codexSkill] = { version: '0.9.0' }
    h.ledger['/home/me/.cursor/skills/ieumoffice/SKILL.md'] = { version: '0.9.0' }
    h.states['/home/me/.codex/skills'] = 'outdated'
    h.states['/home/me/.cursor/skills'] = 'modified'
    invoke(INTEGRATIONS_CHANNELS.installSkill, { agentId: 'agents' })
    expect(h.installed).toEqual(['/home/me/.agents/skills', '/home/me/.codex/skills'])
  })

  it('lists the older copies after the install rows', async () => {
    h.ledger[codexSkill] = { version: '0.9.0' }
    const status = (await invoke(INTEGRATIONS_CHANNELS.status)) as {
      agents: Array<{ id: string; legacy?: boolean }>
    }
    expect(status.agents.map((a) => a.id)).toEqual(['claude-code', 'agents', 'codex'])
    expect(status.agents[2]!.legacy).toBe(true)
  })
})
