import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  agentConfigDir,
  agentIds,
  agentLabel,
  agentPresent,
  agentTarget,
  buildSkillZip,
  bundledSkillFrom,
  compareVersions,
  detectAgents,
  installRowFor,
  installSkill,
  isSharedReader,
  legacySkillCopies,
  parseSkillFrontmatter,
  readInstallState,
  skillRows,
  skillTargetIds,
  uninstallSkill,
  type SkillLedger,
} from '../src/agent-skills'

const skillText = (version: string, body = 'Run `ieumoffice --version` first.') =>
  `---\nname: ieumoffice\ndescription: test\nmetadata:\n  version: ${version}\n  cli: '>=0.4.0'\n---\n\n${body}\n`

const bundled = (version = '1.2.0') => bundledSkillFrom(Buffer.from(skillText(version)))

function home(): string {
  return mkdtempSync(join(tmpdir(), 'genoffice-skills-'))
}

describe('detectAgents', () => {
  it('lists the install rows whose tool is present, honouring the env overrides', () => {
    const h = home()
    mkdirSync(join(h, '.claude'))
    mkdirSync(join(h, '.cursor'))
    mkdirSync(join(h, '.codeium', 'windsurf'), { recursive: true })
    const found = detectAgents({}, h)
    // Cursor reads ~/.agents/skills, so it brings the shared row, not a row of its own
    expect(found.map((a) => a.id)).toEqual(['claude-code', 'agents', 'windsurf'])
    expect(found[0]!.skillsDir).toBe(join(h, '.claude', 'skills'))
    expect(found[1]!.skillsDir).toBe(join(h, '.agents', 'skills'))
    expect(found[2]!.skillsDir).toBe(join(h, '.codeium', 'windsurf', 'skills'))
    expect(found.some((a) => a.legacy)).toBe(false)
  })

  it('shows the shared row for ~/.agents itself or any tool that reads it', () => {
    const none = home()
    expect(detectAgents({}, none)).toEqual([])
    expect(agentPresent('agents', {}, none)).toBe(false)

    const shared = home()
    mkdirSync(join(shared, '.agents'))
    expect(detectAgents({}, shared).map((a) => a.id)).toEqual(['agents'])

    for (const dot of ['.cursor', '.gemini', '.copilot', join('.config', 'opencode')]) {
      const h = home()
      mkdirSync(join(h, dot), { recursive: true })
      expect(detectAgents({}, h).map((a) => a.id)).toEqual(['agents'])
    }

    // CODEX_HOME and XDG_CONFIG_HOME move the probed folders; ~/.codex alone then means nothing
    const moved = home()
    mkdirSync(join(moved, '.codex'))
    expect(detectAgents({ CODEX_HOME: join(moved, 'nowhere') }, moved)).toEqual([])
    mkdirSync(join(moved, 'codex-elsewhere'))
    expect(
      detectAgents({ CODEX_HOME: join(moved, 'codex-elsewhere') }, moved).map((a) => a.id),
    ).toEqual(['agents'])
    mkdirSync(join(moved, 'xdg', 'opencode'), { recursive: true })
    expect(agentPresent('opencode', { XDG_CONFIG_HOME: join(moved, 'xdg') }, moved)).toBe(true)
  })

  it('keeps a label, a dotfolder and a presence check for every tool, row or not', () => {
    const h = home()
    mkdirSync(join(h, 'codex-elsewhere'))
    const env = { CODEX_HOME: join(h, 'codex-elsewhere') }
    expect(agentLabel('codex')).toBe('Codex')
    expect(agentLabel('copilot')).toBe('GitHub Copilot')
    expect(agentConfigDir('codex', env, h)).toBe(join(h, 'codex-elsewhere'))
    expect(agentPresent('codex', env, h)).toBe(true)
    expect(agentPresent('cursor', env, h)).toBe(false)
    expect(agentTarget('codex', env, h)).toMatchObject({
      skillsDir: join(h, 'codex-elsewhere', 'skills'),
      legacy: true,
    })
    expect(agentTarget('claude-code', env, h)!.legacy).toBeUndefined()
  })

  it('sends a new install for a reader tool to the shared row', () => {
    expect(skillTargetIds()).toEqual(['claude-code', 'agents', 'windsurf'])
    expect(agentIds()).toEqual([
      'claude-code',
      'agents',
      'codex',
      'cursor',
      'gemini',
      'copilot',
      'opencode',
      'windsurf',
    ])
    for (const id of ['codex', 'cursor', 'gemini', 'copilot', 'opencode'] as const) {
      expect(isSharedReader(id)).toBe(true)
      expect(installRowFor(id)).toBe('agents')
    }
    for (const id of ['claude-code', 'agents', 'windsurf'] as const) {
      expect(isSharedReader(id)).toBe(false)
      expect(installRowFor(id)).toBe(id)
    }
  })
})

describe('legacySkillCopies / skillRows', () => {
  it('lists a copy this app wrote in the own folder of a reader tool, and nothing else there', () => {
    const h = home()
    mkdirSync(join(h, '.claude'))
    mkdirSync(join(h, '.codex'))
    mkdirSync(join(h, '.gemini'))
    const b = bundled()
    const ledger: SkillLedger = {}
    // written by this app before the shared row existed
    const codexCopy = installSkill(join(h, '.codex', 'skills'), b, ledger)
    // someone else's copy in Gemini's folder: not ours, not listed
    mkdirSync(join(h, '.gemini', 'skills', 'ieumoffice'), { recursive: true })
    writeFileSync(join(h, '.gemini', 'skills', 'ieumoffice', 'SKILL.md'), skillText('1.0.0'))

    const copies = legacySkillCopies(ledger, {}, h)
    expect(copies).toEqual([
      { id: 'codex', label: 'Codex', skillsDir: join(h, '.codex', 'skills'), legacy: true },
    ])
    expect(legacySkillCopies(ledger, {}, h, 'codex')).toHaveLength(1)
    expect(legacySkillCopies(ledger, {}, h, 'agents')).toHaveLength(1)
    expect(legacySkillCopies(ledger, {}, h, 'gemini')).toEqual([])
    expect(legacySkillCopies(ledger, {}, h, 'claude-code')).toEqual([])

    expect(skillRows(ledger, {}, h).map((r) => r.id)).toEqual(['claude-code', 'agents', 'codex'])

    // a copy removed by hand leaves a stale ledger entry: the row goes, nothing is offered there
    rmSync(join(h, '.codex', 'skills', 'ieumoffice'), { recursive: true })
    expect(ledger[codexCopy]).toBeDefined()
    expect(legacySkillCopies(ledger, {}, h)).toEqual([])
    expect(skillRows(ledger, {}, h).map((r) => r.id)).toEqual(['claude-code', 'agents'])
  })

  it('never deletes a legacy copy when the shared row is installed', () => {
    const h = home()
    mkdirSync(join(h, '.cursor'))
    const b = bundled('1.2.0')
    const ledger: SkillLedger = {}
    const old = installSkill(join(h, '.cursor', 'skills'), bundled('1.1.0'), ledger)
    installSkill(agentTarget('agents', {}, h)!.skillsDir, b, ledger)
    expect(existsSync(old)).toBe(true)
    expect(readInstallState(join(h, '.cursor', 'skills'), b, ledger)).toMatchObject({
      status: 'outdated',
      older: true,
    })
    expect(skillRows(ledger, {}, h).map((r) => r.id)).toEqual(['agents', 'cursor'])
  })
})

describe('parseSkillFrontmatter / compareVersions', () => {
  it('reads name and metadata.version', () => {
    expect(parseSkillFrontmatter(skillText('2.1.0'))).toEqual({
      name: 'ieumoffice',
      version: '2.1.0',
    })
    expect(parseSkillFrontmatter('---\nname: other\n---\nx')).toEqual({
      name: 'other',
      version: '',
    })
    expect(parseSkillFrontmatter('no front matter')).toBeNull()
  })

  it('orders numeric semver and sorts junk lowest', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0)
    expect(compareVersions('', '0.0.1')).toBe(-1)
  })
})

describe('readInstallState', () => {
  it('walks the seven states of the design table', () => {
    const dir = join(home(), 'skills')
    const b = bundled('1.2.0')
    const ledger: SkillLedger = {}
    expect(readInstallState(dir, b, ledger).status).toBe('missing')

    // our install, current
    const path = installSkill(dir, b, ledger)
    expect(path).toBe(join(dir, 'ieumoffice', 'SKILL.md'))
    expect(readFileSync(path, 'utf-8')).toBe(b.text)
    expect(ledger[path]).toMatchObject({ version: '1.2.0', sha256: b.sha256, channel: 'app' })
    expect(readInstallState(dir, b, ledger)).toMatchObject({
      status: 'installed',
      installedVersion: '1.2.0',
    })

    // a newer bundle arrives
    expect(readInstallState(dir, bundled('1.3.0'), ledger)).toMatchObject({
      status: 'outdated',
      installedVersion: '1.2.0',
      older: true,
    })

    // the user edits the file
    writeFileSync(path, skillText('1.2.0', 'edited by hand'))
    expect(readInstallState(dir, b, ledger).status).toBe('modified')

    // written by someone else (no ledger entry): older → offers an update, current → nothing
    writeFileSync(path, skillText('1.1.0'))
    expect(readInstallState(dir, b, {})).toMatchObject({
      status: 'foreign',
      installedVersion: '1.1.0',
      older: true,
    })
    writeFileSync(path, skillText('1.2.0'))
    expect(readInstallState(dir, b, {})).toMatchObject({ status: 'foreign', older: false })

    // newer than the bundle, whoever wrote it
    writeFileSync(path, skillText('1.3.0'))
    expect(readInstallState(dir, b, ledger)).toMatchObject({
      status: 'newer',
      installedVersion: '1.3.0',
    })

    // the folder holds something else
    writeFileSync(path, '---\nname: other-skill\n---\n')
    expect(readInstallState(dir, b, ledger).status).toBe('occupied')
    mkdirSync(join(dir, 'ieumoffice', 'nested'))
    writeFileSync(path, 'not a skill at all')
    expect(readInstallState(dir, b, ledger).status).toBe('occupied')
  })
})

describe('uninstallSkill', () => {
  it('removes only what this app wrote and keeps a folder that holds other files', () => {
    const dir = join(home(), 'skills')
    const b = bundled()
    const ledger: SkillLedger = {}
    // foreign file: never touched
    mkdirSync(join(dir, 'ieumoffice'), { recursive: true })
    writeFileSync(join(dir, 'ieumoffice', 'SKILL.md'), skillText('1.0.0'))
    expect(uninstallSkill(dir, ledger)).toBe(false)
    expect(existsSync(join(dir, 'ieumoffice', 'SKILL.md'))).toBe(true)

    const path = installSkill(dir, b, ledger)
    writeFileSync(join(dir, 'ieumoffice', 'notes.txt'), 'mine')
    expect(uninstallSkill(dir, ledger)).toBe(true)
    expect(existsSync(path)).toBe(false)
    expect(existsSync(join(dir, 'ieumoffice', 'notes.txt'))).toBe(true)
    expect(ledger[path]).toBeUndefined()

    installSkill(dir, b, ledger)
    // an empty folder goes with the file
    const dir2 = join(home(), 'skills')
    const p2 = installSkill(dir2, b, ledger)
    expect(uninstallSkill(dir2, ledger)).toBe(true)
    expect(existsSync(join(dir2, 'ieumoffice'))).toBe(false)
    expect(existsSync(p2)).toBe(false)
  })
})

describe('buildSkillZip', () => {
  it('holds genoffice/SKILL.md with the exact bundled bytes', async () => {
    const b = bundled('1.2.0')
    const zip = await JSZip.loadAsync(await buildSkillZip(b))
    expect(Object.keys(zip.files).filter((f) => !zip.files[f]!.dir)).toEqual([
      'ieumoffice/SKILL.md',
    ])
    expect(await zip.file('ieumoffice/SKILL.md')!.async('string')).toBe(b.text)
  })
})
