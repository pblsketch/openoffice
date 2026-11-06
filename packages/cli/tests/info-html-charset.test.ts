import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

// "한글 본문" encoded as EUC-KR (CP949) by hand, so the test needs no encoder package
const EUC_KR_HANGUL = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb, 0x20, 0xba, 0xbb, 0xb9, 0xae])

describe('info on an HTML file decodes the page by its declared charset', () => {
  it('counts characters of an EUC-KR page after decoding', async () => {
    const prefix = '<html><head><meta charset="euc-kr"></head><body><p>'
    const suffix = '</p></body></html>\n'
    const file = join(tempDir(), 'page.html')
    writeFileSync(file, Buffer.concat([Buffer.from(prefix), EUC_KR_HANGUL, Buffer.from(suffix)]))
    const r = await run(['info', file, '--json'])
    expect(r.code, r.stdout).toBe(0)
    expect(r.json().detail.characters).toBe((prefix + '한글 본문' + suffix).length)
  })

  it('still counts a UTF-8 page', async () => {
    const html = '<p>한글 본문</p>\n'
    const file = join(tempDir(), 'page.html')
    writeFileSync(file, html)
    const r = await run(['info', file, '--json'])
    expect(r.code, r.stdout).toBe(0)
    expect(r.json().detail.characters).toBe(html.length)
  })
})
