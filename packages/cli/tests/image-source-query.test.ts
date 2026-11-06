import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { buildBlankDocx } from '@genoffice/docx-engine'
import { describe, expect, it } from 'vitest'
import { readImageSource } from '../src/formats/image-source'
import { inlineLocalFiles } from '../src/formats/pptx'
import { run, tempDir } from './helpers'

const encoded =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='
const PNG = Buffer.from(encoded, 'base64')

describe('local image paths with a query or fragment', () => {
  it.each(['menu.png?raw=true', 'menu.png#thumbnail', 'menu.png?v=2#top'])(
    'reads the file behind %s by ignoring its query and fragment',
    async (reference) => {
      const dir = tempDir()
      writeFileSync(join(dir, 'menu.png'), PNG)
      const r = await readImageSource(reference, { cwd: dir, env: {} })
      expect(r).not.toBeNull()
      expect(Buffer.from(r!.bytes)).toEqual(PNG)
      expect(r).toMatchObject({ ext: 'png', mime: 'image/png' })
    },
  )

  it('prefers a file whose literal name holds a question mark or hash', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'menu#1.png'), PNG)
    writeFileSync(join(dir, 'menu'), 'not an image')
    const r = await readImageSource('menu#1.png', { cwd: dir, env: {} })
    expect(r).not.toBeNull()
    expect(Buffer.from(r!.bytes)).toEqual(PNG)
  })

  it('embeds the file through a Word insert_picture op', async () => {
    const dir = tempDir(),
      input = join(dir, 'source.docx'),
      output = join(dir, 'result.docx'),
      ops = join(dir, 'ops.json'),
      image = join(dir, 'menu.png'),
      original = Buffer.from(await buildBlankDocx())
    writeFileSync(input, original)
    writeFileSync(image, PNG)
    writeFileSync(
      ops,
      JSON.stringify([
        {
          op: 'insert_picture',
          url: 'menu.png?raw=true',
          afterBlockIndex: -1,
          width: '12pt',
        },
      ]),
    )
    const r = await run(['docs', 'apply', input, '--ops', ops, '--out', output, '--json'])
    expect(r.code, r.stdout).toBe(0)
    const zip = await JSZip.loadAsync(readFileSync(output)),
      images = Object.keys(zip.files).filter((p) => /^word\/media\//.test(p) && !zip.files[p]!.dir)
    expect(images).toHaveLength(1)
    expect(await zip.file(images[0]!)!.async('nodebuffer')).toEqual(PNG)
  })

  it('inlines a slide picture path that still carries a query string', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'pic.png'), PNG)
    const [op] = inlineLocalFiles(
      [{ op: 'addPicture', target: { slide: 0 }, bytes: 'pic.png?v=1' } as never],
      { cwd: dir, env: {} },
    )
    expect((op as unknown as { bytes: unknown }).bytes).toBeInstanceOf(Uint8Array)
    expect(Buffer.from((op as unknown as { bytes: Uint8Array }).bytes)).toEqual(PNG)
    expect((op as { ext?: string }).ext).toBe('png')
  })
})
