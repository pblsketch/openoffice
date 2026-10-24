/**
 * The person's skills in the shell's main process (spec 4, 5.1-5.3, 5.6,
 * 5.8): the list with its states, state changes, the app-owned skill folder's
 * writes, imports, GitHub updates, export, and the AI's reads. No Electron
 * here; the IPC layer adds dialogs, the OS trash and who may ask.
 *
 * Writes go only to the app's skills folder (`~/.ieumoffice/skills`); other
 * sources are read only. Imports and update checks also use their own
 * temporary folder under the OS temp folder.
 */
import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import {
  IEUM_SOURCE_FILE,
  SKILL_STAGING_PREFIX,
  SKILL_TEXT_EXTENSIONS,
  SkillImportError,
  appSkillFoldersByName,
  appSkillsDirOf,
  applyGitHubSkillUpdate,
  checkGitHubSkillUpdate,
  commitSkillInstall,
  disposeSkillImport,
  exportSkillZip,
  initialUserSkillState,
  installImportedSkills,
  isInsideDir,
  listSkillFolderFiles,
  listUserSkills,
  parseSkillMd,
  parseUserSkillId,
  pickEnabledUserSkills,
  prepareFolderImport,
  prepareGitHubImport,
  prepareZipImport,
  readIeumSourceRecord,
  renderSkillMd,
  resolveUserSkillStates,
  skillExportInfo,
  suggestUserSkillName,
  userSkillId,
  validateNewUserSkillName,
  MAX_USER_SKILL_BYTES,
  MAX_USER_SKILL_FILES,
  type GitHubSkillUpdateCheck,
  type ResolvedUserSkill,
  type SkillFetch,
  type SkillImport,
  type SkillImportCandidate,
  type UserSkillInvoke,
  type UserSkillSettings,
  type UserSkillSource,
} from '@genoffice/ai-provider'
import type {
  UserSkillAiRead,
  UserSkillCardSaveInput,
  UserSkillContent,
  UserSkillImportCandidateView,
  UserSkillImportPreview,
  UserSkillInstallRequest,
  UserSkillNameProblem,
  UserSkillSaveInput,
  UserSkillTemplateInput,
  UserSkillView,
  UserSkillsFail,
  UserSkillsFailReason,
  UserSkillsResult,
} from '@genoffice/electron-utils/user-skills-channels'
import { readSkillSettings, updateSkillSettings } from '../app-settings'

/** Largest skill file the AI may read in one call (spec 5.8; tunable) */
export const AI_SKILL_FILE_MAX_BYTES = 200 * 1024

/** Largest template document a skill card saves (the folder limit) */
export const SKILL_TEMPLATE_MAX_BYTES = MAX_USER_SKILL_BYTES

/**
 * Documents a template may be (spec 5.7): the formats the app's editors open.
 * JSON is left out on purpose: no settings or sign-in file becomes a template.
 */
const TEMPLATE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.docx',
  '.odt',
  '.xlsx',
  '.xlsm',
  '.xls',
  '.csv',
  '.tsv',
  '.pptx',
  '.pdf',
  '.md',
  '.markdown',
  '.txt',
  '.html',
  '.htm',
  '.xmind',
  '.hwp',
  '.hwpx',
])

const FOLDER_LIMITS = { files: MAX_USER_SKILL_FILES, bytes: MAX_USER_SKILL_BYTES }

export interface UserSkillsServiceDeps {
  homeDir: () => string
  /** the builtin skills folder; none in a build without it */
  builtinDir: () => string | undefined
  /** userData/app-settings.json */
  settingsPath: () => string
  /** where imports and update checks make their temporary folders */
  tempDir: () => string
  /** moves a folder to the OS trash */
  trash: (path: string) => Promise<void>
  /** GitHub requests (the core allows only the three GitHub hosts) */
  fetch: SkillFetch
  aiFileMaxBytes?: number | undefined
}

/** An enabled skill as the agent session's bundle takes it */
export interface AgentEnabledSkill {
  id: string
  source: UserSkillSource
  plugin: string | undefined
  name: string
  title: string
  description: string
  /** the skill folder */
  dir: string
  invoke: UserSkillInvoke
  agentOnly: boolean
}

function fail(reason: UserSkillsFailReason, problem?: string): UserSkillsFail {
  return problem === undefined ? { ok: false, reason } : { ok: false, reason, problem }
}

/** A thrown error as a result: the core's kinds pass through, the rest is a failure */
export function failureOf(error: unknown): UserSkillsFail {
  if (error instanceof SkillImportError) return fail(error.kind as UserSkillsFailReason)
  return fail('failed')
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Write a file by a temporary name beside it and a rename, so it is never half written */
async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.${randomBytes(4).toString('hex')}.tmp`)
  try {
    await writeFile(temp, data, { flag: 'wx' })
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

/** A folder of the app's skills folder handed to the core installer as an import candidate */
function stagedCandidate(dir: string, name: string): SkillImportCandidate {
  return {
    key: name,
    rel: '',
    dir,
    name,
    title: name,
    description: '',
    files: 0,
    bytes: 0,
    hasScripts: false,
    hasTemplate: false,
    urls: [],
    urlCount: 0,
    license: undefined,
    collision: false,
    problem: undefined,
  }
}

/** A template file name as it goes under `assets/`: one plain name with a document extension */
export function templateFileNameOf(raw: string): string | undefined {
  const last = raw.split(/[\\/]/).pop() ?? ''
  const cleaned = last
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
  if (!cleaned || cleaned.length > 150) return undefined
  const ext = extname(cleaned).toLowerCase()
  if (!TEMPLATE_EXTENSIONS.has(ext) || cleaned.length === ext.length) return undefined
  return cleaned
}

function viewOf(
  skill: ResolvedUserSkill,
  github: UserSkillView['github'],
  shadowedBy: string | undefined,
  /** an own skill whose folder really is in the app's skills folder (not a link leading out) */
  owned: boolean,
): UserSkillView {
  const other = skill.source === 'user' || skill.source === 'plugin' || skill.source === 'codex'
  return {
    id: skill.id,
    source: skill.source,
    plugin: skill.plugin,
    name: skill.name,
    title: skill.title,
    description: skill.description,
    enabled: skill.enabled,
    invoke: skill.invoke,
    hidden: skill.hidden,
    hasScripts: skill.hasScripts,
    template: skill.template,
    templateExists: skill.templateExists,
    agentOnly: skill.agentOnly,
    unreadable: skill.unreadable,
    files: skill.files,
    bytes: skill.bytes,
    github,
    owned,
    can: {
      edit: owned,
      copyToMine: skill.source === 'builtin' || other,
      export: owned,
      checkUpdate: owned && skill.github,
      openFolder: owned || other,
      remove: owned,
      hide: skill.source === 'builtin',
    },
    shadowedBy,
  }
}

function candidateView(candidate: SkillImportCandidate): UserSkillImportCandidateView {
  return {
    key: candidate.key,
    rel: candidate.rel,
    name: candidate.name,
    title: candidate.title,
    description: candidate.description,
    files: candidate.files,
    bytes: candidate.bytes,
    hasScripts: candidate.hasScripts,
    hasTemplate: candidate.hasTemplate,
    urls: candidate.urls,
    urlCount: candidate.urlCount,
    license: candidate.license,
    collision: candidate.collision,
    problem: candidate.problem,
  }
}

/** What an import preview shows (no folder paths) */
export function importPreviewOf(imported: SkillImport, token: string): UserSkillImportPreview {
  const origin = imported.origin
  return {
    token,
    origin:
      origin.kind === 'github'
        ? {
            kind: 'github',
            repo: origin.repo,
            ref: origin.ref,
            commit: origin.commit,
            path: origin.path,
          }
        : { kind: origin.kind },
    candidates: imported.candidates.map(candidateView),
    rootLicense: imported.rootLicense,
  }
}

/** Drop the saved state of a skill so it starts as its source starts */
function clearState(settings: UserSkillSettings, id: string): void {
  for (const key of Object.keys(settings.states)) {
    if (sameName(key, id)) delete settings.states[key]
  }
}

/** Keep only what differs from the initial state of the source */
function setStateValue(
  settings: UserSkillSettings,
  id: string,
  source: UserSkillSource,
  patch: { enabled?: boolean; invoke?: UserSkillInvoke },
): void {
  const initial = initialUserSkillState(source)
  const next = { ...settings.states[id], ...patch }
  if (next.enabled === initial.enabled) delete next.enabled
  if (next.invoke === initial.invoke) delete next.invoke
  clearState(settings, id)
  if (next.enabled !== undefined || next.invoke !== undefined) settings.states[id] = next
}

export function createUserSkillsService(deps: UserSkillsServiceDeps) {
  const appSkillsDir = () => appSkillsDirOf(deps.homeDir())
  const settingsPath = () => deps.settingsPath()
  const aiFileMax = deps.aiFileMaxBytes ?? AI_SKILL_FILE_MAX_BYTES

  async function resolved(projectRoot?: string): Promise<ResolvedUserSkill[]> {
    const skills = await listUserSkills({
      homeDir: deps.homeDir(),
      builtinDir: deps.builtinDir(),
      projectRoot,
    })
    return resolveUserSkillStates(skills, readSkillSettings(settingsPath()))
  }

  async function find(id: string): Promise<ResolvedUserSkill | undefined> {
    const parsed = parseUserSkillId(id)
    if (!parsed || parsed.source === 'project') return undefined
    const all = await resolved()
    return all.find((skill) => skill.id === id) ?? all.find((skill) => sameName(skill.id, id))
  }

  /**
   * An own skill's folder: a direct child of the app's skills folder whose
   * real place is inside the app's skills folder too. A linked folder leading
   * elsewhere is read, but never written, deleted or edited through.
   */
  async function ownedDir(skill: ResolvedUserSkill): Promise<string | undefined> {
    if (skill.source !== 'app') return undefined
    const root = appSkillsDir()
    const dir = resolve(skill.dir)
    const child = isInsideDir(dirname(dir), root) && isInsideDir(root, dirname(dir))
    if (!child || isInsideDir(root, dir)) return undefined
    const realRoot = await realpath(root).catch(() => undefined)
    const real = await realpath(dir).catch(() => undefined)
    if (!realRoot || !real) return undefined
    return isInsideDir(real, realRoot) && !isInsideDir(realRoot, real) ? dir : undefined
  }

  function changeSettings(change: (settings: UserSkillSettings) => void): void {
    updateSkillSettings(settingsPath(), change)
  }

  async function takenNames(): Promise<Map<string, string[]>> {
    return appSkillFoldersByName(appSkillsDir())
  }

  /** The strict rule for a name the app writes, and whether an own skill has it */
  async function nameProblem(
    name: string,
    except?: string,
  ): Promise<UserSkillNameProblem | 'taken' | undefined> {
    const problem = validateNewUserSkillName(name)
    if (problem) return problem
    const taken = (await takenNames()).get(name.toLowerCase()) ?? []
    const others = except ? taken.filter((dir) => !isInsideDir(dir, except)) : taken
    return others.length > 0 ? 'taken' : undefined
  }

  /** A card's template, or why it cannot be one: its bytes under a document file name */
  function templateOf(
    input: UserSkillTemplateInput,
  ): { bytes: Uint8Array; fileName: string } | UserSkillsFail {
    const fileName = templateFileNameOf(input.fileName)
    if (!fileName || !(input.bytes instanceof Uint8Array)) return fail('bad-template')
    if (input.bytes.byteLength > SKILL_TEMPLATE_MAX_BYTES) return fail('too-large')
    return { bytes: input.bytes, fileName }
  }

  /** A work folder inside the app's skills folder (hidden from the list) */
  async function makeWorkDir(): Promise<string> {
    await mkdir(appSkillsDir(), { recursive: true })
    const dir = join(
      appSkillsDir(),
      `${SKILL_STAGING_PREFIX}work-${randomBytes(6).toString('hex')}`,
    )
    await mkdir(dir)
    return dir
  }

  async function copyFolderInto(from: string, to: string): Promise<void> {
    const listed = await listSkillFolderFiles(from, FOLDER_LIMITS)
    if (!listed) throw new SkillImportError('failed', `Cannot read ${from}`)
    if (listed.tooLarge) throw new SkillImportError('too-large', 'The skill folder is too large')
    for (const file of listed.files) {
      if (file.rel === IEUM_SOURCE_FILE) continue
      const target = join(to, ...file.rel.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await copyFile(file.path, target)
    }
  }

  async function readSkillMdText(dir: string): Promise<string | undefined> {
    return readFile(join(dir, 'SKILL.md'), 'utf8').catch(() => undefined)
  }

  interface WriteRequest {
    title: string
    name: string | undefined
    description: string
    body: string
    invoke: UserSkillInvoke | undefined
    template: UserSkillTemplateInput | undefined
    targetId: string | undefined
    overwrite: boolean
  }

  /**
   * Put a finished folder into the app's skills folder under `name`, replacing
   * the given folders (they go to the OS trash).
   */
  async function place(work: string, name: string, replaceDirs: string[]): Promise<void> {
    await commitSkillInstall(
      appSkillsDir(),
      [{ candidate: stagedCandidate(work, name), folderName: name, replaceDirs }],
      { discardReplaced: (dir) => deps.trash(dir) },
    )
  }

  async function writeSkill(request: WriteRequest): Promise<UserSkillsResult<{ id: string }>> {
    const description = request.description.trim()
    if (!description) return fail('empty-description')
    if (!request.body.trim()) return fail('empty-body')

    let template: { bytes: Uint8Array; fileName: string } | undefined
    if (request.template) {
      const read = templateOf(request.template)
      if ('ok' in read) return read
      template = read
    }
    const templatePath = template ? `assets/${template.fileName}` : undefined

    const target = request.targetId ? await find(request.targetId) : undefined
    if (request.targetId && !target) return fail('not-found')
    // lists show the name; a title is optional, and a changed skill keeps the one it had
    const keptTitle = target && target.title !== target.name ? target.title : undefined
    const title = request.title.trim() || keptTitle

    // ---- an edit of an own skill: files rewritten in place, the folder renamed with the name
    if (target && target.source === 'app') {
      const dir = await ownedDir(target)
      if (!dir) return fail('not-owned')
      const name = request.name?.trim() || target.name
      if (name !== target.name) {
        const problem = await nameProblem(name, dir)
        if (problem === 'taken') return fail('name-taken')
        if (problem) return fail('bad-name', problem)
      }
      const base = await readSkillMdText(dir)
      const text = renderSkillMd(
        { name, description, title, template: templatePath ?? target.template, body: request.body },
        base,
      )
      try {
        if (template) {
          await mkdir(join(dir, 'assets'), { recursive: true })
          await writeFileAtomic(join(dir, 'assets', template.fileName), template.bytes)
        }
        await writeFileAtomic(join(dir, 'SKILL.md'), text)
        // an own skill's folder carries its name
        if (name !== target.name && basename(dir) !== name) {
          await rename(dir, join(appSkillsDir(), name))
        }
      } catch (error) {
        return failureOf(error)
      }
      const newId = userSkillId('app', name)
      changeSettings((settings) => {
        const kept = settings.states[target.id]
        if (newId !== target.id) {
          clearState(settings, target.id)
          clearState(settings, newId)
          if (kept) settings.states[newId] = kept
        }
        if (request.invoke) setStateValue(settings, newId, 'app', { invoke: request.invoke })
      })
      return { ok: true, id: newId }
    }

    if (target && target.source === 'project') return fail('invalid')

    // ---- a new skill, or another source's skill copied in with the new text
    let name = request.name?.trim() ?? ''
    if (!target && !name) {
      name = suggestUserSkillName(title ?? '', { taken: (await takenNames()).keys() })
    }
    if (target && !name) name = target.name
    const keepsName = target !== undefined && name === target.name
    if (!keepsName) {
      const problem = validateNewUserSkillName(name)
      if (problem) return fail('bad-name', problem)
    }
    const taken = (await takenNames()).get(name.toLowerCase()) ?? []
    if (taken.length > 0) {
      if (!target) return fail('name-taken')
      if (!request.overwrite) return fail('exists')
    }
    if (target && target.unreadable === 'too-large') return fail('too-large')

    const work = await makeWorkDir()
    try {
      if (target) await copyFolderInto(target.dir, work)
      const base = target ? await readSkillMdText(target.dir) : undefined
      const keptTemplate = target && base !== undefined ? target.template : undefined
      const text = renderSkillMd(
        { name, description, title, template: templatePath ?? keptTemplate, body: request.body },
        base,
      )
      if (template) {
        await mkdir(join(work, 'assets'), { recursive: true })
        await writeFile(join(work, 'assets', template.fileName), template.bytes)
      }
      await writeFile(join(work, 'SKILL.md'), text)
      await place(work, name, target ? taken : [])
    } catch (error) {
      return failureOf(error)
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined)
    }
    const id = userSkillId('app', name)
    changeSettings((settings) => {
      clearState(settings, id)
      if (request.invoke) setStateValue(settings, id, 'app', { invoke: request.invoke })
      if (target) setStateValue(settings, target.id, target.source, { enabled: false })
    })
    return { ok: true, id }
  }

  return {
    appSkillsDir,

    /** Every skill of the settings list (project skills are the agent window's only) */
    async list(): Promise<UserSkillView[]> {
      const all = await resolved()
      const { shadowed } = pickEnabledUserSkills(all)
      const pushedBack = new Map(shadowed.map((entry) => [entry.skill.id, entry.by]))
      const views: UserSkillView[] = []
      for (const skill of all) {
        let github: UserSkillView['github']
        if (skill.source === 'app' && skill.github) {
          const record = await readIeumSourceRecord(skill.dir)
          if (record) {
            github = {
              repo: record.repo,
              ref: record.ref,
              path: record.path,
              commit: record.commit,
            }
          }
        }
        const owned = skill.source === 'app' && (await ownedDir(skill)) !== undefined
        views.push(viewOf(skill, github, pushedBack.get(skill.id), owned))
      }
      return views
    },

    /** A skill's text for the read-only view and the editor */
    async read(id: string): Promise<UserSkillsResult<{ skill: UserSkillContent }>> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      const listed = await listSkillFolderFiles(skill.dir, FOLDER_LIMITS)
      if (!listed || listed.tooLarge) return fail(listed ? 'too-large' : 'unreadable')
      const text = await readSkillMdText(skill.dir)
      const parsed = text === undefined ? undefined : parseSkillMd(text)
      return {
        ok: true,
        skill: {
          id: skill.id,
          name: skill.name,
          title: skill.title,
          description: skill.description,
          body: parsed?.body ?? text ?? '',
          template: skill.template,
          files: listed.files
            .filter((file) => file.rel !== IEUM_SOURCE_FILE)
            .map((file) => ({ rel: file.rel, size: file.size })),
        },
      }
    },

    async setState(
      id: string,
      patch: { enabled?: boolean; invoke?: UserSkillInvoke },
    ): Promise<UserSkillsResult> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      if (patch.enabled === true && skill.hidden) return fail('hidden')
      if (patch.enabled === true && skill.unreadable) return fail('unreadable')
      changeSettings((settings) => setStateValue(settings, skill.id, skill.source, patch))
      return { ok: true }
    },

    async hideBuiltin(id: string): Promise<UserSkillsResult> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      if (skill.source !== 'builtin') return fail('invalid')
      changeSettings((settings) => {
        if (!settings.hiddenBuiltins.some((name) => sameName(name, skill.name))) {
          settings.hiddenBuiltins.push(skill.name)
        }
        clearState(settings, skill.id)
      })
      return { ok: true }
    },

    /** Show hidden builtins again; each comes back in its initial state */
    unhideBuiltins(names?: readonly string[]): UserSkillsResult {
      changeSettings((settings) => {
        const shown = names
          ? settings.hiddenBuiltins.filter((hidden) => names.some((name) => sameName(name, hidden)))
          : [...settings.hiddenBuiltins]
        settings.hiddenBuiltins = settings.hiddenBuiltins.filter(
          (hidden) => !shown.includes(hidden),
        )
        for (const name of shown) clearState(settings, userSkillId('builtin', name))
      })
      return { ok: true }
    },

    /** An own skill to the OS trash; any other source is refused */
    async remove(id: string): Promise<UserSkillsResult> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      const dir = await ownedDir(skill)
      if (!dir) return fail('not-owned')
      try {
        await deps.trash(dir)
      } catch {
        return fail('failed')
      }
      changeSettings((settings) => clearState(settings, skill.id))
      return { ok: true }
    },

    /**
     * Copy a builtin or another program's skill into the app's folder under
     * the same name and turn the original off. A taken name needs `overwrite`
     * (the own skill it replaces goes to the OS trash).
     */
    async copyToMine(id: string, overwrite: boolean): Promise<UserSkillsResult<{ id: string }>> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      if (skill.source === 'app' || skill.source === 'project') return fail('invalid')
      if (skill.unreadable)
        return fail(skill.unreadable === 'too-large' ? 'too-large' : 'unreadable')
      const taken = (await takenNames()).get(skill.name.toLowerCase()) ?? []
      if (taken.length > 0 && !overwrite) return fail('exists')
      const work = await makeWorkDir()
      try {
        await copyFolderInto(skill.dir, work)
        await place(work, skill.name, taken)
      } catch (error) {
        return failureOf(error)
      } finally {
        await rm(work, { recursive: true, force: true }).catch(() => undefined)
      }
      const newId = userSkillId('app', skill.name)
      changeSettings((settings) => {
        clearState(settings, newId)
        setStateValue(settings, skill.id, skill.source, { enabled: false })
      })
      return { ok: true, id: newId }
    },

    /** A free name for a new skill from its title */
    async suggestName(title: string): Promise<string> {
      return suggestUserSkillName(title, { taken: (await takenNames()).keys() })
    },

    /** The strict rule for a new name; `forId` is the own skill being renamed */
    async checkName(
      name: string,
      forId?: string,
    ): Promise<{ ok: true } | { ok: false; problem: UserSkillNameProblem | 'taken' }> {
      const skill = forId ? await find(forId) : undefined
      const except = skill ? await ownedDir(skill) : undefined
      const problem = await nameProblem(name, except)
      return problem ? { ok: false, problem } : { ok: true }
    },

    /** The settings editor's save: a new skill, or an edit of an own skill */
    async save(input: UserSkillSaveInput): Promise<UserSkillsResult<{ id: string }>> {
      if (input.id) {
        const target = await find(input.id)
        if (!target) return fail('not-found')
        if (target.source !== 'app') return fail('not-owned')
      }
      return writeSkill({
        title: input.title,
        name: input.name,
        description: input.description,
        body: input.body,
        invoke: undefined,
        template: undefined,
        targetId: input.id,
        overwrite: false,
      })
    },

    /**
     * A skill card's save (spec 5.6): a new skill, a change to an own skill
     * (its template kept unless a new one is given), or another source's
     * skill copied in with the new text and the original turned off.
     */
    saveFromCard(input: UserSkillCardSaveInput): Promise<UserSkillsResult<{ id: string }>> {
      return writeSkill({
        title: input.title,
        name: input.name,
        description: input.description,
        body: input.body,
        invoke: input.invoke,
        template: input.template,
        targetId: input.targetId,
        overwrite: input.overwrite === true,
      })
    },

    prepareFolder(folder: string): Promise<SkillImport> {
      return prepareFolderImport({ folder, appSkillsDir: appSkillsDir(), homeDir: deps.homeDir() })
    },

    prepareZip(file: string): Promise<SkillImport> {
      return prepareZipImport({ file, appSkillsDir: appSkillsDir(), tempDir: deps.tempDir() })
    },

    prepareGitHub(address: string, signal?: AbortSignal): Promise<SkillImport> {
      return prepareGitHubImport({
        address,
        fetch: deps.fetch,
        appSkillsDir: appSkillsDir(),
        tempDir: deps.tempDir(),
        signal,
      })
    },

    /** Install the checked skills of a previewed import; they start on, used on their own */
    async install(
      imported: SkillImport,
      request: Pick<UserSkillInstallRequest, 'selected' | 'onCollision'>,
    ): Promise<
      UserSkillsResult<{ installed: Array<{ key: string; id: string }>; skipped: string[] }>
    > {
      try {
        const done = await installImportedSkills(imported, {
          appSkillsDir: appSkillsDir(),
          selected: request.selected,
          onCollision: request.onCollision,
          discardReplaced: (dir) => deps.trash(dir),
        })
        const installed = done.installed.map((skill) => ({
          key: skill.key,
          id: userSkillId('app', skill.name),
        }))
        changeSettings((settings) => {
          for (const skill of installed) clearState(settings, skill.id)
        })
        return { ok: true, installed, skipped: done.skipped }
      } catch (error) {
        return failureOf(error)
      }
    },

    dispose(imported: SkillImport): Promise<void> {
      return disposeSkillImport(imported)
    },

    /** Check an own GitHub skill for an update; connects only when called */
    async checkUpdate(
      id: string,
      signal?: AbortSignal,
    ): Promise<{ ok: true; check: GitHubSkillUpdateCheck } | UserSkillsFail> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      const dir = await ownedDir(skill)
      if (!dir) return fail('not-owned')
      if (!skill.github) return fail('not-github')
      try {
        const check = await checkGitHubSkillUpdate({
          skillDir: dir,
          appSkillsDir: appSkillsDir(),
          fetch: deps.fetch,
          tempDir: deps.tempDir(),
          signal,
        })
        return { ok: true, check }
      } catch (error) {
        return failureOf(error)
      }
    },

    /** Apply a found update; on/off and when-used stay as they were */
    async applyUpdate(
      id: string,
      check: Extract<GitHubSkillUpdateCheck, { status: 'changed' }>,
    ): Promise<UserSkillsResult<{ id: string }>> {
      const skill = await find(id)
      const dir = skill ? await ownedDir(skill) : undefined
      if (!skill || !dir) {
        await disposeSkillImport(check.update)
        return fail(skill ? 'not-owned' : 'not-found')
      }
      try {
        const done = await applyGitHubSkillUpdate(check, {
          appSkillsDir: appSkillsDir(),
          skillDir: dir,
          discardReplaced: (old) => deps.trash(old),
        })
        const newId = userSkillId('app', done.name)
        if (newId !== skill.id) {
          changeSettings((settings) => {
            const kept = settings.states[skill.id]
            clearState(settings, skill.id)
            clearState(settings, newId)
            if (kept) settings.states[newId] = kept
          })
        }
        return { ok: true, id: newId }
      } catch (error) {
        return failureOf(error)
      }
    },

    async exportInfo(
      id: string,
    ): Promise<UserSkillsResult<{ fileName: string; includesTemplate: boolean }>> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      const dir = await ownedDir(skill)
      if (!dir) return fail('not-owned')
      try {
        const info = await skillExportInfo(dir)
        return { ok: true, fileName: info.fileName, includesTemplate: info.includesTemplate }
      } catch (error) {
        return failureOf(error)
      }
    },

    async exportTo(id: string, outPath: string): Promise<UserSkillsResult<{ path: string }>> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      const dir = await ownedDir(skill)
      if (!dir) return fail('not-owned')
      try {
        await exportSkillZip(dir, outPath)
        return { ok: true, path: outPath }
      } catch (error) {
        return failureOf(error)
      }
    },

    /** The folder "open folder" shows: own skills and other programs' (not builtin) */
    async folderOf(id: string): Promise<UserSkillsResult<{ dir: string }>> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      if (skill.source === 'builtin' || skill.source === 'project') return fail('invalid')
      return { ok: true, dir: skill.dir }
    },

    /**
     * `use_skill` (spec 5.8): an enabled skill's body and its text files. A
     * skill that is off, hidden, unreadable or for the agent window only is
     * refused.
     */
    async aiRead(id: string): Promise<UserSkillsResult<{ skill: UserSkillAiRead }>> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      if (skill.agentOnly) return fail('agent-only')
      if (skill.unreadable) return fail('unreadable')
      if (!skill.enabled) return fail('disabled')
      const listed = await listSkillFolderFiles(skill.dir, FOLDER_LIMITS)
      if (!listed || listed.tooLarge) return fail(listed ? 'too-large' : 'unreadable')
      const text = await readSkillMdText(skill.dir)
      const parsed = text === undefined ? undefined : parseSkillMd(text)
      if (!parsed) return fail('unreadable')
      return {
        ok: true,
        skill: {
          id: skill.id,
          name: skill.name,
          title: skill.title,
          body: parsed.body,
          files: listed.files
            .map((file) => file.rel)
            .filter(
              (rel) =>
                rel !== 'SKILL.md' &&
                rel !== IEUM_SOURCE_FILE &&
                SKILL_TEXT_EXTENSIONS.has(extname(rel).toLowerCase()),
            ),
          template: skill.templateExists ? skill.template : undefined,
          hasScripts: skill.hasScripts,
        },
      }
    },

    /**
     * The template document of an enabled skill (spec 5.7), for its copy in a
     * new tab: the file's absolute place, only when it is a document the
     * editors open and it lies inside the skill's folder. A skill whose
     * template file is gone answers `no-template`; nothing is read here.
     */
    async templateFile(
      id: string,
    ): Promise<UserSkillsResult<{ path: string; fileName: string; title: string }>> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      if (skill.agentOnly) return fail('agent-only')
      if (skill.unreadable) return fail('unreadable')
      if (!skill.enabled) return fail('disabled')
      if (!skill.template) return fail('no-template')
      const fileName = templateFileNameOf(skill.template)
      if (!fileName) return fail('bad-template')
      const path = join(skill.dir, ...skill.template.split('/'))
      const info = await stat(path).catch(() => undefined)
      if (!info?.isFile()) return fail('no-template')
      const root = await realpath(skill.dir).catch(() => undefined)
      const real = await realpath(path).catch(() => undefined)
      if (!root || !real || !isInsideDir(real, root)) return fail('bad-template')
      if (info.size > SKILL_TEMPLATE_MAX_BYTES) return fail('too-large')
      return { ok: true, path: real, fileName, title: skill.title }
    },

    /**
     * `read_skill_file` (spec 5.8): one text file inside an enabled skill's
     * folder, by its path inside the folder. The file must be one the folder
     * listing finds (links leading out are never listed), its real place must
     * be inside the folder's, and it must be a text file under the size limit.
     */
    async aiReadFile(id: string, rel: string): Promise<UserSkillsResult<{ text: string }>> {
      const skill = await find(id)
      if (!skill) return fail('not-found')
      if (skill.agentOnly) return fail('agent-only')
      if (skill.unreadable) return fail('unreadable')
      if (!skill.enabled) return fail('disabled')
      const wanted = rel.replace(/\\/g, '/').replace(/^\.\//, '')
      const parts = wanted.split('/')
      if (
        !wanted ||
        isAbsolute(rel) ||
        /^[A-Za-z]:/.test(wanted) ||
        parts.some((part) => part === '' || part === '.' || part === '..')
      ) {
        return fail('outside')
      }
      if (!SKILL_TEXT_EXTENSIONS.has(extname(wanted).toLowerCase())) return fail('not-text')
      const listed = await listSkillFolderFiles(skill.dir, FOLDER_LIMITS)
      if (!listed) return fail('unreadable')
      const file =
        listed.files.find((entry) => entry.rel === wanted) ??
        (process.platform === 'win32'
          ? listed.files.find((entry) => sameName(entry.rel, wanted))
          : undefined)
      if (!file) {
        const there = await stat(join(skill.dir, ...parts)).catch(() => undefined)
        return fail(there ? 'outside' : 'not-found')
      }
      const root = await realpath(skill.dir).catch(() => undefined)
      const real = await realpath(file.path).catch(() => undefined)
      if (!root || !real || !isInsideDir(real, root)) return fail('outside')
      if (file.size > aiFileMax) return fail('too-large')
      try {
        return { ok: true, text: await readFile(file.path, 'utf8') }
      } catch {
        return fail('unreadable')
      }
    },

    /**
     * The skills an agent session takes (spec 6.1): every enabled skill,
     * builtin, own, Claude's, plugins' and Codex's, plus the project's when a
     * folder is given. Off, hidden and unreadable skills are left out.
     */
    async enabledForAgent(projectRoot?: string): Promise<AgentEnabledSkill[]> {
      const all = await resolved(projectRoot)
      return all
        .filter((skill) => skill.enabled)
        .map((skill) => ({
          id: skill.id,
          source: skill.source,
          plugin: skill.plugin,
          name: skill.name,
          title: skill.title,
          description: skill.description,
          dir: skill.dir,
          invoke: skill.invoke,
          agentOnly: skill.agentOnly,
        }))
    },
  }
}

export type UserSkillsService = ReturnType<typeof createUserSkillsService>
