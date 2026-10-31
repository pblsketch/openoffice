/**
 * The skills an agent session gets (decision 0032, spec 6.1): a copy of every
 * enabled skill in one plugin folder of the app's own. Claude Code runs with
 * `--restricted`, which keeps every user setting out, skills included; reading
 * the user's settings instead would also run their hooks. So the app copies
 * the skill folders themselves and passes the copy with `--plugin-dir`. Codex
 * gets the same copy as a folder it may read, and the list of skills in its
 * instructions. Hooks, MCP definitions, agents and commands of installed
 * plugins are not copied.
 *
 * Which skills go in is decided by the caller (the person's on/off states, and
 * the project's skills, which are always on). This module only copies them:
 * - one name per skill in the copy: on a shared name the winner by priority
 *   keeps it, the others go in as `<name>--<source>` (plugins
 *   `<name>--plugin-<plugin>`), so the person can still call them;
 * - a skill used "only when called" gets `disable-model-invocation: true` in
 *   the copy's front matter, and one set to "AI decides" whose own file says
 *   true gets `false`; the source folder is never changed.
 *
 * The copy is kept between sessions and only changed skills are copied again:
 * a person's skills can run to hundreds of megabytes. It is also handed to
 * Claude as a working folder (`--add-dir`) so that a skill's scripts may run;
 * writing there changes the copy only, and the next session restores it.
 *
 * A skill from an installed Claude plugin may name files beside its `skills`
 * folder with `${CLAUDE_PLUGIN_ROOT}`. The copy is one plugin folder of the
 * app's own, so three of the plugin's root folders are copied to its root as
 * well: `scripts`, `references` and `assets`. Nothing else at the plugin root
 * is copied. Claude loads more from a plugin root than skills (hooks, MCP and
 * LSP servers, monitors, `bin`, settings, agents, commands), and some of those
 * start a process with no tool call and no permission request, so only
 * folders Claude never loads by themselves are taken.
 */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import {
  IEUM_TEMPLATE_KEY,
  IEUM_TITLE_KEY,
  MAX_USER_SKILL_BYTES,
  MAX_USER_SKILL_FILES,
  USER_SKILL_NAME,
  USER_SKILL_PRIORITY,
  isReservedUserSkillName,
  listSkillFolderFiles,
  parseSkillMd,
  renderSkillMd,
  type SkillFolderFile,
  type UserSkillInvoke,
  type UserSkillSource,
} from '../user-skills'

/** An enabled skill to put in the copy (the shell's `enabledForAgent` gives these) */
export interface AgentSkillInput {
  /** the skill identifier (`source:name`, `plugin:<plugin>:<name>`, `project:<name>`) */
  id: string
  source: UserSkillSource
  plugin?: string | undefined
  /** the skill's own name */
  name: string
  title: string
  description: string
  /** the skill folder */
  dir: string
  invoke: UserSkillInvoke
}

/** A skill as it is in the copy */
export interface AgentSkillEntry {
  id: string
  /** the name in the copy: the skill's own, or `<name>--<source>` when another one won the name */
  name: string
  source: UserSkillSource
  plugin: string | undefined
  title: string
  description: string
  invoke: UserSkillInvoke
  /** the copy's SKILL.md, absolute when the bundle folder is */
  skillMd: string
}

export type AgentSkillSkipReason =
  'too-large' | 'no-frontmatter' | 'bad-name' | 'unreadable' | 'duplicate'

export interface AgentSkillBundle {
  /** the plugin folder for `--plugin-dir` */
  dir: string
  skills: AgentSkillEntry[]
  skipped: Array<{
    id: string
    name: string
    source: UserSkillSource
    plugin: string | undefined
    reason: AgentSkillSkipReason
  }>
}

export const AGENT_SKILL_PLUGIN_NAME = 'ieum-skills'
const MANIFEST_FILE = '.ieum-skills.json'
export const MAX_AGENT_SKILL_BYTES = MAX_USER_SKILL_BYTES
/** The longest name in the copy */
export const MAX_AGENT_SKILL_NAME = 64
const SHORT_HASH = 6

function shortHash(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, SHORT_HASH)
}

/** `base` cut so that `-<short hash of id>` fits within the name limit */
function withHash(base: string, id: string): string {
  const head = base.slice(0, MAX_AGENT_SKILL_NAME - SHORT_HASH - 1).replace(/[-.]+$/, '')
  return `${head}-${shortHash(id)}`
}

/**
 * The name a skill gets in the copy when another enabled skill won its name:
 * `<name>--<source>`, plugins `<name>--plugin-<plugin>`. Longer than 64
 * characters, it is cut and ends with a short hash of the identifier.
 */
export function agentSkillAltName(
  skill: Pick<AgentSkillInput, 'id' | 'source' | 'plugin' | 'name'>,
): string {
  const suffix = skill.source === 'plugin' ? `plugin-${skill.plugin ?? ''}` : skill.source
  const full = `${skill.name}--${suffix}`.replace(/[^A-Za-z0-9._-]/g, '-')
  return full.length <= MAX_AGENT_SKILL_NAME ? full : withHash(full, skill.id)
}

function rank(skill: AgentSkillInput): number {
  const at = USER_SKILL_PRIORITY.indexOf(skill.source)
  return at === -1 ? USER_SKILL_PRIORITY.length : at
}

/** Priority order (spec 4.4): project, app, builtin, Claude, Codex, then plugins by plugin name */
function byPriority(skills: readonly AgentSkillInput[]): AgentSkillInput[] {
  return skills
    .map((skill, index) => ({ skill, index }))
    .sort((a, b) => {
      const byRank = rank(a.skill) - rank(b.skill)
      if (byRank !== 0) return byRank
      if (a.skill.source === 'plugin') {
        const pa = (a.skill.plugin ?? '').toLowerCase()
        const pb = (b.skill.plugin ?? '').toLowerCase()
        if (pa !== pb) return pa < pb ? -1 : 1
      }
      return a.index - b.index
    })
    .map(({ skill }) => skill)
}

interface FolderFacts {
  files: SkillFolderFile[]
  signature: string
  tooLarge: boolean
}

/**
 * The files of a skill folder and a signature of their paths, sizes and times,
 * without reading contents. Links leading out of the folder are left out, as
 * in the skill list, so nothing is read through them.
 */
async function folderFacts(dir: string): Promise<FolderFacts | undefined> {
  const listed = await listSkillFolderFiles(dir, {
    files: MAX_USER_SKILL_FILES,
    bytes: MAX_USER_SKILL_BYTES,
  })
  if (!listed) return undefined
  const hash = createHash('sha256')
  for (const file of listed.files) {
    const info = await stat(file.path).catch(() => undefined)
    hash.update(`${file.rel}\0${file.size}\0${Math.round(info?.mtimeMs ?? 0)}\n`)
  }
  return { files: listed.files, signature: hash.digest('hex'), tooLarge: listed.tooLarge }
}

async function copyFiles(files: readonly SkillFolderFile[], to: string): Promise<void> {
  for (const file of files) {
    const target = join(to, ...file.rel.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await copyFile(file.path, target)
  }
}

/**
 * The only plugin root folders copied. Everything else at the root is left
 * out, including what Claude would load and run by itself (`.lsp.json`,
 * `monitors`, `hooks`, `.mcp.json`, `bin`, `settings.json`).
 */
const PLUGIN_COPIED_DIRS = new Set(['scripts', 'references', 'assets'])

/** The plugin folder a plugin skill belongs to (`<plugin>/skills/<skill>`) */
function pluginRootOf(skill: AgentSkillInput): string | undefined {
  if (skill.source !== 'plugin') return undefined
  const skillsDir = dirname(skill.dir)
  return basename(skillsDir).toLowerCase() === 'skills' ? dirname(skillsDir) : undefined
}

/**
 * Copy a plugin's supporting files to the copy's root, so that a SKILL.md's
 * `${CLAUDE_PLUGIN_ROOT}/…` finds them. Links are not followed: nothing outside
 * the plugin folder is read. The same size limits as a skill apply.
 */
async function copyPluginSupport(pluginRoot: string, bundleDir: string): Promise<void> {
  let bytes = 0
  let files = 0
  const walk = async (current: string, rel: string): Promise<void> => {
    if (bytes > MAX_USER_SKILL_BYTES || files > MAX_USER_SKILL_FILES) return
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      if (bytes > MAX_USER_SKILL_BYTES || files > MAX_USER_SKILL_FILES) return
      if (entry.isSymbolicLink()) continue
      // at the plugin root, only the listed folders: no file and no other folder
      if (!rel && !(entry.isDirectory() && PLUGIN_COPIED_DIRS.has(entry.name))) continue
      const path = join(current, entry.name)
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(path, childRel)
        continue
      }
      if (!entry.isFile()) continue
      const info = await stat(path).catch(() => undefined)
      if (!info?.isFile()) continue
      if (bytes + info.size > MAX_USER_SKILL_BYTES || files + 1 > MAX_USER_SKILL_FILES) return
      const target = join(bundleDir, ...childRel.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await copyFile(path, target)
      bytes += info.size
      files += 1
    }
  }
  await walk(pluginRoot, '')
}

/**
 * Make the copy's SKILL.md say what the copy is: its name in the copy, and
 * `disable-model-invocation: true` for a skill used only when called (`false`
 * for one set to "AI decides" whose file says true). Other keys stay as written.
 */
async function adjustSkillMd(to: string, name: string, invoke: UserSkillInvoke): Promise<boolean> {
  const path = join(to, 'SKILL.md')
  const text = await readFile(path, 'utf8')
  const parsed = parseSkillMd(text)
  if (!parsed) return false
  // a skill turned to "AI decides" says so even when its own file says only when called, so
  // Claude (which reads this key) and Codex (which is told every skill) agree
  const saysManual = /^(?:true|yes|on)$/i.test(parsed.fields['disable-model-invocation'] ?? '')
  const fields =
    invoke === 'manual'
      ? { 'disable-model-invocation': true }
      : saysManual
        ? { 'disable-model-invocation': false }
        : undefined
  if (parsed.name === name && !fields) return true
  await writeFile(
    path,
    renderSkillMd(
      {
        name,
        description: parsed.description ?? '',
        title: parsed.metadata[IEUM_TITLE_KEY],
        template: parsed.metadata[IEUM_TEMPLATE_KEY],
        body: parsed.body,
        fields,
      },
      text,
    ),
  )
  return true
}

type Manifest = Record<string, { signature: string; copied: string }>

/** One build at a time per bundle folder: two sessions starting together must not mix copies */
const building = new Map<string, Promise<unknown>>()

/**
 * Bring the plugin folder in line with the enabled skills: copy new and
 * changed skills, restore a copy that was changed in place, drop skills that
 * are gone or no longer enabled.
 */
export function buildAgentSkillBundle(
  skills: readonly AgentSkillInput[],
  bundleDir: string,
): Promise<AgentSkillBundle> {
  const key = resolve(bundleDir).toLowerCase()
  const previous = building.get(key) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(() => buildNow(skills, bundleDir))
  building.set(key, run)
  void run
    .finally(() => {
      if (building.get(key) === run) building.delete(key)
    })
    .catch(() => undefined)
  return run
}

async function buildNow(
  input: readonly AgentSkillInput[],
  bundleDir: string,
): Promise<AgentSkillBundle> {
  const skillsDir = join(bundleDir, 'skills')
  await mkdir(join(bundleDir, '.claude-plugin'), { recursive: true })
  await mkdir(skillsDir, { recursive: true })
  await writeFile(
    join(bundleDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: AGENT_SKILL_PLUGIN_NAME, version: '1.0.0' }),
  )
  let manifest: Manifest
  try {
    manifest = JSON.parse(await readFile(join(bundleDir, MANIFEST_FILE), 'utf8')) as Manifest
  } catch {
    manifest = {}
  }

  const entries: AgentSkillEntry[] = []
  const skipped: AgentSkillBundle['skipped'] = []
  /** names given in the copy, without case */
  const taken = new Set<string>()
  /** skill names a skill has already won, without case */
  const won = new Set<string>()
  /** plugin roots whose supporting files were already copied */
  const copiedPlugins = new Set<string>()
  const next: Manifest = {}

  for (const skill of byPriority(input)) {
    const info = { id: skill.id, name: skill.name, source: skill.source, plugin: skill.plugin }
    // never put in, from any source: not even reported
    if (isReservedUserSkillName(skill.name) || isReservedUserSkillName(basename(skill.dir))) {
      continue
    }
    if (!USER_SKILL_NAME.test(skill.name)) {
      skipped.push({ ...info, reason: 'bad-name' })
      continue
    }
    let name = won.has(skill.name.toLowerCase()) ? agentSkillAltName(skill) : skill.name
    if (taken.has(name.toLowerCase())) name = withHash(name, skill.id)
    if (taken.has(name.toLowerCase())) {
      skipped.push({ ...info, reason: 'duplicate' })
      continue
    }
    let text: string
    try {
      text = await readFile(join(skill.dir, 'SKILL.md'), 'utf8')
    } catch {
      skipped.push({ ...info, reason: 'unreadable' })
      continue
    }
    if (!parseSkillMd(text)) {
      skipped.push({ ...info, reason: 'no-frontmatter' })
      continue
    }
    const facts = await folderFacts(skill.dir)
    if (!facts) {
      skipped.push({ ...info, reason: 'unreadable' })
      continue
    }
    if (facts.tooLarge) {
      skipped.push({ ...info, reason: 'too-large' })
      continue
    }
    // a plugin skill may name files beside its skills folder: ${CLAUDE_PLUGIN_ROOT}/…
    const pluginRoot = pluginRootOf(skill)
    if (pluginRoot && !copiedPlugins.has(pluginRoot)) {
      copiedPlugins.add(pluginRoot)
      await copyPluginSupport(pluginRoot, bundleDir)
    }
    // what the copy depends on besides the files: a new name or a changed "only when called"
    // makes a new copy even when the files are the same
    const signature = createHash('sha256')
      .update(`${skill.id}\0${name}\0${skill.invoke}\0${facts.signature}`)
      .digest('hex')
    const to = join(skillsDir, name)
    const before = manifest[name]
    const copy = before?.signature === signature ? await folderFacts(to) : undefined
    if (!copy || copy.signature !== before?.copied) {
      await rm(to, { recursive: true, force: true })
      try {
        await copyFiles(facts.files, to)
        if (!(await adjustSkillMd(to, name, skill.invoke))) {
          await rm(to, { recursive: true, force: true })
          skipped.push({ ...info, reason: 'no-frontmatter' })
          continue
        }
      } catch {
        await rm(to, { recursive: true, force: true })
        skipped.push({ ...info, reason: 'unreadable' })
        continue
      }
    }
    const copied = await folderFacts(to)
    next[name] = { signature, copied: copied?.signature ?? '' }
    taken.add(name.toLowerCase())
    won.add(skill.name.toLowerCase())
    entries.push({
      id: skill.id,
      name,
      source: skill.source,
      plugin: skill.plugin,
      title: skill.title,
      description: skill.description,
      invoke: skill.invoke,
      skillMd: join(to, 'SKILL.md'),
    })
  }

  for (const name of await readdir(skillsDir).catch(() => [] as string[])) {
    if (!next[name]) await rm(join(skillsDir, name), { recursive: true, force: true })
  }
  await writeFile(join(bundleDir, MANIFEST_FILE), JSON.stringify(next))
  return { dir: bundleDir, skills: entries, skipped }
}
