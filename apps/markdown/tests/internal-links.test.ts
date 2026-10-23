import { describe, expect, it } from 'vitest'
import {
  classifyHref,
  embedImageSize,
  findHeadingIndex,
  findWikiLinks,
  headingSlug,
  parseWikiLink,
  wikiLinkTarget,
} from '../src/shared/internal-links'

describe('parseWikiLink', () => {
  it('splits target, heading and alias', () => {
    expect(parseWikiLink('Note')).toEqual({ target: 'Note' })
    expect(parseWikiLink('Note#Part')).toEqual({ target: 'Note', heading: 'Part' })
    expect(parseWikiLink('Note#Part|shown')).toEqual({
      target: 'Note',
      heading: 'Part',
      alias: 'shown',
    })
    expect(parseWikiLink('#Part')).toEqual({ target: '', heading: 'Part' })
    expect(parseWikiLink('sub/Note^abc')).toEqual({ target: 'sub/Note^abc' })
  })

  it('takes the escaped pipe a table cell writes', () => {
    expect(parseWikiLink('Note\\|shown')).toEqual({ target: 'Note', alias: 'shown' })
  })
})

describe('findWikiLinks', () => {
  it('finds links and embeds with their offsets', () => {
    const text = 'see [[A]] and ![[pic.png|300]].'
    const links = findWikiLinks(text)
    expect(links.map((l) => [l.start, l.end, l.embed, l.target])).toEqual([
      [4, 9, false, 'A'],
      [14, 30, true, 'pic.png'],
    ])
    expect(text.slice(14, 30)).toBe('![[pic.png|300]]')
  })

  it('ignores empty, nested and code-blocked brackets', () => {
    expect(findWikiLinks('[[]] [[ ]] [[a[b]]')).toEqual([])
    expect(findWikiLinks('[[a\uFFFFb]]')).toEqual([])
    expect(findWikiLinks('no links [x](y)')).toEqual([])
  })
})

describe('wikiLinkTarget', () => {
  it('turns a same-note heading into a heading target', () => {
    expect(wikiLinkTarget(parseWikiLink('#Part'))).toEqual({ kind: 'heading', heading: 'Part' })
    expect(wikiLinkTarget(parseWikiLink('Note#Part'))).toEqual({
      kind: 'wiki',
      target: 'Note',
      heading: 'Part',
    })
  })
})

describe('classifyHref', () => {
  it('opens web and mail links outside', () => {
    expect(classifyHref('https://example.com')).toEqual({
      kind: 'external',
      url: 'https://example.com',
    })
    expect(classifyHref('mailto:a@b.c')?.kind).toBe('external')
  })

  it('refuses every other scheme', () => {
    expect(classifyHref('file:///C:/x.md')).toBeNull()
    expect(classifyHref('javascript:alert(1)')).toBeNull()
    expect(classifyHref('obsidian://open?vault=x')).toBeNull()
  })

  it('reads headings and relative paths, decoding %-escapes', () => {
    expect(classifyHref('#Two%20Words')).toEqual({ kind: 'heading', heading: 'Two Words' })
    expect(classifyHref('My%20Note.md#part-one')).toEqual({
      kind: 'path',
      path: 'My Note.md',
      heading: 'part-one',
    })
    expect(classifyHref('../a/b.pdf')).toEqual({ kind: 'path', path: '../a/b.pdf' })
  })

  it('keeps a Windows drive path a path', () => {
    expect(classifyHref('C:\\notes\\a.md')).toEqual({ kind: 'path', path: 'C:\\notes\\a.md' })
  })
})

describe('findHeadingIndex', () => {
  const headings = ['Intro', 'Two Words!', '한글 제목', 'Intro']

  it('matches the heading text first, case and spacing aside', () => {
    expect(findHeadingIndex(headings, 'intro')).toBe(0)
    expect(findHeadingIndex(headings, 'two  words!')).toBe(1)
  })

  it('matches a GitHub-style slug', () => {
    expect(findHeadingIndex(headings, 'two-words')).toBe(1)
    expect(findHeadingIndex(headings, '한글-제목')).toBe(2)
    expect(headingSlug('Two Words!')).toBe('two-words')
  })

  it('names the last part of a nested path and skips block ids', () => {
    expect(findHeadingIndex(headings, 'Intro#Two Words!')).toBe(1)
    expect(findHeadingIndex(headings, '^abc123')).toBe(-1)
    expect(findHeadingIndex(headings, 'missing')).toBe(-1)
  })
})

describe('embedImageSize', () => {
  it('reads width and optional height', () => {
    expect(embedImageSize('300')).toEqual({ width: 300 })
    expect(embedImageSize('300x200')).toEqual({ width: 300, height: 200 })
    expect(embedImageSize('caption')).toEqual({})
    expect(embedImageSize(undefined)).toEqual({})
  })
})
