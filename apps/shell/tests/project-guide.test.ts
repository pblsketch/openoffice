import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectFolderFile,
  ProjectTrustAnswer,
  ProjectTrustPrompt,
} from '@genoffice/project-store'
import { readAppSettings, readProjectsSettings, writeAppSetting } from '../src/main/app-settings'
import {
  INSTRUCTIONS_LIMIT_CHARS,
  MEMORY_SOFT_LIMIT_CHARS,
  ProjectGuide,
  type ProjectGuideDeps,
} from '../src/main/projects/project-guide'
import { ProjectWriteGuard } from '../src/main/projects/write-guard'

/** The project guide: registry, identity, trust, context, memory and selection (spec 3-5) */

let base: string
let home: string
let userData: string
let settingsPath: string
let saveDir: string
let clock: number

function makeGuide(extra: Partial<ProjectGuideDeps> = {}): ProjectGuide {
  return new ProjectGuide({
    settingsPath,
    homeDir: home,
    userData,
    defaultParentDir: () => saveDir,
    env: {},
    language: () => 'en',
    now: () => new Date(clock),
    ...extra,
  })
}

function folder(...parts: string[]): string {
  const path = join(base, ...parts)
  mkdirSync(path, { recursive: true })
  return path
}

function dataFile(root: string, name: string): string {
  return join(root, '.ieumoffice', name)
}

function writeData(root: string, name: string, text: string): void {
  mkdirSync(join(root, '.ieumoffice', 'chats'), { recursive: true })
  writeFileSync(dataFile(root, name), text)
}

function projectFile(root: string): ProjectFolderFile {
  return JSON.parse(readFileSync(dataFile(root, 'project.json'), 'utf8')) as ProjectFolderFile
}

const never = vi.fn(async (): Promise<ProjectTrustAnswer> => {
  throw new Error('the trust prompt should not be shown')
})

function answer(value: ProjectTrustAnswer) {
  return vi.fn(async (_prompt: ProjectTrustPrompt): Promise<ProjectTrustAnswer> => value)
}

async function addOk(guide: ProjectGuide, path: string, ask = answer('use')) {
  const result = await guide.addFolder(path, ask)
  if (result.status !== 'added') throw new Error(`not added: ${JSON.stringify(result)}`)
  return result
}

beforeEach(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'project-guide-')))
  home = folder('home')
  userData = folder('appdata', 'IeumOffice')
  saveDir = folder('documents', 'IeumOffice')
  settingsPath = join(userData, 'app-settings.json')
  clock = Date.UTC(2026, 9, 29, 12, 0, 0)
  never.mockClear()
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('settings', () => {
  it('makes the install id once and keeps other settings keys', () => {
    writeAppSetting(settingsPath, 'uiLanguage', 'ko')
    const first = makeGuide().installId()
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(makeGuide().installId()).toBe(first)
    expect(readAppSettings(settingsPath).uiLanguage).toBe('ko')
  })

  it('reads a broken file as an empty registry', async () => {
    writeFileSync(settingsPath, '{broken')
    expect(await makeGuide().listProjects()).toEqual([])
  })
})

describe('registration refusals', () => {
  it('refuses a drive root, the home folder, protected folders and their parents', async () => {
    const guide = makeGuide()
    const refused = async (path: string) => {
      const result = await guide.addFolder(path, never)
      return result.status === 'refused' ? result.reason : result.status
    }
    expect(await refused(parse(base).root)).toBe('drive-root')
    expect(await refused(home)).toBe('user-home')
    expect(await refused(folder('home', '.claude'))).toBe('protected')
    expect(await refused(folder('home', '.codex', 'sessions'))).toBe('protected')
    expect(await refused(folder('home', '.genoffice'))).toBe('protected')
    expect(await refused(folder('home', '.ieumoffice'))).toBe('protected')
    expect(await refused(userData)).toBe('protected')
    expect(await refused(join(base, 'appdata'))).toBe('contains-protected')
    writeFileSync(join(base, 'file.txt'), 'x')
    expect(await refused(join(base, 'file.txt'))).toBe('not-a-folder')
    expect(await refused(join(base, 'missing'))).toBe('not-a-folder')
    expect(await guide.listProjects()).toEqual([])
  })

  it('refuses a folder holding the home folder', async () => {
    const guide = makeGuide({ homeDir: folder('users', 'me') })
    const result = await guide.addFolder(join(base, 'users'), never)
    expect(result).toEqual({ status: 'refused', reason: 'contains-protected' })
  })
})

describe('adding folders and identity (spec 5.11)', () => {
  it('lists a new folder under its canonical path without writing into it', async () => {
    const guide = makeGuide()
    const root = folder('work')
    const result = await addOk(guide, root, never)
    expect(result.identity).toBe('new')
    expect(result.project.path).toBe(root)
    expect(result.project.name).toBe('work')
    expect(existsSync(join(root, '.ieumoffice'))).toBe(false)
    expect(guide.trustState(result.project.id)).toBe('use')
    expect(never).not.toHaveBeenCalled()
  })

  it('treats a linked path or another spelling as the same folder', async () => {
    const guide = makeGuide()
    const root = folder('Work')
    const first = await addOk(guide, root, never)
    const alias = join(base, 'alias')
    let linked = true
    try {
      symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      linked = false
    }
    if (linked) {
      const again = await addOk(guide, alias, never)
      expect(again.identity).toBe('existing')
      expect(again.project.id).toBe(first.project.id)
      expect(again.project.path).toBe(root)
    }
    if (process.platform === 'win32') {
      const upper = await addOk(guide, root.toUpperCase(), never)
      expect(upper.identity).toBe('existing')
    }
    expect(await guide.listProjects()).toHaveLength(1)
  })

  it('follows a moved folder: same id, pins and opt-outs carried over', async () => {
    const guide = makeGuide()
    const oldRoot = folder('old')
    const added = await addOk(guide, oldRoot, never)
    const id = added.project.id
    await guide.setPinned(id, true)
    expect(await guide.saveInstructions(id, 'Use short sentences.')).toEqual({ status: 'ok' })
    writeFileSync(join(oldRoot, 'a.docx'), 'x')
    await guide.setSelection({ kind: 'document', path: join(oldRoot, 'a.docx') }, null)

    const newRoot = join(base, 'new')
    renameSync(oldRoot, newRoot)
    const listed = await guide.listProjects()
    expect(listed[0]?.missing).toBe(true)

    const moved = await addOk(guide, newRoot, never)
    expect(moved.identity).toBe('moved')
    expect(moved.project.id).toBe(id)
    expect(moved.project.path).toBe(newRoot)
    expect(moved.project.pinned).toBe(true)
    expect(await guide.listProjects()).toHaveLength(1)
    const selection = await guide.getSelection({ kind: 'document', path: join(newRoot, 'a.docx') })
    expect(selection.projectId).toBeNull()
  })

  it('gives a copied folder a new id, keeps its name, instructions and trust', async () => {
    const guide = makeGuide()
    const original = folder('original')
    const added = await addOk(guide, original, never)
    await guide.renameProject(added.project.id, 'Annual report')
    await guide.saveInstructions(added.project.id, 'Formal tone.')
    await guide.setSettings(added.project.id, { readAgentsFiles: false })

    const copy = join(base, 'copy')
    cpSync(original, copy, { recursive: true })
    const copied = await addOk(guide, copy, never)
    expect(copied.identity).toBe('copied')
    expect(copied.project.id).not.toBe(added.project.id)
    expect(copied.project.name).toBe('Annual report')
    expect(projectFile(copy).id).toBe(copied.project.id)
    expect(projectFile(copy).name).toBe('Annual report')
    expect(projectFile(original).id).toBe(added.project.id)
    expect(guide.trustState(copied.project.id)).toBe('use')
    expect(await guide.getSettings(copied.project.id)).toEqual({
      memoryEnabled: true,
      readAgentsFiles: false,
    })
    const context = await guide.readContext(copied.project.id)
    expect(context.status === 'ok' && context.context.instructions?.text).toContain('Formal tone.')
    expect(context.status === 'ok' && context.context.notices).toEqual([])
  })

  async function copyWithFailedIdWrite(guide: ProjectGuide) {
    const original = folder('original-id')
    const added = await addOk(guide, original, never)
    await guide.renameProject(added.project.id, 'Source')
    const copy = join(base, 'copy-id')
    cpSync(original, copy, { recursive: true })
    const spy = vi
      .spyOn(ProjectWriteGuard.prototype, 'writeData')
      .mockRejectedValueOnce(new Error('EPERM: read-only'))
    const copied = await addOk(guide, copy, never)
    spy.mockRestore()
    expect(copied.identity).toBe('copied')
    expect(copied.project.id).not.toBe(added.project.id)
    // the new id could not be written: the folder still names the original
    expect(projectFile(copy).id).toBe(added.project.id)
    expect(guide.isUnwritable(copied.project.id)).toBe(true)
    return { original, copy, originalId: added.project.id, id: copied.project.id }
  }

  it('fixes a copy’s project.json on the next write that succeeds', async () => {
    const guide = makeGuide()
    const { original, copy, originalId, id } = await copyWithFailedIdWrite(guide)
    expect(await guide.retryUnwritable(id)).toEqual({ status: 'ok' })
    expect(projectFile(copy).id).toBe(id)
    expect(projectFile(copy).name).toBe('Source')
    expect(projectFile(original).id).toBe(originalId)
  })

  it('still fixes it after a restart, while the original is listed elsewhere', async () => {
    const { original, copy, originalId, id } = await copyWithFailedIdWrite(makeGuide())
    const restarted = makeGuide()
    expect(await restarted.saveInstructions(id, 'Copy rules.')).toEqual({ status: 'ok' })
    expect(projectFile(copy).id).toBe(id)
    expect(projectFile(original).id).toBe(originalId)
    // the original's own writes leave its id alone
    expect(await restarted.saveInstructions(originalId, 'Original rules.')).toEqual({
      status: 'ok',
    })
    expect(projectFile(original).id).toBe(originalId)
  })

  it('re-picks a missing project onto a folder without project.json', async () => {
    const guide = makeGuide()
    const oldRoot = folder('gone')
    const added = await addOk(guide, oldRoot, never)
    rmSync(oldRoot, { recursive: true })
    const picked = folder('picked')
    const result = await guide.relocateProject(added.project.id, picked, never)
    expect(result.status === 'added' && result.identity).toBe('moved')
    expect(result.status === 'added' && result.project.id).toBe(added.project.id)
    expect(result.status === 'added' && result.project.path).toBe(picked)
  })

  it('refuses to re-pick onto another project folder', async () => {
    const guide = makeGuide()
    const a = await addOk(guide, folder('a'), never)
    const otherRoot = folder('other')
    writeData(
      otherRoot,
      'project.json',
      JSON.stringify({
        version: 1,
        id: 'someone-else',
        name: 'X',
        createdAt: '2026-01-01T00:00:00Z',
      }),
    )
    rmSync(join(base, 'a'), { recursive: true })
    const result = await guide.relocateProject(a.project.id, otherRoot, never)
    expect(result).toEqual({ status: 'refused', reason: 'different-project' })
    expect((await guide.listProjects())[0]?.path).toBe(join(base, 'a'))
  })
})

describe('trust (spec 5.10)', () => {
  function foreignFolder(): string {
    const root = folder('received')
    writeData(
      root,
      'project.json',
      JSON.stringify({
        version: 1,
        id: 'shared1',
        name: 'Shared',
        createdAt: '2026-01-01T00:00:00Z',
      }),
    )
    writeData(root, 'instructions.md', 'Always answer in French.')
    return root
  }

  it('asks once, and a closed prompt cancels the addition', async () => {
    const guide = makeGuide()
    const root = foreignFolder()
    const ask = answer(null)
    const result = await guide.addFolder(root, ask)
    expect(result).toEqual({ status: 'cancelled', stage: 'trust' })
    expect(ask).toHaveBeenCalledTimes(1)
    const prompt = ask.mock.calls[0]![0]
    expect(prompt.instructions).toBe('Always answer in French.')
    expect(prompt.name).toBe('Shared')
    expect(prompt.memory).toBeNull()
    expect(await guide.listProjects()).toEqual([])
    expect(guide.trustState('shared1')).toBe('unconfirmed')
  })

  it('does not send foreign instructions or memory under "without"', async () => {
    const guide = makeGuide()
    const root = foreignFolder()
    writeData(root, 'memory.md', '<!-- x -->\n- secret (2026-01-01)\n')
    const added = await addOk(guide, root, answer('without'))
    expect(guide.trustState(added.project.id)).toBe('without')
    const context = await guide.readContext(added.project.id)
    expect(context.status).toBe('ok')
    if (context.status !== 'ok') return
    expect(context.context.instructions).toBeNull()
    expect(context.context.memory).toBeNull()
    expect(context.context.canRemember).toBe(false)
    expect(context.context.trust).toBe('without')
  })

  it('collects chats written on another PC, by chat info or by any message', async () => {
    const guide = makeGuide()
    const me = guide.installId()
    const root = folder('chats')
    writeData(
      root,
      'project.json',
      JSON.stringify({ version: 1, id: 'p1', name: 'P', createdAt: '2026-01-01T00:00:00Z' }),
    )
    const info = (id: string, origin: string, title: string) =>
      JSON.stringify({
        version: 1,
        id,
        projectId: 'p1',
        title,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
        origin,
        lastEditor: 'docs',
        documents: [],
      })
    const line = (origin: string, seq: number) =>
      JSON.stringify({ role: 'user', text: 'hi', seq, ts: 1, editor: 'docs', origin })
    writeData(root, 'chats/mine.json', info('mine', me, 'Mine'))
    writeData(root, 'chats/mine.jsonl', `${line(me, 1)}\n`)
    writeData(root, 'chats/planted.json', info('planted', me, 'Planted'))
    writeData(root, 'chats/planted.jsonl', `${line(me, 1)}\n{broken\n${line('other-pc', 2)}\n`)
    writeData(root, 'chats/away.json', info('away', 'other-pc', 'Away'))
    writeData(root, 'chats/bad$id.json', info('bad$id', 'other-pc', 'Bad'))

    const ask = answer('use')
    await addOk(guide, root, ask)
    expect(ask).toHaveBeenCalledTimes(1)
    const titles = ask.mock.calls[0]![0].foreignChats.map((chat) => chat.title).sort()
    expect(titles).toEqual(['Away', 'Planted'])
  })

  it('records "use" without asking when nothing foreign is there', async () => {
    const guide = makeGuide()
    const root = folder('mine')
    const added = await addOk(guide, root, never)
    expect(guide.trustState(added.project.id)).toBe('use')
    expect(never).not.toHaveBeenCalled()
  })

  it('shows "changed" once after an outside edit, then records the new hash', async () => {
    const guide = makeGuide()
    const root = folder('p')
    const added = await addOk(guide, root, never)
    const id = added.project.id
    await guide.saveInstructions(id, 'v1')
    await guide.editMemory(id, { op: 'add', text: 'fact' }, 'ai')
    const quiet = await guide.readContext(id)
    expect(quiet.status === 'ok' && quiet.context.notices).toEqual([])

    writeFileSync(dataFile(root, 'instructions.md'), 'v2 from outside')
    writeFileSync(dataFile(root, 'memory.md'), '<!-- x -->\n- edited (2026-01-01)\n')
    writeFileSync(join(root, 'AGENTS.md'), 'agents text')
    const changed = await guide.readContext(id)
    expect(changed.status === 'ok' && changed.context.notices).toEqual([
      { kind: 'instructions-changed', files: ['instructions', 'agents'] },
      { kind: 'memory-changed' },
    ])
    expect(changed.status === 'ok' && changed.context.instructions?.text).toContain(
      'v2 from outside',
    )
    const again = await guide.readContext(id)
    expect(again.status === 'ok' && again.context.notices).toEqual([])
  })

  it('"remove from list" keeps trust and hashes; re-adding does not ask again', async () => {
    const guide = makeGuide()
    const root = foreignFolder()
    const ask = answer('use')
    const added = await addOk(guide, root, ask)
    writeFileSync(join(root, 'doc.docx'), 'x')
    await guide.setSelection({ kind: 'document', path: join(root, 'doc.docx') }, null)
    await guide.setPinned(added.project.id, true)
    await guide.removeFromList(added.project.id)
    expect(await guide.listProjects()).toEqual([])
    expect(guide.trustState(added.project.id)).toBe('use')

    writeFileSync(dataFile(root, 'instructions.md'), 'changed while away')
    const again = await addOk(guide, root, never)
    expect(again.project.id).toBe(added.project.id)
    expect(again.project.pinned).toBe(false)
    expect(ask).toHaveBeenCalledTimes(1)
    const selection = await guide.getSelection({ kind: 'document', path: join(root, 'doc.docx') })
    expect(selection.projectId).toBe(added.project.id)
    const context = await guide.readContext(added.project.id)
    expect(context.status === 'ok' && context.context.notices).toEqual([
      { kind: 'instructions-changed', files: ['instructions'] },
    ])
  })

  it('switching back to "use" shows the prompt again; closing it keeps "without"', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, foreignFolder(), answer('without'))
    const closed = answer(null)
    expect(await guide.decideTrust(added.project.id, 'use', closed)).toEqual({
      status: 'cancelled',
    })
    expect(closed).toHaveBeenCalledTimes(1)
    expect(guide.trustState(added.project.id)).toBe('without')
    expect(await guide.decideTrust(added.project.id, 'use', answer('use'))).toEqual({
      status: 'ok',
      trust: 'use',
    })
    expect(await guide.decideTrust(added.project.id, 'without', never)).toEqual({
      status: 'ok',
      trust: 'without',
    })
  })
})

describe('new project (spec 5.1)', () => {
  it('creates the folder and project.json under the default save folder, trusted', async () => {
    const guide = makeGuide()
    expect(guide.getDefaultParentFolder()).toBe(saveDir)
    const result = await guide.createProject({ name: 'Budget 2027' }, never)
    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    expect(result.project.path).toBe(join(saveDir, 'Budget 2027'))
    expect(projectFile(join(saveDir, 'Budget 2027'))).toMatchObject({
      version: 1,
      id: result.project.id,
      name: 'Budget 2027',
    })
    expect(guide.trustState(result.project.id)).toBe('use')
  })

  it('does not create over an existing folder and offers to use it', async () => {
    const guide = makeGuide()
    const existing = folder('documents', 'IeumOffice', 'Taken')
    writeFileSync(join(existing, 'keep.txt'), 'x')
    const result = await guide.createProject({ name: 'Taken' }, never)
    expect(result).toEqual({ status: 'exists', folderPath: existing })
    expect(existsSync(join(existing, '.ieumoffice'))).toBe(false)
    const used = await guide.createProject({ name: 'Taken', useExisting: true }, never)
    expect(used.status).toBe('added')
  })

  it('just opens a folder of that name that is already a listed project, without asking', async () => {
    const guide = makeGuide()
    const made = await guide.createProject({ name: 'Report' }, never)
    expect(made.status).toBe('created')
    if (made.status !== 'created') return
    const again = await guide.createProject({ name: 'Report' }, never)
    expect(again).toMatchObject({
      status: 'added',
      identity: 'existing',
      project: { id: made.project.id },
    })
    expect(await guide.listProjects()).toHaveLength(1)
  })

  it('uses another parent folder and refuses bad names', async () => {
    const guide = makeGuide()
    const parent = folder('elsewhere')
    const result = await guide.createProject({ name: 'Here', parentDir: parent }, never)
    expect(result.status === 'created' && result.project.path).toBe(join(parent, 'Here'))
    for (const name of ['', '  ', 'a/b', 'CON', 'x'.repeat(129), '..']) {
      expect(await guide.createProject({ name }, never)).toEqual({ status: 'invalid-name' })
    }
  })

  it('refuses a new project inside a protected folder', async () => {
    const guide = makeGuide({ defaultParentDir: () => userData })
    expect(await guide.createProject({ name: 'Nope' }, never)).toEqual({
      status: 'refused',
      reason: 'protected',
    })
    expect(existsSync(join(userData, 'Nope'))).toBe(false)
  })

  it('refuses a picked parent folder inside a protected folder the same way', async () => {
    const guide = makeGuide()
    expect(await guide.createProject({ name: 'Nope', parentDir: userData }, never)).toEqual({
      status: 'refused',
      reason: 'protected',
    })
    expect(existsSync(join(userData, 'Nope'))).toBe(false)
  })
})

describe('context for a send (spec 5.4)', () => {
  it('writes a project’s use time at most once a minute and keeps the order in memory', async () => {
    const guide = makeGuide({ touchWriteMs: 60_000 })
    const a = await addOk(guide, folder('use-a'), never)
    clock += 1_000
    const b = await addOk(guide, folder('use-b'), never)
    const storedAt = (id: string) =>
      readProjectsSettings(settingsPath).list.find((item) => item.id === id)?.lastUsedAt
    const order = async () => (await guide.listProjects()).map((item) => item.id)
    expect(await order()).toEqual([b.project.id, a.project.id])

    // the first use is written at once
    clock += 1_000
    await guide.readContext(a.project.id)
    const firstWrite = storedAt(a.project.id)
    expect(firstWrite).toBe(new Date(clock).toISOString())
    expect(await order()).toEqual([a.project.id, b.project.id])

    // b, then a again within the minute: b is written (its first use), a waits in memory
    clock += 1_000
    await guide.readContext(b.project.id)
    clock += 1_000
    await guide.readContext(a.project.id)
    expect(storedAt(a.project.id)).toBe(firstWrite)
    expect(await order()).toEqual([a.project.id, b.project.id])

    // quitting writes what waited
    guide.flushTouches()
    expect(storedAt(a.project.id)).toBe(new Date(clock).toISOString())

    // past the minute a use is written at once again
    clock += 61_000
    await guide.readContext(a.project.id)
    expect(storedAt(a.project.id)).toBe(new Date(clock).toISOString())
  })

  it('writes a held use time when the minute is over', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const guide = makeGuide({ touchWriteMs: 60_000 })
      const a = await addOk(guide, folder('use-timer'), never)
      await guide.readContext(a.project.id)
      clock += 5_000
      await guide.readContext(a.project.id)
      const held = new Date(clock).toISOString()
      expect(
        readProjectsSettings(settingsPath).list.find((item) => item.id === a.project.id)
          ?.lastUsedAt,
      ).not.toBe(held)
      clock += 55_000
      vi.advanceTimersByTime(55_000)
      expect(
        readProjectsSettings(settingsPath).list.find((item) => item.id === a.project.id)
          ?.lastUsedAt,
      ).toBe(held)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reads instructions, root AGENTS.md / CLAUDE.md and memory without creating anything', async () => {
    const guide = makeGuide()
    const root = folder('ctx')
    writeFileSync(join(root, 'AGENTS.md'), 'agents rules')
    writeFileSync(join(root, 'CLAUDE.md'), 'claude rules')
    const added = await addOk(guide, root, answer('use'))
    const context = await guide.readContext(added.project.id)
    expect(context.status).toBe('ok')
    if (context.status !== 'ok') return
    expect(context.context.name).toBe('ctx')
    expect(context.context.instructions?.sources).toEqual(['agents', 'claude'])
    expect(context.context.instructions?.text).toContain('agents rules')
    expect(context.context.memory).toBeNull()
    expect(context.context.canRemember).toBe(true)
    expect(existsSync(join(root, '.ieumoffice'))).toBe(false)

    await guide.setSettings(added.project.id, { readAgentsFiles: false })
    const off = await guide.readContext(added.project.id)
    expect(off.status === 'ok' && off.context.instructions).toBeNull()
  })

  it('cuts instructions at the limit with a notice', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, folder('long'), never)
    const text = 'a'.repeat(INSTRUCTIONS_LIMIT_CHARS + 500)
    await guide.saveInstructions(added.project.id, text)
    const context = await guide.readContext(added.project.id)
    if (context.status !== 'ok') throw new Error('no context')
    expect(context.context.instructions?.text.length).toBe(INSTRUCTIONS_LIMIT_CHARS)
    expect(context.context.notices).toContainEqual({
      kind: 'instructions-truncated',
      chars: expect.any(Number),
      limit: INSTRUCTIONS_LIMIT_CHARS,
    })
  })

  it('sends long memory whole, with a notice', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, folder('mem'), never)
    const entries = Array.from({ length: 400 }, (_, i) => `fact number ${i} with some words`)
    await guide.applyMemoryConsolidation({ projectId: added.project.id, entries })
    const context = await guide.readContext(added.project.id)
    if (context.status !== 'ok') throw new Error('no context')
    expect(context.context.memory?.chars).toBeGreaterThan(MEMORY_SOFT_LIMIT_CHARS)
    expect(context.context.memory?.text).toContain('fact number 399')
    expect(context.context.notices).toContainEqual({
      kind: 'memory-long',
      chars: context.context.memory?.chars,
      limit: MEMORY_SOFT_LIMIT_CHARS,
    })
  })

  it('asks the file lister for names', async () => {
    const contextFiles = vi.fn(async () => ({
      files: [{ relPath: 'a.docx', ext: 'docx', sizeBytes: 1, mtimeMs: 1, cloudOnly: false }],
      omitted: 3,
    }))
    const guide = makeGuide({ contextFiles })
    const added = await addOk(guide, folder('files'), never)
    const context = await guide.readContext(added.project.id)
    if (context.status !== 'ok') throw new Error('no context')
    expect(context.context.files).toHaveLength(1)
    expect(context.context.filesOmitted).toBe(3)
    expect(contextFiles.mock.calls[0]![0]).toMatchObject({
      id: added.project.id,
      root: join(base, 'files'),
    })
  })

  it('reports a missing folder and an unknown project', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, folder('vanish'), never)
    rmSync(join(base, 'vanish'), { recursive: true })
    expect(await guide.readContext(added.project.id)).toEqual({ status: 'missing' })
    expect(await guide.readContext('nope')).toEqual({ status: 'unknown' })
  })

  it('shows the sync-folder notice once', async () => {
    const sync = folder('OneDrive')
    const guide = makeGuide({ env: { OneDrive: sync }, platform: process.platform })
    const added = await addOk(guide, folder('OneDrive', 'Team'), never)
    expect(added.notices).toEqual([{ kind: 'sync-folder', service: 'onedrive' }])
    expect(added.project.syncFolder).toBe(true)
    const context = await guide.readContext(added.project.id)
    expect(context.status === 'ok' && context.context.notices).toEqual([])

    const created = await makeGuide({
      env: { OneDrive: sync },
      defaultParentDir: () => sync,
    }).createProject({ name: 'Fresh' }, never)
    if (created.status !== 'created') throw new Error('not created')
    const first = await makeGuide({ env: { OneDrive: sync } }).readContext(created.project.id)
    expect(first.status === 'ok' && first.context.notices).toEqual([
      { kind: 'sync-folder', service: 'onedrive' },
    ])
    const second = await makeGuide({ env: { OneDrive: sync } }).readContext(created.project.id)
    expect(second.status === 'ok' && second.context.notices).toEqual([])
  })
})

describe('unwritable folders (spec 5.7)', () => {
  it('marks the project after a failed write, drops remember, and retries on request', async () => {
    const guide = makeGuide()
    const root = folder('ro')
    const added = await addOk(guide, root, never)
    const id = added.project.id
    writeFileSync(join(root, '.ieumoffice'), 'a file where the folder should be')

    expect(await guide.saveInstructions(id, 'x')).toEqual({ status: 'unwritable' })
    expect(guide.isUnwritable(id)).toBe(true)
    expect((await guide.listProjects())[0]?.unwritable).toBe(true)
    const context = await guide.readContext(id)
    if (context.status !== 'ok') throw new Error('no context')
    expect(context.context.canRemember).toBe(false)
    expect(context.context.notices).toContainEqual({ kind: 'unwritable' })
    expect(await guide.editMemory(id, { op: 'add', text: 'x' }, 'ai')).toEqual({
      status: 'refused',
      reason: 'unwritable',
    })
    expect(await guide.retryUnwritable(id)).toEqual({ status: 'unwritable' })

    rmSync(join(root, '.ieumoffice'))
    expect(await guide.retryUnwritable(id)).toEqual({ status: 'ok' })
    expect(guide.isUnwritable(id)).toBe(false)
    expect(projectFile(root).id).toBe(id)
  })

  it('creates nothing for a change that writes nothing', async () => {
    const guide = makeGuide()
    const root = folder('noop')
    const added = await addOk(guide, root, never)
    expect(await guide.editMemory(added.project.id, { op: 'remove', text: 'x' }, 'person')).toEqual(
      { status: 'refused', reason: 'not-found' },
    )
    expect(await guide.removeIgnore(added.project.id, 'a.docx')).toEqual({ status: 'ok' })
    expect(existsSync(join(root, '.ieumoffice'))).toBe(false)
  })

  it('keeps project.json for the guide alone', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, folder('own'), never)
    await expect(guide.writeData(added.project.id, 'project.json', '{}')).rejects.toThrow()
  })

  it('writes project.json together with the first data file', async () => {
    const guide = makeGuide()
    const root = folder('lazy')
    const added = await addOk(guide, root, never)
    expect(await guide.writeData(added.project.id, 'chats/c1.json', '{}')).toEqual({ status: 'ok' })
    expect(projectFile(root)).toMatchObject({ id: added.project.id, name: 'lazy' })
  })
})

describe('memory through the guide (spec 5.6)', () => {
  it('refuses AI edits when memory is off or trust is "without", allows the person', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, folder('m'), never)
    const id = added.project.id
    await guide.setSettings(id, { memoryEnabled: false })
    expect(await guide.editMemory(id, { op: 'add', text: 'x' }, 'ai')).toEqual({
      status: 'refused',
      reason: 'disabled',
    })
    const context = await guide.readContext(id)
    expect(context.status === 'ok' && context.context.canRemember).toBe(false)
    await guide.setSettings(id, { memoryEnabled: true })
    await guide.decideTrust(id, 'without', never)
    expect(await guide.editMemory(id, { op: 'add', text: 'x' }, 'ai')).toEqual({
      status: 'refused',
      reason: 'without',
    })
    expect(await guide.editMemory(id, { op: 'add', text: 'by hand' }, 'person')).toMatchObject({
      status: 'ok',
    })
  })

  it('re-reads the file before each change', async () => {
    const guide = makeGuide()
    const root = folder('m2')
    const added = await addOk(guide, root, never)
    const id = added.project.id
    await guide.editMemory(id, { op: 'add', text: 'first' }, 'ai')
    const current = readFileSync(dataFile(root, 'memory.md'), 'utf8')
    writeFileSync(dataFile(root, 'memory.md'), `${current}- outside (2026-01-01)\n`)
    await guide.editMemory(id, { op: 'add', text: 'second' }, 'ai')
    const detail = await guide.getProjectDetail(id)
    expect(detail.memoryEntries).toEqual([
      'first (2026-10-29)',
      'outside (2026-01-01)',
      'second (2026-10-29)',
    ])
    expect(await guide.editMemory(id, { op: 'remove', text: 'outside' }, 'person')).toEqual({
      status: 'ok',
      change: { op: 'remove', text: 'outside (2026-01-01)' },
    })
  })

  it('consolidates with backups (newest 3 kept), undoes, and saves the full text', async () => {
    const guide = makeGuide()
    const root = folder('m3')
    const added = await addOk(guide, root, never)
    const id = added.project.id
    await guide.editMemory(id, { op: 'add', text: 'a' }, 'ai')
    await guide.editMemory(id, { op: 'add', text: 'b' }, 'ai')
    const names: string[] = []
    for (let i = 0; i < 4; i++) {
      clock += 1000
      const result = await guide.applyMemoryConsolidation({
        projectId: id,
        entries: [`merged ${i}`],
      })
      if (result.status !== 'ok') throw new Error('not applied')
      names.push(result.backupName)
      if (i === 0) expect([result.before, result.after]).toEqual([2, 1])
    }
    const backups = readdirSync(join(root, '.ieumoffice'))
      .filter((n) => n.endsWith('.bak.md'))
      .sort()
    expect(backups).toEqual(names.slice(1))
    expect(await guide.undoMemoryConsolidation({ projectId: id, backupName: names[3]! })).toEqual({
      status: 'ok',
      entries: 1,
    })
    expect((await guide.getProjectDetail(id)).memoryEntries).toEqual(['merged 2 (2026-10-29)'])
    expect(await guide.undoMemoryConsolidation({ projectId: id, backupName: 'memory.md' })).toEqual(
      { status: 'no-backup' },
    )

    expect(await guide.saveMemory(id, '<!-- mine -->\n- typed (2026-10-01)\n')).toEqual({
      status: 'ok',
    })
    const context = await guide.readContext(id)
    expect(context.status === 'ok' && context.context.notices).toEqual([])
    expect(context.status === 'ok' && context.context.memory?.text).toContain('typed')
  })

  it('lists sync conflict copies of memory.md', async () => {
    const guide = makeGuide()
    const root = folder('m4')
    const added = await addOk(guide, root, never)
    await guide.editMemory(added.project.id, { op: 'add', text: 'x' }, 'ai')
    writeFileSync(dataFile(root, 'memory-PC2.md'), 'conflict')
    writeFileSync(dataFile(root, 'memory.20260101-000000.bak.md'), 'backup')
    expect((await guide.getProjectDetail(added.project.id)).memoryConflictCopies).toEqual([
      'memory-PC2.md',
    ])
  })
})

describe('selection (spec 5.2)', () => {
  it('picks the nearest registered folder holding the document', async () => {
    const guide = makeGuide()
    const outer = await addOk(guide, folder('outer'), never)
    const inner = await addOk(guide, folder('outer', 'inner'), never)
    writeFileSync(join(base, 'outer', 'a.docx'), 'x')
    writeFileSync(join(base, 'outer', 'inner', 'b.docx'), 'x')
    const a = await guide.getSelection({ kind: 'document', path: join(base, 'outer', 'a.docx') })
    const b = await guide.getSelection({
      kind: 'document',
      path: join(base, 'outer', 'inner', 'b.docx'),
    })
    expect(a.projectId).toBe(outer.project.id)
    expect(b.projectId).toBe(inner.project.id)
    expect(
      guide.documentRelativePath(outer.project.id, join(base, 'outer', 'inner', 'b.docx')),
    ).toBe('inner/b.docx')
  })

  it('remembers "no project" for a document inside a project, and undoes it', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, folder('p'), never)
    const doc = join(base, 'p', 'a.docx')
    writeFileSync(doc, 'x')
    expect((await guide.setSelection({ kind: 'document', path: doc }, null)).projectId).toBeNull()
    expect((await guide.getSelection({ kind: 'document', path: doc })).projectId).toBeNull()
    await guide.setSelection({ kind: 'document', path: doc }, added.project.id)
    expect((await guide.getSelection({ kind: 'document', path: doc })).projectId).toBe(
      added.project.id,
    )
  })

  it('remembers the choice and last chat of an outside document', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, folder('p'), never)
    const doc = join(folder('loose'), 'memo.docx')
    writeFileSync(doc, 'x')
    expect((await guide.getSelection({ kind: 'document', path: doc })).projectId).toBeNull()
    await guide.setSelection({ kind: 'document', path: doc }, added.project.id)
    await guide.recordOutsideChat(doc, added.project.id, 'chat1')
    expect(await guide.getSelection({ kind: 'document', path: doc })).toEqual({
      projectId: added.project.id,
      initialChatId: 'chat1',
    })
    await guide.removeFromList(added.project.id)
    expect((await guide.getSelection({ kind: 'document', path: doc })).projectId).toBeNull()
  })

  it('starts untitled documents without a project unless a listed hint is given', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, folder('p'), never)
    expect(await guide.getSelection({ kind: 'untitled' })).toEqual({
      projectId: null,
      initialChatId: null,
    })
    expect(
      (await guide.getSelection({ kind: 'untitled', projectId: added.project.id })).projectId,
    ).toBe(added.project.id)
    expect((await guide.getSelection({ kind: 'untitled', projectId: 'unknown' })).projectId).toBe(
      null,
    )
  })

  it('keeps the home choice', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, folder('p'), never)
    expect((await guide.getSelection({ kind: 'home' })).projectId).toBeNull()
    await guide.setSelection({ kind: 'home' }, added.project.id)
    expect((await makeGuide().getSelection({ kind: 'home' })).projectId).toBe(added.project.id)
  })

  it('hints at an unregistered project folder above the document and adopts it on request', async () => {
    const guide = makeGuide()
    const root = folder('found')
    writeData(
      root,
      'project.json',
      JSON.stringify({
        version: 1,
        id: 'found1',
        name: 'Found it',
        createdAt: '2026-01-01T00:00:00Z',
      }),
    )
    const doc = join(folder('found', 'sub'), 'x.docx')
    writeFileSync(doc, 'x')
    const selection = await guide.getSelection({ kind: 'document', path: doc })
    expect(selection).toEqual({
      projectId: null,
      initialChatId: null,
      unregisteredProjectHint: { name: 'Found it', folderPath: root },
    })
    const adopted = await guide.adoptFolderHint(doc, never)
    expect(adopted.status === 'added' && adopted.project.id).toBe('found1')
    expect((await guide.getSelection({ kind: 'document', path: doc })).projectId).toBe('found1')
  })
})

describe('new documents and data paths for other modules', () => {
  it('writes a new document only inside the project and never over a file', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, folder('docs'), never)
    const target = join(base, 'docs', 'made.md')
    expect(await guide.writeNewDocument(added.project.id, target, Buffer.from('x'))).toEqual({
      status: 'ok',
    })
    await expect(
      guide.writeNewDocument(added.project.id, target, Buffer.from('y')),
    ).rejects.toThrow()
    expect(readFileSync(target, 'utf8')).toBe('x')
    await expect(
      guide.writeNewDocument(added.project.id, join(base, 'made.md'), Buffer.from('y')),
    ).rejects.toThrow()
    expect(guide.isUnwritable(added.project.id)).toBe(false)
  })

  it('exposes the AI visibility of a project with its ignore file', async () => {
    const guide = makeGuide()
    const added = await addOk(guide, folder('vis'), never)
    expect(await guide.addIgnore(added.project.id, 'drafts/a.docx')).toEqual({ status: 'ok' })
    const visibility = await guide.aiVisibility(added.project.id)
    expect(visibility?.root).toBe(join(base, 'vis'))
    expect(visibility?.isVisible('drafts/a.docx')).toBe(false)
    expect(visibility?.isVisible('drafts/b.docx')).toBe(true)
    expect(visibility?.isVisible('.ieumoffice/memory.md')).toBe(false)
    await guide.removeIgnore(added.project.id, 'drafts/a.docx')
    expect((await guide.aiVisibility(added.project.id))?.isVisible('drafts/a.docx')).toBe(true)
  })
})
