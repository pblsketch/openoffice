import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectTrustAnswer } from '@genoffice/project-store'
import type { JevTransport } from '../src/main/file-index/decider'
import { FileIndexer } from '../src/main/file-index/indexer'
import { normalizeFileSearchSettings, SearchReranker } from '../src/main/file-index/rerank'
import { FileIndexStore } from '../src/main/file-index/store'
import { ProjectGuide } from '../src/main/projects/project-guide'
import {
  createContextFiles,
  listIgnoredFiles,
  listVisibleFiles,
  PROJECT_CONTEXT_FILES_LIMIT,
} from '../src/main/projects/project-files'
import {
  createProjectNameOnly,
  createRerankIgnoreFilter,
  mergeIndexRoots,
  projectFolderRoots,
} from '../src/main/projects/project-index'

/**
 * The project folders in the home search index (spec 5.8, 5.9): they join the
 * indexer's roots, a cloud-only file inside one is indexed by name only (its
 * body is never extracted, so it is never downloaded), files outside every
 * project keep today's treatment, and `ignore` keeps paths out of what the
 * reranker sends out while the home results still show them.
 */

// walks like the real scan and answers every extraction with "body of <path>"
const WORKER = join(__dirname, 'file-index-test-worker.mjs')

let base: string
let home: string
let userData: string
let settingsPath: string
let homeRoot: string
let project: string
let projectId: string
let guide: ProjectGuide
let store: FileIndexStore
let indexer: FileIndexer | null

const never = async (): Promise<ProjectTrustAnswer> => {
  throw new Error('the trust prompt should not be shown')
}

function put(path: string, text: string, mtimeSec?: number): string {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
  if (mtimeSec !== undefined) utimesSync(path, mtimeSec, mtimeSec)
  return path
}

beforeEach(async () => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'project-index-')))
  home = join(base, 'home')
  userData = join(base, 'appdata')
  mkdirSync(home)
  mkdirSync(userData)
  settingsPath = join(userData, 'app-settings.json')
  homeRoot = join(base, 'docs')
  project = join(homeRoot, 'project')
  mkdirSync(project, { recursive: true })
  guide = new ProjectGuide({
    settingsPath,
    homeDir: home,
    userData,
    defaultParentDir: () => join(base, 'documents'),
    env: {},
  })
  const added = await guide.addFolder(project, never)
  if (added.status !== 'added') throw new Error(JSON.stringify(added))
  projectId = added.project.id
  store = new FileIndexStore(join(base, 'index.db'))
  indexer = null
})

afterEach(() => {
  indexer?.stop()
  store.close()
  rmSync(base, { recursive: true, force: true })
})

describe('index roots', () => {
  it('lists the registered project folders that exist', () => {
    expect(projectFolderRoots(settingsPath)).toEqual([project])
    rmSync(project, { recursive: true, force: true })
    expect(projectFolderRoots(settingsPath)).toEqual([])
  })

  it('adds project folders to the home roots, once, skipping those already inside one', () => {
    expect(mergeIndexRoots(['/a', '/b'], ['/a/p', '/c', '/c'], 'linux')).toEqual(['/a', '/b', '/c'])
    expect(mergeIndexRoots(['C:\\Docs'], ['c:\\docs\\Proj', 'D:\\Work'], 'win32')).toEqual([
      'C:\\Docs',
      'D:\\Work',
    ])
    expect(mergeIndexRoots(['/a'], [], 'linux')).toEqual(['/a'])
  })
})

describe('name-only decision', () => {
  it('asks the detector once, for paths inside project folders only', async () => {
    const resolve = vi.fn(async (paths: readonly string[]) => new Map(paths.map((p) => [p, true])))
    const decide = createProjectNameOnly({
      projectRoots: () => [project],
      resolveCloudOnly: resolve,
    })
    const inside = [join(project, 'a.md'), join(project, 'sub', 'b.md')]
    const out = await decide([...inside, join(homeRoot, 'c.md')])
    expect([...out].sort()).toEqual([...inside].sort())
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve.mock.calls[0]![0]).toEqual(inside)
  })

  it('does not run the detector when no path is inside a project', async () => {
    const resolve = vi.fn()
    const decide = createProjectNameOnly({
      projectRoots: () => [project],
      resolveCloudOnly: resolve,
    })
    expect([...(await decide([join(homeRoot, 'c.md')]))]).toEqual([])
    expect(resolve).not.toHaveBeenCalled()
  })

  it('treats every project path as not on this PC when detection fails', async () => {
    const decide = createProjectNameOnly({
      projectRoots: () => [project],
      resolveCloudOnly: async () => {
        throw new Error('listing failed')
      },
    })
    const inside = join(project, 'a.md')
    expect([...(await decide([inside, join(homeRoot, 'c.md')]))]).toEqual([inside])
  })
})

describe('indexer with project folders', () => {
  let cloud: Set<string>

  function makeIndexer(nameOnly = true): FileIndexer {
    const resolve = vi.fn(
      async (paths: readonly string[]) => new Map(paths.map((p) => [p, cloud.has(p)])),
    )
    return new FileIndexer(store, WORKER, {
      roots: () => mergeIndexRoots([homeRoot], projectFolderRoots(settingsPath)),
      extraPaths: () => [],
      ...(nameOnly
        ? {
            nameOnly: createProjectNameOnly({
              projectRoots: () => projectFolderRoots(settingsPath),
              resolveCloudOnly: resolve,
            }),
          }
        : {}),
    })
  }

  async function settle(ix: FileIndexer): Promise<void> {
    await ix.scan()
    await vi.waitFor(() => expect(ix.progress()).toMatchObject({ pending: 0, scanning: false }), {
      timeout: 5_000,
      interval: 20,
    })
    // the last queued file may still be on its way in
    await new Promise((r) => setTimeout(r, 50))
  }

  beforeEach(() => {
    cloud = new Set()
  })

  it('indexes a cloud-only file inside a project by name only, and the rest as today', async () => {
    const cloudFile = put(join(project, 'cloud.md'), 'x')
    const localFile = put(join(project, 'local.md'), 'x')
    const outsideCloud = put(join(homeRoot, 'outside.md'), 'x')
    cloud.add(cloudFile)
    cloud.add(outsideCloud) // outside every project: the rule does not apply
    indexer = makeIndexer()
    await settle(indexer)
    const rows = store.listAll()
    expect(rows.get(cloudFile)?.status).toBe('cloud')
    expect(rows.get(localFile)?.status).toBe('ok')
    expect(rows.get(outsideCloud)?.status).toBe('ok')
    // no body was extracted, so nothing from it can be quoted
    const hit = store.search('cloud').hits.find((h) => h.path === cloudFile)
    expect(hit?.snippet).toBeNull()
    expect(store.excerptsFor([cloudFile], 'body', 100)[0]!.excerpt).toBe('')
  })

  it('applies the rule to a project folder that also lies inside a home root, and indexes it once', async () => {
    const cloudFile = put(join(project, 'deep', 'cloud.md'), 'x')
    cloud.add(cloudFile)
    indexer = makeIndexer()
    await settle(indexer)
    expect(store.listAll().get(cloudFile)?.status).toBe('cloud')
    expect(store.count()).toBe(1)
  })

  it('extracts the body once the file is on this PC', async () => {
    const cloudFile = put(join(project, 'cloud.md'), 'x')
    cloud.add(cloudFile)
    indexer = makeIndexer()
    await settle(indexer)
    expect(store.listAll().get(cloudFile)?.status).toBe('cloud')
    cloud.delete(cloudFile)
    await settle(indexer)
    expect(store.listAll().get(cloudFile)?.status).toBe('ok')
    expect(store.excerptsFor([cloudFile], 'body', 100)[0]!.excerpt).toContain('body of')
  })

  it('without the project hook every file is extracted as before', async () => {
    const cloudFile = put(join(project, 'cloud.md'), 'x')
    cloud.add(cloudFile)
    indexer = makeIndexer(false)
    await settle(indexer)
    expect(store.listAll().get(cloudFile)?.status).toBe('ok')
  })
})

describe('reranking leaves ignored paths out of what it sends', () => {
  const settings = normalizeFileSearchSettings({
    rerank: true,
    endpoint: 'openrouter',
    keys: { openrouter: 'k' },
  })
  const judge =
    (seen: string[][]): JevTransport =>
    async (_url, body) => {
      const docs = JSON.parse(body).state.documents as Array<{ title: string }>
      seen.push(docs.map((d) => d.title))
      const answers = Object.fromEntries(
        docs.map((_d, i) => [
          `d${i}`,
          { type: 'score', score: 2, confidence: 0.9, probabilities: { 0: 0, 1: 0, 2: 1 } },
        ]),
      )
      return {
        status: 200,
        body: JSON.stringify({ model: 'typesafe/jev-1.13', answers, usage: { input_tokens: 1 } }),
      }
    }

  function indexed(path: string): string {
    put(path, 'budget')
    const st = statSync(path)
    store.upsert({ path, mtimeMs: st.mtimeMs, sizeBytes: st.size }, 'budget text', 'ok')
    return path
  }

  it('filters paths ignored by any project, keeps the rest', async () => {
    await guide.addIgnore(projectId, 'private/')
    const kept = indexed(join(project, 'open.md'))
    const ignored = indexed(join(project, 'private', 'secret.md'))
    const outside = indexed(join(homeRoot, 'outside.md'))
    const filter = createRerankIgnoreFilter({ guide })
    expect(await filter([kept, ignored, outside])).toEqual([kept, outside])

    const seen: string[][] = []
    const result = await new SearchReranker(store, judge(seen), filter).rerank(
      'budget',
      [kept, ignored, outside],
      settings,
    )
    expect(seen).toEqual([['open.md', 'outside.md']])
    expect(result!.order).not.toContain(ignored)
    // the home results themselves still find it
    expect(store.search('budget').hits.map((h) => h.path)).toContain(ignored)
  })

  it('keeps today’s behaviour without a filter', async () => {
    const a = indexed(join(project, 'a.md'))
    const b = indexed(join(project, 'b.md'))
    const seen: string[][] = []
    await new SearchReranker(store, judge(seen)).rerank('budget', [a, b], settings)
    expect(seen).toEqual([['a.md', 'b.md']])
  })
})

describe('file names for the per-send context', () => {
  it('sends the newest files first up to the limit, with the rest counted and cloud marked', async () => {
    for (let i = 0; i < 5; i++) put(join(project, `f${i}.md`), 'x', 1_700_000_000 + i)
    put(join(project, '.hidden.md'), 'x', 1_800_000_000)
    put(join(project, '.ieumoffice', 'memory.md'), 'x', 1_800_000_000)
    const cloud = join(project, 'f3.md')
    const resolve = vi.fn(
      async (paths: readonly string[]) => new Map(paths.map((p) => [p, p === cloud])),
    )
    const contextFiles = createContextFiles({ resolveCloudOnly: resolve, limit: 3 })
    const visibility = (await guide.aiVisibility(projectId))!
    const result = await contextFiles({ id: projectId, root: project, visibility })
    expect(result.files.map((f) => f.relPath)).toEqual(['f4.md', 'f3.md', 'f2.md'])
    expect(result.files.map((f) => f.cloudOnly)).toEqual([false, true, false])
    expect(result.omitted).toBe(2)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve.mock.calls[0]![0]).toHaveLength(3)
  })

  it('defaults to 500 and plugs into the guide’s context', async () => {
    expect(PROJECT_CONTEXT_FILES_LIMIT).toBe(500)
    put(join(project, 'only.md'), 'x')
    const withFiles = new ProjectGuide({
      settingsPath,
      homeDir: home,
      userData,
      defaultParentDir: () => join(base, 'documents'),
      env: {},
      contextFiles: createContextFiles({
        resolveCloudOnly: async (p) => new Map(p.map((x) => [x, false])),
      }),
    })
    const read = await withFiles.readContext(projectId)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.context.files.map((f) => f.relPath)).toEqual(['only.md'])
    expect(read.context.filesOmitted).toBe(0)
  })
})

describe('files `ignore` keeps from the AI (project screen)', () => {
  it('lists ignored supported files, including those under an ignored folder, and nothing hidden', async () => {
    put(join(project, 'open.md'), 'x', 1_700_000_001)
    put(join(project, 'private', 'a.md'), 'x', 1_700_000_003)
    put(join(project, 'notes.secret.md'), 'x', 1_700_000_002)
    put(join(project, '.hidden', 'b.md'), 'x', 1_700_000_004)
    await guide.addIgnore(projectId, 'private/')
    await guide.addIgnore(projectId, 'notes.secret.md')
    const visibility = (await guide.aiVisibility(projectId))!
    expect((await listIgnoredFiles(visibility)).map((f) => f.relPath)).toEqual([
      'private/a.md',
      'notes.secret.md',
    ])
    expect((await listVisibleFiles(visibility)).map((f) => f.relPath)).toEqual(['open.md'])
  })
})
