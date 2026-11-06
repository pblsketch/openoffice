import { describe, expect, it } from 'vitest'
import { escapeXmlAttr, escapeXmlText } from '../src/core/xml'

describe('escapeXmlText / escapeXmlAttr', () => {
  it('strips XML 1.0 illegal C0 controls before escaping', () => {
    const input = 'Report Q1\u0001Draft & <tag>'
    expect(escapeXmlText(input)).toBe('Report Q1Draft &amp; &lt;tag&gt;')
    expect(escapeXmlAttr('a\u0001"b')).toBe('a&quot;b')
    expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(escapeXmlText(input))).toBe(false)
  })

  it('keeps tab, LF and CR', () => {
    expect(escapeXmlText('a\tb\nc\rd')).toBe('a\tb\nc\rd')
  })
})
