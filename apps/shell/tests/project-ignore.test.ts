import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addIgnoreLine,
  compileIgnore,
  ignoreLineFor,
  removeIgnoreLine,
} from '../src/main/projects/ignore'
import { isAiVisiblePath } from '../src/main/projects/visibility'

/** `.ieumoffice/ignore` syntax (spec 3) and "is this file visible to AI" */

describe('compileIgnore', () => {
  const sensitive = (text: string) => compileIgnore(text, { caseInsensitive: false })

  it('skips blank lines and # comments', () => {
    const m = sensitive('\n# drafts\n   \n#*.docx\n')
    expect(m.patterns).toEqual([])
    expect(m.ignores('a.docx')).toBe(false)
  })

  it('matches a bare name at any depth', () => {
    const m = sensitive('secret.docx')
    expect(m.ignores('secret.docx')).toBe(true)
    expect(m.ignores('a/b/secret.docx')).toBe(true)
    expect(m.ignores('a/notsecret.docx')).toBe(false)
  })

  it('anchors a leading slash to the project folder', () => {
    const m = sensitive('/secret.docx')
    expect(m.ignores('secret.docx')).toBe(true)
    expect(m.ignores('a/secret.docx')).toBe(false)
  })

  it('keeps * and ? inside one path segment', () => {
    const m = sensitive('*.tmp\nfile?.txt')
    expect(m.ignores('x.tmp')).toBe(true)
    expect(m.ignores('dir/x.tmp')).toBe(true)
    expect(m.ignores('file1.txt')).toBe(true)
    expect(m.ignores('file12.txt')).toBe(false)
    const anchored = sensitive('/a*/b')
    expect(anchored.ignores('abc/b')).toBe(true)
    expect(anchored.ignores('a/x/b')).toBe(false)
  })

  it('lets ** cross folders', () => {
    const m = sensitive('/docs/**/old.md\n/build/**\n**/cache')
    expect(m.ignores('docs/old.md')).toBe(true)
    expect(m.ignores('docs/a/b/old.md')).toBe(true)
    expect(m.ignores('other/old.md')).toBe(false)
    expect(m.ignores('build/x/y.txt')).toBe(true)
    expect(m.ignores('cache')).toBe(true)
    expect(m.ignores('a/b/cache')).toBe(true)
  })

  it('matches a trailing slash only against folders, and hides what is inside', () => {
    const m = sensitive('drafts/')
    expect(m.ignores('drafts', true)).toBe(true)
    expect(m.ignores('drafts', false)).toBe(false)
    expect(m.ignores('drafts/a.docx')).toBe(true)
    expect(m.ignores('x/drafts/y/a.docx')).toBe(true)
  })

  it('a folder pattern without a slash also hides the folder content', () => {
    const m = sensitive('private')
    expect(m.ignores('private/a.docx')).toBe(true)
  })

  it('has no ! negation: such lines are ignored', () => {
    const m = sensitive('*.docx\n!keep.docx')
    expect(m.ignores('keep.docx')).toBe(true)
    expect(m.patterns).toEqual(['*.docx'])
  })

  it('folds case only when asked (Windows, macOS)', () => {
    expect(sensitive('Secret.DOCX').ignores('secret.docx')).toBe(false)
    expect(compileIgnore('Secret.DOCX', { caseInsensitive: true }).ignores('secret.docx')).toBe(
      true,
    )
  })

  it('accepts backslashes in patterns and paths as separators', () => {
    const m = sensitive('\\reports\\*.pdf')
    expect(m.ignores('reports/a.pdf')).toBe(true)
    expect(m.ignores('reports\\a.pdf')).toBe(true)
  })

  it('treats regular expression characters literally', () => {
    const m = sensitive('a+b (1).txt')
    expect(m.ignores('a+b (1).txt')).toBe(true)
    expect(m.ignores('aab (1).txt')).toBe(false)
  })

  it('handles Hangul names and Unicode normalization', () => {
    const m = sensitive('보고서*.hwp')
    expect(m.ignores('보고서-최종.hwp')).toBe(true)
    expect(m.ignores('보고서-최종.hwp'.normalize('NFD'))).toBe(true)
  })
})

describe('ignore lines', () => {
  it('adds an anchored line for one path and removes it again', () => {
    expect(ignoreLineFor('reports/a.docx')).toBe('/reports/a.docx')
    const added = addIgnoreLine('# mine\n*.tmp\n', 'reports/a.docx')
    expect(added).toBe('# mine\n*.tmp\n/reports/a.docx\n')
    expect(compileIgnore(added, { caseInsensitive: false }).ignores('reports/a.docx')).toBe(true)
    expect(addIgnoreLine(added, 'reports/a.docx')).toBe(added)
    expect(removeIgnoreLine(added, 'reports/a.docx')).toBe('# mine\n*.tmp\n')
  })

  it('adds to an empty file and keeps a missing final newline sane', () => {
    expect(addIgnoreLine('', 'a.docx')).toBe('/a.docx\n')
    expect(addIgnoreLine('*.tmp', 'a.docx')).toBe('*.tmp\n/a.docx\n')
  })

  it('removes a hand-written line for the same path with or without the leading slash', () => {
    expect(removeIgnoreLine('reports/a.docx\n*.tmp\n', 'reports/a.docx')).toBe('*.tmp\n')
  })
})

describe('isAiVisiblePath', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'project-visible-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const none = compileIgnore('', { caseInsensitive: false })

  it('shows ordinary files', () => {
    expect(isAiVisiblePath(root, 'a/b.docx', none)).toBe(true)
  })

  it('hides dot entries, Office lock files, OS junk and .ieumoffice', () => {
    expect(isAiVisiblePath(root, '.hidden.docx', none)).toBe(false)
    expect(isAiVisiblePath(root, '.git/config', none)).toBe(false)
    expect(isAiVisiblePath(root, '~$report.docx', none)).toBe(false)
    expect(isAiVisiblePath(root, 'Thumbs.db', none)).toBe(false)
    expect(isAiVisiblePath(root, 'node_modules/x.md', none)).toBe(false)
    expect(isAiVisiblePath(root, '.ieumoffice/memory.md', none)).toBe(false)
    expect(isAiVisiblePath(root, '.ieumoffice', none, true)).toBe(false)
  })

  it('hides the Markdown app-owned assets folder', () => {
    mkdirSync(join(root, 'notes', 'assets'), { recursive: true })
    writeFileSync(join(root, 'notes', 'assets', '.genoffice-assets.json'), '{}')
    expect(isAiVisiblePath(root, 'notes/assets/pic.png', none)).toBe(false)
  })

  it('hides ignored paths', () => {
    const m = compileIgnore('drafts/', { caseInsensitive: false })
    expect(isAiVisiblePath(root, 'drafts/a.docx', m)).toBe(false)
    expect(isAiVisiblePath(root, 'final/a.docx', m)).toBe(true)
  })

  it('refuses paths that leave the folder', () => {
    expect(isAiVisiblePath(root, '../outside.docx', none)).toBe(false)
    expect(isAiVisiblePath(root, 'a/../../outside.docx', none)).toBe(false)
    expect(isAiVisiblePath(root, join(root, 'a.docx'), none)).toBe(false)
    expect(isAiVisiblePath(root, '', none)).toBe(false)
  })
})
