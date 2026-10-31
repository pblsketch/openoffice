import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

async function info(text: string, ext = 'md') {
  const file = join(tempDir(), `note.${ext}`)
  writeFileSync(file, text)
  const result = await run(['info', file, '--json'])
  expect(result.code, result.stdout).toBe(0)
  return result.json().detail as { lines: number; characters: number; headings?: number }
}

describe('info on a Markdown file counts real headings', () => {
  it('counts a first heading that follows a UTF-8 BOM, and does not count the BOM as text', async () => {
    const detail = await info('\ufeff# 제목\n\n## 소제목\n')
    expect(detail.headings).toBe(2)
    expect(detail.characters).toBe('# 제목\n\n## 소제목\n'.length)
  })

  it.each([
    ['backtick fence', '# Real\n```sh\n# comment\n## another\n```\n## Two\n', 2],
    ['tilde fence', '# Real\n~~~\n# comment\n~~~\n## Two\n', 2],
    ['longer closing fence', '# Real\n```\n# comment\n`````\n## Two\n', 2],
    ['indented fence', '# Real\n   ```python\n# comment\n   ```\n## Two\n', 2],
    ['fence left open', '# Real\n```\n# comment\n## never closed\n', 1],
    ['fence with CRLF line endings', '# Real\r\n```\r\n# comment\r\n```\r\n## Two\r\n', 2],
  ])('skips headings inside a %s', async (_name, text, headings) => {
    expect((await info(text)).headings).toBe(headings)
  })

  it('still counts headings that only look like a fence or sit outside one', async () => {
    expect((await info('# A\n```\ncode\n```\n# B\n``` not closed by this ```\n')).headings).toBe(2)
    expect((await info('# A\n## B\n### C\n####### seven\n#nospace\n')).headings).toBe(3)
  })

  it('leaves a non-Markdown text file without a heading count', async () => {
    expect((await info('# not markdown\n', 'txt')).headings).toBeUndefined()
  })
})
