/**
 * The skill copy an agent session gets (spec 6.1): only enabled skills and the
 * project's, which one keeps a shared name and what the others are called,
 * "only when called" written into the copy, what is left out, and what is
 * copied again or removed.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  agentSkillAltName,
  buildAgentSkillBundle,
  type AgentSkillInput,
} from '../src/agent-session'
import { listUserSkills, resolveUserSkillStates, userSkillId } from '../src/user-skills'
import type { UserSkillSource } from '../src/user-skills'

const roots: string[] = []
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-skills-test-'))
  roots.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function skillMd(name: string, body: string, extra = ''): string {
  return `---\nname: ${name}\ndescription: test ${name}\n${extra}---\n${body}\n`
}

function skillFolder(base: string, name: string, body = 'Do the thing.', frontmatter = true) {
  const dir = join(base, name)
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), frontmatter ? skillMd(name, body) : `${body}\n`)
  writeFileSync(join(dir, 'scripts', 'run.js'), 'console.log(1)\n')
  return dir
}

function input(
  source: UserSkillSource,
  dir: string,
  name: string,
  more: Partial<AgentSkillInput> = {},
): AgentSkillInput {
  return {
    id: userSkillId(source, name, more.plugin),
    source,
    plugin: undefined,
    name,
    title: name,
    description: `test ${name}`,
    dir,
    invoke: 'auto',
    ...more,
  }
}

describe('the bundle', () => {
  it('copies skills with their scripts into a plugin folder and says where each SKILL.md is', async () => {
    const user = temp()
    const dir = skillFolder(user, 'pdf')
    const bundle = temp()
    const result = await buildAgentSkillBundle(
      [input('user', dir, 'pdf', { title: 'PDF tools' })],
      bundle,
    )
    expect(result.skills).toEqual([
      {
        id: 'user:pdf',
        name: 'pdf',
        source: 'user',
        plugin: undefined,
        title: 'PDF tools',
        description: 'test pdf',
        invoke: 'auto',
        skillMd: join(bundle, 'skills', 'pdf', 'SKILL.md'),
      },
    ])
    expect(
      JSON.parse(readFileSync(join(bundle, '.claude-plugin', 'plugin.json'), 'utf8')).name,
    ).toBe('ieum-skills')
    expect(existsSync(join(bundle, 'skills', 'pdf', 'scripts', 'run.js'))).toBe(true)
    // an "auto" skill keeping its own name is copied byte for byte
    expect(readFileSync(join(bundle, 'skills', 'pdf', 'SKILL.md'), 'utf8')).toBe(
      readFileSync(join(dir, 'SKILL.md'), 'utf8'),
    )
  })

  it('takes only what it is given: the enabled skills and the project’s, from both project folders', async () => {
    const home = temp()
    const project = join(home, 'Project')
    skillFolder(join(home, '.ieumoffice', 'skills'), 'mine')
    skillFolder(join(home, '.claude', 'skills'), 'claude-off')
    skillFolder(join(home, '.claude', 'skills'), 'claude-on')
    skillFolder(join(home, '.agents', 'skills'), 'codex-off')
    skillFolder(join(project, '.claude', 'skills'), 'from-claude-folder')
    skillFolder(join(project, '.agents', 'skills'), 'from-agents-folder')
    const listed = await listUserSkills({ homeDir: home, projectRoot: project })
    const enabled = resolveUserSkillStates(listed, {
      states: { 'user:claude-on': { enabled: true }, 'app:mine': { invoke: 'manual' } },
    }).filter((skill) => skill.enabled)
    const bundle = temp()
    const result = await buildAgentSkillBundle(enabled, bundle)
    expect(result.skills.map((skill) => skill.id).sort()).toEqual([
      'app:mine',
      'project:from-agents-folder',
      'project:from-claude-folder',
      'user:claude-on',
    ])
    expect(readdirSync(join(bundle, 'skills')).sort()).toEqual([
      'claude-on',
      'from-agents-folder',
      'from-claude-folder',
      'mine',
    ])
  })

  it('lets the winner by priority keep a shared name and copies the others under another name', async () => {
    const base = temp()
    const project = skillFolder(join(base, 'project'), 'report', 'project version')
    const app = skillFolder(join(base, 'app'), 'report', 'app version')
    const codex = skillFolder(join(base, 'codex'), 'report', 'codex version')
    const pluginB = skillFolder(join(base, 'b'), 'report', 'plugin b version')
    const pluginA = skillFolder(join(base, 'a'), 'report', 'plugin a version')
    const bundle = temp()
    // given in no particular order
    const result = await buildAgentSkillBundle(
      [
        input('plugin', pluginB, 'report', { plugin: 'bbb' }),
        input('codex', codex, 'report'),
        input('app', app, 'report'),
        input('plugin', pluginA, 'report', { plugin: 'aaa' }),
        input('project', project, 'report'),
      ],
      bundle,
    )
    expect(result.skills.map((skill) => [skill.id, skill.name])).toEqual([
      ['project:report', 'report'],
      ['app:report', 'report--app'],
      ['codex:report', 'report--codex'],
      ['plugin:aaa:report', 'report--plugin-aaa'],
      ['plugin:bbb:report', 'report--plugin-bbb'],
    ])
    expect(result.skipped).toEqual([])
    const read = (name: string) => readFileSync(join(bundle, 'skills', name, 'SKILL.md'), 'utf8')
    expect(read('report')).toContain('project version')
    expect(read('report--app')).toContain('app version')
    expect(read('report--app')).toMatch(/^---\nname: report--app\n/)
    expect(read('report--plugin-bbb')).toContain('plugin b version')
    expect(read('report--plugin-bbb')).toMatch(/^---\nname: report--plugin-bbb\n/)
    // the source folders are never changed
    expect(readFileSync(join(app, 'SKILL.md'), 'utf8')).toBe(skillMd('report', 'app version'))
  })

  it('applies the priority among enabled skills only: a skill alone keeps its name', async () => {
    const base = temp()
    const codex = skillFolder(join(base, 'codex'), 'notes')
    const result = await buildAgentSkillBundle([input('codex', codex, 'notes')], temp())
    expect(result.skills.map((skill) => skill.name)).toEqual(['notes'])
  })

  it('cuts a long other name to 64 characters with a short hash of the identifier', async () => {
    const base = temp()
    const long = `a${'b'.repeat(58)}c` // 60 characters
    const app = skillFolder(join(base, 'app'), long)
    const plugin = skillFolder(join(base, 'plugin'), long)
    const bundle = temp()
    const result = await buildAgentSkillBundle(
      [input('app', app, long), input('plugin', plugin, long, { plugin: 'long-plugin' })],
      bundle,
    )
    const id = `plugin:long-plugin:${long}`
    const hash = createHash('sha256').update(id).digest('hex').slice(0, 6)
    const renamed = result.skills[1]!
    expect(renamed.id).toBe(id)
    expect(renamed.name).toHaveLength(64)
    expect(renamed.name).toBe(`${long.slice(0, 57)}-${hash}`)
    expect(agentSkillAltName({ id, source: 'plugin', plugin: 'long-plugin', name: long })).toBe(
      renamed.name,
    )
    expect(readFileSync(join(bundle, 'skills', renamed.name, 'SKILL.md'), 'utf8')).toMatch(
      new RegExp(`^---\\nname: ${renamed.name}\\n`),
    )
  })

  it('writes "only when called" into the copy only, keeping the other front matter', async () => {
    const base = temp()
    const dir = join(base, 'letter')
    mkdirSync(dir, { recursive: true })
    const source =
      '---\nname: letter\ndescription: Write a letter.\nmetadata:\n  ieum-title: 가정통신문\n  ieum-template: assets/form.hwpx\nlicense: MIT\n---\nBody stays.\n'
    writeFileSync(join(dir, 'SKILL.md'), source)
    const bundle = temp()
    const result = await buildAgentSkillBundle(
      [input('app', dir, 'letter', { invoke: 'manual' })],
      bundle,
    )
    expect(result.skills[0]!.invoke).toBe('manual')
    const copy = readFileSync(join(bundle, 'skills', 'letter', 'SKILL.md'), 'utf8')
    expect(copy).toContain('disable-model-invocation: true')
    expect(copy).toContain('ieum-title: 가정통신문')
    expect(copy).toContain('ieum-template: assets/form.hwpx')
    expect(copy).toContain('license: MIT')
    expect(copy).toContain('name: letter\n')
    expect(copy.endsWith('---\nBody stays.\n')).toBe(true)
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe(source)
  })

  it('writes "used on its own" into the copy when the skill itself says only when called', async () => {
    // Codex is told every skill of the copy; Claude reads the front matter. Both must agree
    // with the person's choice, so a skill turned to "AI decides" says so in its copy.
    const dir = join(temp(), 'letter')
    mkdirSync(dir, { recursive: true })
    const source =
      '---\nname: letter\ndescription: Write a letter.\ndisable-model-invocation: true\nlicense: MIT\n---\nBody stays.\n'
    writeFileSync(join(dir, 'SKILL.md'), source)
    const bundle = temp()
    const result = await buildAgentSkillBundle([input('app', dir, 'letter')], bundle)
    expect(result.skills[0]!.invoke).toBe('auto')
    const copy = readFileSync(join(bundle, 'skills', 'letter', 'SKILL.md'), 'utf8')
    expect(copy).toContain('disable-model-invocation: false')
    expect(copy).not.toContain('disable-model-invocation: true')
    expect(copy).toContain('license: MIT')
    expect(copy.endsWith('---\nBody stays.\n')).toBe(true)
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe(source)
  })

  it('copies again when "only when called" changes with the files unchanged', async () => {
    const dir = skillFolder(temp(), 'deck')
    const bundle = temp()
    const copy = () => readFileSync(join(bundle, 'skills', 'deck', 'SKILL.md'), 'utf8')
    await buildAgentSkillBundle([input('app', dir, 'deck')], bundle)
    expect(copy()).not.toContain('disable-model-invocation')
    await buildAgentSkillBundle([input('app', dir, 'deck', { invoke: 'manual' })], bundle)
    expect(copy()).toContain('disable-model-invocation: true')
    await buildAgentSkillBundle([input('app', dir, 'deck')], bundle)
    expect(copy()).not.toContain('disable-model-invocation')
  })

  it('leaves out a folder without front matter, with an odd name, or gone', async () => {
    const base = temp()
    const plain = skillFolder(base, 'plain', 'no header', false)
    const odd = skillFolder(base, 'odd')
    const result = await buildAgentSkillBundle(
      [
        input('app', plain, 'plain'),
        input('app', odd, 'bad name'),
        input('app', join(base, 'missing'), 'missing'),
      ],
      temp(),
    )
    expect(result.skills).toEqual([])
    expect(result.skipped.map((entry) => [entry.name, entry.reason])).toEqual([
      ['plain', 'no-frontmatter'],
      ['bad name', 'bad-name'],
      ['missing', 'unreadable'],
    ])
  })

  it('never takes the upstream skill or the command-line skill of this app', async () => {
    const base = temp()
    const bundle = temp()
    const result = await buildAgentSkillBundle(
      [
        input('user', skillFolder(base, 'genoffice'), 'genoffice'),
        input('app', skillFolder(base, 'IeumOffice'), 'IeumOffice'),
        // by folder name too, whatever the front matter says
        input('app', skillFolder(join(base, 'x'), 'ieumoffice'), 'renamed'),
        input('app', skillFolder(base, 'kept'), 'kept'),
      ],
      bundle,
    )
    expect(result.skills.map((entry) => entry.name)).toEqual(['kept'])
    // not even listed as skipped
    expect(result.skipped).toEqual([])
    expect(readdirSync(join(bundle, 'skills'))).toEqual(['kept'])
  })

  it('removes a skill that was turned off or is gone', async () => {
    const base = temp()
    const a = skillFolder(base, 'alpha')
    const b = skillFolder(base, 'beta')
    const bundle = temp()
    await buildAgentSkillBundle([input('app', a, 'alpha'), input('user', b, 'beta')], bundle)
    expect(readdirSync(join(bundle, 'skills')).sort()).toEqual(['alpha', 'beta'])
    const result = await buildAgentSkillBundle([input('app', a, 'alpha')], bundle)
    expect(result.skills.map((skill) => skill.name)).toEqual(['alpha'])
    expect(readdirSync(join(bundle, 'skills'))).toEqual(['alpha'])
  })

  it('copies a changed skill again and restores an edited copy', async () => {
    const dir = skillFolder(temp(), 'deck', 'v1')
    const bundle = temp()
    const skills = [input('user', dir, 'deck')]
    await buildAgentSkillBundle(skills, bundle)

    writeFileSync(join(dir, 'SKILL.md'), skillMd('deck', 'v2 longer'))
    const later = new Date(Date.now() + 5_000)
    utimesSync(join(dir, 'SKILL.md'), later, later)
    await buildAgentSkillBundle(skills, bundle)
    expect(readFileSync(join(bundle, 'skills', 'deck', 'SKILL.md'), 'utf8')).toContain('v2')

    // the session wrote into its copy; the next build puts the source back
    writeFileSync(join(bundle, 'skills', 'deck', 'scripts', 'run.js'), 'tampered and longer\n')
    await buildAgentSkillBundle(skills, bundle)
    expect(readFileSync(join(bundle, 'skills', 'deck', 'scripts', 'run.js'), 'utf8')).toBe(
      'console.log(1)\n',
    )
  })

  it('builds one at a time for the same folder', async () => {
    const base = temp()
    const a = skillFolder(base, 'alpha')
    const b = skillFolder(base, 'beta')
    const bundle = temp()
    const [first, second] = await Promise.all([
      buildAgentSkillBundle([input('app', a, 'alpha')], bundle),
      buildAgentSkillBundle([input('app', b, 'beta')], bundle),
    ])
    expect(first.skills.map((skill) => skill.name)).toEqual(['alpha'])
    expect(second.skills.map((skill) => skill.name)).toEqual(['beta'])
    expect(readdirSync(join(bundle, 'skills'))).toEqual(['beta'])
  })

  it('brings a plugin’s other files so ${CLAUDE_PLUGIN_ROOT} resolves, without hooks or MCP', async () => {
    const plugin = temp()
    const skill = join(plugin, 'skills', 'pdf')
    mkdirSync(join(skill, 'scripts'), { recursive: true })
    writeFileSync(
      join(skill, 'SKILL.md'),
      skillMd('pdf', 'Run `${CLAUDE_PLUGIN_ROOT}/scripts/run.js`.'),
    )
    mkdirSync(join(plugin, 'scripts'), { recursive: true })
    writeFileSync(join(plugin, 'scripts', 'run.js'), 'console.log("plugin")\n')
    mkdirSync(join(plugin, 'hooks'), { recursive: true })
    writeFileSync(join(plugin, 'hooks', 'hook.js'), 'console.log("hook")\n')
    mkdirSync(join(plugin, '.claude-plugin'), { recursive: true })
    writeFileSync(join(plugin, '.claude-plugin', 'plugin.json'), '{"name":"upstream"}')
    writeFileSync(join(plugin, '.mcp.json'), '{"mcpServers":{}}')
    const bundle = temp()

    const result = await buildAgentSkillBundle(
      [input('plugin', skill, 'pdf', { plugin: 'upstream' })],
      bundle,
    )

    expect(result.skills.map((entry) => entry.name)).toEqual(['pdf'])
    expect(existsSync(join(bundle, 'scripts', 'run.js'))).toBe(true)
    expect(existsSync(join(bundle, 'hooks'))).toBe(false)
    expect(existsSync(join(bundle, '.mcp.json'))).toBe(false)
    expect(readFileSync(join(bundle, '.claude-plugin', 'plugin.json'), 'utf8')).toContain(
      'ieum-skills',
    )
    // the model reads the variable; Claude expands it to this same root
    expect(readFileSync(join(bundle, 'skills', 'pdf', 'SKILL.md'), 'utf8')).toContain(
      '${CLAUDE_PLUGIN_ROOT}/scripts/run.js',
    )
  })

  it('copies only scripts, references and assets from a plugin root', async () => {
    const plugin = temp()
    const skill = join(plugin, 'skills', 'pdf')
    mkdirSync(skill, { recursive: true })
    writeFileSync(join(skill, 'SKILL.md'), skillMd('pdf', 'Read the references.'))
    for (const dir of ['scripts', 'references', 'assets']) {
      mkdirSync(join(plugin, dir, 'nested'), { recursive: true })
      writeFileSync(join(plugin, dir, 'nested', 'file.txt'), dir)
    }
    // what Claude would load from a plugin root by itself
    writeFileSync(join(plugin, '.lsp.json'), '{"x":{"command":"node","args":["x.js"]}}')
    mkdirSync(join(plugin, 'monitors'), { recursive: true })
    writeFileSync(join(plugin, 'monitors', 'monitors.json'), '[]')
    mkdirSync(join(plugin, 'bin'), { recursive: true })
    writeFileSync(join(plugin, 'bin', 'tool'), 'echo tool\n')
    writeFileSync(join(plugin, 'settings.json'), '{"agent":"x"}')
    mkdirSync(join(plugin, 'hooks'), { recursive: true })
    writeFileSync(join(plugin, 'hooks', 'hooks.json'), '{"hooks":{}}')
    writeFileSync(join(plugin, '.mcp.json'), '{"mcpServers":{}}')
    mkdirSync(join(plugin, 'agents'), { recursive: true })
    writeFileSync(join(plugin, 'agents', 'a.md'), 'agent')
    mkdirSync(join(plugin, 'commands'), { recursive: true })
    writeFileSync(join(plugin, 'commands', 'c.md'), 'command')
    mkdirSync(join(plugin, 'output-styles'), { recursive: true })
    writeFileSync(join(plugin, 'output-styles', 's.md'), 'style')
    writeFileSync(join(plugin, 'README.md'), 'readme')
    const bundle = temp()

    await buildAgentSkillBundle([input('plugin', skill, 'pdf', { plugin: 'upstream' })], bundle)

    for (const dir of ['scripts', 'references', 'assets']) {
      expect(readFileSync(join(bundle, dir, 'nested', 'file.txt'), 'utf8')).toBe(dir)
    }
    for (const entry of [
      '.lsp.json',
      'monitors',
      'bin',
      'settings.json',
      'hooks',
      '.mcp.json',
      'agents',
      'commands',
      'output-styles',
      'README.md',
    ]) {
      expect(existsSync(join(bundle, entry)), entry).toBe(false)
    }
    expect(readdirSync(bundle).sort()).toEqual(
      ['.claude-plugin', '.ieum-skills.json', 'assets', 'references', 'scripts', 'skills'].sort(),
    )
  })
})
