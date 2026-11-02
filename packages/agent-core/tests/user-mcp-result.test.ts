import { describe, expect, it } from 'vitest'
import { MCP_RESULT_MAX_CHARS, shapeMcpResult } from '../src/user-mcp'

describe('shapeMcpResult', () => {
  it('passes text blocks on, in order', () => {
    expect(
      shapeMcpResult({
        content: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
        ],
      }),
    ).toEqual({ output: 'first\n\nsecond', isError: false })
  })

  it('passes structuredContent on as JSON text', () => {
    const shaped = shapeMcpResult({
      content: [{ type: 'text', text: 'summary' }],
      structuredContent: { count: 2, items: ['a', 'b'] },
    })
    expect(shaped.output).toBe('summary\n\n{"count":2,"items":["a","b"]}')
  })

  it('does not repeat structuredContent a text block already carries', () => {
    const shaped = shapeMcpResult({
      content: [{ type: 'text', text: '{ "count": 2 }' }],
      structuredContent: { count: 2 },
    })
    expect(shaped.output).toBe('{ "count": 2 }')
  })

  it('replaces other blocks with one line that counts them', () => {
    const shaped = shapeMcpResult({
      content: [
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
        { type: 'text', text: 'caption' },
        { type: 'resource', resource: { uri: 'file:///x', text: 'hidden' } },
        { type: 'audio', data: 'BBBB', mimeType: 'audio/wav' },
      ],
    })
    expect(shaped.output).toBe('caption\n\n[3 non-text items were not passed on.]')
    expect(shaped.output).not.toContain('hidden')
    expect(shapeMcpResult({ content: [{ type: 'image', data: 'A' }] }).output).toBe(
      '[1 non-text item was not passed on.]',
    )
  })

  it('counts a text block without a string as non-text', () => {
    expect(shapeMcpResult({ content: [{ type: 'text', text: 5 }, null] }).output).toBe(
      '[2 non-text items were not passed on.]',
    )
  })

  it('passes isError on as a tool error', () => {
    expect(
      shapeMcpResult({ content: [{ type: 'text', text: 'no such law' }], isError: true }),
    ).toEqual({ output: 'no such law', isError: true })
    expect(shapeMcpResult({ content: [], isError: true }).isError).toBe(true)
  })

  it('says so when the result is empty', () => {
    const shaped = shapeMcpResult({ content: [] })
    expect(shaped.isError).toBe(false)
    expect(shaped.output.length).toBeGreaterThan(0)
  })

  it('treats an unreadable result as a tool error', () => {
    for (const raw of [null, 'text', 3, { content: 'x' }]) {
      expect(shapeMcpResult(raw).isError).toBe(true)
    }
  })

  it('cuts a long result to its start and says it was cut', () => {
    expect(MCP_RESULT_MAX_CHARS).toBe(200_000)
    const text = 'a'.repeat(MCP_RESULT_MAX_CHARS + 10)
    const shaped = shapeMcpResult({ content: [{ type: 'text', text }] })
    expect(shaped.output.startsWith('a'.repeat(MCP_RESULT_MAX_CHARS))).toBe(true)
    expect(shaped.output).not.toContain('a'.repeat(MCP_RESULT_MAX_CHARS + 1))
    expect(shaped.output).toContain('cut because it was long')
    // exactly at the limit nothing is cut
    const atLimit = shapeMcpResult({ content: [{ type: 'text', text: 'b'.repeat(100) }] }, 100)
    expect(atLimit.output).toBe('b'.repeat(100))
  })

  it('takes a different limit and does not split a surrogate pair', () => {
    const shaped = shapeMcpResult({ content: [{ type: 'text', text: 'ab😀cd' }] }, 3)
    expect(shaped.output.startsWith('ab\n')).toBe(true)
    expect(shaped.output).toContain('cut because it was long')
  })
})
