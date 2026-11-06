import { describe, expect, it } from 'vitest'
import { parseFileToText } from '../src/parse'
import { writeFixture } from './helpers/fixtures'

describe('parseFileToText HTML charset', () => {
  it('decodes a page from its meta charset instead of falling back to windows-1252', async () => {
    const korean = '한글 본문'
    // EUC-KR bytes for that phrase (Buffer cannot encode euc-kr by name here)
    const body = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb, 0x20, 0xba, 0xbb, 0xb9, 0xae])
    const html = Buffer.concat([
      Buffer.from('<!doctype html><html><head><meta charset="euc-kr"></head><body><p>', 'ascii'),
      body,
      Buffer.from('</p></body></html>', 'ascii'),
    ])
    const result = await parseFileToText(writeFixture('notice.html', html))
    expect(result.ok).toBe(true)
    expect(result.text).toContain(korean)
  })
})
