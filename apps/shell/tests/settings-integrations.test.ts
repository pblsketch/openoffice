/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi } from '../src/shared/home-api'
import type { IntegrationsApi, IntegrationsStatus } from '../src/shared/integrations-api'
import { mcpClaudeCommand, mcpConfigJson, mcpLaunch } from '../src/renderer/src/IntegrationsPane'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SettingsModal, type SettingsModalProps } from '../src/renderer/src/SettingsModal'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  window.aiOffice = {
    getTheme: async () => 'system',
    getDefaultSaveDir: async () => '',
    getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
    getAiPanelPrefs: async () => ({ fontSize: 'default', spellcheck: true }),
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '1.0.0',
  } as unknown as HomeApi
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).toBeTruthy()
  await act(async () => {
    ;(el as HTMLButtonElement).click()
    await Promise.resolve()
  })
  await flush()
}

function buttonWithText(text: string, scope: ParentNode = host): HTMLButtonElement | undefined {
  return [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
}

function baseStatus(): IntegrationsStatus {
  return {
    cli: {
      status: 'missing',
      location: '/usr/local/bin/ieumoffice',
      manual:
        'sudo ln -sf /Applications/IeumOffice.app/Contents/Resources/cli/ieumoffice /usr/local/bin/ieumoffice',
      launcherDir: '/Applications/IeumOffice.app/Contents/Resources/cli',
      ephemeral: false,
      version: '0.4.0',
    },
    skillVersion: '2.1.0',
    skillNeedsCli: '0.4.0',
    agents: [
      {
        id: 'claude-code',
        label: 'Claude Code',
        skillsDir: '/home/u/.claude/skills',
        state: { status: 'missing', path: '/home/u/.claude/skills/ieumoffice/SKILL.md' },
      },
      {
        id: 'agents',
        label: 'Shared folder (~/.agents): Codex, Cursor, Gemini CLI, Copilot, OpenCode',
        skillsDir: '/home/u/.agents/skills',
        state: {
          status: 'foreign',
          path: '/home/u/.agents/skills/ieumoffice/SKILL.md',
          installedVersion: '2.1.0',
        },
      },
      {
        // written by an older version, before the shared row served Codex
        id: 'codex',
        label: 'Codex',
        skillsDir: '/home/u/.codex/skills',
        legacy: true,
        state: {
          status: 'outdated',
          path: '/home/u/.codex/skills/ieumoffice/SKILL.md',
          installedVersion: '2.0.0',
          older: true,
        },
      },
    ],
  }
}

async function openIntegrations(
  api: Partial<IntegrationsApi>,
  extra: Partial<SettingsModalProps> = {},
): Promise<void> {
  window.aiOfficeIntegrations = api as IntegrationsApi
  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(SettingsModal, {
          onClose: vi.fn(),
          ...extra,
        }),
      ),
    )
    await Promise.resolve()
  })
  await click(buttonWithText('Integrations'))
}

describe('Settings → Integrations', () => {
  it('lists detected agents with their state and offers the matching actions', async () => {
    await openIntegrations({ status: async () => baseStatus(), copyText: async () => {} })
    const rows = [...host.querySelectorAll('.set-intg-row')]
    expect(rows.map((r) => r.getAttribute('data-agent'))).toEqual([
      'claude-code',
      'agents',
      'codex',
    ])
    expect(rows[0]!.textContent).toContain('Skill not installed')
    expect(buttonWithText('Install', rows[0]!)).toBeTruthy()
    // the shared row: its label is translated, and foreign and current means no button
    expect(rows[1]!.querySelector('.set-field-label')!.textContent).toBe(
      'Shared folder (~/.agents): Codex, Cursor, Gemini CLI, Copilot, OpenCode',
    )
    expect(rows[1]!.textContent).toContain('Installed 2.1.0 (not by this app)')
    expect(rows[1]!.querySelectorAll('button')).toHaveLength(0)
    expect(rows[1]!.querySelector('.set-intg-legacy')).toBeNull()
    // the older copy in Codex's own folder: still kept current and removable, with the hint
    expect(rows[2]!.classList.contains('set-intg-row-legacy')).toBe(true)
    expect(rows[2]!.textContent).toContain('Installed 2.0.0, update to 2.1.0 available')
    expect(buttonWithText('Update', rows[2]!)).toBeTruthy()
    expect(buttonWithText('Uninstall', rows[2]!)).toBeTruthy()
    expect(rows[2]!.querySelector('.set-intg-legacy')!.textContent).toBe(
      "Older copy in Codex's own folder. Codex now reads the skill from the shared folder (~/.agents); once it is installed there, you can remove this copy.",
    )
    // CLI block: launcher path, PATH state in plain words, the manual command as copyable code
    expect(host.textContent).toContain('/Applications/IeumOffice.app/Contents/Resources/cli')
    expect(host.textContent).toContain("not on your terminal's PATH")
    expect(host.querySelector('.set-intg-cli code')?.textContent).toContain('sudo ln -sf')
    expect(host.textContent).toContain('skill 2.1.0')
    // guidance: hero steps, one-of-three note, example prompts, npx command shown inline
    expect(host.querySelectorAll('.set-intg-hero-steps li')).toHaveLength(3)
    expect(host.textContent).toContain('Pick any one of these three ways')
    // the same three prompts appear under both the CLI and the MCP part
    expect(host.querySelectorAll('.set-intg-example')).toHaveLength(6)
    expect(host.textContent).toContain('npx skills add pblsketch/openoffice')
    // MCP block: the launcher itself while genoffice is not on the PATH, as a command and as JSON
    const mcp = [...host.querySelectorAll('.set-intg-mcp code')].map((c) => c.textContent)
    expect(mcp[0]).toBe(
      'claude mcp add --transport stdio ieumoffice -- /Applications/IeumOffice.app/Contents/Resources/cli/ieumoffice mcp',
    )
    expect(JSON.parse(mcp[1]!)).toEqual({
      mcpServers: {
        ieumoffice: {
          command: '/Applications/IeumOffice.app/Contents/Resources/cli/ieumoffice',
          args: ['mcp'],
        },
      },
    })
    expect(host.textContent).toContain('assistant picks one')
  })

  it('names the bare command once genoffice is on the PATH and runs the app as Node on Windows', () => {
    expect(
      mcpLaunch({
        status: 'present',
        launcherDir: '/Applications/IeumOffice.app/Contents/Resources/cli',
      }),
    ).toEqual({ command: 'ieumoffice', args: ['mcp'] })
    const winDir = 'C:\\Users\\Jane Doe\\AppData\\Local\\Programs\\IeumOffice\\resources\\cli'
    const win = {
      command: `${winDir}\\..\\..\\IeumOffice.exe`,
      args: [`${winDir}\\genoffice.cjs`, 'mcp'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    }
    expect(mcpLaunch({ status: 'missing', launcherDir: winDir })).toEqual(win)
    expect(mcpLaunch({ status: 'present', launcherDir: winDir })).toEqual(win)
    expect(mcpClaudeCommand(win)).toBe(
      `claude mcp add -e ELECTRON_RUN_AS_NODE=1 --transport stdio ieumoffice -- "${win.command}" "${win.args[0]}" mcp`,
    )
    expect(JSON.parse(mcpConfigJson(win))).toEqual({ mcpServers: { ieumoffice: win } })
    expect(
      mcpClaudeCommand({ command: '/Applications/Gen Office.app/cli/ieumoffice', args: ['mcp'] }),
    ).toBe(
      'claude mcp add --transport stdio ieumoffice -- "/Applications/Gen Office.app/cli/ieumoffice" mcp',
    )
  })

  it('writes only after the path was shown and confirmed, then refreshes the row', async () => {
    const status = baseStatus()
    const install = vi.fn(async (target: { agentId?: string; dir?: string }) => {
      const row = status.agents.find((a) => a.id === target.agentId)!
      row.state = { status: 'installed', path: row.state.path, installedVersion: '2.1.0' }
      return row.state
    })
    await openIntegrations({
      status: async () => status,
      installSkill: install as IntegrationsApi['installSkill'],
    })
    const row = host.querySelector('[data-agent="claude-code"]')!
    await click(buttonWithText('Install', row))
    expect(install).not.toHaveBeenCalled()
    expect(row.textContent).toContain('Will write: /home/u/.claude/skills/ieumoffice/SKILL.md')

    await click(buttonWithText('Cancel', row))
    expect(row.querySelector('.set-intg-confirm')).toBeNull()
    expect(install).not.toHaveBeenCalled()

    await click(buttonWithText('Install', row))
    await click(buttonWithText('Confirm', row))
    expect(install).toHaveBeenCalledWith({ agentId: 'claude-code' })
    const after = host.querySelector('[data-agent="claude-code"]')!
    expect(after.getAttribute('data-state')).toBe('installed')
    expect(after.textContent).toContain('Skill 2.1.0 installed · ready in your next chat')
    expect(buttonWithText('Uninstall', after)).toBeTruthy()
  })

  it('names the older copies the shared row brings along before it writes', async () => {
    const status = baseStatus()
    status.agents[1]!.state = {
      status: 'missing',
      path: '/home/u/.agents/skills/ieumoffice/SKILL.md',
    }
    const install = vi.fn(async () => status.agents[1]!.state)
    await openIntegrations({
      status: async () => status,
      installSkill: install as IntegrationsApi['installSkill'],
    })
    const row = host.querySelector('[data-agent="agents"]')!
    await click(buttonWithText('Install', row))
    expect(row.querySelector('.set-intg-confirm')!.textContent).toContain(
      'Will write: /home/u/.agents/skills/ieumoffice/SKILL.md The older copies at /home/u/.codex/skills/ieumoffice/SKILL.md are updated as well.',
    )
    await click(buttonWithText('Confirm', row))
    expect(install).toHaveBeenCalledWith({ agentId: 'agents' })
  })

  it('never offers a new install on a legacy row', async () => {
    const status = baseStatus()
    status.agents[2]!.state = {
      status: 'missing',
      path: '/home/u/.codex/skills/ieumoffice/SKILL.md',
    }
    await openIntegrations({ status: async () => status })
    const row = host.querySelector('[data-agent="codex"]')!
    expect(row.querySelectorAll('button')).toHaveLength(0)
  })

  it('installs into a picked folder and saves the zip through the main process', async () => {
    const install = vi.fn(async () => ({
      status: 'installed' as const,
      path: '/x/ieumoffice/SKILL.md',
      installedVersion: '2.1.0',
    }))
    const saveZip = vi.fn(async () => '/Users/u/Downloads/ieumoffice-skill-2.1.0.zip')
    await openIntegrations({
      status: async () => baseStatus(),
      pickSkillDir: async () => '/x',
      installSkill: install,
      saveSkillZip: saveZip,
    })
    await click(buttonWithText('Install into another folder…'))
    expect(host.textContent).toContain('Will write: /x/ieumoffice/SKILL.md')
    await click(buttonWithText('Confirm'))
    expect(install).toHaveBeenCalledWith({ dir: '/x' })

    await click(buttonWithText('Download skill (zip)'))
    expect(saveZip).toHaveBeenCalledWith('Save skill')
    expect(host.textContent).toContain('Saved to /Users/u/Downloads/ieumoffice-skill-2.1.0.zip')
  })

  it('marks the Integrations entry while a detected assistant holds an older skill', async () => {
    const onDue = vi.fn()
    await openIntegrations(
      { status: async () => baseStatus() },
      { skillUpdateDue: true, onSkillUpdateDue: onDue },
    )
    expect(buttonWithText('Integrations')!.querySelector('.set-nav-dot')).toBeTruthy()
    // codex is outdated in baseStatus → the pane reports "update due" once it has probed
    expect(onDue).toHaveBeenLastCalledWith(true)

    const fresh = baseStatus()
    for (const a of fresh.agents) a.state = { status: 'missing', path: a.state.path }
    await openIntegrations(
      { status: async () => fresh },
      { skillUpdateDue: false, onSkillUpdateDue: onDue },
    )
    expect(buttonWithText('Integrations')!.querySelector('.set-nav-dot')).toBeNull()
    expect(onDue).toHaveBeenLastCalledWith(false)
  })
})
