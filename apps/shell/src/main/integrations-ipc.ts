import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, clipboard, dialog, ipcMain, type BrowserWindow } from 'electron'
import {
  agentTarget,
  bundledSkillFrom,
  buildSkillZip,
  detectAgents,
  installSkill,
  LEDGER_KEY,
  ledgerFromSettings,
  legacySkillCopies,
  readInstallState,
  SHARED_AGENT_ID,
  skillFilePath,
  skillRows,
  uninstallSkill,
  type BundledSkill,
  type SkillLedger,
} from '@genoffice/cli/agent-skills'
import { CLI_COMMAND, inspectCliLink, launcherFileName } from '@genoffice/cli/install'
import { readAppSettings, writeAppSetting } from './app-settings'
import { isEphemeralInstall } from './cli-link'
import { isInstallableSkillDir } from './skill-target'
import {
  INTEGRATIONS_CHANNELS,
  type AgentId,
  type IntegrationsStatus,
  type SkillInstallState,
} from '../shared/integrations-api'

export interface IntegrationsDeps {
  settingsPath: () => string
  /** the shell window dialogs attach to */
  window: () => BrowserWindow | null
  /** directory holding ieumoffice / ieumoffice.cmd and, packaged, skills/ieumoffice/SKILL.md */
  cliDir: string
  /** skills/ieumoffice/SKILL.md (repo file in dev, Resources/cli/skills/... packaged) */
  skillPath: string
  /** packages/cli/package.json (its version is the CLI version) */
  cliPackageJson: string
}

/** Settings → Integrations: probe, install, uninstall, zip. No write happens without a click in that pane. */
export function registerIntegrationsIpc(deps: IntegrationsDeps): void {
  const bundled = (): BundledSkill => bundledSkillFrom(readFileSync(deps.skillPath))
  const ledger = (): SkillLedger => ledgerFromSettings(readAppSettings(deps.settingsPath()))
  const saveLedger = (l: SkillLedger) => writeAppSetting(deps.settingsPath(), LEDGER_KEY, l)
  // the only non-agent directory installSkill may write to is the one the user just picked
  let pickedSkillDir: string | null = null
  const vouchedSkillDirs = (): string[] => [
    ...detectAgents().map((a) => a.skillsDir),
    ...(pickedSkillDir ? [pickedSkillDir] : []),
  ]
  const stateOf = (skillsDir: string): SkillInstallState =>
    readInstallState(skillsDir, bundled(), ledger())

  ipcMain.handle(INTEGRATIONS_CHANNELS.status, (): IntegrationsStatus => {
    const skill = bundled()
    const l = ledger()
    const launcher = join(deps.cliDir, launcherFileName(process.platform))
    return {
      cli: {
        ...inspectCliLink({ launcher }),
        launcherDir: deps.cliDir,
        ephemeral: app.isPackaged && isEphemeralInstall(process.resourcesPath, process.env),
        version: cliVersion(deps.cliPackageJson),
      },
      skillVersion: skill.version,
      skillNeedsCli: /^\s+cli:\s*['"]?>=\s*(\d+\.\d+\.\d+)/m.exec(skill.text)?.[1] ?? '',
      agents: skillRows(l).map((a) => ({ ...a, state: readInstallState(a.skillsDir, skill, l) })),
    }
  })

  ipcMain.handle(
    INTEGRATIONS_CHANNELS.installSkill,
    (_e, target: { agentId?: AgentId; dir?: string }): SkillInstallState => {
      const row = target.dir ? null : agentTarget(target.agentId!)
      const skillsDir = target.dir ?? row?.skillsDir
      if (!skillsDir) throw new Error('unknown skill target')
      if (target.dir && !isInstallableSkillDir(skillsDir, vouchedSkillDirs())) {
        throw new Error('unknown skill target')
      }
      const l = ledger()
      // a tool the shared row serves gets no new copy of its own: only one this app already wrote is rewritten
      if (row?.legacy && !l[skillFilePath(skillsDir)]) throw new Error('unknown skill target')
      const skill = bundled()
      installSkill(skillsDir, skill, l)
      // the shared row brings the older copies along so a tool never finds two versions under one
      // name; a copy edited by hand (or otherwise not plainly outdated) waits for its own row's click
      if (row?.id === SHARED_AGENT_ID) {
        for (const copy of legacySkillCopies(l, process.env, undefined, SHARED_AGENT_ID)) {
          if (readInstallState(copy.skillsDir, skill, l).status === 'outdated') {
            installSkill(copy.skillsDir, skill, l)
          }
        }
      }
      saveLedger(l)
      return stateOf(skillsDir)
    },
  )

  ipcMain.handle(
    INTEGRATIONS_CHANNELS.uninstallSkill,
    (_e, agentId: AgentId): SkillInstallState => {
      const target = agentTarget(agentId)
      if (!target) throw new Error('unknown skill target')
      const l = ledger()
      if (uninstallSkill(target.skillsDir, l)) saveLedger(l)
      return stateOf(target.skillsDir)
    },
  )

  // dialog titles come from the renderer, which owns the UI language
  ipcMain.handle(
    INTEGRATIONS_CHANNELS.pickSkillDir,
    async (_e, title: string): Promise<string | null> => {
      const opts: Electron.OpenDialogOptions = {
        title: String(title ?? ''),
        properties: ['openDirectory', 'createDirectory'],
      }
      const win = deps.window()
      const r = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts))
      const picked = r.canceled ? null : (r.filePaths[0] ?? null)
      pickedSkillDir = picked
      return picked
    },
  )

  ipcMain.handle(
    INTEGRATIONS_CHANNELS.saveSkillZip,
    async (_e, title: string): Promise<string | null> => {
      const skill = bundled()
      const opts: Electron.SaveDialogOptions = {
        title: String(title ?? ''),
        defaultPath: join(app.getPath('downloads'), `${CLI_COMMAND}-skill-${skill.version}.zip`),
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      }
      const win = deps.window()
      const r = await (win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts))
      if (r.canceled || !r.filePath) return null
      writeFileSync(r.filePath, await buildSkillZip(skill))
      return r.filePath
    },
  )

  ipcMain.handle(INTEGRATIONS_CHANNELS.copyText, (_e, text: string): void => {
    if (typeof text === 'string') clipboard.writeText(text)
  })
}

function cliVersion(packageJson: string): string {
  try {
    return String(JSON.parse(readFileSync(packageJson, 'utf-8')).version ?? '')
  } catch {
    return ''
  }
}
