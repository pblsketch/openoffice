import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  UNSAVED_CHANGES_MESSAGE,
  setOpenFilesSource,
} from '@genoffice/electron-utils/unsaved-files'
import {
  KB_GROUP_EMPTY,
  KB_NOT_IN_BASE,
  KB_SCOPE_UNKNOWN,
  KbRunScopes,
  listKnowledgeFiles,
  readKnowledgeFilePage,
  searchSavedKnowledgeBase,
} from '../src/main/knowledge-base'

/**
 * Narrowing an ask to one starred group (spec 8.8) is kept by the main
 * process, not by the screen. A group-scoped run holds an opaque scope minted
 * in main; main resolves the group's members from the starred store on every
 * call, so a scoped run lists, searches and reads that group only, and a read
 * of any other starred file is refused at the same place as the existing
 * "starred files only" check. An unscoped call is today's behaviour.
 *
 * src/main/index.ts needs a running Electron, so the handlers below are
 * composed the way index.ts composes them, and the wiring is pinned by text.
 */

const HOME = 7
const OTHER_WINDOW = 9

let dir: string
let a1: string
let a2: string
let b1: string
let loose: string
let starred: string[]
let groupOf: Map<string, string>
let scopes: KbRunScopes

function write(name: string, content: string): string {
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-kb-scope-'))
  a1 = write('a1.md', 'budget of unit A, part one')
  a2 = write('a2.md', 'budget of unit A, part two')
  b1 = write('b1.md', 'budget of unit B')
  loose = write('loose.md', 'budget nobody grouped')
  starred = [a1, a2, b1, loose]
  groupOf = new Map([
    [a1, 'Unit A'],
    [a2, 'Unit A'],
    [b1, 'Unit B'],
  ])
  let n = 0
  scopes = new KbRunScopes(() => `scope-${++n}`)
})
afterEach(() => {
  setOpenFilesSource(null)
  rmSync(dir, { recursive: true, force: true })
})

// ---- the three handlers, composed the way src/main/index.ts composes them ----

function kbList(owner: number, raw?: unknown): string[] {
  return listKnowledgeFiles(scopes.narrow(owner, raw, starred, () => groupOf)).map((f) => f.path)
}

async function kbSearch(owner: number, raw: { q: string; limit?: number; scope?: unknown }) {
  const pool = starred.map((path) => ({
    path,
    name: path.slice(dir.length + 1),
    ext: 'md',
    snippetText: `excerpt of ${path}`,
  }))
  const inScope = scopes.narrow(owner, raw, starred, () => groupOf)
  return (await searchSavedKnowledgeBase(() => pool, raw.q, inScope, 8)).map((h) => h.path)
}

async function kbRead(owner: number, raw: { path: string; offset?: number; scope?: unknown }) {
  const path = raw.path
  if (!path || !starred.includes(path)) throw new Error(KB_NOT_IN_BASE)
  if (!scopes.narrow(owner, raw, [path], () => groupOf).includes(path)) {
    throw new Error(KB_NOT_IN_BASE)
  }
  return readKnowledgeFilePage(path, raw.offset ?? 0)
}

describe('an unscoped ask is today’s behaviour', () => {
  it('lists, searches and reads every starred file', async () => {
    expect(kbList(HOME)).toEqual(starred)
    expect(kbList(HOME, {})).toEqual(starred)
    expect((await kbSearch(HOME, { q: 'budget' })).sort()).toEqual([...starred].sort())
    for (const path of starred) {
      expect((await kbRead(HOME, { path })).text).toContain('budget')
    }
  })

  it('still refuses a file that is not starred', async () => {
    const outside = write('outside.md', 'not starred')
    await expect(kbRead(HOME, { path: outside })).rejects.toThrow(KB_NOT_IN_BASE)
  })
})

describe('a group-scoped ask', () => {
  it('lists only the group’s files', () => {
    const scope = scopes.open(HOME, 'Unit A', groupOf)
    expect(kbList(HOME, { scope })).toEqual([a1, a2])
  })

  it('searches only the group’s files', async () => {
    const scope = scopes.open(HOME, 'Unit A', groupOf)
    const hits = await kbSearch(HOME, { q: 'budget', scope })
    expect(hits).toEqual([a1, a2])
  })

  it('reads the group’s files', async () => {
    const scope = scopes.open(HOME, 'Unit A', groupOf)
    expect((await kbRead(HOME, { path: a2, scope })).text).toContain('part two')
  })

  it('refuses a starred file of another group, named directly by path', async () => {
    const scope = scopes.open(HOME, 'Unit A', groupOf)
    const refused = await kbRead(HOME, { path: b1, scope }).catch((e: Error) => e)
    expect(refused).toBeInstanceOf(Error)
    // the same refusal as a path outside the starred set: nothing about the other group leaks
    expect((refused as Error).message).toBe(KB_NOT_IN_BASE)
  })

  it('refuses an ungrouped starred file, which only an unscoped ask reads', async () => {
    const scope = scopes.open(HOME, 'Unit B', groupOf)
    await expect(kbRead(HOME, { path: loose, scope })).rejects.toThrow(KB_NOT_IN_BASE)
    expect((await kbRead(HOME, { path: loose })).text).toContain('nobody grouped')
  })

  it('follows the group as it is now, never wider', async () => {
    const scope = scopes.open(HOME, 'Unit A', groupOf)
    // a file moved out of the group mid-run is out of the run, too
    groupOf.set(a2, 'Unit B')
    expect(kbList(HOME, { scope })).toEqual([a1])
    await expect(kbRead(HOME, { path: a2, scope })).rejects.toThrow(KB_NOT_IN_BASE)
    // a group emptied mid-run narrows to nothing, not to every starred file
    groupOf.delete(a1)
    expect(kbList(HOME, { scope })).toEqual([])
    expect(await kbSearch(HOME, { q: 'budget', scope })).toEqual([])
  })

  it('keeps the unsaved-file and on-disk protections underneath', async () => {
    const scope = scopes.open(HOME, 'Unit A', groupOf)
    setOpenFilesSource(() => [{ filePath: a1, dirty: true }])
    expect(await kbSearch(HOME, { q: 'budget', scope })).toEqual([a2])
    await expect(kbRead(HOME, { path: a1, scope })).rejects.toThrow(UNSAVED_CHANGES_MESSAGE)
  })
})

describe('the scope cannot be widened from the renderer side of a run', () => {
  it('ignores a forged file list or group name next to the scope', async () => {
    const scope = scopes.open(HOME, 'Unit A', groupOf)
    const forged = { scope, group: 'Unit B', paths: [b1, loose], files: [b1] }
    expect(kbList(HOME, forged)).toEqual([a1, a2])
    expect(await kbSearch(HOME, { q: 'budget', ...forged })).toEqual([a1, a2])
    await expect(kbRead(HOME, { path: b1, ...forged })).rejects.toThrow(KB_NOT_IN_BASE)
  })

  it('refuses a scope main never opened, instead of reading it as unscoped', async () => {
    for (const scope of ['made-up', '', null, 42, { group: 'Unit A' }, ['scope-1']]) {
      expect(() => kbList(HOME, { scope })).toThrow(KB_SCOPE_UNKNOWN)
      await expect(kbSearch(HOME, { q: 'budget', scope })).rejects.toThrow(KB_SCOPE_UNKNOWN)
      await expect(kbRead(HOME, { path: a1, scope })).rejects.toThrow(KB_SCOPE_UNKNOWN)
    }
  })

  it('refuses another window’s scope', () => {
    const scope = scopes.open(HOME, 'Unit A', groupOf)
    expect(() => kbList(OTHER_WINDOW, { scope })).toThrow(KB_SCOPE_UNKNOWN)
    // and that window cannot close it either
    scopes.close(OTHER_WINDOW, scope)
    expect(kbList(HOME, { scope })).toEqual([a1, a2])
  })

  it('refuses a scope once its run has closed it', () => {
    const scope = scopes.open(HOME, 'Unit A', groupOf)
    scopes.close(HOME, scope)
    expect(() => kbList(HOME, { scope })).toThrow(KB_SCOPE_UNKNOWN)
  })

  it('refuses the oldest scope once too many are open, rather than widening it', () => {
    const capped = new KbRunScopes(
      (() => {
        let n = 0
        return () => `s${++n}`
      })(),
      2,
    )
    const first = capped.open(HOME, 'Unit A', groupOf)
    capped.open(HOME, 'Unit A', groupOf)
    capped.open(HOME, 'Unit B', groupOf)
    expect(() => capped.narrow(HOME, { scope: first }, starred, () => groupOf)).toThrow(
      KB_SCOPE_UNKNOWN,
    )
  })

  it('mints a different scope for every run', () => {
    const real = new KbRunScopes()
    const one = real.open(HOME, 'Unit A', groupOf)
    const two = real.open(HOME, 'Unit A', groupOf)
    expect(one).not.toBe(two)
    expect(one.length).toBeGreaterThanOrEqual(32)
  })
})

describe('opening a group scope', () => {
  it('refuses a group with no starred files rather than widening to all', () => {
    for (const group of ['No such group', '', null, undefined, 3, ['Unit A']]) {
      expect(() => scopes.open(HOME, group, groupOf)).toThrow(KB_GROUP_EMPTY)
    }
  })

  it('refuses a group whose last file left it', () => {
    groupOf.delete(b1)
    expect(() => scopes.open(HOME, 'Unit B', groupOf)).toThrow(KB_GROUP_EMPTY)
  })
})

describe('shell wiring (src/main/index.ts needs a running Electron, so the text is pinned)', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8')
  const between = (start: string, end: string): string => {
    const at = source.indexOf(start)
    expect(at, start).toBeGreaterThan(0)
    return source.slice(at, source.indexOf(end, at + start.length))
  }

  it('narrows the list to the run’s scope', () => {
    const handler = between("ipcMain.handle('kb:list'", "ipcMain.handle('kb:search'")
    const flat = handler.replace(/\s+/g, ' ')
    expect(flat).toContain(
      'const starred = kbRunScopes.narrow( event.sender.id, raw, readStarredFiles(), readStarredGroupMap, )',
    )
    expect(flat).toContain('return listKnowledgeFiles(starred)')
  })

  it('narrows the search after the unsaved and on-disk filters, never instead of them', () => {
    const handler = between("ipcMain.handle('kb:search'", "ipcMain.handle('kb:read'")
    expect(handler).toContain('store.pathsIndexedAsOnDisk(readStarredFiles())')
    expect(handler).toContain(
      'kbRunScopes.narrow(event.sender.id, raw, starred, readStarredGroupMap)',
    )
    expect(handler).toContain('searchSavedKnowledgeWithProject(')
    const narrowed = handler.indexOf('kbRunScopes.narrow(')
    expect(narrowed).toBeGreaterThan(handler.indexOf('store.pathsIndexedAsOnDisk('))
    expect(narrowed).toBeLessThan(handler.indexOf('searchSavedKnowledgeWithProject('))
  })

  it('widens the search only by the project the run’s scope holds, with its visibility rule', () => {
    const handler = between("ipcMain.handle('kb:search'", "ipcMain.handle('kb:read'")
    const flat = handler.replace(/\s+/g, ' ')
    expect(flat).toContain('const projectId = kbRunScopes.projectOf(event.sender.id, raw)')
    expect(flat).toContain('projectFolderServices().tools.visibleTest(projectId)')
    // project hits are quoted only from files indexed as they are on disk
    expect(flat).toContain('(paths) => store.pathsIndexedAsOnDisk(paths)')
  })

  it('reads a starred file only within the scope, and anything else only as a project file', () => {
    const handler = between("ipcMain.handle('kb:read'", 'HOME_CHANNELS.rerankSearch')
    const flat = handler.replace(/\s+/g, ' ')
    const projectOf = flat.indexOf('const projectId = kbRunScopes.projectOf(owner, raw)')
    const starredCheck = flat.indexOf('readStarredFiles().includes(path) &&')
    const scopeCheck = flat.indexOf(
      'kbRunScopes.narrow(owner, raw, [path], readStarredGroupMap).includes(path)',
    )
    const read = flat.indexOf('readKnowledgeOrProjectPage(')
    expect(projectOf).toBeGreaterThan(0)
    expect(starredCheck).toBeGreaterThan(projectOf)
    expect(scopeCheck).toBeGreaterThan(starredCheck)
    expect(read).toBeGreaterThan(scopeCheck)
    expect(flat).toContain('projectFolderServices().tools.readPath(owner, projectId, target, at)')
    expect(flat).not.toContain('readKnowledgeFilePage(')
  })

  it('opens a scope from a group name, or a project plus a starred part, resolved in main', () => {
    const handler = between("ipcMain.handle('kb:open-scope'", "ipcMain.handle('kb:close-scope'")
    expect(handler).toContain('parseKbOpenScope(raw)')
    expect(handler).toContain('kbRunScopes.open(event.sender.id, group, readStarredGroupMap())')
    expect(handler).toContain('projectFolderServices().tools.isAvailable(projectId)')
    expect(handler).toContain(
      'kbRunScopes.openProject(event.sender.id, projectId, starred, readStarredGroupMap())',
    )
  })
})
