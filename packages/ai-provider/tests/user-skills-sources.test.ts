/**
 * Where a person's skills are read from and how one skill folder is judged:
 * sources, identifiers, names left out, unreadable reasons, scripts, templates,
 * and the Codex home that is never read.
 */
import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_USER_SKILL_BYTES,
  MAX_USER_SKILL_FILES,
  findSkillUrls,
  listSkillFolderFiles,
  skillContentHash,
  listUserSkills,
  parseUserSkillId,
  readBuiltinSkillsManifest,
  readUserSkillFolder,
  readUserSkillsFrom,
  userSkillId,
  userSkillSources,
  type UserSkill,
} from '../src/user-skills'

const roots: string[] = []
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'user-skills-test-'))
  roots.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function skill(
  base: string,
  folder: string,
  options: {
    name?: string
    description?: string
    frontmatter?: string | false
    files?: Record<string, string>
  } = {},
): string {
  const dir = join(base, folder)
  mkdirSync(dir, { recursive: true })
  const name = options.name ?? folder
  const header =
    options.frontmatter === false
      ? ''
      : (options.frontmatter ??
        `---\nname: ${name}\ndescription: ${options.description ?? 'A test skill.'}\n---\n`)
  writeFileSync(join(dir, 'SKILL.md'), `${header}Do the thing.\n`)
  for (const [path, text] of Object.entries(options.files ?? {})) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

/** A fake home with every source the app reads, plus a Codex home it must not read */
function fakeHome(): { home: string; builtin: string } {
  const home = temp()
  const builtin = join(home, 'app-resources', 'builtin-skills')
  skill(builtin, 'meeting-minutes')
  skill(join(home, '.ieumoffice', 'skills'), 'mine')
  skill(join(home, '.claude', 'skills'), 'claude-one')
  skill(join(home, '.agents', 'skills'), 'agents-one')
  skill(join(home, '.codex', 'skills'), 'codex-home-one')
  const pluginRoot = join(home, '.claude', 'plugins', 'cache', 'hwp', '1')
  skill(join(pluginRoot, 'skills'), 'hwp')
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'hwp@market': [{ installPath: pluginRoot }] } }),
  )
  return { home, builtin }
}

const ids = (skills: UserSkill[]): string[] => skills.map((entry) => entry.id)

describe('identifiers', () => {
  it('joins the source value and the name, with the plugin in between for plugins', () => {
    expect(userSkillId('builtin', 'meeting-minutes')).toBe('builtin:meeting-minutes')
    expect(userSkillId('app', 'mine')).toBe('app:mine')
    expect(userSkillId('user', 'x')).toBe('user:x')
    expect(userSkillId('codex', 'x')).toBe('codex:x')
    expect(userSkillId('project', 'x')).toBe('project:x')
    expect(userSkillId('plugin', 'x', 'hwp')).toBe('plugin:hwp:x')
  })

  it('reads an identifier back and refuses unknown shapes', () => {
    expect(parseUserSkillId('plugin:hwp:x')).toEqual({ source: 'plugin', plugin: 'hwp', name: 'x' })
    expect(parseUserSkillId('app:mine')).toEqual({ source: 'app', name: 'mine' })
    expect(parseUserSkillId('nope:mine')).toBeUndefined()
    expect(parseUserSkillId('app:')).toBeUndefined()
    expect(parseUserSkillId('plugin:x')).toBeUndefined()
    expect(parseUserSkillId('app:bad name')).toBeUndefined()
  })
})

describe('sources', () => {
  it('skips hidden folders such as an install that is still staging', async () => {
    const home = temp()
    const app = join(home, '.ieumoffice', 'skills')
    skill(app, '.ieum-staging-abc123', { name: 'half-copied' })
    skill(app, 'kept')
    const skills = await readUserSkillsFrom([{ source: 'app', dir: app }], { homeDir: home })
    expect(skills.map((entry) => entry.name)).toEqual(['kept'])
  })

  it('lists builtin, app, Claude, plugins, the agents folder, then the project folders', async () => {
    const { home, builtin } = fakeHome()
    const sources = await userSkillSources({ homeDir: home, builtinDir: builtin, projectRoot: 'P' })
    expect(sources).toEqual([
      { source: 'builtin', dir: builtin },
      { source: 'app', dir: join(home, '.ieumoffice', 'skills') },
      { source: 'user', dir: join(home, '.claude', 'skills') },
      {
        source: 'plugin',
        dir: join(home, '.claude', 'plugins', 'cache', 'hwp', '1', 'skills'),
        plugin: 'hwp',
      },
      { source: 'codex', dir: join(home, '.agents', 'skills') },
      { source: 'project', dir: join('P', '.claude', 'skills') },
      { source: 'project', dir: join('P', '.agents', 'skills') },
    ])
  })

  it('leaves out the builtin and project sources when they are not given', async () => {
    const { home } = fakeHome()
    const sources = await userSkillSources({ homeDir: home })
    expect(sources.map((entry) => entry.source)).toEqual(['app', 'user', 'plugin', 'codex'])
  })

  it('never lists a folder inside the Codex home, even when a plugin points there', async () => {
    const home = temp()
    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
    writeFileSync(
      join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ plugins: { 'sneaky@m': [{ installPath: join(home, '.codex', 'p') }] } }),
    )
    const sources = await userSkillSources({
      homeDir: home,
      appSkillsDir: join(home, '.codex', 's'),
    })
    for (const entry of sources) expect(entry.dir.includes('.codex')).toBe(false)
  })

  it('orders plugins by name and goes on when the plugin list is unreadable', async () => {
    const home = temp()
    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
    writeFileSync(
      join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'zeta@m': [{ installPath: join(home, 'z') }],
          'alpha@m': [{ installPath: join(home, 'a-old') }, { installPath: join(home, 'a') }],
        },
      }),
    )
    const sources = await userSkillSources({ homeDir: home })
    expect(sources.filter((entry) => entry.source === 'plugin')).toEqual([
      { source: 'plugin', dir: join(home, 'a', 'skills'), plugin: 'alpha' },
      { source: 'plugin', dir: join(home, 'z', 'skills'), plugin: 'zeta' },
    ])
    writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), '{not json')
    const again = await userSkillSources({ homeDir: home })
    expect(again.map((entry) => entry.source)).toEqual(['app', 'user', 'codex'])
  })
})

describe('the list', () => {
  it('reads every source, with identifiers, and nothing from the Codex home', async () => {
    const { home, builtin } = fakeHome()
    const skills = await listUserSkills({ homeDir: home, builtinDir: builtin })
    expect(ids(skills)).toEqual([
      'builtin:meeting-minutes',
      'app:mine',
      'user:claude-one',
      'plugin:hwp:hwp',
      'codex:agents-one',
    ])
    expect(skills.some((entry) => entry.dir.includes('.codex'))).toBe(false)
  })

  it('skips a skill folder whose real place is inside the Codex home', async () => {
    const home = temp()
    const real = skill(join(home, '.codex', 'skills'), 'linked')
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
    try {
      symlinkSync(real, join(home, '.claude', 'skills', 'linked'), 'junction')
    } catch {
      return // links not allowed here; the source test above still holds
    }
    const skills = await listUserSkills({ homeDir: home })
    expect(ids(skills)).toEqual([])
  })

  it('follows a linked skill folder outside the Codex home', async () => {
    const home = temp()
    const real = skill(join(home, 'elsewhere'), 'shared')
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
    try {
      symlinkSync(real, join(home, '.claude', 'skills', 'shared'), 'junction')
    } catch {
      return
    }
    expect(ids(await listUserSkills({ homeDir: home }))).toEqual(['user:shared'])
  })

  it('never reads the genoffice or ieumoffice skill, in any case, by folder or by name', async () => {
    const home = temp()
    const claude = join(home, '.claude', 'skills')
    skill(claude, 'genoffice')
    skill(claude, 'IeumOffice')
    skill(claude, 'other-folder', { name: 'GenOffice' })
    skill(claude, 'kept')
    skill(join(home, '.ieumoffice', 'skills'), 'ieumoffice')
    const skills = await listUserSkills({ homeDir: home })
    expect(ids(skills)).toEqual(['user:kept'])
  })

  it('does not list the ieumoffice skill installed into the shared ~/.agents folder', async () => {
    // Settings → Integrations writes ~/.agents/skills/ieumoffice for Codex, Cursor and the rest;
    // that folder is also the app's `codex` source, so the reserved name has to keep it out
    const home = temp()
    const shared = join(home, '.agents', 'skills')
    skill(shared, 'ieumoffice')
    skill(shared, 'kept-shared')
    const skills = await listUserSkills({ homeDir: home })
    expect(ids(skills)).toEqual(['codex:kept-shared'])
  })

  it('names a skill by its front matter, not its folder', async () => {
    const home = temp()
    skill(join(home, '.claude', 'skills'), 'folder-name', { name: 'real-name' })
    const [only] = await listUserSkills({ homeDir: home })
    expect(only).toMatchObject({
      id: 'user:real-name',
      name: 'real-name',
      folderName: 'folder-name',
    })
  })

  it('keeps the first of two project folders with the same name and reads both project roots', async () => {
    const home = temp()
    const project = temp()
    skill(join(project, '.claude', 'skills'), 'report', { description: 'from claude' })
    skill(join(project, '.agents', 'skills'), 'report', { description: 'from agents' })
    skill(join(project, '.agents', 'skills'), 'only-agents')
    const skills = await listUserSkills({ homeDir: home, projectRoot: project })
    expect(ids(skills)).toEqual(['project:report', 'project:only-agents'])
    expect(skills[0]?.description).toBe('from claude')
  })

  it('lists the same skill name from two plugins as two skills', async () => {
    const home = temp()
    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
    skill(join(home, 'p1', 'skills'), 'review')
    skill(join(home, 'p2', 'skills'), 'review')
    writeFileSync(
      join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'beta@m': [{ installPath: join(home, 'p2') }],
          'alpha@m': [{ installPath: join(home, 'p1') }],
        },
      }),
    )
    expect(ids(await listUserSkills({ homeDir: home }))).toEqual([
      'plugin:alpha:review',
      'plugin:beta:review',
    ])
  })

  it('lists the same name from different sources side by side', async () => {
    const { home, builtin } = fakeHome()
    skill(join(home, '.ieumoffice', 'skills'), 'meeting-minutes')
    const skills = await listUserSkills({ homeDir: home, builtinDir: builtin })
    expect(ids(skills).filter((id) => id.endsWith(':meeting-minutes'))).toEqual([
      'builtin:meeting-minutes',
      'app:meeting-minutes',
    ])
  })

  it('marks app skills installed from GitHub and builtin skills meant for the agent window only', async () => {
    const home = temp()
    const builtin = join(home, 'builtin')
    skill(builtin, 'find-skills')
    skill(builtin, 'humanizer')
    writeFileSync(
      join(builtin, 'builtin-skills.json'),
      JSON.stringify([
        {
          name: 'find-skills',
          source: 'vercel-labs/skills',
          path: 'skills/find-skills',
          commit: 'abc',
          license: 'MIT',
          agentOnly: true,
          modified: true,
        },
        {
          name: 'humanizer',
          source: 'blader/humanizer',
          path: '',
          commit: 'def',
          license: 'MIT',
          agentOnly: false,
          modified: false,
        },
      ]),
    )
    skill(join(home, '.ieumoffice', 'skills'), 'from-github', {
      files: { '.ieum-source.json': '{"kind":"github"}' },
    })
    skill(join(home, '.ieumoffice', 'skills'), 'local')
    const skills = await listUserSkills({ homeDir: home, builtinDir: builtin })
    const by = (id: string) => skills.find((entry) => entry.id === id)
    expect(by('builtin:find-skills')?.agentOnly).toBe(true)
    expect(by('builtin:humanizer')?.agentOnly).toBe(false)
    expect(by('app:from-github')?.github).toBe(true)
    expect(by('app:local')?.github).toBe(false)
  })
})

async function readOne(...args: Parameters<typeof readUserSkillFolder>): Promise<UserSkill> {
  const read = await readUserSkillFolder(...args)
  if (!read) throw new Error('reserved name')
  return read
}

describe('one skill folder', () => {
  it('reads nothing of a folder with a reserved name', async () => {
    const base = temp()
    expect(await readUserSkillFolder(skill(base, 'GenOffice'), { source: 'app' })).toBeUndefined()
    expect(
      await readUserSkillFolder(skill(base, 'x', { name: 'ieumoffice' }), { source: 'app' }),
    ).toBeUndefined()
  })

  it('reads the title, description and template from the front matter', async () => {
    const base = temp()
    const dir = skill(base, 'home-letter', {
      frontmatter:
        '---\nname: home-letter\ndescription: |\n  Writes a letter home.\n  Two lines.\nmetadata:\n  ieum-title: 가정통신문\n  ieum-template: assets/양식.hwpx\n---\n',
      files: { 'assets/양식.hwpx': 'binary' },
    })
    const read = await readOne(dir, { source: 'app' })
    expect(read).toMatchObject({
      id: 'app:home-letter',
      name: 'home-letter',
      title: '가정통신문',
      description: 'Writes a letter home.\nTwo lines.',
      template: 'assets/양식.hwpx',
      templateExists: true,
      hasScripts: false,
      unreadable: undefined,
    })
  })

  it('falls back to the name for the title and notes a template file that is missing', async () => {
    const dir = skill(temp(), 'plain', {
      frontmatter:
        '---\nname: plain\ndescription: d\nmetadata:\n  ieum-template: assets/gone.docx\n---\n',
    })
    const read = await readOne(dir, { source: 'app' })
    expect(read).toMatchObject({
      title: 'plain',
      template: 'assets/gone.docx',
      templateExists: false,
    })
  })

  it('ignores a template path outside assets/', async () => {
    for (const path of ['../x.docx', 'x.docx', 'assets/../../x.docx', '/abs/assets/x.docx']) {
      const dir = skill(temp(), 'tpl', {
        frontmatter: `---\nname: tpl\ndescription: d\nmetadata:\n  ieum-template: ${path}\n---\n`,
      })
      const read = await readOne(dir, { source: 'app' })
      expect(read.template).toBeUndefined()
      expect(read.templateExists).toBe(false)
    }
  })

  it('tells a skill with scripts by the scripts folder or a script file type', async () => {
    const plain = await readOne(skill(temp(), 'plain', { files: { 'references/notes.md': 'x' } }), {
      source: 'app',
    })
    expect(plain.hasScripts).toBe(false)
    for (const file of [
      'scripts/readme.txt',
      'tool.py',
      'run.SH',
      'a/b.ps1',
      'x.bat',
      'x.cmd',
      'x.js',
      'x.mjs',
      'x.cjs',
      'x.ts',
      'x.exe',
    ]) {
      const read = await readOne(skill(temp(), 'with', { files: { [file]: 'x' } }), {
        source: 'app',
      })
      expect(read.hasScripts, file).toBe(true)
    }
  })

  it('gives the reason a skill cannot be used', async () => {
    const base = temp()
    const noHeader = await readOne(skill(base, 'a', { frontmatter: false }), {
      source: 'user',
    })
    expect(noHeader.unreadable).toBe('no-frontmatter')

    mkdirSync(join(base, 'no-skill-md'))
    const noFile = await readOne(join(base, 'no-skill-md'), { source: 'user' })
    expect(noFile.unreadable).toBe('no-frontmatter')

    const noDescription = await readOne(skill(base, 'b', { frontmatter: '---\nname: b\n---\n' }), {
      source: 'user',
    })
    expect(noDescription.unreadable).toBe('no-frontmatter')

    const badName = await readOne(skill(base, 'c', { name: 'bad name!' }), {
      source: 'user',
    })
    expect(badName.unreadable).toBe('bad-name')
    expect(badName.id).toBe('user:c')

    const noName = await readOne(skill(base, 'd', { frontmatter: '---\ndescription: x\n---\n' }), {
      source: 'user',
    })
    expect(noName.unreadable).toBe('bad-name')

    const missing = await readOne(join(base, 'missing'), { source: 'user' })
    expect(missing.unreadable).toBe('unreadable')
  })

  it('calls a skill too large past 64MB', async () => {
    const dir = skill(temp(), 'big')
    const fd = openSync(join(dir, 'huge.bin'), 'w')
    try {
      ftruncateSync(fd, 64 * 1024 * 1024 + 1)
    } finally {
      closeSync(fd)
    }
    const read = await readOne(dir, { source: 'app' })
    expect(read.unreadable).toBe('too-large')
  })

  it('stops counting past the file count limit', async () => {
    expect(MAX_USER_SKILL_FILES).toBe(5_000)
    expect(MAX_USER_SKILL_BYTES).toBe(64 * 1024 * 1024)
    const dir = skill(temp(), 'many', { files: { 'a.txt': '', 'b.txt': '', 'c.txt': '' } })
    expect((await listSkillFolderFiles(dir, { files: 3, bytes: 1_000 }))?.tooLarge).toBe(true)
    expect((await listSkillFolderFiles(dir, { files: 4, bytes: 1_000 }))?.tooLarge).toBe(false)
  })

  it('counts files and bytes', async () => {
    const dir = skill(temp(), 'count', { files: { 'a.txt': '12345' } })
    const read = await readOne(dir, { source: 'app' })
    expect(read.files).toBe(2)
    expect(read.bytes).toBeGreaterThan(5)
  })
})

describe('links that lead out of a skill folder', () => {
  const FILE_LINK_SKIP =
    'creating file symlinks needs Developer Mode or administrator rights on Windows (EPERM)'

  /** A fake home whose Codex folder holds a sign-in-like file */
  function homeWithCodexFile(): { home: string; secret: string } {
    const home = temp()
    mkdirSync(join(home, '.codex'), { recursive: true })
    const secret = join(home, '.codex', 'auth.json')
    writeFileSync(
      secret,
      '---\nname: leaked\ndescription: secret https://secret.example/\n---\n{"token":"x"}\n',
    )
    return { home, secret }
  }

  /** Make a file link, or `false` when this machine does not allow it */
  function fileLink(target: string, path: string): boolean {
    try {
      symlinkSync(target, path, 'file')
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return false
      throw error
    }
  }

  it('does not read a SKILL.md that links into the Codex home', async (ctx) => {
    const { home, secret } = homeWithCodexFile()
    const dir = join(home, '.claude', 'skills', 'trap')
    mkdirSync(dir, { recursive: true })
    if (!fileLink(secret, join(dir, 'SKILL.md'))) ctx.skip(FILE_LINK_SKIP)
    const read = await readOne(dir, { source: 'user' })
    expect(read.unreadable).toBe('unreadable')
    expect(read.description).toBe('')
    expect(read.name).toBe('trap')
    expect(read.files).toBe(0)
    const [listed] = await listUserSkills({ homeDir: home })
    expect(listed).toMatchObject({ id: 'user:trap', unreadable: 'unreadable', description: '' })
  })

  it('leaves a linked file outside the folder out of the count, the hash and the web addresses', async (ctx) => {
    const { home, secret } = homeWithCodexFile()
    const dir = skill(join(home, '.claude', 'skills'), 'notes', {
      files: { 'references/a.md': 'https://kept.example/' },
    })
    const before = await skillContentHash(dir)
    if (!fileLink(secret, join(dir, 'notes.json'))) ctx.skip(FILE_LINK_SKIP)
    expect(await findSkillUrls(dir)).toEqual(['https://kept.example/'])
    expect(await skillContentHash(dir)).toBe(before)
    expect((await listSkillFolderFiles(dir))?.files.map((file) => file.rel)).toEqual([
      'SKILL.md',
      'references/a.md',
    ])
    expect((await readOne(dir, { source: 'user' })).files).toBe(2)
  })

  it('still reads a linked file that stays inside the folder', async (ctx) => {
    const dir = skill(temp(), 'inside', { files: { 'references/a.md': 'https://in.example/' } })
    if (!fileLink(join(dir, 'references', 'a.md'), join(dir, 'b.md'))) ctx.skip(FILE_LINK_SKIP)
    expect((await listSkillFolderFiles(dir))?.files.map((file) => file.rel)).toEqual([
      'SKILL.md',
      'b.md',
      'references/a.md',
    ])
  })

  it('does not follow a folder link out of the skill folder', async () => {
    const { home } = homeWithCodexFile()
    const dir = skill(join(home, '.claude', 'skills'), 'dirlink')
    symlinkSync(join(home, '.codex'), join(dir, 'codex'), 'junction')
    expect((await listSkillFolderFiles(dir))?.files.map((file) => file.rel)).toEqual(['SKILL.md'])
    expect(await findSkillUrls(dir)).toEqual([])
  })

  it('skips a source folder whose real place is the Codex home, without listing it', async () => {
    const home = temp()
    skill(join(home, '.codex', 'skills'), 'codex-only')
    mkdirSync(join(home, '.claude'), { recursive: true })
    symlinkSync(join(home, '.codex', 'skills'), join(home, '.claude', 'skills'), 'junction')
    const sources = await userSkillSources({ homeDir: home })
    expect(sources.map((entry) => entry.source)).toEqual(['app', 'codex'])
    expect(await listUserSkills({ homeDir: home })).toEqual([])
    expect(
      await readUserSkillsFrom([{ source: 'user', dir: join(home, '.claude', 'skills') }], {
        homeDir: home,
      }),
    ).toEqual([])
  })
})

describe('the builtin list file', () => {
  it('reads entries and the agent-only flag, and an empty list when the file is missing or odd', async () => {
    const dir = temp()
    expect(await readBuiltinSkillsManifest(dir)).toEqual([])
    writeFileSync(
      join(dir, 'builtin-skills.json'),
      JSON.stringify([
        {
          name: 'find-skills',
          source: 's',
          path: 'p',
          commit: 'c',
          license: 'MIT',
          agentOnly: true,
          modified: true,
        },
        {
          name: 'humanizer',
          source: 's',
          path: '',
          commit: 'c',
          license: 'MIT',
          agentOnly: 'yes',
          modified: false,
        },
        { nope: true },
      ]),
    )
    expect(await readBuiltinSkillsManifest(dir)).toEqual([
      {
        name: 'find-skills',
        source: 's',
        path: 'p',
        commit: 'c',
        license: 'MIT',
        agentOnly: true,
        modified: true,
      },
      {
        name: 'humanizer',
        source: 's',
        path: '',
        commit: 'c',
        license: 'MIT',
        agentOnly: false,
        modified: false,
      },
    ])
    writeFileSync(join(dir, 'builtin-skills.json'), '{"not":"a list"}')
    expect(await readBuiltinSkillsManifest(dir)).toEqual([])
  })
})
