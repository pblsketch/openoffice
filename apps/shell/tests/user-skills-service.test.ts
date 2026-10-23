import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSkillMd } from '@genoffice/ai-provider'
import { readAppSettings, writeAppSetting } from '../src/main/app-settings'
import { builtinSkillsDirFor } from '../src/main/user-skills/builtin-dir'
import {
  createUserSkillsService,
  templateFileNameOf,
  type UserSkillsService,
} from '../src/main/user-skills/user-skills-service'

/**
 * The skills service of the shell's main process (spec 4, 5.1, 5.6, 5.8,
 * 6.1): states, the app-owned folder's writes, and the AI's reads checked
 * again in main. A fake home folder keeps the PC's own skills out.
 */

let root: string
let home: string
let builtin: string
let settingsPath: string
let trash: ReturnType<typeof vi.fn>
let service: UserSkillsService

const appDir = () => join(home, '.ieumoffice', 'skills')

function skill(dir: string, name: string, description: string, extra = '', body = 'Do it.\n') {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n${extra}---\n${body}`,
  )
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skills-service-'))
  home = join(root, 'home')
  builtin = join(root, 'builtin')
  settingsPath = join(root, 'app-settings.json')
  skill(join(builtin, 'meeting-minutes'), 'meeting-minutes', 'Minutes')
  skill(join(builtin, 'find-skills'), 'find-skills', 'Finds skills')
  writeFileSync(
    join(builtin, 'builtin-skills.json'),
    JSON.stringify([
      { name: 'meeting-minutes', agentOnly: false },
      { name: 'find-skills', agentOnly: true },
    ]),
  )
  skill(join(appDir(), 'mine'), 'mine', 'My own', 'metadata:\n  ieum-title: Mine\n', 'Body\n')
  writeFileSync(join(appDir(), 'mine', 'notes.md'), 'notes')
  writeFileSync(join(appDir(), 'mine', 'run.py'), 'print(1)')
  skill(join(home, '.claude', 'skills', 'claude-one'), 'claude-one', 'From Claude')
  skill(join(home, '.agents', 'skills', 'codex-one'), 'codex-one', 'From Codex')
  trash = vi.fn(async (path: string) => {
    rmSync(path, { recursive: true, force: true })
  })
  service = createUserSkillsService({
    homeDir: () => home,
    builtinDir: () => builtin,
    settingsPath: () => settingsPath,
    tempDir: () => join(root, 'temp'),
    trash,
    fetch: () => Promise.reject(new Error('no network in tests')),
  })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const byId = async (id: string) => (await service.list()).find((view) => view.id === id)

describe('the list', () => {
  it('starts builtin and own skills on and other programs’ skills off', async () => {
    const list = await service.list()
    const state = Object.fromEntries(list.map((view) => [view.id, view.enabled]))
    expect(state).toEqual({
      'builtin:find-skills': true,
      'builtin:meeting-minutes': true,
      'app:mine': true,
      'user:claude-one': false,
      'codex:codex-one': false,
    })
    const mine = list.find((view) => view.id === 'app:mine')!
    expect(mine).toMatchObject({ title: 'Mine', owned: true, hasScripts: true, invoke: 'auto' })
    expect(mine.can).toMatchObject({ edit: true, remove: true, export: true, copyToMine: false })
    expect((await byId('builtin:find-skills'))!.agentOnly).toBe(true)
    expect((await byId('builtin:meeting-minutes'))!.can).toMatchObject({
      hide: true,
      remove: false,
      openFolder: false,
      copyToMine: true,
    })
    expect(JSON.stringify(list)).not.toContain(home)
  })

  it('keeps only changed values and refuses to turn a hidden builtin on', async () => {
    expect(await service.setState('user:claude-one', { enabled: true })).toEqual({ ok: true })
    expect((await byId('user:claude-one'))!.enabled).toBe(true)
    await service.setState('user:claude-one', { enabled: false })
    expect(readAppSettings(settingsPath).skills).toEqual({})
    await service.hideBuiltin('builtin:meeting-minutes')
    expect(await service.setState('builtin:meeting-minutes', { enabled: true })).toEqual({
      ok: false,
      reason: 'hidden',
    })
    expect(await service.setState('app:nothing', { enabled: true })).toMatchObject({
      reason: 'not-found',
    })
  })

  it('hides a builtin (off) and shows it again in its initial state', async () => {
    await service.setState('builtin:meeting-minutes', { invoke: 'manual' })
    await service.hideBuiltin('builtin:meeting-minutes')
    expect(await byId('builtin:meeting-minutes')).toMatchObject({ hidden: true, enabled: false })
    expect(readAppSettings(settingsPath).skills).toEqual({ hiddenBuiltins: ['meeting-minutes'] })
    // hiding something that is not a builtin is refused
    expect(await service.hideBuiltin('app:mine')).toMatchObject({ reason: 'invalid' })
    // a restored builtin's old state is gone even if one was written meanwhile
    writeAppSetting(settingsPath, 'skills', {
      states: { 'builtin:meeting-minutes': { invoke: 'manual' } },
      hiddenBuiltins: ['meeting-minutes'],
    })
    service.unhideBuiltins()
    expect(await byId('builtin:meeting-minutes')).toMatchObject({
      hidden: false,
      enabled: true,
      invoke: 'auto',
    })
    expect(readAppSettings(settingsPath).skills).toEqual({})
  })
})

describe('a linked folder in the app’s skills folder', () => {
  it('is read but never written, deleted or edited through when it leads outside', async () => {
    const outside = join(root, 'elsewhere', 'linked')
    skill(outside, 'linked', 'Lives elsewhere')
    writeFileSync(join(outside, 'notes.md'), 'kept')
    try {
      symlinkSync(outside, join(appDir(), 'linked'), 'junction')
    } catch {
      return // links not allowed here
    }
    const view = await byId('app:linked')
    expect(view).toMatchObject({ owned: false })
    expect(view!.can).toMatchObject({ edit: false, remove: false, export: false })

    expect(await service.remove('app:linked')).toEqual({ ok: false, reason: 'not-owned' })
    expect(trash).not.toHaveBeenCalled()
    expect(
      await service.save({ id: 'app:linked', title: 'T', description: 'D', body: 'changed' }),
    ).toEqual({ ok: false, reason: 'not-owned' })
    expect(await service.exportInfo('app:linked')).toEqual({ ok: false, reason: 'not-owned' })
    expect(readFileSync(join(outside, 'SKILL.md'), 'utf8')).toContain('Lives elsewhere')
    expect(readFileSync(join(outside, 'notes.md'), 'utf8')).toBe('kept')
    // an own folder that is really there stays owned
    expect(await byId('app:mine')).toMatchObject({ owned: true })
  })
})

describe('removing and copying', () => {
  it('sends only own skills to the trash', async () => {
    expect(await service.remove('user:claude-one')).toEqual({ ok: false, reason: 'not-owned' })
    expect(await service.remove('builtin:meeting-minutes')).toMatchObject({ reason: 'not-owned' })
    expect(trash).not.toHaveBeenCalled()
    await service.setState('app:mine', { invoke: 'manual' })
    expect(await service.remove('app:mine')).toEqual({ ok: true })
    expect(trash).toHaveBeenCalledWith(join(appDir(), 'mine'))
    expect(readAppSettings(settingsPath).skills).toEqual({})
  })

  it('copies another source’s skill into mine and turns the original off', async () => {
    await service.setState('user:claude-one', { enabled: true })
    expect(await service.copyToMine('user:claude-one', false)).toEqual({
      ok: true,
      id: 'app:claude-one',
    })
    expect(existsSync(join(appDir(), 'claude-one', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(home, '.claude', 'skills', 'claude-one', 'SKILL.md'))).toBe(true)
    expect(await byId('user:claude-one')).toMatchObject({ enabled: false })
    expect(await byId('app:claude-one')).toMatchObject({ enabled: true })
    // no work folders are left behind
    expect(readdirSync(appDir()).sort()).toEqual(['claude-one', 'mine'])
  })

  it('asks before overwriting an own skill of the same name', async () => {
    skill(join(home, '.agents', 'skills', 'mine'), 'mine', 'Codex copy')
    expect(await service.copyToMine('codex:mine', false)).toEqual({ ok: false, reason: 'exists' })
    expect(trash).not.toHaveBeenCalled()
    expect(await service.copyToMine('codex:mine', true)).toMatchObject({ ok: true })
    expect(trash).toHaveBeenCalledTimes(1)
    const text = readFileSync(join(appDir(), 'mine', 'SKILL.md'), 'utf8')
    expect(parseSkillMd(text)!.description).toBe('Codex copy')
  })

  it('keeps the own skill when it cannot go to the trash, and says why', async () => {
    skill(join(home, '.agents', 'skills', 'mine'), 'mine', 'Codex copy')
    trash.mockImplementation(async () => {
      throw new Error('no trash here')
    })
    expect(await service.copyToMine('codex:mine', true)).toEqual({
      ok: false,
      reason: 'trash-failed',
    })
    expect(
      parseSkillMd(readFileSync(join(appDir(), 'mine', 'SKILL.md'), 'utf8'))!.description,
    ).toBe('My own')
    expect(readFileSync(join(appDir(), 'mine', 'notes.md'), 'utf8')).toBe('notes')
    expect(readdirSync(appDir())).toEqual(['mine'])
  })

  it('does not copy an own skill or a builtin that is not there', async () => {
    expect(await service.copyToMine('app:mine', false)).toMatchObject({ reason: 'invalid' })
    expect(await service.copyToMine('builtin:none', false)).toMatchObject({ reason: 'not-found' })
  })
})

describe('saving skills', () => {
  const card = {
    title: '가정통신문',
    name: 'home-letter',
    description: 'Writes a home letter.',
    body: '1. Greet.\n2. List what to bring.\n',
    invoke: 'auto' as const,
  }

  it('refuses names outside the strict rule and empty fields', async () => {
    expect(await service.saveFromCard({ ...card, name: 'Home_Letter' })).toEqual({
      ok: false,
      reason: 'bad-name',
      problem: 'characters',
    })
    expect(await service.saveFromCard({ ...card, name: 'ieumoffice' })).toMatchObject({
      problem: 'reserved',
    })
    expect(await service.saveFromCard({ ...card, description: ' ' })).toMatchObject({
      reason: 'empty-description',
    })
    expect(await service.saveFromCard({ ...card, body: '' })).toMatchObject({
      reason: 'empty-body',
    })
    expect(await service.saveFromCard({ ...card, name: 'mine' })).toMatchObject({
      reason: 'name-taken',
    })
    expect(existsSync(join(appDir(), 'home-letter'))).toBe(false)
  })

  it('writes the standard shape with the title and the template asset', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4, 9])
    const saved = await service.saveFromCard({
      ...card,
      invoke: 'manual',
      template: { bytes, fileName: '양식.hwpx' },
    })
    expect(saved).toEqual({ ok: true, id: 'app:home-letter' })
    const dir = join(appDir(), 'home-letter')
    const parsed = parseSkillMd(readFileSync(join(dir, 'SKILL.md'), 'utf8'))!
    expect(parsed).toMatchObject({
      name: 'home-letter',
      description: 'Writes a home letter.',
      metadata: { 'ieum-title': '가정통신문', 'ieum-template': 'assets/양식.hwpx' },
      body: card.body,
    })
    expect([...readFileSync(join(dir, 'assets', '양식.hwpx'))]).toEqual([...bytes])
    expect(await byId('app:home-letter')).toMatchObject({
      enabled: true,
      invoke: 'manual',
      templateExists: true,
    })
  })

  it('takes a template only as bytes with a document file name', async () => {
    const doc = join(root, 'docs', 'form.docx')
    mkdirSync(join(root, 'docs'))
    writeFileSync(doc, 'docx bytes')
    // a path is never read here: the card hands over bytes only
    expect(
      await service.saveFromCard({
        ...card,
        template: { sourcePath: doc, fileName: 'form.docx' } as never,
      }),
    ).toEqual({ ok: false, reason: 'bad-template' })
    expect(existsSync(join(appDir(), 'home-letter'))).toBe(false)
    expect(
      await service.saveFromCard({
        ...card,
        name: 'other',
        template: { bytes: new Uint8Array([1]), fileName: 'auth.json' },
      }),
    ).toEqual({ ok: false, reason: 'bad-template' })
  })

  it('changes an own skill in place and keeps its template unless a new one comes', async () => {
    await service.saveFromCard({
      ...card,
      template: { bytes: new Uint8Array([1]), fileName: 'a.docx' },
    })
    expect(
      await service.saveFromCard({
        ...card,
        targetId: 'app:home-letter',
        body: 'New steps\n',
        invoke: 'manual',
      }),
    ).toEqual({ ok: true, id: 'app:home-letter' })
    const parsed = parseSkillMd(readFileSync(join(appDir(), 'home-letter', 'SKILL.md'), 'utf8'))!
    expect(parsed.body).toBe('New steps\n')
    expect(parsed.metadata['ieum-template']).toBe('assets/a.docx')
    expect((await byId('app:home-letter'))!.invoke).toBe('manual')
  })

  it('renames an own skill with its folder and carries its state', async () => {
    await service.setState('app:mine', { invoke: 'manual' })
    expect(
      await service.save({
        id: 'app:mine',
        title: 'Mine',
        name: 'mine-2',
        description: 'D',
        body: 'B',
      }),
    ).toEqual({ ok: true, id: 'app:mine-2' })
    expect(existsSync(join(appDir(), 'mine'))).toBe(false)
    expect(existsSync(join(appDir(), 'mine-2', 'notes.md'))).toBe(true)
    expect((await byId('app:mine-2'))!.invoke).toBe('manual')
  })

  it('saves a card for another source’s skill as a copy and turns the original off', async () => {
    expect(
      await service.saveFromCard({
        ...card,
        name: 'meeting-minutes',
        targetId: 'builtin:meeting-minutes',
      }),
    ).toEqual({ ok: true, id: 'app:meeting-minutes' })
    expect(await byId('builtin:meeting-minutes')).toMatchObject({ enabled: false })
    const text = readFileSync(join(appDir(), 'meeting-minutes', 'SKILL.md'), 'utf8')
    expect(parseSkillMd(text)!.body).toBe(card.body)
    // the builtin itself is untouched
    expect(readFileSync(join(builtin, 'meeting-minutes', 'SKILL.md'), 'utf8')).toContain('Minutes')
  })

  it('refuses the settings editor on a skill that is not mine', async () => {
    expect(
      await service.save({ id: 'user:claude-one', title: 'T', description: 'D', body: 'B' }),
    ).toEqual({ ok: false, reason: 'not-owned' })
  })

  it('saves a new skill without a title and writes no title into it', async () => {
    expect(await service.saveFromCard({ ...card, title: ' ' })).toEqual({
      ok: true,
      id: 'app:home-letter',
    })
    const parsed = parseSkillMd(readFileSync(join(appDir(), 'home-letter', 'SKILL.md'), 'utf8'))!
    expect(parsed.name).toBe('home-letter')
    expect(parsed.metadata).not.toHaveProperty('ieum-title')
    expect(await byId('app:home-letter')).toMatchObject({ title: 'home-letter' })
  })

  it('keeps the title an own skill already has when an edit gives none', async () => {
    expect(
      await service.save({ id: 'app:mine', title: '', description: 'D', body: 'New body\n' }),
    ).toEqual({ ok: true, id: 'app:mine' })
    const parsed = parseSkillMd(readFileSync(join(appDir(), 'mine', 'SKILL.md'), 'utf8'))!
    expect(parsed.metadata['ieum-title']).toBe('Mine')
    expect(parsed.body).toBe('New body\n')
    expect(await byId('app:mine')).toMatchObject({ title: 'Mine' })
  })

  it('keeps the title through a rename that gives none', async () => {
    expect(
      await service.save({
        id: 'app:mine',
        title: '',
        name: 'mine-2',
        description: 'D',
        body: 'B',
      }),
    ).toEqual({ ok: true, id: 'app:mine-2' })
    expect(await byId('app:mine-2')).toMatchObject({ title: 'Mine' })
  })

  it('a new title given on an edit replaces the old one', async () => {
    await service.save({ id: 'app:mine', title: 'Ours', description: 'D', body: 'B' })
    expect(await byId('app:mine')).toMatchObject({ title: 'Ours' })
  })

  it('makes up a name for a new skill with neither a name nor a title', async () => {
    const saved = await service.save({ title: '', description: 'D', body: 'B' })
    expect(saved.ok).toBe(true)
    const id = (saved as { id: string }).id
    expect(id).toMatch(/^app:skill-[a-z0-9]{6}$/)
    const name = id.slice('app:'.length)
    const parsed = parseSkillMd(readFileSync(join(appDir(), name, 'SKILL.md'), 'utf8'))!
    expect(parsed.name).toBe(name)
    expect(parsed.metadata).not.toHaveProperty('ieum-title')
  })

  it('names a new skill from its title when no name is given', async () => {
    const saved = await service.save({ title: 'Weekly Report', description: 'D', body: 'B' })
    expect(saved).toEqual({ ok: true, id: 'app:weekly-report' })
    expect(await service.checkName('weekly-report')).toEqual({ ok: false, problem: 'taken' })
    expect(await service.checkName('weekly-report', 'app:weekly-report')).toEqual({ ok: true })
    expect(await service.suggestName('Weekly Report')).toBe('weekly-report-2')
  })
})

describe('the AI’s reads, checked again in main', () => {
  it('gives an enabled skill’s body without front matter and its text files', async () => {
    const read = await service.aiRead('app:mine')
    expect(read).toEqual({
      ok: true,
      skill: {
        id: 'app:mine',
        name: 'mine',
        title: 'Mine',
        body: 'Body\n',
        files: ['notes.md'],
        template: undefined,
        hasScripts: true,
      },
    })
  })

  it('refuses skills that are off, for the agent window only, or unknown', async () => {
    expect(await service.aiRead('user:claude-one')).toEqual({ ok: false, reason: 'disabled' })
    expect(await service.aiRead('builtin:find-skills')).toEqual({
      ok: false,
      reason: 'agent-only',
    })
    expect(await service.aiRead('app:none')).toEqual({ ok: false, reason: 'not-found' })
    expect(await service.aiReadFile('user:claude-one', 'SKILL.md')).toMatchObject({
      reason: 'disabled',
    })
    expect(await service.aiReadFile('builtin:find-skills', 'SKILL.md')).toMatchObject({
      reason: 'agent-only',
    })
    await service.setState('app:mine', { enabled: false })
    expect(await service.aiRead('app:mine')).toEqual({ ok: false, reason: 'disabled' })
  })

  it('reads one text file inside the folder and refuses the rest', async () => {
    expect(await service.aiReadFile('app:mine', 'notes.md')).toEqual({ ok: true, text: 'notes' })
    expect(
      await service.aiReadFile('app:mine', '../../.claude/skills/claude-one/SKILL.md'),
    ).toEqual({ ok: false, reason: 'outside' })
    expect(await service.aiReadFile('app:mine', join(home, 'x.md'))).toMatchObject({
      reason: 'outside',
    })
    expect(await service.aiReadFile('app:mine', 'run.py')).toEqual({
      ok: false,
      reason: 'not-text',
    })
    expect(await service.aiReadFile('app:mine', 'missing.md')).toEqual({
      ok: false,
      reason: 'not-found',
    })
  })

  it('refuses a file over the size limit', async () => {
    const small = createUserSkillsService({
      homeDir: () => home,
      builtinDir: () => builtin,
      settingsPath: () => settingsPath,
      tempDir: () => join(root, 'temp'),
      trash,
      fetch: () => Promise.reject(new Error('no network')),
      aiFileMaxBytes: 3,
    })
    expect(await small.aiReadFile('app:mine', 'notes.md')).toEqual({
      ok: false,
      reason: 'too-large',
    })
  })
})

describe('the agent session’s skills', () => {
  it('takes every enabled skill, the project’s too, and leaves off ones out', async () => {
    const project = join(root, 'project')
    skill(join(project, '.claude', 'skills', 'proj'), 'proj', 'Project skill')
    await service.setState('codex:codex-one', { enabled: true, invoke: 'manual' })
    await service.hideBuiltin('builtin:meeting-minutes')
    const skills = await service.enabledForAgent(project)
    expect(skills.map((entry) => entry.id).sort()).toEqual([
      'app:mine',
      'builtin:find-skills',
      'codex:codex-one',
      'project:proj',
    ])
    expect(skills.find((entry) => entry.id === 'codex:codex-one')).toMatchObject({
      invoke: 'manual',
      dir: join(home, '.agents', 'skills', 'codex-one'),
    })
    expect(skills.find((entry) => entry.id === 'builtin:find-skills')).toMatchObject({
      agentOnly: true,
      dir: join(builtin, 'find-skills'),
    })
  })

  it('finds the builtin folder in a development run and once packaged', () => {
    expect(
      builtinSkillsDirFor({
        isPackaged: false,
        resourcesPath: 'R',
        appPath: join('repo', 'shell'),
      }),
    ).toBe(join('repo', 'shell', 'resources', 'builtin-skills'))
    expect(builtinSkillsDirFor({ isPackaged: true, resourcesPath: 'R', appPath: 'A' })).toBe(
      join('R', 'builtin-skills'),
    )
  })
})

describe('template file names', () => {
  it('keeps a plain document name and refuses the rest', () => {
    expect(templateFileNameOf('양식.hwpx')).toBe('양식.hwpx')
    expect(templateFileNameOf('C:\\docs\\form.docx')).toBe('form.docx')
    expect(templateFileNameOf('a:b?.docx')).toBe('ab.docx')
    expect(templateFileNameOf('auth.json')).toBeUndefined()
    expect(templateFileNameOf('.docx')).toBeUndefined()
    expect(templateFileNameOf('run.exe')).toBeUndefined()
  })
})

describe('a skill’s template file for its copy (spec 5.7)', () => {
  const withTemplate = (name: string, template: string) =>
    skill(
      join(appDir(), name),
      name,
      'Has a template',
      `metadata:\n  ieum-template: ${template}\n`,
      'Fill it.\n',
    )

  it('gives the template’s place inside the skill folder; nothing is read', async () => {
    withTemplate('letter', 'assets/letter.hwpx')
    mkdirSync(join(appDir(), 'letter', 'assets'), { recursive: true })
    writeFileSync(join(appDir(), 'letter', 'assets', 'letter.hwpx'), 'HWPX')
    const found = await service.templateFile('app:letter')
    expect(found).toMatchObject({ ok: true, fileName: 'letter.hwpx', title: 'letter' })
    if (found.ok) expect(readFileSync(found.path, 'utf8')).toBe('HWPX')
  })

  it('says the template file is missing when it is gone', async () => {
    withTemplate('gone', 'assets/gone.docx')
    expect(await service.templateFile('app:gone')).toEqual({ ok: false, reason: 'no-template' })
  })

  it('has no template for a skill that names none, and refuses an off or unknown skill', async () => {
    expect(await service.templateFile('app:mine')).toEqual({ ok: false, reason: 'no-template' })
    expect(await service.templateFile('user:claude-one')).toEqual({
      ok: false,
      reason: 'disabled',
    })
    expect(await service.templateFile('app:none')).toEqual({ ok: false, reason: 'not-found' })
  })
})
