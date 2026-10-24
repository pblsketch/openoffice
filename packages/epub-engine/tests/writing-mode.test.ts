import { describe, expect, it } from 'vitest'
import { cssDeclaresVerticalWriting, isVerticalWritingMode } from '../src/writing-mode'

describe('isVerticalWritingMode', () => {
  it.each(['vertical-rl', 'vertical-lr', ' Vertical-RL '])('%j is vertical', (value) => {
    expect(isVerticalWritingMode(value)).toBe(true)
  })
  it.each(['horizontal-tb', 'horizontal-rl', '', null])('%j is not', (value) => {
    expect(isVerticalWritingMode(value)).toBe(false)
  })
})

describe('cssDeclaresVerticalWriting', () => {
  it.each([
    'html { writing-mode: vertical-rl; }',
    'body{-epub-writing-mode:vertical-rl}',
    '.v { -webkit-writing-mode : vertical-lr !important }',
    'p {\n  WRITING-MODE:\n  vertical-rl;\n}',
  ])('finds %j', (css) => {
    expect(cssDeclaresVerticalWriting(css)).toBe(true)
  })

  it.each([
    'body { writing-mode: horizontal-tb }',
    '/* writing-mode: vertical-rl */ body { margin: 0 }',
    '.x { my-writing-mode: vertical-rl }',
    'p::before { content: "writing-mode: vertical-rl" }',
    '',
  ])('ignores %j', (css) => {
    expect(cssDeclaresVerticalWriting(css)).toBe(false)
  })
})
