import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readImageSource } from '../src/formats/image-source'
import { tempDir } from './helpers'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
  'base64',
)

describe('file: image sources', () => {
  it.each(['file:', 'FILE:', 'File:'])('reads a picture through a %s URL', async (scheme) => {
    const dir = tempDir()
    const image = join(dir, 'menu#1 사진.png')
    writeFileSync(image, PNG)
    const url = pathToFileURL(image).href.replace(/^file:/, scheme)
    const r = await readImageSource(url, { cwd: tempDir(), env: {} })
    expect(r).not.toBeNull()
    expect(Buffer.from(r!.bytes)).toEqual(PNG)
    expect(r).toMatchObject({ ext: 'png', mime: 'image/png' })
  })

  it('does not decode a file URL a second time', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'menu#1.png'), PNG)
    const url = pathToFileURL(join(dir, 'menu%231.png')).href
    expect(await readImageSource(url, { cwd: tempDir(), env: {} })).toBeNull()
  })

  it('refuses a file URL outside the allowed roots', async () => {
    const dir = tempDir()
    const image = join(dir, 'a.png')
    writeFileSync(image, PNG)
    await expect(
      readImageSource(pathToFileURL(image).href, {
        cwd: tempDir(),
        env: { GENOFFICE_ALLOWED_ROOTS: tempDir() },
      }),
    ).rejects.toThrow(/outside GENOFFICE_ALLOWED_ROOTS/)
  })

  it.each(['file:relative.png', 'file://remote-host/share/a.png'])(
    'treats the unusable URL %s as not found',
    async (url) => {
      expect(await readImageSource(url, { cwd: tempDir(), env: {} })).toBeNull()
    },
  )
})
