import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setOpenFilesSource } from '@genoffice/electron-utils/unsaved-files'
import type { ProjectTrustAnswer } from '@genoffice/project-store'
import { FileIndexStore } from '../src/main/file-index/store'
import {
  KB_DOWNLOAD_DECLINED,
  KB_GROUP_EMPTY,
  KB_NOT_IN_BASE,
  KB_SCOPE_UNKNOWN,
  KbRunScopes,
  parseKbOpenScope,
  readKnowledgeOrProjectPage,
  searchSavedKnowledgeWithProject,
} from '../src/main/knowledge-base'
import { createCachedFileLister, listVisibleFiles } from '../src/main/projects/project-files'
import { ProjectGuide } from '../src/main/projects/project-guide'
import {
  PROJECT_SCOPE_UNKNOWN,
  PROJECT_UNAVAILABLE,
  ProjectFolderTools,
  type DownloadAsk,
} from '../src/main/projects/project-tools'

/**
 * The project folder tools (spec 5.5, 5.8): main mints a run scope from a
 * project id, re-derives the folder and its visibility rule on every call, and
 * lists, searches and reads only what the AI may see. A cloud-only file is read
 * only after the person says yes. The home ask may hold a project next to its
 * starred scope.
 */

const WIN = 7
const OTHER_WINDOW = 9
const SECRET = '13800138000'
const LABEL = 'client phone'

let base: string
let home: string
let userData: string
let settingsPath: string
let root: string
let outside: string
let projectId: string
let guide: ProjectGuide
let scopes: KbRunScopes
let store: FileIndexStore
let cloud: Set<string>
let resolveCloud: ReturnType<typeof vi.fn>
let ask: ReturnType<typeof vi.fn>
let tools: ProjectFolderTools

const never = async (): Promise<ProjectTrustAnswer> => {
  throw new Error('the trust prompt should not be shown')
}

function put(dir: string, rel: string, text: string, mtimeSec?: number): string {
  const path = join(dir, ...rel.split('/'))
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
  if (mtimeSec !== undefined) utimesSync(path, mtimeSec, mtimeSec)
  return path
}

function makeTools(extra: Partial<ConstructorParameters<typeof ProjectFolderTools>[0]> = {}) {
  return new ProjectFolderTools({
    guide,
    scopes,
    store: () => store,
    resolveCloudOnly: resolveCloud as never,
    askDownload: ask as never,
    ...extra,
  })
}

beforeEach(async () => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'project-tools-')))
  home = join(base, 'home')
  userData = join(base, 'appdata')
  mkdirSync(home)
  mkdirSync(userData)
  settingsPath = join(userData, 'app-settings.json')
  root = join(base, 'work', 'project')
  outside = join(base, 'work', 'elsewhere')
  mkdirSync(root, { recursive: true })
  mkdirSync(outside, { recursive: true })

  put(root, 'notes.md', 'budget notes for the year', 1_700_000_300)
  put(root, 'reports/plan.md', 'budget plan body', 1_700_000_200)
  put(root, 'reports/deep/annex.txt', 'annex text', 1_700_000_100)
  put(root, '.hidden/secret.md', 'budget hidden', 1_700_000_400)
  put(root, '~$lock.docx', 'lock', 1_700_000_400)
  put(root, 'node_modules/pkg.md', 'budget module', 1_700_000_400)
  put(root, 'drafts/old.md', 'budget draft', 1_700_000_400)
  put(root, 'picture.png', 'not a document', 1_700_000_400)
  put(
    root,
    'masked.md',
    `please call <span class="redact-span" data-redaction="" data-label="${LABEL}">${SECRET}</span> to confirm`,
    1_700_000_050,
  )
  put(outside, 'outside.md', 'budget outside the project')

  guide = new ProjectGuide({
    settingsPath,
    homeDir: home,
    userData,
    defaultParentDir: () => join(base, 'documents'),
    env: {},
  })
  const added = await guide.addFolder(root, never)
  if (added.status !== 'added') throw new Error(JSON.stringify(added))
  projectId = added.project.id
  await guide.addIgnore(projectId, 'drafts/')

  let n = 0
  scopes = new KbRunScopes(() => `scope-${++n}`)
  store = new FileIndexStore(join(base, 'index.db'))
  cloud = new Set()
  resolveCloud = vi.fn(
    async (paths: readonly string[]) => new Map(paths.map((p) => [p, cloud.has(p)])),
  )
  ask = vi.fn(async (_ask: DownloadAsk) => true)
  tools = makeTools()
})

afterEach(() => {
  setOpenFilesSource(null)
  store.close()
  rmSync(base, { recursive: true, force: true })
})

describe('run scope', () => {
  it('mints a scope for a listed project and serves the tools with it', async () => {
    const scope = await tools.openScope(WIN, { projectId })
    expect(scope).toBe('scope-1')
    const listed = await tools.listFiles(WIN, { scope })
    expect(listed.total).toBeGreaterThan(0)
  })

  it('refuses to open a scope for an unknown project or a missing folder', async () => {
    for (const raw of [{ projectId: 'nope' }, { projectId: '' }, {}, null, 'x', { projectId: 3 }]) {
      await expect(tools.openScope(WIN, raw)).rejects.toThrow(PROJECT_UNAVAILABLE)
    }
    rmSync(root, { recursive: true, force: true })
    await expect(tools.openScope(WIN, { projectId })).rejects.toThrow(PROJECT_UNAVAILABLE)
  })

  it('refuses a call without a scope, an unknown scope, or another window’s scope', async () => {
    const scope = await tools.openScope(WIN, { projectId })
    for (const raw of [
      {},
      { scope: 'made-up' },
      { scope: '' },
      { scope: 42 },
      null,
      { scope: [scope] },
    ]) {
      await expect(tools.listFiles(WIN, raw)).rejects.toThrow(PROJECT_SCOPE_UNKNOWN)
      await expect(tools.search(WIN, { ...(raw as object), query: 'budget' })).rejects.toThrow(
        PROJECT_SCOPE_UNKNOWN,
      )
      await expect(tools.read(WIN, { ...(raw as object), relPath: 'notes.md' })).rejects.toThrow(
        PROJECT_SCOPE_UNKNOWN,
      )
    }
    await expect(tools.listFiles(OTHER_WINDOW, { scope })).rejects.toThrow(PROJECT_SCOPE_UNKNOWN)
  })

  it('lets only the opener close a scope, and refuses it once closed', async () => {
    const scope = await tools.openScope(WIN, { projectId })
    tools.closeScope(OTHER_WINDOW, { scope })
    await expect(tools.listFiles(WIN, { scope })).resolves.toBeTruthy()
    tools.closeScope(WIN, { scope })
    await expect(tools.listFiles(WIN, { scope })).rejects.toThrow(PROJECT_SCOPE_UNKNOWN)
  })

  it('drops the oldest scope past the limit and refuses it', async () => {
    let n = 0
    scopes = new KbRunScopes(() => `s${++n}`, 2)
    tools = makeTools()
    const first = await tools.openScope(WIN, { projectId })
    await tools.openScope(WIN, { projectId })
    await tools.openScope(WIN, { projectId })
    await expect(tools.listFiles(WIN, { scope: first })).rejects.toThrow(PROJECT_SCOPE_UNKNOWN)
  })

  it('refuses a group-only starred scope as a project scope', async () => {
    const groupScope = scopes.open(WIN, 'A', new Map([['/x.md', 'A']]))
    await expect(tools.listFiles(WIN, { scope: groupScope })).rejects.toThrow(PROJECT_SCOPE_UNKNOWN)
  })

  it('re-derives the project on every call: removed from the list mid-run is refused', async () => {
    const scope = await tools.openScope(WIN, { projectId })
    await guide.removeFromList(projectId)
    await expect(tools.listFiles(WIN, { scope })).rejects.toThrow(PROJECT_UNAVAILABLE)
    await expect(tools.read(WIN, { scope, relPath: 'notes.md' })).rejects.toThrow(
      PROJECT_UNAVAILABLE,
    )
  })

  it('reads `ignore` fresh on every call', async () => {
    const scope = await tools.openScope(WIN, { projectId })
    expect((await tools.read(WIN, { scope, relPath: 'notes.md' })).status).toBe('ok')
    await guide.addIgnore(projectId, 'notes.md')
    expect(await tools.read(WIN, { scope, relPath: 'notes.md' })).toEqual({
      status: 'refused',
      reason: 'ignored',
    })
  })
})

describe('project_list_files', () => {
  it('lists AI-visible supported files recursively, newest first', async () => {
    const scope = await tools.openScope(WIN, { projectId })
    const listed = await tools.listFiles(WIN, { scope })
    expect(listed.files.map((f) => f.relPath)).toEqual([
      'notes.md',
      'reports/plan.md',
      'reports/deep/annex.txt',
      'masked.md',
    ])
    expect(listed.total).toBe(4)
    const notes = listed.files[0]!
    expect(notes).toMatchObject({ ext: 'md', cloudOnly: false, mtimeMs: 1_700_000_300_000 })
    expect(notes.sizeBytes).toBe('budget notes for the year'.length)
  })

  it('narrows by a folder-relative prefix, either separator', async () => {
    const scope = await tools.openScope(WIN, { projectId })
    for (const prefix of ['reports/', 'reports\\', './reports', 'reports']) {
      const listed = await tools.listFiles(WIN, { scope, prefix })
      expect(listed.files.map((f) => f.relPath)).toEqual([
        'reports/plan.md',
        'reports/deep/annex.txt',
      ])
    }
    expect((await tools.listFiles(WIN, { scope, prefix: 'REPORTS/deep' })).total).toBe(
      process.platform === 'linux' ? 0 : 1,
    )
  })

  it('pages with offset and limit, keeping the total', async () => {
    const scope = await tools.openScope(WIN, { projectId })
    const page = await tools.listFiles(WIN, { scope, offset: 1, limit: 2 })
    expect(page.files.map((f) => f.relPath)).toEqual(['reports/plan.md', 'reports/deep/annex.txt'])
    expect(page.total).toBe(4)
  })

  it('marks cloud-only files, asking the detector once per call', async () => {
    cloud.add(join(root, 'reports', 'plan.md'))
    const scope = await tools.openScope(WIN, { projectId })
    const listed = await tools.listFiles(WIN, { scope })
    expect(listed.files.find((f) => f.relPath === 'reports/plan.md')!.cloudOnly).toBe(true)
    expect(listed.files.find((f) => f.relPath === 'notes.md')!.cloudOnly).toBe(false)
    expect(resolveCloud).toHaveBeenCalledTimes(1)
  })

  it('does not follow a link or junction out of the folder', async () => {
    try {
      symlinkSync(outside, join(root, 'linked'), 'junction')
    } catch {
      return // links cannot be made here
    }
    const scope = await tools.openScope(WIN, { projectId })
    const listed = await tools.listFiles(WIN, { scope })
    expect(listed.files.some((f) => f.relPath.startsWith('linked'))).toBe(false)
    expect(await tools.read(WIN, { scope, relPath: 'linked/outside.md' })).toEqual({
      status: 'refused',
      reason: 'outside',
    })
  })
})

describe('shared caches for lists (8 GB PCs)', () => {
  it('marks list and search results with the list resolver, and asks afresh before a read', async () => {
    const listCloud = vi.fn(
      async (paths: readonly string[]) => new Map(paths.map((p) => [p, cloud.has(p)])),
    )
    const cached = makeTools({ listCloudOnly: listCloud as never })
    const scope = await cached.openScope(WIN, { projectId })
    await cached.listFiles(WIN, { scope })
    const st = statSync(join(root, 'notes.md'))
    store.upsert(
      { path: join(root, 'notes.md'), mtimeMs: st.mtimeMs, sizeBytes: st.size },
      'budget notes',
      'ok',
    )
    await cached.search(WIN, { scope, query: 'budget' })
    expect(listCloud).toHaveBeenCalledTimes(2)
    expect(resolveCloud).not.toHaveBeenCalled()
    await cached.read(WIN, { scope, relPath: 'notes.md' })
    expect(resolveCloud).toHaveBeenCalledTimes(1)
    expect(listCloud).toHaveBeenCalledTimes(2)
  })

  it('reuses one walk for a few seconds, keyed by the ignore rule', async () => {
    let at = 0
    const walk = vi.fn(listVisibleFiles)
    const lister = createCachedFileLister({ ttlMs: 5_000, now: () => at, list: walk })
    const cached = makeTools({ listFiles: lister })
    const scope = await cached.openScope(WIN, { projectId })
    const names = async () => (await cached.listFiles(WIN, { scope })).files.map((f) => f.relPath)

    const first = await names()
    put(root, 'fresh.md', 'new file', 1_700_000_900)
    at = 1_000
    expect(await names()).toEqual(first)
    expect(walk).toHaveBeenCalledTimes(1)

    // an ignore edit is a new rule: never served the old list
    await guide.addIgnore(projectId, 'masked.md')
    const afterIgnore = await names()
    expect(afterIgnore).not.toContain('masked.md')
    expect(afterIgnore).toContain('fresh.md')
    expect(walk).toHaveBeenCalledTimes(2)

    // invalidation drops it; so does the time limit
    put(root, 'later.md', 'later', 1_700_000_950)
    lister.invalidate(root)
    expect(await names()).toContain('later.md')
    put(root, 'latest.md', 'latest', 1_700_000_990)
    at = 7_000
    expect(await names()).toContain('latest.md')
    expect(walk).toHaveBeenCalledTimes(4)
  })

  it('shares one walk between callers asking at once, and never keeps a failed one', async () => {
    let fail = true
    const walk = vi.fn(async (visibility: Parameters<typeof listVisibleFiles>[0]) => {
      if (fail) {
        fail = false
        throw new Error('walk failed')
      }
      return listVisibleFiles(visibility)
    })
    const lister = createCachedFileLister({ list: walk })
    const visibility = await guide.aiVisibility(projectId)
    if (!visibility) throw new Error('no visibility')
    await expect(lister(visibility)).rejects.toThrow('walk failed')
    const [a, b] = await Promise.all([lister(visibility), lister(visibility)])
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
    expect(walk).toHaveBeenCalledTimes(2)
    // a visibility without a rule key is never cached
    const bare = { ...visibility, ruleKey: undefined }
    await lister(bare)
    await lister(bare)
    expect(walk).toHaveBeenCalledTimes(4)
  })
})

describe('project_read', () => {
  async function read(relPath: string, offset?: number) {
    const scope = await tools.openScope(WIN, { projectId })
    return tools.read(WIN, { scope, relPath, ...(offset !== undefined ? { offset } : {}) })
  }

  it('reads a visible file as text', async () => {
    const result = await read('reports/plan.md')
    expect(result).toEqual({ status: 'ok', text: 'budget plan body', totalChars: 16, offset: 0 })
    expect((await read('reports\\plan.md')).status).toBe('ok')
    expect(await read('reports/plan.md', 7)).toMatchObject({ text: 'plan body', offset: 7 })
  })

  it('refuses paths that escape, hide or are ignored', async () => {
    expect(await read('../elsewhere/outside.md')).toEqual({ status: 'refused', reason: 'outside' })
    expect(await read('reports/../../elsewhere/outside.md')).toEqual({
      status: 'refused',
      reason: 'outside',
    })
    expect(await read(join(outside, 'outside.md'))).toEqual({
      status: 'refused',
      reason: 'outside',
    })
    expect(await read('/etc/passwd')).toEqual({ status: 'refused', reason: 'outside' })
    expect(await read('C:/Windows/win.ini')).toEqual({ status: 'refused', reason: 'outside' })
    expect(await read('')).toEqual({ status: 'refused', reason: 'outside' })
    expect(await read('.hidden/secret.md')).toEqual({ status: 'refused', reason: 'hidden' })
    expect(await read('.ieumoffice/ignore')).toEqual({ status: 'refused', reason: 'hidden' })
    expect(await read('~$lock.docx')).toEqual({ status: 'refused', reason: 'hidden' })
    expect(await read('node_modules/pkg.md')).toEqual({ status: 'refused', reason: 'hidden' })
    expect(await read('drafts/old.md')).toEqual({ status: 'refused', reason: 'ignored' })
    expect(await read('missing.md')).toEqual({ status: 'refused', reason: 'not-found' })
    expect(await read('reports')).toEqual({ status: 'refused', reason: 'not-found' })
  })

  it('accepts an absolute path that lies inside the folder', async () => {
    expect((await read(join(root, 'notes.md'))).status).toBe('ok')
  })

  it('reads through the attachment path, so withheld text stays withheld', async () => {
    const result = await read('masked.md')
    expect(result.status).toBe('ok')
    const text = (result as { text: string }).text
    expect(text).not.toContain(SECRET)
    expect(text).toContain(`{{${LABEL}}}`)
  })

  it('refuses a mark it cannot process rather than reading it raw', async () => {
    put(
      root,
      'broken.md',
      `call <span class="redact-span" data-redaction="" data-label="${LABEL}">${SECRET} soon`,
    )
    expect(await read('broken.md')).toEqual({ status: 'refused', reason: 'unreadable' })
  })

  it('refuses a file open with unsaved changes', async () => {
    setOpenFilesSource(() => [{ filePath: join(root, 'notes.md'), dirty: true }])
    expect(await read('notes.md')).toEqual({ status: 'refused', reason: 'unsaved' })
  })

  it('refuses a file over the size limit and one the parser cannot read', async () => {
    const big = put(root, 'huge.txt', '')
    truncateSync(big, 51 * 1024 * 1024)
    expect(await read('huge.txt')).toEqual({ status: 'refused', reason: 'too-large' })
    put(root, 'bad.docx', 'not a zip')
    expect(await read('bad.docx')).toEqual({ status: 'refused', reason: 'unreadable' })
    expect(await read('picture.png')).toEqual({ status: 'refused', reason: 'unreadable' })
  })

  it('does not ask before reading a file that is on this PC', async () => {
    expect((await read('notes.md')).status).toBe('ok')
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks before reading a cloud-only file and reads it on yes', async () => {
    cloud.add(join(root, 'reports', 'plan.md'))
    expect((await read('reports/plan.md')).status).toBe('ok')
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask.mock.calls[0]![0]).toMatchObject({
      owner: WIN,
      projectId,
      fileName: 'plan.md',
      relPath: 'reports/plan.md',
    })
  })

  it('returns the declined result on no, without opening the file', async () => {
    const path = join(root, 'reports', 'plan.md')
    cloud.add(path)
    ask.mockResolvedValueOnce(false)
    // a broken mark would fail the parse: the declined answer shows nothing was parsed
    writeFileSync(path, `<span class="redact-span" data-redaction="" data-label="x">open`)
    expect(await read('reports/plan.md')).toEqual({ status: 'declined' })
    ask.mockRejectedValueOnce(new Error('dialog failed'))
    expect(await read('reports/plan.md')).toEqual({ status: 'declined' })
  })
})

/** the 8.3 short name Windows made for `<dir>/<name>`, or null when short names are off */
function shortNameOf(dir: string, name: string): string | null {
  if (process.platform !== 'win32') return null
  let listing: string
  try {
    listing = execFileSync('cmd', ['/d', '/c', 'dir', '/x', '/a', dir], { encoding: 'latin1' })
  } catch {
    return null
  }
  for (const line of listing.split(/\r?\n/)) {
    const match = /\s(\S+~\d+\S*)\s+(\S+)\s*$/.exec(line)
    if (match && match[2] === name) return match[1]!
  }
  return null
}

describe('project_read: other names for the same entry (Windows)', () => {
  async function read(relPath: string) {
    const scope = await tools.openScope(WIN, { projectId })
    return tools.read(WIN, { scope, relPath })
  }

  it.runIf(process.platform === 'win32')(
    'refuses a trailing dot or space that names a hidden or ignored entry',
    async () => {
      put(root, '.ieumoffice/memory.md', 'remembered secret')
      for (const alias of [
        'drafts./old.md',
        'drafts /old.md',
        'drafts/old.md.',
        'drafts/old.md ',
        '.ieumoffice./memory.md',
        '.ieumoffice /memory.md',
        'notes.md.',
        'notes.md::$DATA',
      ]) {
        const result = await read(alias)
        expect(result.status, alias).toBe('refused')
      }
      // an absolute path with the same alias is refused too
      const absolute = await tools.readPath(
        WIN,
        projectId,
        join(`${join(root, 'drafts')}.`, 'old.md'),
        0,
      )
      expect(absolute.status).toBe('refused')
    },
  )

  it.runIf(process.platform === 'win32')(
    'judges an 8.3 short name by the real name it stands for',
    async (ctx) => {
      put(root, '.ieumoffice/memory.md', 'remembered secret')
      put(root, 'confidential-folder/x.md', 'confidential body')
      put(root, 'long-visible-name.md', 'visible body')
      await guide.addIgnore(projectId, 'confidential-folder/')
      const dataShort = shortNameOf(root, '.ieumoffice')
      const confShort = shortNameOf(root, 'confidential-folder')
      const fileShort = shortNameOf(root, 'long-visible-name.md')
      if (!dataShort || !confShort || !fileShort) {
        ctx.skip()
        return
      }
      expect(await read(`${dataShort}/memory.md`)).toEqual({ status: 'refused', reason: 'hidden' })
      expect(await read(`${confShort}/x.md`)).toEqual({ status: 'refused', reason: 'ignored' })
      expect(await tools.readPath(WIN, projectId, join(root, dataShort, 'memory.md'), 0)).toEqual({
        status: 'refused',
        reason: 'hidden',
      })
      expect(await tools.readPath(WIN, projectId, join(root, confShort, 'x.md'), 0)).toEqual({
        status: 'refused',
        reason: 'ignored',
      })
      // a short name of a visible file reads, and its unsaved state is found by the real name
      expect(await read(fileShort)).toMatchObject({ status: 'ok', text: 'visible body' })
      setOpenFilesSource(() => [{ filePath: join(root, 'long-visible-name.md'), dirty: true }])
      expect(await read(fileShort)).toEqual({ status: 'refused', reason: 'unsaved' })
      // the download question names the real file
      setOpenFilesSource(null)
      cloud.add(join(root, 'long-visible-name.md'))
      expect((await read(fileShort)).status).toBe('ok')
      expect(ask.mock.calls[0]![0]).toMatchObject({
        fileName: 'long-visible-name.md',
        relPath: 'long-visible-name.md',
      })
    },
  )
})

describe('project_search', () => {
  function index(path: string, body: string): void {
    const st = statSync(path)
    store.upsert({ path, mtimeMs: st.mtimeMs, sizeBytes: st.size }, body, 'ok')
  }

  beforeEach(() => {
    index(join(root, 'notes.md'), 'budget notes for the year')
    index(join(root, 'reports', 'plan.md'), 'budget plan body')
    index(join(root, 'drafts', 'old.md'), 'budget draft')
    index(join(outside, 'outside.md'), 'budget outside the project')
  })

  it('finds visible files of the project only, with excerpts', async () => {
    const scope = await tools.openScope(WIN, { projectId })
    const found = await tools.search(WIN, { scope, query: 'budget' })
    expect(found.hits.map((h) => h.relPath).sort()).toEqual(['notes.md', 'reports/plan.md'])
    expect(found.total).toBe(2)
    const plan = found.hits.find((h) => h.relPath === 'reports/plan.md')!
    expect(plan).toMatchObject({ name: 'plan.md', ext: 'md', cloudOnly: false })
    expect(plan.snippet).toContain('budget')
  })

  it('narrows in the query, so other folders cannot fill the page first', async () => {
    for (let i = 0; i < 60; i++) {
      index(put(outside, `budget-${i}.md`, 'budget'), 'budget budget budget')
    }
    const scope = await tools.openScope(WIN, { projectId })
    const found = await tools.search(WIN, { scope, query: 'budget', limit: 1 })
    expect(found.hits).toHaveLength(1)
    expect(found.total).toBe(2)
    const next = await tools.search(WIN, { scope, query: 'budget', limit: 1, offset: 1 })
    expect(next.hits).toHaveLength(1)
    expect(next.hits[0]!.relPath).not.toBe(found.hits[0]!.relPath)
  })

  it('restricts by extension', async () => {
    index(put(root, 'sheet.csv', 'budget,1'), 'budget 1')
    const scope = await tools.openScope(WIN, { projectId })
    const found = await tools.search(WIN, { scope, query: 'budget', exts: ['csv'] })
    expect(found.hits.map((h) => h.relPath)).toEqual(['sheet.csv'])
  })

  it('quotes no excerpt from a file saved since its scan or open with unsaved changes', async () => {
    writeFileSync(join(root, 'notes.md'), `budget notes ${SECRET} changed after the scan`)
    setOpenFilesSource(() => [{ filePath: join(root, 'reports', 'plan.md'), dirty: true }])
    const scope = await tools.openScope(WIN, { projectId })
    const found = await tools.search(WIN, { scope, query: 'budget' })
    expect(found.hits.map((h) => h.relPath).sort()).toEqual(['notes.md', 'reports/plan.md'])
    for (const hit of found.hits) expect(hit.snippet).toBe('')
  })

  it('marks cloud-only hits', async () => {
    cloud.add(join(root, 'notes.md'))
    const scope = await tools.openScope(WIN, { projectId })
    const found = await tools.search(WIN, { scope, query: 'budget' })
    expect(found.hits.find((h) => h.relPath === 'notes.md')!.cloudOnly).toBe(true)
  })

  it('returns nothing for an empty query or no index', async () => {
    const scope = await tools.openScope(WIN, { projectId })
    expect(await tools.search(WIN, { scope, query: '  ' })).toEqual({ hits: [], total: 0 })
    tools = makeTools({ store: () => null })
    expect(await tools.search(WIN, { scope, query: 'budget' })).toEqual({ hits: [], total: 0 })
  })
})

describe('home ask: project folder plus the starred scope', () => {
  let starredA: string
  let starredB: string
  let groupOf: Map<string, string>

  beforeEach(() => {
    starredA = put(outside, 'starred-a.md', 'budget starred a')
    starredB = put(outside, 'starred-b.md', 'budget starred b')
    groupOf = new Map([[starredA, 'A']])
  })

  it('parses the open request: a group name alone, or an object with a project', () => {
    expect(parseKbOpenScope('A')).toEqual({ group: 'A', projectId: null })
    expect(parseKbOpenScope({ group: 'A', projectId })).toEqual({ group: 'A', projectId })
    expect(parseKbOpenScope({ projectId })).toEqual({ group: null, projectId })
    expect(parseKbOpenScope({ group: null, projectId: 5 })).toEqual({
      group: null,
      projectId: null,
    })
  })

  it('holds all starred files plus the project, or a group plus the project', () => {
    const all = scopes.openProject(WIN, projectId, 'all')
    expect(scopes.narrow(WIN, { scope: all }, [starredA, starredB], () => groupOf)).toEqual([
      starredA,
      starredB,
    ])
    expect(scopes.projectOf(WIN, { scope: all })).toBe(projectId)
    const group = scopes.openProject(WIN, projectId, { group: 'A' }, groupOf)
    expect(scopes.narrow(WIN, { scope: group }, [starredA, starredB], () => groupOf)).toEqual([
      starredA,
    ])
    const none = scopes.openProject(WIN, projectId)
    expect(scopes.narrow(WIN, { scope: none }, [starredA, starredB], () => groupOf)).toEqual([])
    expect(() => scopes.openProject(WIN, projectId, { group: 'Z' }, groupOf)).toThrow(
      KB_GROUP_EMPTY,
    )
    expect(scopes.projectOf(WIN, {})).toBeNull()
    expect(scopes.projectOf(WIN, { scope: scopes.open(WIN, 'A', groupOf) })).toBeNull()
    expect(() => scopes.projectOf(WIN, { scope: 'made-up' })).toThrow(KB_SCOPE_UNKNOWN)
    expect(() => scopes.projectOf(OTHER_WINDOW, { scope: all })).toThrow(KB_SCOPE_UNKNOWN)
  })

  it('reads a starred file or a project-visible file, and refuses anything else', async () => {
    const scope = scopes.openProject(WIN, projectId, { group: 'A' }, groupOf)
    const projectRead = (path: string, offset: number) =>
      tools.readPath(WIN, projectId, path, offset)
    const allowed = (path: string) =>
      [starredA, starredB].includes(path) &&
      scopes.narrow(WIN, { scope }, [path], () => groupOf).includes(path)

    const starredPage = await readKnowledgeOrProjectPage(
      starredA,
      0,
      allowed(starredA),
      projectRead,
    )
    expect(starredPage.text).toBe('budget starred a')
    const projectPage = await readKnowledgeOrProjectPage(
      join(root, 'notes.md'),
      0,
      allowed(join(root, 'notes.md')),
      projectRead,
    )
    expect(projectPage.text).toBe('budget notes for the year')
    // a starred file of another group, an ignored project file, a file in neither
    for (const path of [starredB, join(root, 'drafts', 'old.md'), join(outside, 'outside.md')]) {
      await expect(readKnowledgeOrProjectPage(path, 0, allowed(path), projectRead)).rejects.toThrow(
        KB_NOT_IN_BASE,
      )
    }
    // a run without a project reads starred files only
    await expect(
      readKnowledgeOrProjectPage(join(root, 'notes.md'), 0, false, null),
    ).rejects.toThrow(KB_NOT_IN_BASE)
  })

  it('asks before a starred-scope read reaches a cloud-only project file', async () => {
    cloud.add(join(root, 'notes.md'))
    ask.mockResolvedValueOnce(false)
    const projectRead = (path: string, offset: number) =>
      tools.readPath(WIN, projectId, path, offset)
    await expect(
      readKnowledgeOrProjectPage(join(root, 'notes.md'), 0, false, projectRead),
    ).rejects.toThrow(KB_DOWNLOAD_DECLINED)
    // a starred file is one the person chose: read as today, no question
    cloud.add(starredA)
    expect((await readKnowledgeOrProjectPage(starredA, 0, true, projectRead)).text).toContain('a')
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('searches starred and project-visible files, narrowed in the query', async () => {
    const index = (path: string, body: string) => {
      const st = statSync(path)
      store.upsert({ path, mtimeMs: st.mtimeMs, sizeBytes: st.size }, body, 'ok')
    }
    index(starredA, 'budget starred a')
    index(starredB, 'budget starred b')
    index(join(root, 'notes.md'), 'budget notes')
    index(join(root, 'drafts', 'old.md'), 'budget draft')
    index(join(outside, 'outside.md'), 'budget outside')
    const within = await tools.visibleTest(projectId)
    expect(within).not.toBeNull()
    const search = (q: string, limit: number, filter?: (path: string) => boolean) =>
      store.search(q, { limit, ...(filter ? { within: filter } : {}) }).hits.map((h) => ({
        path: h.path,
        name: h.name,
        ext: h.ext,
        snippetText: (h.snippet ?? []).map((p) => p.text).join(''),
      }))
    const hits = await searchSavedKnowledgeWithProject(
      search,
      'budget',
      [starredA],
      8,
      within,
      (paths) => store.pathsIndexedAsOnDisk(paths),
    )
    expect(hits.map((h) => h.path).sort()).toEqual([starredA, join(root, 'notes.md')].sort())
    // no project: exactly the starred search of today
    const starredOnly = await searchSavedKnowledgeWithProject(
      search,
      'budget',
      [starredA, starredB],
      8,
      null,
      (paths) => store.pathsIndexedAsOnDisk(paths),
    )
    expect(starredOnly.map((h) => h.path).sort()).toEqual([starredA, starredB].sort())
  })
})
