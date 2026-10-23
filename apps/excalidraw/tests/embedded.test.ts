// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_PICTURE_BYTES, readEmbeddedPictures, vaultRootOf } from '../src/main/embedded'
import { withDrawingExtension } from '../src/main/save-name'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let base: string
let vault: string
let note: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'xd-embedded-'))
  vault = join(base, 'vault')
  mkdirSync(join(vault, '.obsidian'), { recursive: true })
  mkdirSync(join(vault, 'drawings'), { recursive: true })
  mkdirSync(join(vault, 'assets', 'deep'), { recursive: true })
  mkdirSync(join(vault, '.trash'), { recursive: true })
  note = join(vault, 'drawings', 'board.excalidraw.md')
  writeFileSync(note, '')
  writeFileSync(join(vault, 'assets', 'deep', 'cat.png'), PNG)
  writeFileSync(join(vault, 'drawings', 'local.png'), PNG)
  writeFileSync(join(vault, '.trash', 'hidden.png'), PNG)
  writeFileSync(join(vault, 'notes.md'), '# not a picture')
  writeFileSync(join(base, 'outside.png'), PNG)
})

afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('pictures a note points at', () => {
  it('finds the vault folder above the note', () => {
    expect(vaultRootOf(note)).toBe(vault)
  })

  it('uses the note folder outside a vault', () => {
    const loose = join(base, 'loose.excalidraw.md')
    writeFileSync(loose, '')
    expect(vaultRootOf(loose)).toBe(base)
  })

  it('reads by vault path, by note-relative path and by bare name', async () => {
    const pictures = await readEmbeddedPictures(note, [
      { fileId: 'a', target: 'assets/deep/cat.png' },
      { fileId: 'b', target: 'local.png' },
      { fileId: 'c', target: 'cat.png' },
    ])
    expect(pictures.map((p) => p.fileId)).toEqual(['a', 'b', 'c'])
    expect(pictures[0]!.mimeType).toBe('image/png')
    expect(pictures[0]!.dataURL).toBe(`data:image/png;base64,${PNG.toString('base64')}`)
  })

  it('never reads outside the vault, hidden folders or what is not a picture', async () => {
    const pictures = await readEmbeddedPictures(note, [
      { fileId: 'up', target: '../../outside.png' },
      { fileId: 'abs', target: join(base, 'outside.png') },
      { fileId: 'hidden', target: 'hidden.png' },
      { fileId: 'text', target: 'notes.md' },
      { fileId: 'none', target: 'missing.png' },
    ])
    expect(pictures).toEqual([])
  })

  it('skips pictures over the size limit', async () => {
    writeFileSync(join(vault, 'assets', 'huge.png'), Buffer.alloc(MAX_PICTURE_BYTES + 1))
    expect(await readEmbeddedPictures(note, [{ fileId: 'h', target: 'assets/huge.png' }])).toEqual(
      [],
    )
  })
})

describe('save names', () => {
  it('keeps a note a markdown file and a scene an .excalidraw file', () => {
    expect(withDrawingExtension('C:/a/board', 'markdown')).toBe('C:/a/board.excalidraw.md')
    expect(withDrawingExtension('C:/a/board.md', 'markdown')).toBe('C:/a/board.md')
    expect(withDrawingExtension('C:/a/board.excalidraw', 'markdown')).toBe(
      'C:/a/board.excalidraw.md',
    )
    expect(withDrawingExtension('C:/a/board', 'json')).toBe('C:/a/board.excalidraw')
    expect(withDrawingExtension('C:/a/board.excalidraw', 'json')).toBe('C:/a/board.excalidraw')
  })
})
