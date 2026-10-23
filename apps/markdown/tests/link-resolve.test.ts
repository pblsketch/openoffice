// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  MAX_EMBED_IMAGE_BYTES,
  VaultIndexCache,
  findVaultRoot,
  isNetworkPath,
  listVault,
  pickVaultFile,
  resolveEmbedImage,
  resolveLinkPath,
  resolveWikiTarget,
  suggestNotes,
} from '../src/main/link-resolve'

let base: string
let vault: string
let note: string

function file(rel: string, content = 'x'): string {
  const path = join(vault, ...rel.split('/'))
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  return path
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'md-links-'))
  vault = join(base, 'vault')
  mkdirSync(join(vault, '.obsidian'), { recursive: true })
  note = file('projects/alpha/Plan.md', '# Plan')
  file('projects/alpha/Tasks.md')
  file('projects/beta/Tasks.md')
  file('Tasks.md')
  file('Index.md')
  file('people/Kim Min.md')
  file('attachments/diagram.png')
  file('attachments/report.pdf')
  file('attachments/Drawing.excalidraw.md')
  file('.trash/Old.md')
  file('projects/alpha/notes.txt')
  writeFileSync(join(base, 'outside.png'), 'x')
  writeFileSync(join(base, 'Outside.md'), 'x')
})

afterAll(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('isNetworkPath', () => {
  it('flags UNC and double-slash paths', () => {
    expect(isNetworkPath('\\\\server\\share\\a.md')).toBe(true)
    expect(isNetworkPath('//server/share/a.md')).toBe(true)
    expect(isNetworkPath('C:\\a.md')).toBe(false)
    expect(isNetworkPath('../a.md')).toBe(false)
  })
})

describe('findVaultRoot', () => {
  it('climbs to the folder holding .obsidian', async () => {
    expect(await findVaultRoot(note)).toBe(vault)
  })

  it('falls back to the note folder outside a vault', async () => {
    expect(await findVaultRoot(join(base, 'Outside.md'))).toBe(base)
  })
})

describe('resolveLinkPath', () => {
  it('resolves against the note folder and tries .md for a bare name', async () => {
    expect(await resolveLinkPath(note, 'Tasks.md')).toEqual({
      ok: true,
      path: join(vault, 'projects', 'alpha', 'Tasks.md'),
    })
    expect(await resolveLinkPath(note, '../../Index')).toEqual({
      ok: true,
      path: join(vault, 'Index.md'),
    })
    expect(await resolveLinkPath(note, 'notes.txt')).toEqual({
      ok: true,
      path: join(vault, 'projects', 'alpha', 'notes.txt'),
    })
  })

  it('reports untitled, missing and network targets', async () => {
    expect(await resolveLinkPath(null, 'Tasks.md')).toEqual({ ok: false, reason: 'untitled' })
    expect(await resolveLinkPath(note, 'Nope.md')).toEqual({ ok: false, reason: 'not-found' })
    expect(await resolveLinkPath(note, '\\\\server\\share\\a.md')).toEqual({
      ok: false,
      reason: 'blocked',
    })
    expect(await resolveLinkPath(note, '//server/share/a.md')).toEqual({
      ok: false,
      reason: 'blocked',
    })
  })

  it('does not take a folder for a file', async () => {
    expect(await resolveLinkPath(note, '../beta')).toEqual({ ok: false, reason: 'not-found' })
  })
})

describe('resolveWikiTarget', () => {
  const cache = new VaultIndexCache()

  it('finds a bare name anywhere in the vault, closest to the note first', async () => {
    expect(await resolveWikiTarget(note, 'Tasks', cache)).toEqual({
      ok: true,
      path: join(vault, 'projects', 'alpha', 'Tasks.md'),
    })
    expect(await resolveWikiTarget(note, 'kim min', cache)).toEqual({
      ok: true,
      path: join(vault, 'people', 'Kim Min.md'),
    })
  })

  it('prefers the shallower file when none shares the note folder', async () => {
    const other = file('people/Profile.md')
    expect(await resolveWikiTarget(other, 'Tasks', cache)).toEqual({
      ok: true,
      path: join(vault, 'Tasks.md'),
    })
  })

  it('takes a path from the note folder or the vault root', async () => {
    expect(await resolveWikiTarget(note, 'beta/Tasks', cache)).toEqual({
      ok: true,
      path: join(vault, 'projects', 'beta', 'Tasks.md'),
    })
    expect(await resolveWikiTarget(note, 'projects/beta/Tasks', cache)).toEqual({
      ok: true,
      path: join(vault, 'projects', 'beta', 'Tasks.md'),
    })
  })

  it('opens other formats and Obsidian drawing names', async () => {
    expect(await resolveWikiTarget(note, 'report.pdf', cache)).toEqual({
      ok: true,
      path: join(vault, 'attachments', 'report.pdf'),
    })
    expect(await resolveWikiTarget(note, 'Drawing.excalidraw', cache)).toEqual({
      ok: true,
      path: join(vault, 'attachments', 'Drawing.excalidraw.md'),
    })
  })

  it('never leaves the vault or reads hidden folders', async () => {
    expect(await resolveWikiTarget(note, '../../../Outside', cache)).toEqual({
      ok: false,
      reason: 'not-found',
    })
    expect(await resolveWikiTarget(note, 'Old', cache)).toEqual({
      ok: false,
      reason: 'not-found',
    })
    expect(await resolveWikiTarget(note, join(base, 'Outside.md'), cache)).toEqual({
      ok: false,
      reason: 'blocked',
    })
    expect(await resolveWikiTarget(note, '\\\\server\\x', cache)).toEqual({
      ok: false,
      reason: 'blocked',
    })
  })

  it('needs a saved note', async () => {
    expect(await resolveWikiTarget(null, 'Tasks', cache)).toEqual({
      ok: false,
      reason: 'untitled',
    })
  })

  it('sees a note created after the listing', async () => {
    const fresh = new VaultIndexCache()
    await fresh.get(vault)
    file('Brand New.md')
    expect(await resolveWikiTarget(note, 'Brand New', fresh)).toEqual({
      ok: true,
      path: join(vault, 'Brand New.md'),
    })
  })
})

describe('pickVaultFile', () => {
  it('matches whole names only', () => {
    const index = { root: vault, files: ['a/MyTasks.md', 'b/Tasks.md'], truncated: false }
    expect(pickVaultFile(index, 'a/Note.md', ['Tasks.md'])).toBe('b/Tasks.md')
  })
})

describe('listVault', () => {
  it('stops at the limit and says so', async () => {
    const index = await listVault(vault, 3)
    expect(index.files).toHaveLength(3)
    expect(index.truncated).toBe(true)
    expect(index.files.some((f) => f.startsWith('.'))).toBe(false)
  })
})

describe('VaultIndexCache', () => {
  it('reuses a listing for a while', async () => {
    let now = 0
    let walks = 0
    const cache = new VaultIndexCache(
      () => now,
      async (root) => {
        walks++
        return { root, files: [], truncated: false }
      },
    )
    await cache.get('r')
    await cache.get('r')
    expect(walks).toBe(1)
    now = 60_000
    await cache.get('r')
    expect(walks).toBe(2)
    await cache.get('r', true)
    expect(walks).toBe(3)
  })
})

describe('resolveEmbedImage', () => {
  const cache = new VaultIndexCache()

  it('finds a picture in the vault', async () => {
    const found = await resolveEmbedImage(note, 'diagram.png', cache)
    expect(found?.toLowerCase().endsWith(join('attachments', 'diagram.png').toLowerCase())).toBe(
      true,
    )
  })

  it('refuses non-pictures, pictures outside the vault and untitled notes', async () => {
    expect(await resolveEmbedImage(note, 'report.pdf', cache)).toBeNull()
    expect(await resolveEmbedImage(note, '../../../outside.png', cache)).toBeNull()
    expect(await resolveEmbedImage(null, 'diagram.png', cache)).toBeNull()
  })

  it('refuses a picture over the size limit', async () => {
    const big = file('attachments/huge.png')
    truncateSync(big, MAX_EMBED_IMAGE_BYTES + 1)
    expect(await resolveEmbedImage(note, 'huge.png', new VaultIndexCache())).toBeNull()
  })
})

describe('suggestNotes', () => {
  const cache = new VaultIndexCache()

  it('lists notes by name, prefix matches first', async () => {
    // `attachments/…` matches by path and comes after every name match
    const items = (await suggestNotes(note, 'ta', cache)).slice(0, 3)
    expect(items.map((i) => i.name)).toEqual(['Tasks', 'Tasks', 'Tasks'])
    expect(items.map((i) => i.insert)).toEqual([
      'Tasks',
      'projects/beta/Tasks',
      'projects/alpha/Tasks',
    ])
  })

  it('uses the bare name when it is unique and leaves out hidden folders', async () => {
    const items = await suggestNotes(note, 'kim', cache)
    expect(items).toEqual([{ name: 'Kim Min', folder: 'people', insert: 'Kim Min' }])
    expect((await suggestNotes(note, 'old', cache)).length).toBe(0)
  })

  it('offers nothing to an untitled note', async () => {
    expect(await suggestNotes(null, '', cache)).toEqual([])
  })
})
