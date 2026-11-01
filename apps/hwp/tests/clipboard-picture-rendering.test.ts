import { describe, expect, it } from 'vitest'

import { clipboardPictureIsRendering } from '@genoffice/ui/clipboard-picture'
import { ieumPictureIsRendering } from '../studio-plugin/clipboard-html.mjs'

// The studio cannot import the shared package, so the rule is written twice; they must agree.
describe('ieumPictureIsRendering', () => {
  it('answers like the shared rule', () => {
    const cases: [string, string][] = [
      ['<table><tr><td>1</td></tr></table>', '1'],
      ['<TABLE><TR><TD></TD></TR></TABLE>', ''],
      ['<p>hello</p>', 'hello'],
      ['', 'hello'],
      ['', ''],
      ['<img src="a.png">', ''],
      ['<p><img src="a.png">caption</p>', 'caption'],
      ['', ' \n'],
    ]
    for (const [html, text] of cases) {
      expect(ieumPictureIsRendering(html, text), html).toBe(clipboardPictureIsRendering(html, text))
    }
    expect(ieumPictureIsRendering('<table><tr><td>a</td></tr></table>', 'a')).toBe(true)
    expect(ieumPictureIsRendering('', '')).toBe(false)
  })
})
