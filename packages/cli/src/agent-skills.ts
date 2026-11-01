import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  type Stats,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { SKILL_NAME } from './names'

/**
 * Installing the bundled `ieumoffice` skill into the coding agents found on this
 * machine, shared by Settings → Integrations and `ieumoffice skill`. Every write
 * is a click in that pane or an explicit command; nothing installs on its own.
 * Pure functions over an injected home / env so the state table is
 * unit-testable without touching the real dotfolders.
 */

export { SKILL_NAME }

/** app-settings.json key under which every install this machine's GenOffice wrote is remembered */
export const LEDGER_KEY = 'agentSkillInstalls'

export type AgentId =
  'claude-code' | 'agents' | 'codex' | 'cursor' | 'gemini' | 'copilot' | 'opencode' | 'windsurf'

export interface AgentTarget {
  id: AgentId
  /** product name, shown as is (not translated); the shared row's is a description the app localizes */
  label: string
  /** global skills directory the agent scans */
  skillsDir: string
  /**
   * A tool's own skills folder that the shared `~/.agents` row now serves. Such
   * a row is listed only while a copy this app wrote is still there, so it can
   * be kept current or removed; it is never offered for a new install.
   */
  legacy?: boolean
}

export type SkillInstallStatus =
  /** no ieumoffice/ folder in the skills directory */
  | 'missing'
  /** written by this app, same version and bytes as the bundled skill */
  | 'installed'
  /** written by this app, older than the bundled skill */
  | 'outdated'
  /** written by this app, edited since (bytes differ from what was written) */
  | 'modified'
  /** our skill by front matter, but not written by this app (other host, npx, by hand) */
  | 'foreign'
  /** a newer skill version than the one bundled, whoever wrote it */
  | 'newer'
  /** ieumoffice/ exists but does not hold our skill */
  | 'occupied'

export interface SkillInstallState {
  status: SkillInstallStatus
  /** `<skillsDir>/ieumoffice/SKILL.md` */
  path: string
  installedVersion?: string
  /** installed version is older than the bundled one (foreign rows offer an update then) */
  older?: boolean
}

/**
 * How a row of the table takes part in installing the skill:
 * - `own`: the tool reads only its own folder (Claude Code, Windsurf), so it gets a row of its own
 * - `shared`: `~/.agents/skills`, which every `reader` tool scans, so one row serves them all
 * - `reader`: a tool that reads the shared folder; its own folder is only a legacy target
 *   (a copy written there before stays listed, updatable and removable, never deleted on its own)
 */
type AgentRole = 'own' | 'shared' | 'reader'

interface AgentDef {
  id: AgentId
  label: string
  role: AgentRole
  /** the tool's own dotfolder: its presence means the tool is installed, and `mcp` writes its config there */
  probe: (env: NodeJS.ProcessEnv, home: string) => string
  /** the skills directory, inside the probe folder */
  skills: (probe: string) => string
}

/** Table order is pane order: the shared row right after Claude Code, the readers' legacy copies under it. */
const AGENTS: readonly AgentDef[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    role: 'own',
    probe: (env, home) => env.CLAUDE_CONFIG_DIR || join(home, '.claude'),
    skills: (p) => join(p, 'skills'),
  },
  {
    id: 'agents',
    label: 'Shared folder (~/.agents): Codex, Cursor, Gemini CLI, Copilot, OpenCode',
    role: 'shared',
    probe: (_env, home) => join(home, '.agents'),
    skills: (p) => join(p, 'skills'),
  },
  {
    id: 'codex',
    label: 'Codex',
    role: 'reader',
    probe: (env, home) => env.CODEX_HOME || join(home, '.codex'),
    skills: (p) => join(p, 'skills'),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    role: 'reader',
    probe: (_env, home) => join(home, '.cursor'),
    skills: (p) => join(p, 'skills'),
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    role: 'reader',
    probe: (_env, home) => join(home, '.gemini'),
    skills: (p) => join(p, 'skills'),
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    role: 'reader',
    probe: (_env, home) => join(home, '.copilot'),
    skills: (p) => join(p, 'skills'),
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    role: 'reader',
    probe: (env, home) => join(env.XDG_CONFIG_HOME || join(home, '.config'), 'opencode'),
    skills: (p) => join(p, 'skills'),
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    role: 'own',
    probe: (_env, home) => join(home, '.codeium', 'windsurf'),
    skills: (p) => join(p, 'skills'),
  },
]

/** The id of the shared `~/.agents` row. */
export const SHARED_AGENT_ID = 'agents' satisfies AgentId

/** Every name `skill install` takes, in table order: the install rows and the tools the shared row serves. */
export function agentIds(): AgentId[] {
  return AGENTS.map((a) => a.id)
}

/** The rows a new install can go to: Claude Code, the shared folder, Windsurf. */
export function skillTargetIds(): AgentId[] {
  return AGENTS.filter((a) => a.role !== 'reader').map((a) => a.id)
}

/** Whether `id` is a tool the shared row serves, whose own folder only holds a legacy copy. */
export function isSharedReader(id: AgentId): boolean {
  return AGENTS.find((a) => a.id === id)?.role === 'reader'
}

/** The row a new install for `id` goes to: the shared row for its readers, the tool's own row otherwise. */
export function installRowFor(id: AgentId): AgentId {
  return isSharedReader(id) ? SHARED_AGENT_ID : id
}

/** The product name for any id of the table. */
export function agentLabel(id: AgentId): string {
  return AGENTS.find((x) => x.id === id)?.label ?? id
}

/**
 * Whether the tool is on this machine, judged by its dotfolder. The shared row
 * counts as present when `~/.agents` exists or any tool that reads it does.
 */
export function agentPresent(
  id: AgentId,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): boolean {
  const a = AGENTS.find((x) => x.id === id)
  if (!a) return false
  if (isDir(a.probe(env, home))) return true
  return a.role === 'shared' && AGENTS.some((r) => r.role === 'reader' && isDir(r.probe(env, home)))
}

/**
 * Install rows (own and shared) whose tool is present; the folder standing in
 * for "installed" is a heuristic, so a stale one only adds a row. Tools the
 * shared row serves get no row here: see `legacySkillCopies`.
 */
export function detectAgents(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): AgentTarget[] {
  const out: AgentTarget[] = []
  for (const a of AGENTS) {
    if (a.role !== 'reader' && agentPresent(a.id, env, home)) out.push(targetOf(a, env, home))
  }
  return out
}

/** The dotfolder probed for `id` (env overrides applied): where the agent keeps its own config files. */
export function agentConfigDir(
  id: AgentId,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string | null {
  const a = AGENTS.find((x) => x.id === id)
  return a ? a.probe(env, home) : null
}

/** The skills folder of any row; for a tool the shared row serves, its own (legacy) folder. */
export function agentTarget(
  id: AgentId,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): AgentTarget | null {
  const a = AGENTS.find((x) => x.id === id)
  return a ? targetOf(a, env, home) : null
}

/**
 * Copies this app wrote (by the ledger) into the own folder of a tool the
 * shared row now serves, and that are still there. They are kept current and
 * can be removed by the person; nothing deletes them on its own. `only` narrows
 * the list: a reader id to its own copy, the shared row's id to every reader,
 * any other row to none.
 */
export function legacySkillCopies(
  ledger: SkillLedger,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  only?: AgentId,
): AgentTarget[] {
  if (only && only !== SHARED_AGENT_ID && !isSharedReader(only)) return []
  const out: AgentTarget[] = []
  for (const a of AGENTS) {
    if (a.role !== 'reader') continue
    if (only && only !== SHARED_AGENT_ID && only !== a.id) continue
    const t = targetOf(a, env, home)
    if (ledger[skillFilePath(t.skillsDir)] && existsSync(join(t.skillsDir, SKILL_NAME))) out.push(t)
  }
  return out
}

/** What Settings → Integrations lists: the install rows present here, then the legacy copies, in table order. */
export function skillRows(
  ledger: SkillLedger,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): AgentTarget[] {
  const order = agentIds()
  return [...detectAgents(env, home), ...legacySkillCopies(ledger, env, home)].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  )
}

function targetOf(a: AgentDef, env: NodeJS.ProcessEnv, home: string): AgentTarget {
  return {
    id: a.id,
    label: a.label,
    skillsDir: a.skills(a.probe(env, home)),
    ...(a.role === 'reader' ? { legacy: true } : {}),
  }
}

export interface SkillFrontmatter {
  name: string
  version: string
}

/** `name` and `metadata.version` from the YAML front matter; enough to tell our skill (and its version) from anything else. */
export function parseSkillFrontmatter(text: string): SkillFrontmatter | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return null
  const name = /^name:\s*(\S+)\s*$/m.exec(m[1]!)?.[1]
  const version = /^\s+version:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m.exec(m[1]!)?.[1] ?? ''
  return name ? { name, version } : null
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** semver-ish: numeric major.minor.patch; anything unparsable sorts lowest */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i]! < pb[i]!) return -1
    if (pa[i]! > pb[i]!) return 1
  }
  return 0
}

function parts(v: string): number[] {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [-1, -1, -1]
}

export interface LedgerEntry {
  version: string
  sha256: string
  at: string
  channel: 'app' | 'zip' | 'cli'
}

/** absolute SKILL.md path → what this app wrote there */
export type SkillLedger = Record<string, LedgerEntry>

export function ledgerFromSettings(settings: Record<string, unknown>): SkillLedger {
  const raw = settings[LEDGER_KEY]
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as SkillLedger) } : {}
}

export interface BundledSkill {
  bytes: Uint8Array
  text: string
  version: string
  sha256: string
}

export function bundledSkillFrom(bytes: Uint8Array): BundledSkill {
  const text = Buffer.from(bytes).toString('utf-8')
  const fm = parseSkillFrontmatter(text)
  return { bytes, text, version: fm?.version ?? '0.0.0', sha256: sha256(bytes) }
}

export function skillFilePath(skillsDir: string): string {
  return join(skillsDir, SKILL_NAME, 'SKILL.md')
}

export function readInstallState(
  skillsDir: string,
  bundled: BundledSkill,
  ledger: SkillLedger,
): SkillInstallState {
  const path = skillFilePath(skillsDir)
  const dir = join(skillsDir, SKILL_NAME)
  if (!existsSync(dir)) return { status: 'missing', path }
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch {
    return { status: 'occupied', path }
  }
  const fm = parseSkillFrontmatter(text)
  if (!fm || fm.name !== SKILL_NAME) return { status: 'occupied', path }
  const installedVersion = fm.version
  const cmp = compareVersions(installedVersion, bundled.version)
  if (cmp > 0) return { status: 'newer', path, installedVersion }
  const ours = ledger[path]
  if (!ours) return { status: 'foreign', path, installedVersion, older: cmp < 0 }
  if (sha256(text) !== ours.sha256)
    return { status: 'modified', path, installedVersion, older: cmp < 0 }
  if (cmp < 0) return { status: 'outdated', path, installedVersion, older: true }
  return { status: 'installed', path, installedVersion }
}

/** Copy the bundled SKILL.md byte for byte and remember the write. Returns the file path. */
export function installSkill(
  skillsDir: string,
  bundled: BundledSkill,
  ledger: SkillLedger,
  channel: LedgerEntry['channel'] = 'app',
): string {
  const path = skillFilePath(skillsDir)
  let existing: Stats | undefined
  try {
    existing = lstatSync(path)
  } catch {}
  if (existing?.isSymbolicLink()) {
    throw new Error(`${path} is a symlink; refusing to overwrite whatever it points at`)
  }
  mkdirSync(join(skillsDir, SKILL_NAME), { recursive: true })
  writeFileSync(path, bundled.bytes)
  ledger[path] = {
    version: bundled.version,
    sha256: bundled.sha256,
    at: new Date().toISOString(),
    channel,
  }
  return path
}

/** Remove only what this app wrote; a folder holding other files keeps them. */
export function uninstallSkill(skillsDir: string, ledger: SkillLedger): boolean {
  const path = skillFilePath(skillsDir)
  if (!ledger[path]) return false
  rmSync(path, { force: true })
  const dir = join(skillsDir, SKILL_NAME)
  try {
    if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true })
  } catch {}
  delete ledger[path]
  return true
}

/** `ieumoffice/SKILL.md` inside a zip: the layout claude.ai and the desktop apps accept for an uploaded skill. */
export async function buildSkillZip(bundled: BundledSkill): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(`${SKILL_NAME}/SKILL.md`, bundled.bytes, { date: new Date(0) })
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
