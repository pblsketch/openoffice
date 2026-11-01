import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

const REPO = resolve(__dirname, '../../..')
const bundledVersion = /^\s+version:\s*(\S+)/m.exec(
  readFileSync(join(REPO, 'skills/ieumoffice/SKILL.md'), 'utf-8'),
)![1]!

function fakeMachine(agents: string[]) {
  const home = tempDir()
  for (const dot of agents) mkdirSync(join(home, dot), { recursive: true })
  const userData = join(home, 'userData')
  mkdirSync(userData)
  return { home, env: { GENOFFICE_HOME: home, GENOFFICE_USER_DATA: userData } }
}

describe('genoffice skill', () => {
  it('path prints the bundled SKILL.md', async () => {
    const r = await run(['skill', 'path', '--json'])
    expect(r.code).toBe(0)
    expect(r.json().detail).toMatchObject({ version: bundledVersion })
    expect(existsSync(r.json().detail.path)).toBe(true)
  })

  it('list shows every install row with detection and install state', async () => {
    const m = fakeMachine(['.claude', '.cursor'])
    const r = await run(['skill', 'list', '--json'], { env: m.env })
    expect(r.code).toBe(0)
    const agents = r.json().detail.agents as Array<Record<string, unknown>>
    // tools that read ~/.agents/skills share one row and have none of their own
    expect(agents.map((a) => a.agent)).toEqual(['claude-code', 'agents', 'windsurf'])
    expect(agents.find((a) => a.agent === 'agents')).toMatchObject({
      detected: true,
      legacy: false,
      skills_dir: join(m.home, '.agents', 'skills'),
    })
    const claude = agents.find((a) => a.agent === 'claude-code')!
    expect(claude).toMatchObject({
      detected: true,
      status: 'missing',
      installed_version: null,
      up_to_date: false,
      skills_dir: join(m.home, '.claude', 'skills'),
    })
    expect(agents.find((a) => a.agent === 'windsurf')).toMatchObject({ detected: false })
    expect(r.json().detail.bundled_version).toBe(bundledVersion)
    expect((await run(['skill', '--list'], { env: m.env })).stdout).toContain('2 agent(s) detected')
  })

  it('install writes the skill, records it in the app ledger and is idempotent', async () => {
    const m = fakeMachine(['.claude'])
    const first = await run(['skill', 'install', 'claude-code', '--json'], { env: m.env })
    expect(first.code).toBe(0)
    const path = join(m.home, '.claude', 'skills', 'ieumoffice', 'SKILL.md')
    expect(readFileSync(path, 'utf-8')).toBe(
      readFileSync(join(REPO, 'skills/ieumoffice/SKILL.md'), 'utf-8'),
    )
    expect(first.json().detail.agents[0]).toMatchObject({
      agent: 'claude-code',
      action: 'written',
      status: 'installed',
      installed_version: bundledVersion,
    })
    const settings = JSON.parse(
      readFileSync(join(m.env.GENOFFICE_USER_DATA, 'app-settings.json'), 'utf-8'),
    )
    expect(settings.agentSkillInstalls[path]).toMatchObject({
      version: bundledVersion,
      channel: 'cli',
    })

    const again = await run(['skill', 'install', 'claude-code', '--json'], { env: m.env })
    expect(again.code).toBe(0)
    expect(again.json().warnings).toEqual([expect.objectContaining({ code: 'already_up_to_date' })])
    expect(again.json().detail.agents[0].action).toBe('unchanged')

    const listed = await run(['skill', 'list', '--json'], { env: m.env })
    expect(listed.json().detail.agents.find((a: any) => a.agent === 'claude-code')).toMatchObject({
      status: 'installed',
      up_to_date: true,
    })
  })

  it('install all covers only detected agents; unknown or absent agents are refused', async () => {
    const m = fakeMachine(['.claude', '.codex'])
    const all = await run(['skill', 'install', 'all', '--json'], { env: m.env })
    expect(all.code).toBe(0)
    expect(
      all
        .json()
        .detail.agents.map((a: any) => a.agent)
        .sort(),
    ).toEqual(['agents', 'claude-code'])
    expect(existsSync(join(m.home, '.agents', 'skills', 'ieumoffice', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(m.home, '.codex', 'skills'))).toBe(false)

    const typo = await run(['skill', 'install', 'claud-code', '--json'], { env: m.env })
    expect(typo.code).toBe(1)
    expect(typo.json()).toMatchObject({ error: 'unsupported' })
    expect(typo.json().suggestion).toContain('claude-code')

    const absent = await run(['skill', 'install', 'cursor', '--json'], { env: m.env })
    expect(absent.code).toBe(1)
    expect(absent.json().error).toBe('unsupported')
    expect(existsSync(join(m.home, '.cursor'))).toBe(false)

    const forced = await run(['skill', 'install', 'cursor', '--force', '--json'], { env: m.env })
    expect(forced.code).toBe(0)
    expect(forced.json().detail.agents).toEqual([
      // `all` above already wrote the shared folder Cursor reads
      expect.objectContaining({ agent: 'agents', action: 'unchanged', status: 'installed' }),
    ])
    expect(existsSync(join(m.home, '.agents', 'skills', 'ieumoffice', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(m.home, '.cursor'))).toBe(false)
  })

  it('install agents writes the shared folder for every tool that reads it', async () => {
    const m = fakeMachine(['.gemini'])
    const r = await run(['skill', 'install', 'agents', '--json'], { env: m.env })
    expect(r.code).toBe(0)
    expect(r.json().detail.agents).toEqual([
      expect.objectContaining({
        agent: 'agents',
        action: 'written',
        detected: true,
        legacy: false,
        skills_dir: join(m.home, '.agents', 'skills'),
      }),
    ])
    expect(existsSync(join(m.home, '.gemini', 'skills'))).toBe(false)
  })

  it('refuses to downgrade a newer skill or overwrite a hand-edited one without --force', async () => {
    const m = fakeMachine(['.claude'])
    const dir = join(m.home, '.claude', 'skills', 'ieumoffice')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'SKILL.md')
    writeFileSync(path, '---\nname: ieumoffice\nmetadata:\n  version: 99.0.0\n---\nfuture\n')
    const newer = await run(['skill', 'install', 'claude-code', '--json'], { env: m.env })
    expect(newer.code).toBe(2)
    expect(newer.json()).toMatchObject({ error: 'output_exists', detail: { status: 'newer' } })

    writeFileSync(path, '---\nname: other-skill\n---\nx\n')
    const occupied = await run(['skill', 'install', 'claude-code', '--force', '--json'], {
      env: m.env,
    })
    expect(occupied.code).toBe(2)
    expect(occupied.json().detail.status).toBe('occupied')

    writeFileSync(path, '---\nname: ieumoffice\nmetadata:\n  version: 0.0.1\n---\nold\n')
    const foreign = await run(['skill', 'install', 'claude-code', '--json'], { env: m.env })
    expect(foreign.code).toBe(0)
    expect(foreign.json().detail.agents[0].action).toBe('written')

    writeFileSync(path, readFileSync(path, 'utf-8') + '\nedited\n')
    const modified = await run(['skill', 'install', 'claude-code', '--json'], { env: m.env })
    expect(modified.code).toBe(2)
    expect(modified.json().detail.status).toBe('modified')
    const forced = await run(['skill', 'install', 'claude-code', '--force', '--json'], {
      env: m.env,
    })
    expect(forced.code).toBe(0)
  })

  it('installs into an arbitrary folder with --dir, resolved against the working directory', async () => {
    const m = fakeMachine([])
    const dir = join(m.home, 'elsewhere')
    const r = await run(['skill', 'install', '--dir', 'elsewhere', '--json'], {
      env: m.env,
      cwd: m.home,
    })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, 'ieumoffice', 'SKILL.md'))).toBe(true)
    expect(r.json().detail.agents[0]).toMatchObject({ agent: null, skills_dir: dir })
    const settings = JSON.parse(
      readFileSync(join(m.env.GENOFFICE_USER_DATA, 'app-settings.json'), 'utf-8'),
    )
    expect(Object.keys(settings.agentSkillInstalls)).toEqual([join(dir, 'ieumoffice', 'SKILL.md')])
    const none = await run(['skill', 'install', 'all', '--json'], { env: m.env })
    expect(none.code).toBe(1)
  })

  it('creates the app data folder for the ledger on a machine that never ran the app', async () => {
    const m = fakeMachine(['.claude'])
    const env = { ...m.env, GENOFFICE_USER_DATA: join(m.home, 'never', 'launched') }
    const r = await run(['skill', 'install', 'claude-code', '--json'], { env })
    expect(r.code).toBe(0)
    expect(existsSync(join(env.GENOFFICE_USER_DATA, 'app-settings.json'))).toBe(true)
  })

  it('install all refuses before writing anything when one target is blocked', async () => {
    const m = fakeMachine(['.claude', '.codex'])
    const shared = join(m.home, '.agents', 'skills', 'ieumoffice')
    mkdirSync(shared, { recursive: true })
    writeFileSync(join(shared, 'SKILL.md'), '---\nname: other-skill\n---\nx\n')
    const r = await run(['skill', 'install', 'all', '--json'], { env: m.env })
    expect(r.code).toBe(2)
    expect(r.json().detail).toMatchObject({ agent: 'agents', status: 'occupied' })
    expect(existsSync(join(m.home, '.claude', 'skills', 'ieumoffice'))).toBe(false)
    expect(existsSync(join(m.env.GENOFFICE_USER_DATA, 'app-settings.json'))).toBe(false)
  })

  describe('a copy written into a tool folder before the shared row', () => {
    /** a SKILL.md this app wrote into ~/.codex/skills in an older version, with its ledger entry */
    function withLegacyCodexCopy(dots: string[]) {
      const m = fakeMachine(dots)
      const dir = join(m.home, '.codex', 'skills', 'ieumoffice')
      mkdirSync(dir, { recursive: true })
      const path = join(dir, 'SKILL.md')
      const text = '---\nname: ieumoffice\nmetadata:\n  version: 0.0.1\n---\nold\n'
      writeFileSync(path, text)
      writeFileSync(
        join(m.env.GENOFFICE_USER_DATA, 'app-settings.json'),
        JSON.stringify({
          agentSkillInstalls: {
            [path]: {
              version: '0.0.1',
              sha256: createHash('sha256').update(text).digest('hex'),
              at: '2026-10-01T00:00:00.000Z',
              channel: 'app',
            },
          },
        }),
      )
      return { ...m, path }
    }

    it('is listed as a legacy row next to the shared one', async () => {
      const m = withLegacyCodexCopy(['.codex'])
      const r = await run(['skill', 'list', '--json'], { env: m.env })
      expect(r.code).toBe(0)
      const agents = r.json().detail.agents as Array<Record<string, unknown>>
      expect(agents.map((a) => a.agent)).toEqual(['claude-code', 'agents', 'codex', 'windsurf'])
      expect(agents.find((a) => a.agent === 'codex')).toMatchObject({
        legacy: true,
        detected: true,
        status: 'outdated',
        installed_version: '0.0.1',
        up_to_date: false,
        skills_dir: join(m.home, '.codex', 'skills'),
      })
      expect(r.json().summary).toContain('older copies in codex 0.0.1')
    })

    it('install codex writes the shared folder and brings the old copy up to date', async () => {
      const m = withLegacyCodexCopy(['.codex'])
      const r = await run(['skill', 'install', 'codex', '--json'], { env: m.env })
      expect(r.code).toBe(0)
      expect(r.json().detail.agents).toEqual([
        expect.objectContaining({ agent: 'agents', action: 'written', legacy: false }),
        expect.objectContaining({
          agent: 'codex',
          action: 'written',
          legacy: true,
          status: 'installed',
        }),
      ])
      const bundledText = readFileSync(join(REPO, 'skills/ieumoffice/SKILL.md'), 'utf-8')
      expect(readFileSync(m.path, 'utf-8')).toBe(bundledText)
      expect(
        readFileSync(join(m.home, '.agents', 'skills', 'ieumoffice', 'SKILL.md'), 'utf-8'),
      ).toBe(bundledText)
    })

    it('install all keeps it current too, and a tool folder alone never gets a new copy', async () => {
      const m = withLegacyCodexCopy(['.codex', '.cursor'])
      const r = await run(['skill', 'install', 'all', '--json'], { env: m.env })
      expect(r.code).toBe(0)
      expect(r.json().detail.agents.map((a: any) => `${a.agent}:${a.action}`)).toEqual([
        'agents:written',
        'codex:written',
      ])
      expect(existsSync(join(m.home, '.cursor', 'skills'))).toBe(false)
    })

    it('an old copy edited by hand is left alone with a warning unless --force', async () => {
      const m = withLegacyCodexCopy(['.codex'])
      writeFileSync(m.path, readFileSync(m.path, 'utf-8') + 'edited\n')
      const r = await run(['skill', 'install', 'codex', '--json'], { env: m.env })
      expect(r.code).toBe(0)
      expect(r.json().warnings).toEqual([expect.objectContaining({ code: 'legacy_copy_left' })])
      expect(r.json().detail.agents[1]).toMatchObject({
        agent: 'codex',
        action: 'unchanged',
        status: 'modified',
      })
      expect(readFileSync(m.path, 'utf-8')).toContain('edited')

      const forced = await run(['skill', 'install', 'codex', '--force', '--json'], { env: m.env })
      expect(forced.code).toBe(0)
      expect(forced.json().detail.agents[1]).toMatchObject({ agent: 'codex', action: 'written' })
    })

    it('skill remove codex takes away only that old copy, and remove agents the shared one', async () => {
      const m = withLegacyCodexCopy(['.codex'])
      await run(['skill', 'install', 'agents', '--json'], { env: m.env })
      const shared = join(m.home, '.agents', 'skills', 'ieumoffice', 'SKILL.md')

      const r = await run(['skill', 'remove', 'codex', '--json'], { env: m.env })
      expect(r.code).toBe(0)
      expect(r.json().detail.agents[0]).toMatchObject({
        agent: 'codex',
        action: 'removed',
        legacy: true,
        status: 'missing',
      })
      expect(existsSync(m.path)).toBe(false)
      expect(existsSync(shared)).toBe(true)
      const settings = JSON.parse(
        readFileSync(join(m.env.GENOFFICE_USER_DATA, 'app-settings.json'), 'utf-8'),
      )
      expect(Object.keys(settings.agentSkillInstalls)).toEqual([shared])
      const listed = await run(['skill', 'list', '--json'], { env: m.env })
      expect(listed.json().detail.agents.map((a: any) => a.agent)).not.toContain('codex')

      const again = await run(['skill', 'remove', 'codex', '--json'], { env: m.env })
      expect(again.code).toBe(0)
      expect(again.json().warnings).toEqual([
        expect.objectContaining({ code: 'not_installed_by_app' }),
      ])

      const sharedGone = await run(['skill', 'remove', 'agents', '--json'], { env: m.env })
      expect(sharedGone.json().detail.agents[0]).toMatchObject({ action: 'removed' })
      expect(existsSync(shared)).toBe(false)
    })

    it('skill remove leaves a copy this app did not write', async () => {
      const m = fakeMachine(['.claude'])
      const dir = join(m.home, '.claude', 'skills', 'ieumoffice')
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, 'SKILL.md'),
        '---\nname: ieumoffice\nmetadata:\n  version: 0.0.1\n---\n',
      )
      const r = await run(['skill', 'remove', 'claude-code', '--json'], { env: m.env })
      expect(r.code).toBe(0)
      expect(r.json().detail.agents[0]).toMatchObject({ action: 'unchanged', status: 'foreign' })
      expect(existsSync(join(dir, 'SKILL.md'))).toBe(true)

      const typo = await run(['skill', 'remove', 'codx', '--json'], { env: m.env })
      expect(typo.code).toBe(1)
      expect(typo.json().suggestion).toContain('codex')
    })

    it('is never deleted by an install', async () => {
      const m = withLegacyCodexCopy(['.codex'])
      writeFileSync(m.path, readFileSync(m.path, 'utf-8') + 'edited\n')
      await run(['skill', 'install', 'agents', '--json'], { env: m.env })
      await run(['skill', 'install', 'all', '--json'], { env: m.env })
      expect(existsSync(m.path)).toBe(true)
    })
  })
})
