/**
 * Links in a chapter: to a chapter and place of the book, to another entry
 * of the book, or outside (handed to the main process, which opens only safe
 * addresses).
 */
import { describe, expect, it } from 'vitest'
import { epubAssetBase, epubAssetUrl } from '../src/shared/asset-url'
import { openableLink } from '../src/shared/links'
import { routeLink } from '../src/renderer/reader/links'

const BASE = epubAssetBase('0123abcd')
const SPINE = ['OEBPS/text/one.xhtml', 'OEBPS/text/two.xhtml', 'OEBPS/text/notes and more.xhtml']
const IN_ONE = epubAssetUrl(BASE, SPINE[0]!)

describe('routing a link', () => {
  it('goes to another chapter and place', () => {
    expect(routeLink('two.xhtml#sec-2', IN_ONE, BASE, SPINE)).toEqual({
      kind: 'chapter',
      spineIndex: 1,
      fragment: 'sec-2',
    })
    expect(routeLink('two.xhtml', IN_ONE, BASE, SPINE)).toEqual({
      kind: 'chapter',
      spineIndex: 1,
      fragment: null,
    })
  })

  it('goes to a place in the same chapter', () => {
    expect(routeLink('#note%201', IN_ONE, BASE, SPINE)).toEqual({
      kind: 'chapter',
      spineIndex: 0,
      fragment: 'note 1',
    })
  })

  it('reads percent-encoded and dotted paths, and stops at the zip root', () => {
    expect(routeLink('../text/notes%20and%20more.xhtml#n1', IN_ONE, BASE, SPINE)).toEqual({
      kind: 'chapter',
      spineIndex: 2,
      fragment: 'n1',
    })
    expect(routeLink('notes and more.xhtml', IN_ONE, BASE, SPINE)).toMatchObject({ spineIndex: 2 })
    expect(routeLink('../../../../OEBPS/text/two.xhtml', IN_ONE, BASE, SPINE)).toMatchObject({
      kind: 'chapter',
      spineIndex: 1,
    })
  })

  it('does nothing for an entry of the book that is not a chapter', () => {
    expect(routeLink('../images/pic.png', IN_ONE, BASE, SPINE)).toEqual({ kind: 'entry' })
  })

  it('hands outside addresses on as written', () => {
    expect(routeLink(' https://example.com/a?b=1 ', IN_ONE, BASE, SPINE)).toEqual({
      kind: 'outside',
      url: 'https://example.com/a?b=1',
    })
    expect(routeLink('mailto:someone@example.com', IN_ONE, BASE, SPINE)).toEqual({
      kind: 'outside',
      url: 'mailto:someone@example.com',
    })
    // another view's book is outside this one
    expect(routeLink('epub-asset://ffff/OEBPS/text/one.xhtml', IN_ONE, BASE, SPINE).kind).toBe(
      'outside',
    )
  })

  it('opens only safe outside addresses', () => {
    expect(openableLink('https://example.com/')).toBe('https://example.com/')
    expect(openableLink('mailto:someone@example.com')).toBe('mailto:someone@example.com')
    expect(openableLink('javascript:alert(1)')).toBeNull()
    expect(openableLink('file:///C:/Windows/system32/calc.exe')).toBeNull()
    expect(openableLink('epub-asset://ffff/x')).toBeNull()
  })

  it('ignores an anchor without an address', () => {
    expect(routeLink(null, IN_ONE, BASE, SPINE)).toEqual({ kind: 'none' })
    expect(routeLink('  ', IN_ONE, BASE, SPINE)).toEqual({ kind: 'none' })
  })
})
