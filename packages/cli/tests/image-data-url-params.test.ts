import { describe, expect, it } from 'vitest'
import { readImageSource } from '../src/formats/image-source'
import { tempDir } from './helpers'

const encoded =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='
const bytes = Buffer.from(encoded, 'base64')

describe('data: image URLs with media type parameters', () => {
  it.each([
    'data:image/png;charset=binary;base64,',
    'data:image/png;name=logo.png;base64,',
    'data:image/png;a=1;b=2;base64,',
    'DATA:IMAGE/PNG;Name=logo.png;BASE64,',
  ])('reads the picture behind %s', async (prefix) => {
    const r = await readImageSource(prefix + encoded, { cwd: tempDir(), env: {} })
    expect(r).not.toBeNull()
    expect(Buffer.from(r!.bytes)).toEqual(bytes)
    expect(r).toMatchObject({ ext: 'png', mime: 'image/png' })
  })

  it('still reads a plain base64 data URL', async () => {
    const r = await readImageSource('data:image/png;base64,' + encoded, {
      cwd: tempDir(),
      env: {},
    })
    expect(Buffer.from(r!.bytes)).toEqual(bytes)
  })

  it.each([
    'data:image/png;charset=binary,' + encoded,
    'data:text/plain;name=a.txt;base64,QQ==',
    'data:image/png;base64',
  ])('still rejects %s', async (url) => {
    expect(await readImageSource(url, { cwd: tempDir(), env: {} })).toBeNull()
  })
})
