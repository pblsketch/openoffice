import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectTrustAnswer } from '@genoffice/project-store'
import { ProjectGuide } from '../src/main/projects/project-guide'
import {
  NewDocumentPlacer,
  newDocumentFolder,
  numberedFileName,
  type NewDocumentPlacement,
} from '../src/main/projects/new-documents'
import { ProjectWriteRefused } from '../src/main/projects/write-guard'
import { projectMentionFiles } from '../src/main/projects/project-files'

/**
 * New documents of a run with a project chosen (spec 6): the folder rule, the
 * numbered names that never overwrite, the write guard's refusals, presets of
 * tabs a create flow opened, and nothing at all without a project.
 */

let base: string
let root: string
let guide: ProjectGuide
let projectId: string

const HOME = 1
const IN_DOC = 2
const OUT_DOC = 3
const UNTITLED = 4
const NEW_TAB = 5
const NO_PROJECT = 6

let chosen: Map<number, string | null>
let documents: Map<number, string | null>

function folder(...parts: string[]): string {
  const path = join(base, ...parts)
  mkdirSync(path, { recursive: true })
  return path
}

function makePlacer(): NewDocumentPlacer {
  return new NewDocumentPlacer({
    guide,
    windowProject: async (id) => chosen.get(id) ?? null,
    documentOf: (id) => documents.get(id) ?? null,
  })
}

beforeEach(async () => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'project-new-docs-')))
  const userData = folder('appdata', 'IeumOffice')
  guide = new ProjectGuide({
    settingsPath: join(userData, 'app-settings.json'),
    homeDir: folder('home'),
    userData,
    defaultParentDir: () => folder('documents'),
    env: {},
  })
  root = folder('Report')
  folder('Report', 'drafts')
  const added = await guide.addFolder(root, async (): Promise<ProjectTrustAnswer> => 'use')
  if (added.status !== 'added') throw new Error('not added')
  projectId = added.project.id
  root = added.project.path
  chosen = new Map([
    [HOME, projectId],
    [IN_DOC, projectId],
    [OUT_DOC, projectId],
    [UNTITLED, projectId],
    [NO_PROJECT, null],
  ])
  documents = new Map([
    [IN_DOC, join(root, 'drafts', 'plan.docx')],
    [OUT_DOC, join(base, 'elsewhere', 'notes.md')],
  ])
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('the folder rule', () => {
  it('uses the current document folder inside the project, else the top', () => {
    expect(newDocumentFolder(root, join(root, 'drafts', 'plan.docx'))).toBe(join(root, 'drafts'))
    expect(newDocumentFolder(root, join(root, 'plan.docx'))).toBe(root)
    expect(newDocumentFolder(root, join(base, 'elsewhere', 'notes.md'))).toBe(root)
    expect(newDocumentFolder(root, null)).toBe(root)
    // never into the app's own folder
    expect(newDocumentFolder(root, join(root, '.ieumoffice', 'chats', 'x.md'))).toBe(root)
  })

  it('numbers a taken name before the extension', () => {
    expect(numberedFileName('memo.md', 1)).toBe('memo.md')
    expect(numberedFileName('memo.md', 2)).toBe('memo (2).md')
    expect(numberedFileName('a.b.docx', 3)).toBe('a.b (3).docx')
    expect(numberedFileName('README', 2)).toBe('README (2)')
  })
})

describe('placements', () => {
  it('home goes to the top, a document inside to its folder, one outside to the top', async () => {
    const placer = makePlacer()
    expect(await placer.placementFor(HOME)).toEqual({ projectId, root, dir: root })
    expect((await placer.placementFor(IN_DOC))?.dir).toBe(join(root, 'drafts'))
    expect((await placer.placementFor(OUT_DOC))?.dir).toBe(root)
    expect((await placer.placementFor(UNTITLED))?.dir).toBe(root)
  })

  it('has nothing without a project, or for a project no longer listed', async () => {
    const placer = makePlacer()
    expect(await placer.placementFor(NO_PROJECT)).toBeNull()
    expect(await placer.writeFor(NO_PROJECT, 'x.md', Buffer.from('x'))).toBeNull()
    expect(await placer.saveDialogFolder(NO_PROJECT)).toBeNull()
    chosen.set(HOME, 'gone')
    expect(await placer.placementFor(HOME)).toBeNull()
  })

  it('a tab a create flow opened keeps its opener placement and its project', async () => {
    const placer = makePlacer()
    const opener = placer.placementOfOpener({ kind: 'window', webContentsId: IN_DOC }, HOME)
    placer.preset(NEW_TAB, opener)
    expect(await placer.presetProjectOf(NEW_TAB)).toBe(projectId)
    // the new tab's panel starts in the preset project
    chosen.set(NEW_TAB, projectId)
    expect(await placer.saveDialogFolder(NEW_TAB)).toBe(join(root, 'drafts'))
    // the person chose "no project" in that tab: nothing applies any more
    chosen.set(NEW_TAB, null)
    expect(await placer.placementFor(NEW_TAB)).toBeNull()
    placer.forget(NEW_TAB)
    expect(await placer.presetProjectOf(NEW_TAB)).toBeNull()
  })

  it('home as the opener places at the top; no project leaves the tab as it is', async () => {
    const placer = makePlacer()
    placer.preset(NEW_TAB, placer.placementOfOpener({ kind: 'home' }, HOME))
    expect(await placer.presetProjectOf(NEW_TAB)).toBe(projectId)
    placer.preset(7, placer.placementOfOpener({ kind: 'window', webContentsId: NO_PROJECT }, HOME))
    expect(await placer.presetProjectOf(7)).toBeNull()
    placer.preset(8, Promise.reject(new Error('lookup failed')))
    expect(await placer.presetProjectOf(8)).toBeNull()
  })
})

describe('writing', () => {
  it('writes into the rule folder and never over an existing file', async () => {
    const placer = makePlacer()
    writeFileSync(join(root, 'drafts', 'memo.md'), 'old')
    const first = await placer.writeFor(IN_DOC, 'memo.md', Buffer.from('new'))
    expect(first).toBe(join(root, 'drafts', 'memo (2).md'))
    expect(readFileSync(join(root, 'drafts', 'memo.md'), 'utf8')).toBe('old')
    expect(readFileSync(first!, 'utf8')).toBe('new')
    const second = await placer.writeFor(IN_DOC, 'memo.md', Buffer.from('newer'))
    expect(second).toBe(join(root, 'drafts', 'memo (3).md'))
    expect(await placer.writeFor(HOME, 'memo.md', Buffer.from('top'))).toBe(join(root, 'memo.md'))
  })

  it('takes the next name when another write wins the race for one', async () => {
    const write = vi.fn(async (_id: string, target: string, data: Uint8Array) => {
      if (target.endsWith('race.md')) throw new ProjectWriteRefused('exists', target)
      return guide.writeNewDocument(_id, target, data)
    })
    const placer = new NewDocumentPlacer({
      guide: { projectRoot: (id) => guide.projectRoot(id), writeNewDocument: write },
      windowProject: async () => projectId,
      documentOf: () => null,
    })
    expect(await placer.writeFor(HOME, 'race.md', Buffer.from('x'))).toBe(join(root, 'race (2).md'))
  })

  it('refuses through the guard: no folder made, nothing written elsewhere', async () => {
    const placer = makePlacer()
    const missing: NewDocumentPlacement = { projectId, root, dir: join(root, 'gone') }
    await expect(placer.write(missing, 'a.md', Buffer.from('x'))).rejects.toMatchObject({
      reason: 'missing-folder',
    })
    const outside: NewDocumentPlacement = { projectId, root, dir: join(base, 'elsewhere') }
    folder('elsewhere')
    await expect(placer.write(outside, 'a.md', Buffer.from('x'))).rejects.toMatchObject({
      reason: 'outside',
    })
    expect(readdirSync(join(base, 'elsewhere'))).toEqual([])
    const data: NewDocumentPlacement = { projectId, root, dir: join(root, '.ieumoffice') }
    folder('Report', '.ieumoffice')
    await expect(placer.write(data, 'a.md', Buffer.from('x'))).rejects.toMatchObject({
      reason: 'outside',
    })
  })

  it('takes a file name only: a name holding a folder or a step up is refused', async () => {
    const placer = makePlacer()
    for (const name of ['drafts/a.md', '../a.md', '..', '.', '', 'a/', 'C:a.md']) {
      await expect(placer.writeFor(HOME, name, Buffer.from('x')), name).rejects.toMatchObject({
        reason: 'bad-path',
      })
    }
    // backslash-separated names too (built here: no backslash in the source)
    const sep = String.fromCharCode(92)
    await expect(
      placer.writeFor(HOME, ['drafts', 'a.md'].join(sep), Buffer.from('x')),
    ).rejects.toMatchObject({ reason: 'bad-path' })
    expect(readdirSync(join(root, 'drafts'))).toEqual([])
    expect(readdirSync(root).filter((name) => name !== '.ieumoffice')).toEqual(['drafts'])
  })

  it('a tab a create flow opened writes its document into its opener folder, numbered', async () => {
    const placer = makePlacer()
    placer.preset(
      NEW_TAB,
      placer.placementOfOpener({ kind: 'window', webContentsId: IN_DOC }, HOME),
    )
    chosen.set(NEW_TAB, projectId)
    writeFileSync(join(root, 'drafts', 'Deck.pptx'), 'old')
    const written = await placer.writeFor(NEW_TAB, 'Deck.pptx', Buffer.from('new'))
    expect(written).toBe(join(root, 'drafts', 'Deck (2).pptx'))
    expect(readFileSync(join(root, 'drafts', 'Deck.pptx'), 'utf8')).toBe('old')
    // the person switched the tab to "no project": nothing is written
    chosen.set(NEW_TAB, null)
    expect(await placer.writeFor(NEW_TAB, 'Deck.pptx', Buffer.from('x'))).toBeNull()
    expect(readdirSync(join(root, 'drafts')).sort()).toEqual(['Deck (2).pptx', 'Deck.pptx'])
  })

  it('refuses a folder that is a link', async () => {
    const target = folder('linked-target')
    try {
      symlinkSync(target, join(root, 'linked'), 'junction')
    } catch {
      return // no permission for links on this machine
    }
    const placer = makePlacer()
    const linked: NewDocumentPlacement = { projectId, root, dir: join(root, 'linked') }
    await expect(placer.write(linked, 'a.md', Buffer.from('x'))).rejects.toBeInstanceOf(
      ProjectWriteRefused,
    )
    expect(readdirSync(target)).toEqual([])
  })
})

describe('the @ list files of a project (spec 5.13)', () => {
  it('lists the newest AI-visible files only, up to the limit', async () => {
    const write = (rel: string, at: number) => {
      const path = join(root, ...rel.split('/'))
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, 'x')
      utimesSync(path, at, at)
    }
    write('old.docx', 1_000)
    write('drafts/new.md', 3_000)
    write('mid.pdf', 2_000)
    write('.hidden.docx', 4_000)
    write('.ieumoffice/memory.md', 5_000)
    write('secret/plan.docx', 6_000)
    write('~$lock.docx', 7_000)
    expect((await guide.addIgnore(projectId, 'secret/')).status).toBe('ok')
    const visibility = await guide.aiVisibility(projectId)
    const files = await projectMentionFiles(visibility!)
    expect(files.map((f) => f.title)).toEqual(['new.md', 'mid.pdf', 'old.docx'])
    expect(files[0]!.path).toBe(join(root, 'drafts', 'new.md'))
    expect((await projectMentionFiles(visibility!, 2)).map((f) => f.title)).toEqual([
      'new.md',
      'mid.pdf',
    ])
  })
})
