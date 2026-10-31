import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectWriteGuard, ProjectWriteRefused } from '../src/main/projects/write-guard'

/** The single write guard for project folders (spec 3, invariants 3 and 9) */

let base: string
let root: string
let outside: string
let guard: ProjectWriteGuard

beforeEach(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'project-guard-')))
  root = join(base, 'project')
  outside = join(base, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
  guard = new ProjectWriteGuard()
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

/** Junctions need no privilege on Windows; elsewhere a directory symlink */
function linkDir(target: string, path: string): boolean {
  try {
    symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir')
    return true
  } catch {
    return false
  }
}

function linkFile(target: string, path: string): boolean {
  try {
    symlinkSync(target, path, 'file')
    return true
  } catch {
    return false
  }
}

describe('data writes', () => {
  it('creates .ieumoffice lazily on the first write only', async () => {
    expect(guard.dataPath(root, 'memory.md')).toBe(join(root, '.ieumoffice', 'memory.md'))
    expect(existsSync(join(root, '.ieumoffice'))).toBe(false)
    await guard.writeData(root, 'chats/a.json', '{}')
    expect(readFileSync(join(root, '.ieumoffice', 'chats', 'a.json'), 'utf8')).toBe('{}')
  })

  it('writes through a temporary file and leaves no temporary files behind', async () => {
    await guard.writeData(root, 'memory.md', 'one')
    await guard.writeData(root, 'memory.md', 'two')
    expect(readFileSync(join(root, '.ieumoffice', 'memory.md'), 'utf8')).toBe('two')
    expect(readdirSync(join(root, '.ieumoffice'))).toEqual(['memory.md'])
  })

  it('refuses .. and absolute and stream paths', async () => {
    for (const rel of [
      '../x.md',
      'chats/../../x.md',
      join(outside, 'x.md'),
      'memory.md:evil',
      '',
    ]) {
      await expect(guard.writeData(root, rel, 'x')).rejects.toBeInstanceOf(ProjectWriteRefused)
    }
    expect(existsSync(join(base, 'x.md'))).toBe(false)
    expect(existsSync(join(root, '.ieumoffice'))).toBe(false)
  })

  it('refuses a linked .ieumoffice folder', async () => {
    if (!linkDir(outside, join(root, '.ieumoffice'))) return
    await expect(guard.writeData(root, 'memory.md', 'x')).rejects.toBeInstanceOf(
      ProjectWriteRefused,
    )
    expect(existsSync(join(outside, 'memory.md'))).toBe(false)
  })

  it('refuses a linked folder inside .ieumoffice', async () => {
    mkdirSync(join(root, '.ieumoffice'))
    if (!linkDir(outside, join(root, '.ieumoffice', 'chats'))) return
    await expect(guard.writeData(root, 'chats/a.json', 'x')).rejects.toBeInstanceOf(
      ProjectWriteRefused,
    )
    expect(readdirSync(outside)).toEqual([])
  })

  it('refuses a linked target file', async () => {
    mkdirSync(join(root, '.ieumoffice'))
    writeFileSync(join(outside, 'target.md'), 'keep')
    if (!linkFile(join(outside, 'target.md'), join(root, '.ieumoffice', 'memory.md'))) return
    await expect(guard.writeData(root, 'memory.md', 'x')).rejects.toBeInstanceOf(
      ProjectWriteRefused,
    )
    expect(readFileSync(join(outside, 'target.md'), 'utf8')).toBe('keep')
  })

  it('refuses a project root that is not its canonical path any more', async () => {
    const alias = join(base, 'alias')
    if (!linkDir(root, alias)) return
    await expect(guard.writeData(alias, 'memory.md', 'x')).rejects.toBeInstanceOf(
      ProjectWriteRefused,
    )
  })

  it('fails (not refuses) when the folder is gone', async () => {
    rmSync(root, { recursive: true })
    const error = await guard.writeData(root, 'memory.md', 'x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(existsSync(root)).toBe(false)
  })

  it('appends without following a hard link', async () => {
    await guard.appendData(root, 'chats/a.jsonl', 'one\n')
    await guard.appendData(root, 'chats/a.jsonl', 'two\n')
    expect(readFileSync(join(root, '.ieumoffice', 'chats', 'a.jsonl'), 'utf8')).toBe('one\ntwo\n')
    writeFileSync(join(outside, 'victim.jsonl'), 'keep')
    try {
      linkSync(join(outside, 'victim.jsonl'), join(root, '.ieumoffice', 'chats', 'b.jsonl'))
    } catch {
      return
    }
    await expect(guard.appendData(root, 'chats/b.jsonl', 'x')).rejects.toBeInstanceOf(
      ProjectWriteRefused,
    )
    expect(readFileSync(join(outside, 'victim.jsonl'), 'utf8')).toBe('keep')
  })

  it('serializes writes to one file in arrival order', async () => {
    const order: string[] = []
    const first = guard.updateData(root, 'memory.md', async (current) => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      order.push(`first saw ${current ?? 'nothing'}`)
      return 'A'
    })
    const second = guard.updateData(root, 'memory.md', (current) => {
      order.push(`second saw ${current ?? 'nothing'}`)
      return `${current ?? ''}B`
    })
    await Promise.all([first, second])
    expect(order).toEqual(['first saw nothing', 'second saw A'])
    expect(readFileSync(join(root, '.ieumoffice', 'memory.md'), 'utf8')).toBe('AB')
  })

  it('a failed write does not block the next one in the queue', async () => {
    const failing = guard.updateData(root, 'memory.md', () => {
      throw new Error('boom')
    })
    const next = guard.writeData(root, 'memory.md', 'ok')
    await expect(failing).rejects.toThrow('boom')
    await next
    expect(readFileSync(join(root, '.ieumoffice', 'memory.md'), 'utf8')).toBe('ok')
  })

  it('an update that returns null writes nothing and creates nothing', async () => {
    const result = await guard.updateData(root, 'memory.md', () => null)
    expect(result.written).toBe(false)
    expect(existsSync(join(root, '.ieumoffice'))).toBe(false)
  })

  it('removes a data file and refuses removal outside', async () => {
    await guard.writeData(root, 'memory.20261029-101010.bak.md', 'x')
    await guard.removeData(root, 'memory.20261029-101010.bak.md')
    expect(existsSync(join(root, '.ieumoffice', 'memory.20261029-101010.bak.md'))).toBe(false)
    await expect(guard.removeData(root, '../outside')).rejects.toBeInstanceOf(ProjectWriteRefused)
    expect(existsSync(outside)).toBe(true)
  })
})

describe('new documents (spec 6)', () => {
  it('writes a new document inside the folder', async () => {
    mkdirSync(join(root, 'reports'))
    const target = join(root, 'reports', 'new.docx')
    await guard.writeNewDocument(root, target, Buffer.from('doc'))
    expect(readFileSync(target, 'utf8')).toBe('doc')
  })

  it('never overwrites an existing file', async () => {
    const target = join(root, 'a.docx')
    writeFileSync(target, 'keep')
    await expect(guard.writeNewDocument(root, target, Buffer.from('x'))).rejects.toBeInstanceOf(
      ProjectWriteRefused,
    )
    expect(readFileSync(target, 'utf8')).toBe('keep')
  })

  it('refuses outside the folder, inside .ieumoffice, and through ..', async () => {
    for (const target of [
      join(outside, 'a.docx'),
      join(root, '.ieumoffice', 'a.docx'),
      `${root}${process.platform === 'win32' ? '\\' : '/'}..${process.platform === 'win32' ? '\\' : '/'}a.docx`,
      'relative.docx',
    ]) {
      await expect(guard.writeNewDocument(root, target, Buffer.from('x'))).rejects.toBeInstanceOf(
        ProjectWriteRefused,
      )
    }
    expect(existsSync(join(outside, 'a.docx'))).toBe(false)
    expect(existsSync(join(base, 'a.docx'))).toBe(false)
  })

  it('refuses a linked folder on the way', async () => {
    if (!linkDir(outside, join(root, 'linked'))) return
    await expect(
      guard.writeNewDocument(root, join(root, 'linked', 'a.docx'), Buffer.from('x')),
    ).rejects.toBeInstanceOf(ProjectWriteRefused)
    expect(existsSync(join(outside, 'a.docx'))).toBe(false)
  })
})

describe('project folder creation', () => {
  it('creates one new folder under an existing parent and refuses an existing one', async () => {
    const created = await guard.createProjectFolder(base, 'New project')
    expect(created).toBe(join(base, 'New project'))
    expect(existsSync(created)).toBe(true)
    await expect(guard.createProjectFolder(base, 'New project')).rejects.toBeInstanceOf(
      ProjectWriteRefused,
    )
    await expect(guard.createProjectFolder(base, '../escape')).rejects.toBeInstanceOf(
      ProjectWriteRefused,
    )
  })
})
