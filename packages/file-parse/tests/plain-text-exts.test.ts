import { describe, expect, it } from 'vitest'
import { parseFileToText } from '../src/index'
import { writeFixture } from './helpers/fixtures'

describe('parseFileToText: attachable plain-text extensions', () => {
  it.each(['yaml', 'yml', 'js', 'ts', 'tsx', 'jsx', 'sql', 'css', 'go', 'rs'])(
    'reads an attachable .%s file as text instead of unsupported',
    async (ext) => {
      const content = `plain ${ext} body`
      const result = await parseFileToText(writeFixture(`sample.${ext}`, content))
      expect(result).toEqual({ ok: true, kind: 'text', text: content })
    },
  )
})
