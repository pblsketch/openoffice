import { describe, expect, it } from 'vitest'
import { directoryOf, hasUrlScheme, normalizeZipPath, resolveHref } from '../src/paths'

describe('normalizeZipPath', () => {
  it('collapses dot segments and duplicate slashes', () => {
    expect(normalizeZipPath('OEBPS/./text//a.xhtml')).toBe('OEBPS/text/a.xhtml')
    expect(normalizeZipPath('OEBPS/text/../images/a.png')).toBe('OEBPS/images/a.png')
  })

  it('stops `..` at the zip root', () => {
    expect(normalizeZipPath('../../etc/passwd')).toBe('etc/passwd')
    expect(normalizeZipPath('OEBPS/../../../x.css')).toBe('x.css')
    expect(normalizeZipPath('/abs/path.xhtml')).toBe('abs/path.xhtml')
  })
})

describe('directoryOf', () => {
  it('gives the folder part with a trailing slash, or nothing at the root', () => {
    expect(directoryOf('OEBPS/text/a.xhtml')).toBe('OEBPS/text/')
    expect(directoryOf('content.opf')).toBe('')
  })
})

describe('hasUrlScheme', () => {
  it.each([
    'http://example.com/a.css',
    'HTTPS://example.com',
    'data:text/plain,hi',
    'file:///C:/Windows/win.ini',
    'mailto:a@example.com',
    'javascript:alert(1)',
    'C:\\Windows\\win.ini',
    '//example.com/a.png',
  ])('%s is not a zip entry', (href) => {
    expect(hasUrlScheme(href)).toBe(true)
  })

  it.each(['a.xhtml', '../a.xhtml', 'dir/a:b.xhtml', '#frag', ''])('%s is relative', (href) => {
    expect(hasUrlScheme(href)).toBe(false)
  })
})

describe('resolveHref', () => {
  it('resolves against the folder of the referring entry and splits the fragment', () => {
    expect(resolveHref('OEBPS/content.opf', 'text/c1.xhtml')).toEqual({
      path: 'OEBPS/text/c1.xhtml',
      fragment: null,
    })
    expect(resolveHref('OEBPS/text/c1.xhtml', '../images/a.png#x')).toEqual({
      path: 'OEBPS/images/a.png',
      fragment: 'x',
    })
  })

  it('percent-decodes the path and drops a query', () => {
    expect(resolveHref('OEBPS/content.opf', 'text/chapter%201.xhtml?v=2#s%201')).toEqual({
      path: 'OEBPS/text/chapter 1.xhtml',
      fragment: 's 1',
    })
  })

  it('keeps malformed percent escapes as written', () => {
    expect(resolveHref('a.opf', 'bad%zz.xhtml')?.path).toBe('bad%zz.xhtml')
  })

  it('treats a bare fragment or an empty href as the referring entry', () => {
    expect(resolveHref('OEBPS/c1.xhtml', '#note')).toEqual({
      path: 'OEBPS/c1.xhtml',
      fragment: 'note',
    })
    expect(resolveHref('OEBPS/c1.xhtml', '')).toEqual({ path: 'OEBPS/c1.xhtml', fragment: null })
  })

  it('never leaves the zip root', () => {
    expect(resolveHref('OEBPS/content.opf', '../../../../etc/passwd')?.path).toBe('etc/passwd')
    expect(resolveHref('OEBPS/content.opf', '/OEBPS/x.css')?.path).toBe('OEBPS/x.css')
    expect(resolveHref('OEBPS/content.opf', '%2e%2e/%2e%2e/x')?.path).toBe('x')
  })

  it('returns null for scheme-bearing targets', () => {
    expect(resolveHref('OEBPS/content.opf', 'https://example.com/a.css')).toBeNull()
    expect(resolveHref('OEBPS/content.opf', 'file:///etc/passwd')).toBeNull()
    expect(resolveHref('OEBPS/content.opf', '//cdn.example.com/x.js')).toBeNull()
  })
})
