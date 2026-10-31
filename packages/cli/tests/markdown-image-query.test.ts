import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZSiLoAAAAEElEQVR4nGNgYGBgYPj//z8ABf4C/tP4tTUAAAAASUVORK5CYII=',
  'base64',
)

async function embeddedImages(file: string): Promise<Uint8Array[]> {
  const zip = await JSZip.loadAsync(readFileSync(file))
  const media = Object.keys(zip.files).filter((name) => /^word\/media\/[^/]+$/.test(name))
  return Promise.all(media.map((name) => zip.file(name)!.async('uint8array')))
}

describe('Markdown local image paths with a query or fragment', () => {
  it.each(['menu.png?raw=true', 'menu.png#thumbnail', 'menu.png?v=2#top', 'menu%201.png?raw=1'])(
    'embeds the file behind %s by ignoring its query and fragment',
    async (reference) => {
      const dir = tempDir()
      writeFileSync(join(dir, reference.startsWith('menu%20') ? 'menu 1.png' : 'menu.png'), PNG)
      const markdown = join(dir, 'menu.md')
      const output = join(dir, 'menu.docx')
      writeFileSync(markdown, `![dish](${reference})\n`)
      expect((await run(['convert', markdown, '--to', 'docx', '--out', output])).code).toBe(0)
      const images = await embeddedImages(output)
      expect(images).toHaveLength(1)
      expect(Buffer.from(images[0]!)).toEqual(PNG)
    },
  )

  it('prefers a file whose literal name holds a question mark or hash', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'menu#1.png'), PNG)
    writeFileSync(join(dir, 'menu'), 'not an image')
    const markdown = join(dir, 'menu.md')
    const output = join(dir, 'menu.docx')
    writeFileSync(markdown, '![dish](menu#1.png)\n')
    expect((await run(['convert', markdown, '--to', 'docx', '--out', output])).code).toBe(0)
    const images = await embeddedImages(output)
    expect(images).toHaveLength(1)
    expect(Buffer.from(images[0]!)).toEqual(PNG)
  })

  it.each(['file:', 'FILE:'])(
    'does not cut a %s URL at a decoded hash in its file name',
    async (scheme) => {
      const dir = tempDir()
      writeFileSync(join(dir, 'menu'), PNG)
      const markdown = join(dir, 'menu.md')
      const output = join(dir, 'menu.docx')
      const url = pathToFileURL(join(dir, 'menu#1.png')).href.replace(/^file:/, scheme)
      writeFileSync(markdown, `![dish](${url})\n`)
      expect((await run(['convert', markdown, '--to', 'docx', '--out', output])).code).toBe(0)
      expect(await embeddedImages(output)).toHaveLength(0)
    },
  )

  it('still drops a reference whose file does not exist even without its query', async () => {
    const dir = tempDir()
    const markdown = join(dir, 'menu.md')
    const output = join(dir, 'menu.docx')
    writeFileSync(markdown, '![dish](missing.png?raw=1)\n')
    expect((await run(['convert', markdown, '--to', 'docx', '--out', output])).code).toBe(0)
    expect(await embeddedImages(output)).toHaveLength(0)
  })
})
