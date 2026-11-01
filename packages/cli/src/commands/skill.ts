import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  agentIds,
  agentLabel,
  agentPresent,
  agentTarget,
  bundledSkillFrom,
  installRowFor,
  installSkill,
  legacySkillCopies,
  LEDGER_KEY,
  ledgerFromSettings,
  readInstallState,
  skillTargetIds,
  uninstallSkill,
  type AgentId,
  type AgentTarget,
  type BundledSkill,
  type SkillInstallState,
  type SkillLedger,
} from '../agent-skills'
import { flagBool, flagString } from '../args'
import { genofficeUserDataDir } from '../gui'
import type { CommandContext, CommandDef } from '../registry'
import { bundledSkillPath } from '../resources'
import { CliError, EXIT, type Warning } from '../result'
import { didYouMean } from '../suggest'

const SUBCOMMANDS = ['list', 'install', 'remove', 'path']

/**
 * The headless twin of Settings → Integrations: list the coding agents on this
 * machine and copy the bundled skill into their skills directory. Writes go
 * into the same ledger the app keeps (userData/app-settings.json), so the pane
 * shows a CLI install as "installed", not "foreign".
 *
 * Codex, Cursor, Gemini CLI, Copilot and OpenCode all read `~/.agents/skills`,
 * so naming one of them installs into that shared row. A copy this app wrote
 * into one of their own folders earlier is listed, kept at the bundled version
 * along with the install, and only `skill remove <tool>` deletes it (decision 0095).
 */
export const skillCommand: CommandDef = {
  name: 'skill',
  summary:
    'List the coding agents found on this machine and install, update or remove the bundled ieumoffice skill for them.',
  usage:
    'skill list | skill install <agent|all> [--dir <path>] [--force] | skill remove <agent> [--dir <path>] | skill path',
  options: [
    { name: 'list', description: 'same as `skill list`' },
    {
      name: 'dir',
      value: 'path',
      description: 'install/remove: use this skills directory instead',
    },
    {
      name: 'force',
      description:
        'install: also write when the agent is not detected, the installed copy is newer, or it was edited by hand',
    },
  ],
  async run(args, ctx) {
    const sub = flagBool(args, 'list') ? 'list' : (args.positionals[0] ?? 'list')
    switch (sub) {
      case 'list':
        return list(ctx)
      case 'path': {
        const path = skillFile()
        return { summary: path, detail: { path, version: bundled().version } }
      }
      case 'install':
        return install(args.positionals[1], flagString(args, 'dir'), flagBool(args, 'force'), ctx)
      case 'remove':
        return remove(args.positionals[1], flagString(args, 'dir'), ctx)
      default:
        throw new CliError(
          EXIT.usage,
          `unknown skill subcommand: ${sub}`,
          { supported: SUBCOMMANDS },
          {
            reason: 'invalid_argument',
            suggestion: didYouMean(sub, SUBCOMMANDS)
              ? `did you mean \`${didYouMean(sub, SUBCOMMANDS)}\`?`
              : 'use `skill list`, `skill install <agent|all>`, `skill remove <agent>` or `skill path`',
          },
        )
    }
  },
}

interface AgentRow {
  /** null for a folder given with --dir */
  agent: AgentId | null
  label: string
  detected: boolean
  skills_dir: string
  status: SkillInstallState['status']
  installed_version: string | null
  up_to_date: boolean
  /** a copy in the own folder of a tool the shared `agents` row now serves (kept current, never deleted on its own) */
  legacy: boolean
}

function list(ctx: CommandContext) {
  const skill = bundled()
  const ledger = readLedger(ctx.env)
  const h = home(ctx.env)
  const agents: AgentRow[] = [
    ...skillTargetIds().map((id) => agentTarget(id, ctx.env, h)!),
    ...legacySkillCopies(ledger, ctx.env, h),
  ]
    .sort((a, b) => agentIds().indexOf(a.id) - agentIds().indexOf(b.id))
    .map((t) =>
      row(t, agentPresent(t.id, ctx.env, h), readInstallState(t.skillsDir, skill, ledger)),
    )
  const found = agents.filter((a) => a.detected && !a.legacy)
  const current = found.filter((a) => a.up_to_date).length
  const legacy = agents.filter((a) => a.legacy)
  return {
    summary:
      (found.length
        ? `${found.length} agent(s) detected, ${current} with skill ${skill.version}: ${found
            .map((a) => `${a.agent} ${a.installed_version ?? '-'}`)
            .join(', ')}`
        : 'no coding agent detected on this machine') +
      (legacy.length
        ? `; older copies in ${legacy.map((a) => `${a.agent} ${a.installed_version ?? '-'}`).join(', ')}`
        : ''),
    detail: { bundled_version: skill.version, skill_path: skillFile(), agents },
  }
}

interface InstallTarget {
  target: AgentTarget | null
  skillsDir: string
  detected: boolean
}

function install(
  name: string | undefined,
  dir: string | undefined,
  force: boolean,
  ctx: CommandContext,
) {
  if (!name && !dir) {
    throw new CliError(
      EXIT.usage,
      'skill install needs an agent name, `all`, or --dir',
      undefined,
      {
        reason: 'missing_argument',
        suggestion: `agents: ${agentIds().join(', ')}`,
      },
    )
  }
  const skill = bundled()
  const ledger = readLedger(ctx.env)
  const h = home(ctx.env)
  const targets: InstallTarget[] = []
  /** legacy copies brought along: refreshed when they can be, skipped (with a warning) when not */
  let legacy: AgentTarget[] = []
  const rowTarget = (id: AgentId): InstallTarget => {
    const t = agentTarget(id, ctx.env, h)!
    return { target: t, skillsDir: t.skillsDir, detected: agentPresent(id, ctx.env, h) }
  }
  if (dir) {
    targets.push({ target: null, skillsDir: resolve(ctx.cwd, dir), detected: true })
  } else if (name === 'all') {
    for (const id of skillTargetIds()) {
      if (agentPresent(id, ctx.env, h)) targets.push(rowTarget(id))
    }
    legacy = legacySkillCopies(ledger, ctx.env, h)
    if (!targets.length && !legacy.length) {
      throw new CliError(EXIT.usage, 'no coding agent detected on this machine', undefined, {
        reason: 'unsupported',
        suggestion: 'install into a folder with --dir <skills directory>',
      })
    }
  } else {
    const named = agentIds().find((id) => id === name)
    if (!named) {
      const guess = didYouMean(name!, agentIds())
      throw new CliError(
        EXIT.usage,
        `unknown agent: ${name}`,
        { supported: [...agentIds(), 'all'] },
        {
          reason: 'unsupported',
          suggestion: guess
            ? `did you mean \`${guess}\`?`
            : `agents: ${agentIds().join(', ')}, or all`,
        },
      )
    }
    // a tool the shared row serves installs there; its own folder is only kept current
    const t = rowTarget(installRowFor(named))
    const present = agentPresent(named, ctx.env, h)
    if (!present && !force) {
      throw new CliError(
        EXIT.usage,
        `${agentLabel(named)} is not installed on this machine (${t.skillsDir} would be created)`,
        { agent: named, skills_dir: t.skillsDir },
        { reason: 'unsupported', suggestion: 'repeat with --force to create the folder anyway' },
      )
    }
    targets.push({ ...t, detected: present })
    legacy = legacySkillCopies(ledger, ctx.env, h, named)
  }

  // every target is checked before the first write, so a refusal never leaves a half-done batch
  for (const t of targets) {
    const before = readInstallState(t.skillsDir, skill, ledger)
    const blocked = refusal(before, force)
    if (blocked) {
      throw new CliError(
        EXIT.file,
        `${t.target?.id ?? t.skillsDir}: ${blocked} (${before.path})`,
        { agent: t.target?.id ?? null, skills_dir: t.skillsDir, status: before.status },
        { reason: 'output_exists', suggestion: refusalHint(before.status) },
      )
    }
  }
  const warnings: Warning[] = []
  const written: string[] = []
  const rows: Array<AgentRow & { action: 'written' | 'unchanged' }> = []
  let dirty = false
  const write = (t: InstallTarget) => {
    installSkill(t.skillsDir, skill, ledger, 'cli')
    dirty = true
    written.push(t.target?.id ?? t.skillsDir)
  }
  for (const t of targets) {
    const label = t.target?.id ?? t.skillsDir
    let action: 'written' | 'unchanged' = 'unchanged'
    if (readInstallState(t.skillsDir, skill, ledger).status === 'installed') {
      warnings.push({
        code: 'already_up_to_date',
        message: `${label}: skill ${skill.version} already installed`,
      })
    } else {
      write(t)
      action = 'written'
    }
    rows.push({
      ...row(t.target, t.detected, readInstallState(t.skillsDir, skill, ledger)),
      action,
    })
  }
  // the old copies stay where they are and only follow the bundled version, so the
  // tool never finds two different skills under one name
  for (const l of legacy) {
    const t: InstallTarget = {
      target: l,
      skillsDir: l.skillsDir,
      detected: agentPresent(l.id, ctx.env, h),
    }
    const before = readInstallState(l.skillsDir, skill, ledger)
    let action: 'written' | 'unchanged' = 'unchanged'
    if (before.status !== 'installed') {
      const blocked = refusal(before, force)
      if (blocked) {
        warnings.push({
          code: 'legacy_copy_left',
          message: `${l.id}: ${blocked}; the older copy at ${before.path} was left as it is`,
        })
      } else {
        write(t)
        action = 'written'
      }
    }
    rows.push({ ...row(l, t.detected, readInstallState(l.skillsDir, skill, ledger)), action })
  }
  if (dirty) writeLedger(ctx.env, ledger)
  return {
    summary: written.length
      ? `installed skill ${skill.version} for ${written.join(', ')}`
      : `skill ${skill.version} already up to date`,
    ...(warnings.length ? { warnings } : {}),
    detail: { bundled_version: skill.version, agents: rows },
  }
}

/**
 * Remove the copy this app wrote in one row's folder, the twin of the pane's
 * Uninstall. A tool the shared row serves names its own (legacy) folder here,
 * not the shared one: `remove agents` is what takes the shared copy away. A
 * file this app did not write is left alone.
 */
function remove(name: string | undefined, dir: string | undefined, ctx: CommandContext) {
  if (!name && !dir) {
    throw new CliError(EXIT.usage, 'skill remove needs an agent name or --dir', undefined, {
      reason: 'missing_argument',
      suggestion: `agents: ${agentIds().join(', ')}`,
    })
  }
  const h = home(ctx.env)
  let target: AgentTarget | null = null
  if (!dir) {
    target = agentIds().includes(name as AgentId) ? agentTarget(name as AgentId, ctx.env, h) : null
    if (!target) {
      const guess = didYouMean(name!, agentIds())
      throw new CliError(
        EXIT.usage,
        `unknown agent: ${name}`,
        { supported: agentIds() },
        {
          reason: 'unsupported',
          suggestion: guess ? `did you mean \`${guess}\`?` : `agents: ${agentIds().join(', ')}`,
        },
      )
    }
  }
  const skillsDir = dir ? resolve(ctx.cwd, dir) : target!.skillsDir
  const skill = bundled()
  const ledger = readLedger(ctx.env)
  const removed = uninstallSkill(skillsDir, ledger)
  if (removed) writeLedger(ctx.env, ledger)
  const after = readInstallState(skillsDir, skill, ledger)
  const label = target?.id ?? skillsDir
  return {
    summary: removed
      ? `removed the skill from ${label}`
      : `${label}: nothing this app installed to remove`,
    ...(removed
      ? {}
      : {
          warnings: [
            {
              code: 'not_installed_by_app',
              message:
                after.status === 'missing'
                  ? `${label}: no skill at ${after.path}`
                  : `${label}: the skill at ${after.path} was not written by this app; left as it is`,
            },
          ],
        }),
    detail: {
      bundled_version: skill.version,
      agents: [
        {
          ...row(target, target ? agentPresent(target.id, ctx.env, h) : true, after),
          action: removed ? 'removed' : 'unchanged',
        },
      ],
    },
  }
}

function refusal(state: SkillInstallState, force: boolean): string | null {
  if (state.status === 'occupied') return 'the ieumoffice folder there holds something else'
  if (force) return null
  if (state.status === 'newer')
    return `a newer skill ${state.installedVersion} is installed; not downgrading`
  if (state.status === 'modified') return 'the installed skill was edited by hand; not overwriting'
  return null
}

function refusalHint(status: SkillInstallState['status']): string {
  if (status === 'occupied') return 'move that folder away, or install with --dir elsewhere'
  return 'repeat with --force to replace it'
}

function row(target: AgentTarget | null, detected: boolean, state: SkillInstallState): AgentRow {
  return {
    agent: target?.id ?? null,
    label: target?.label ?? state.path,
    detected,
    skills_dir: target?.skillsDir ?? state.path.replace(/[\\/]ieumoffice[\\/]SKILL\.md$/, ''),
    status: state.status,
    installed_version: state.installedVersion ?? null,
    up_to_date: state.status === 'installed' || state.status === 'newer',
    legacy: target?.legacy === true,
  }
}

/** test seam: the home the agent dotfolders are probed under */
function home(env: NodeJS.ProcessEnv): string {
  return env.GENOFFICE_HOME || homedir()
}

function skillFile(): string {
  const path = bundledSkillPath()
  if (!path)
    throw new CliError(EXIT.app, 'the bundled skill (skills/ieumoffice/SKILL.md) was not found')
  return path
}

function bundled(): BundledSkill {
  return bundledSkillFrom(readFileSync(skillFile()))
}

function settingsPath(env: NodeJS.ProcessEnv): string {
  return join(genofficeUserDataDir(env), 'app-settings.json')
}

function readSettings(env: NodeJS.ProcessEnv): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(readFileSync(settingsPath(env), 'utf8'))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  } catch {}
  return {}
}

function readLedger(env: NodeJS.ProcessEnv): SkillLedger {
  return ledgerFromSettings(readSettings(env))
}

/** Same file and key the app uses; replaced atomically so a concurrent app write never sees a half file. */
function writeLedger(env: NodeJS.ProcessEnv, ledger: SkillLedger): void {
  const path = settingsPath(env)
  const next = { ...readSettings(env), [LEDGER_KEY]: ledger }
  const tmp = `${path}.${process.pid}.tmp`
  mkdirSync(dirname(path), { recursive: true })
  try {
    writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding: 'utf8', flag: 'wx' })
    renameSync(tmp, path)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {}
    throw err
  }
}
