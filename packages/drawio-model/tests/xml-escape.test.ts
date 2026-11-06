import { describe, expect, it } from 'vitest'
import { escapeXmlAttr, escapeXmlText } from '../src/xml-tree'

describe('escapeXmlText / escapeXmlAttr', () => {
  it('strips XML 1.0 illegal C0 controls before escaping', () => {
    const input = 'Step 1\u0001Step 2 & <tag>'
    expect(escapeXmlText(input)).toBe('Step 1Step 2 &amp; &lt;tag&gt;')
    expect(escapeXmlAttr('a\u0001"b')).toBe('a&quot;b')
    expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(escapeXmlText(input))).toBe(false)
  })

  it('keeps tab, LF and CR (attrs encode them as character refs)', () => {
    expect(escapeXmlText('a\tb\nc\rd')).toBe('a\tb\nc\rd')
    expect(escapeXmlAttr('a\tb\nc\rd')).toBe('a&#x9;b&#xa;c&#xd;d')
  })
})
