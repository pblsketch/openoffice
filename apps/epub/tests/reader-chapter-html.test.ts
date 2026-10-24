/**
 * The drawing copy of a chapter: what is removed before it is drawn, the
 * policy and base it gets, and the block ids it carries.
 */
import { describe, expect, it } from 'vitest'
import { openChapter } from '@genoffice/epub-engine'
import {
  BLOCK_ATTR,
  FRAME_CSP,
  VIEW_STYLE_ID,
  buildChapterHtml,
  isScriptUrl,
  markBlocks,
} from '../src/renderer/reader/chapter-html'
import { xhtml } from './helpers/book'

const BASE = 'epub-asset://0123abcd/OEBPS/text/one.xhtml'

function draw(source: string, broken = false, viewCss = ''): Document {
  const map = openChapter(source)
  const blocks = map.broken ? [] : map.blocks
  const html = buildChapterHtml({
    source,
    broken: broken || map.broken,
    blocks,
    baseUrl: BASE,
    viewCss,
  })
  expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
  // the frame reads the copy with the HTML parser, as srcdoc does
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('the drawing copy of a chapter', () => {
  it('puts the policy first, then the base at the chapter, then the book styles and the view style', () => {
    const doc = draw(
      xhtml(
        'One',
        '<p>Text</p>',
        '<link rel="stylesheet" href="../styles/book.css"/><style>p { margin: 0 }</style>',
      ),
      false,
      'html { zoom: 1.5; }',
    )
    const head = Array.from(doc.head.children).map((el) => el.localName)
    expect(head.slice(0, 3)).toEqual(['meta', 'meta', 'base'])
    const csp = doc.head.querySelector('meta[http-equiv="Content-Security-Policy"]')
    expect(csp?.getAttribute('content')).toBe(FRAME_CSP)
    expect(FRAME_CSP).toContain("script-src 'none'")
    expect(FRAME_CSP).toContain('img-src epub-asset:')
    expect(FRAME_CSP).toContain('font-src epub-asset:')
    expect(FRAME_CSP).toContain("style-src epub-asset: 'unsafe-inline'")
    expect(FRAME_CSP).not.toMatch(/https?:/)
    expect(doc.querySelector('base')?.getAttribute('href')).toBe(BASE)
    expect(doc.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe(
      '../styles/book.css',
    )
    expect(doc.querySelector('head style:not([id])')?.textContent).toBe('p { margin: 0 }')
    expect(doc.head.lastElementChild?.id).toBe(VIEW_STYLE_ID)
    expect(doc.getElementById(VIEW_STYLE_ID)?.textContent).toBe('html { zoom: 1.5; }')
    // relative addresses resolve inside the book
    const link = doc.querySelector('link[rel="stylesheet"]') as HTMLLinkElement
    expect(new URL(link.getAttribute('href')!, BASE).href).toBe(
      'epub-asset://0123abcd/OEBPS/styles/book.css',
    )
  })

  it('removes scripts, event attributes and script addresses', () => {
    const doc = draw(
      xhtml(
        'One',
        [
          '<p onclick="steal()" onmouseover="x()">Click <a href="javascript:alert(1)">here</a></p>',
          '<p><a href=" JaVaScRiPt:alert(2)">spaced</a> <a href="next.xhtml#n1">next</a></p>',
          '<script>alert(3)</script>',
          '<div><img src="../images/pic.png" onerror="alert(4)" alt="pic"/></div>',
          '<iframe src="https://example.com/"></iframe>',
          '<object data="x.swf"></object><embed src="y.swf"/>',
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(5)</script><a href="javascript:alert(6)"><text>t</text></a></svg>',
          '<form action="javascript:alert(7)"><input formaction="javascript:x()" value="v"/></form>',
        ].join('\n'),
        '<script src="../code/app.js"></script><meta http-equiv="refresh" content="0;url=https://example.com/"/><base href="https://example.com/"/><link rel="prefetch" href="https://example.com/x"/>',
      ),
    )
    const html = doc.documentElement.outerHTML
    expect(doc.querySelectorAll('script')).toHaveLength(0)
    expect(doc.querySelectorAll('iframe, object, embed')).toHaveLength(0)
    expect(doc.querySelectorAll('meta[http-equiv="refresh"]')).toHaveLength(0)
    expect(doc.querySelectorAll('base')).toHaveLength(1)
    expect(doc.querySelector('base')?.getAttribute('href')).toBe(BASE)
    expect(doc.querySelectorAll('link[rel="prefetch"]')).toHaveLength(0)
    for (const el of Array.from(doc.querySelectorAll('*'))) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.toLowerCase().startsWith('on')).toBe(false)
        expect(isScriptUrl(attr.value)).toBe(false)
      }
    }
    expect(html).not.toMatch(/alert\(/)
    // what is harmless stays
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('../images/pic.png')
    expect(doc.querySelector('a[href="next.xhtml#n1"]')?.textContent).toBe('next')
    expect(doc.body.textContent).toContain('Click here')
  })

  it('tags every block with its engine id', () => {
    const source = xhtml(
      'One',
      '<h1 class="t">Chapter One</h1>\n<p>First <em>paragraph</em>.</p>\n<ul><li>a</li><li>b</li></ul>\n<p/>',
    )
    const map = openChapter(source)
    if (map.broken) throw new Error('fixture must be well-formed')
    const doc = draw(source)
    const tagged = Array.from(doc.querySelectorAll(`[${BLOCK_ATTR}]`))
    expect(tagged.map((el) => el.getAttribute(BLOCK_ATTR))).toEqual(map.blocks.map((b) => b.id))
    expect(tagged.map((el) => el.localName)).toEqual(['h1', 'p', 'li', 'li', 'p'])
    expect(tagged[0]!.getAttribute('class')).toBe('t')
    expect(tagged[1]!.innerHTML).toBe('First <em>paragraph</em>.')
  })

  it('keeps an empty anchor empty instead of wrapping the text after it', () => {
    const doc = draw(xhtml('One', '<p><a id="note1"/>Text after the anchor.</p>'))
    const anchor = doc.getElementById('note1')
    expect(anchor?.textContent).toBe('')
    expect(anchor?.parentElement?.localName).toBe('p')
  })

  it('drops block ids the book wrote itself', () => {
    const doc = draw(
      xhtml(
        'One',
        `<div><p ${BLOCK_ATTR}="fake">x</p></div><section ${BLOCK_ATTR}="b9">y</section>`,
      ),
    )
    const ids = Array.from(doc.querySelectorAll(`[${BLOCK_ATTR}]`)).map((el) =>
      el.getAttribute(BLOCK_ATTR),
    )
    expect(ids).not.toContain('fake')
    expect(ids).not.toContain('b9')
    expect(ids).toEqual(['b1'])
  })

  it('draws a broken chapter with the HTML parser, cleaned, without block ids', () => {
    const source = xhtml(
      'Two',
      '<h1>Chapter Two</h1>\n<p onclick="x()">Broken <b>markup</p><script>alert(1)</script>',
    )
    expect(openChapter(source).broken).toBe(true)
    const doc = draw(source, true)
    expect(doc.body.textContent).toContain('Broken markup')
    expect(doc.querySelectorAll('script')).toHaveLength(0)
    expect(doc.querySelector('[onclick]')).toBeNull()
    expect(doc.querySelectorAll(`[${BLOCK_ATTR}]`)).toHaveLength(0)
    expect(doc.querySelector('base')?.getAttribute('href')).toBe(BASE)
  })

  it('keeps the attributes the book styles select on and keeps sound and video still', () => {
    const doc = draw(
      '<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" class="vrtl" dir="rtl"><head><title>t</title></head>' +
        '<body epub:type="bodymatter" class="main"><p>縦書き</p><video src="v.mp4" autoplay="autoplay" controls="controls" poster="p.png"></video><audio src="a.mp3" autoplay="autoplay"></audio></body></html>',
    )
    expect(doc.documentElement.getAttribute('class')).toBe('vrtl')
    expect(doc.documentElement.getAttribute('dir')).toBe('rtl')
    expect(doc.documentElement.getAttribute('lang')).toBe('ja')
    expect(doc.body.getAttribute('class')).toBe('main')
    expect(doc.body.getAttribute('epub:type')).toBe('bodymatter')
    const video = doc.querySelector('video')!
    expect(video.hasAttribute('autoplay')).toBe(false)
    expect(video.hasAttribute('controls')).toBe(false)
    expect(video.getAttribute('poster')).toBe('p.png')
    expect(doc.querySelector('audio')!.hasAttribute('autoplay')).toBe(false)
    expect(FRAME_CSP).toContain("media-src 'none'")
  })

  it('draws a chapter that is a picture inside the body', () => {
    const doc = draw(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><image xlink:href="../images/cover.jpg" width="10" height="10"/><script>alert(1)</script></svg>',
    )
    const svg = doc.body.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(doc.querySelectorAll('script')).toHaveLength(0)
    expect(doc.querySelector('image')?.getAttribute('xlink:href')).toBe('../images/cover.jpg')
  })
})

describe('block markers', () => {
  it('marks only where the offset is the start tag of that block', () => {
    const source = '<body><p>a</p><h2>b</h2></body>'
    const marked = markBlocks(source, [
      { id: 'b1', tag: 'p', outer: { start: 6 } },
      // wrong: offset points into text
      { id: 'b2', tag: 'h2', outer: { start: 9 } },
      // wrong: tag name differs
      { id: 'b3', tag: 'h3', outer: { start: 14 } },
    ])
    expect(marked).toContain('<p data-genoffice-epub-block-mark="b1">a</p>')
    expect(marked).toContain('<h2>b</h2>')
  })

  it('does not mistake a longer tag name for the block tag', () => {
    const source = '<body><pre>x</pre></body>'
    expect(markBlocks(source, [{ id: 'b1', tag: 'p', outer: { start: 6 } }])).toBe(source)
  })

  it('recognises script addresses the way browsers read them', () => {
    expect(isScriptUrl('javascript:alert(1)')).toBe(true)
    expect(isScriptUrl(' java\tscript:alert(1)')).toBe(true)
    expect(isScriptUrl('VBScript:x')).toBe(true)
    expect(isScriptUrl('chapter.xhtml#javascript:')).toBe(false)
    expect(isScriptUrl('https://example.com/')).toBe(false)
  })
})
