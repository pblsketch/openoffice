import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

describe('Markdown local image paths', () => {
  it.each([
    ['menu#1.png', 'menu%231.png'],
    ['fish&rice.png', 'fish%26rice.png'],
    ['set+drink.png', 'set%2Bdrink.png'],
    ['plate,one.png', 'plate%2Cone.png'],
    ['total=1.png', 'total%3D1.png'],
    ['promo;1.png', 'promo%3B1.png'],
    ['lunch@home.png', 'lunch%40home.png'],
  ])('embeds %s when its reserved character is percent-encoded', async (name, reference) => {
    const dir = tempDir()
    writeFileSync(join(dir, name), PNG)
    const markdown = join(dir, 'menu.md')
    const output = join(dir, 'menu.docx')
    writeFileSync(markdown, `# Menu\n\n![dish](${reference})\n`)
    const result = await run(['convert', markdown, '--to', 'docx', '--out', output, '--json'])
    expect(result.code).toBe(0)
    const images = await embeddedImages(output)
    expect(images).toHaveLength(1)
    expect(Buffer.from(images[0]!)).toEqual(PNG)
  })

  it('resolves an encoded directory name relative to the Markdown file', async () => {
    const dir = tempDir()
    mkdirSync(join(dir, 'menu#photos'))
    writeFileSync(join(dir, 'menu#photos', 'dish.png'), PNG)
    const markdown = join(dir, 'menu.md')
    const output = join(dir, 'menu.docx')
    writeFileSync(markdown, '![dish](menu%23photos/dish.png)\n')
    expect(
      (await run(['create', '--type', 'docx', '--from', markdown, '--out', output])).code,
    ).toBe(0)
    expect(await embeddedImages(output)).toHaveLength(1)
  })

  it.each(['100%.png', 'literal%23.png', 'plain.png'])(
    'still accepts the literal file name %s',
    async (name) => {
      const dir = tempDir()
      writeFileSync(join(dir, name), PNG)
      const markdown = join(dir, 'menu.md')
      const output = join(dir, 'menu.docx')
      writeFileSync(markdown, `![dish](${name})\n`)
      expect((await run(['convert', markdown, '--to', 'docx', '--out', output])).code).toBe(0)
      expect(await embeddedImages(output)).toHaveLength(1)
    },
  )

  it('still decodes Korean names and spaces', async () => {
    const dir = tempDir()
    const name = '오늘 메뉴.png'
    writeFileSync(join(dir, name), PNG)
    const markdown = join(dir, 'menu.md')
    const output = join(dir, 'menu.docx')
    writeFileSync(markdown, `![dish](${encodeURIComponent(name)})\n`)
    expect((await run(['convert', markdown, '--to', 'docx', '--out', output])).code).toBe(0)
    expect(await embeddedImages(output)).toHaveLength(1)
  })

  it('preserves the file URL decoding path', async () => {
    const dir = tempDir()
    const image = join(dir, 'menu#1.png')
    writeFileSync(image, PNG)
    const markdown = join(dir, 'menu.md')
    const output = join(dir, 'menu.docx')
    writeFileSync(markdown, `![dish](${pathToFileURL(image).href})\n`)
    expect((await run(['convert', markdown, '--to', 'docx', '--out', output])).code).toBe(0)
    expect(await embeddedImages(output)).toHaveLength(1)
  })

  it.each(['FILE:', 'File:'])('embeds an image referenced through a %s URL', async (scheme) => {
    const dir = tempDir()
    const image = join(dir, 'menu#1.png')
    writeFileSync(image, PNG)
    const markdown = join(dir, 'menu.md')
    const output = join(dir, 'menu.docx')
    writeFileSync(markdown, `![dish](${pathToFileURL(image).href.replace(/^file:/, scheme)})\n`)
    expect((await run(['convert', markdown, '--to', 'docx', '--out', output])).code).toBe(0)
    const images = await embeddedImages(output)
    expect(images).toHaveLength(1)
    expect(Buffer.from(images[0]!)).toEqual(PNG)
  })

  it('prefers an existing literal percent-encoded name over its decoded spelling', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'literal%23.png'), PNG)
    writeFileSync(join(dir, 'literal#.png'), 'not an image')
    const markdown = join(dir, 'menu.md')
    const output = join(dir, 'menu.docx')
    writeFileSync(markdown, '![dish](literal%23.png)\n')
    expect((await run(['convert', markdown, '--to', 'docx', '--out', output])).code).toBe(0)
    expect(await embeddedImages(output)).toHaveLength(1)
  })

  it('does not decode a file URL twice and embed a different file', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'menu#1.png'), PNG)
    const missing = join(dir, 'menu%231.png')
    const markdown = join(dir, 'menu.md')
    const output = join(dir, 'menu.docx')
    writeFileSync(markdown, `![dish](${pathToFileURL(missing).href})\n`)
    expect((await run(['convert', markdown, '--to', 'docx', '--out', output])).code).toBe(0)
    expect(await embeddedImages(output)).toHaveLength(0)
  })

  it('never embeds an image outside allowed roots after decoding its path', async () => {
    const dir = tempDir()
    const allowed = join(dir, 'allowed')
    mkdirSync(allowed)
    writeFileSync(join(dir, 'outside#1.png'), PNG)
    const markdown = join(allowed, 'menu.md')
    const output = join(allowed, 'menu.docx')
    writeFileSync(markdown, '![dish](../outside%231.png)\n')
    const result = await run(['convert', markdown, '--to', 'docx', '--out', output, '--json'], {
      env: { GENOFFICE_ALLOWED_ROOTS: allowed },
    })
    // The shared exporter falls back to alt text when the loader refuses a file.
    expect(result.code).toBe(0)
    expect(existsSync(output)).toBe(true)
    expect(await embeddedImages(output)).toHaveLength(0)
  })
})
