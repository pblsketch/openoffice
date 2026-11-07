import { describe, expect, it } from 'vitest'
import { parseFileToText } from '../src/parse'
import { writeFixture } from './helpers/fixtures'

describe('parseFileToText CSV charset', () => {
  it('decodes a Korean Excel CSV instead of treating the bytes as windows-1252', async () => {
    const expected = '이름,수량,지역'
    // EUC-KR / CP949 bytes for "이름,수량,지역\n한국,1,서울"
    const bytes = Buffer.from([
      0xc0, 0xcc, 0xb8, 0xa7, 0x2c, 0xbc, 0xf6, 0xb7, 0xae, 0x2c, 0xc1, 0xf6, 0xbf, 0xaa, 0x0a,
      0xc7, 0xd1, 0xb1, 0xb9, 0x2c, 0x31, 0x2c, 0xbc, 0xad, 0xbf, 0xef,
    ])
    const result = await parseFileToText(writeFixture('sales.csv', bytes))
    expect(result.ok).toBe(true)
    expect(result.text).toContain(expected)
    expect(result.text).toContain('한국')
    expect(result.text).toContain('서울')
  })
})
