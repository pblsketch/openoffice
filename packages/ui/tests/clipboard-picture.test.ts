import { describe, expect, it } from 'vitest'

import { clipboardPictureIsRendering } from '../src/clipboard-picture'

describe('clipboardPictureIsRendering', () => {
  it('a spreadsheet copy (table HTML next to its picture) pastes as text', () => {
    expect(clipboardPictureIsRendering('<table><tr><td>1</td></tr></table>', '1')).toBe(true)
    // an all-blank range still has its table markup
    expect(clipboardPictureIsRendering('<table><tr><td></td></tr></table>', '')).toBe(true)
  })

  it('text without an <img> pastes as text', () => {
    expect(clipboardPictureIsRendering('<p>hello</p>', 'hello')).toBe(true)
    expect(clipboardPictureIsRendering('', 'hello')).toBe(true)
  })

  it('a real picture copy stays a picture', () => {
    // screenshot: no text, no HTML
    expect(clipboardPictureIsRendering('', '')).toBe(false)
    // browser "copy image": an <img>, no text
    expect(clipboardPictureIsRendering('<img src="https://example.com/a.png">', '')).toBe(false)
    // a picture with its caption from a word processor
    expect(clipboardPictureIsRendering('<p><img src="a.png">caption</p>', 'caption')).toBe(false)
    expect(clipboardPictureIsRendering('', '   ')).toBe(false)
  })
})
