import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PROJECT_SKILLS_KEY,
  projectSkillsAllowed,
  projectSkillsFingerprint,
  projectSkillsView,
  setProjectSkills,
  type ProjectSkillLike,
} from '../../src/main/agent/project-skills'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'project-skills-'))
  dirs.push(root)
  const folder = join(root, 'project')
  const skillDir = join(folder, '.claude', 'skills', 'report')
  mkdirSync(join(skillDir, 'scripts'), { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: report\n---\nWrite the weekly report.')
  writeFileSync(join(skillDir, 'scripts', 'run.py'), 'print("hi")')
  const settings = join(root, 'app-settings.json')
  writeFileSync(settings, '{}')
  const skills: ProjectSkillLike[] = [
    {
      id: 'project:report',
      name: 'report',
      title: 'Report',
      description: 'weekly',
      dir: skillDir,
      source: 'project',
    },
    {
      id: 'app:mine',
      name: 'mine',
      title: 'Mine',
      description: '',
      dir: join(root, 'x'),
      source: 'app',
    },
  ]
  return { folder, skillDir, settings, skills }
}

describe('project skills (decision 0064)', () => {
  it('are off until the person turns them on, and listed for the start screen', async () => {
    const { folder, settings, skills } = setup()
    expect(await projectSkillsAllowed(settings, folder, skills)).toBe(false)
    const view = await projectSkillsView(settings, folder, skills)
    expect(view).toEqual({
      skills: [{ name: 'report', title: 'Report', description: 'weekly' }],
      allowed: false,
      changed: false,
    })
  })

  it('stay on while their files are unchanged, and turn off when any file changes', async () => {
    const { folder, skillDir, settings, skills } = setup()
    expect((await setProjectSkills(settings, folder, skills, true)).allowed).toBe(true)
    expect(await projectSkillsAllowed(settings, folder, skills)).toBe(true)
    expect(JSON.parse(readFileSync(settings, 'utf8'))[PROJECT_SKILLS_KEY]).toBeDefined()
    // a script, not only SKILL.md, counts
    writeFileSync(join(skillDir, 'scripts', 'run.py'), 'print("pwned")')
    expect(await projectSkillsAllowed(settings, folder, skills)).toBe(false)
    expect(await projectSkillsView(settings, folder, skills)).toMatchObject({
      allowed: false,
      changed: true,
    })
  })

  it('are turned off again by the person', async () => {
    const { folder, settings, skills } = setup()
    await setProjectSkills(settings, folder, skills, true)
    expect((await setProjectSkills(settings, folder, skills, false)).allowed).toBe(false)
    expect(await projectSkillsAllowed(settings, folder, skills)).toBe(false)
  })

  it('have no fingerprint when there are none or they cannot be read', async () => {
    const { skills } = setup()
    expect(await projectSkillsFingerprint([])).toBeNull()
    expect(
      await projectSkillsFingerprint([{ ...skills[0]!, dir: join(tmpdir(), 'no-such-skill-dir') }]),
    ).toBeNull()
  })
})

describe('the session start', () => {
  it('leaves project skills out of the bundle unless they are allowed as they are now', () => {
    const index = readFileSync(
      fileURLToPath(new URL('../../src/main/index.ts', import.meta.url)),
      'utf8',
    )
    expect(index).toContain(
      'const withProject = await projectSkillsAllowed(APP_SETTINGS_PATH(), projectRoot, enabled)',
    )
    expect(index).toContain(
      "withProject ? enabled : enabled.filter((skill) => skill.source !== 'project')",
    )
  })
})
