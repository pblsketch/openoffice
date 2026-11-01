import { describe, expect, it } from 'vitest'
import { parseToml, TomlError } from '../../src/main/mcp-client/toml'

describe('parseToml', () => {
  it('reads tables, dotted and quoted keys, and scalar values', () => {
    expect(
      parseToml(
        '\uFEFFtitle = "x"\nwhen = 2026-11-01T10:00:00Z\n[a.b]\nc = 1_000\nd = true\n"e.f" = -2.5\ng.h = \'lit\\eral\'\n',
      ),
    ).toEqual({
      title: 'x',
      a: { b: { c: 1000, d: true, 'e.f': -2.5, g: { h: 'lit\\eral' } } },
      when: '2026-11-01T10:00:00Z',
    })
  })

  it('reads the four string forms and escapes', () => {
    const text = [
      's = "a\\tb\\u00e9\\"q\\""',
      'm = """',
      'one \\',
      '   two"""',
      "l = '''",
      "raw \\n'''",
    ].join('\n')
    expect(parseToml(text)).toEqual({ s: 'a\tbé"q"', m: 'one two', l: 'raw \\n' })
  })

  it('reads multi-line arrays and inline tables', () => {
    expect(
      parseToml('a = [\n  "x", # note\n  ["y", 2],\n]\nt = { k = "v", "q k" = { n = false } }\n'),
    ).toEqual({ a: ['x', ['y', 2]], t: { k: 'v', 'q k': { n: false } } })
  })

  it('reads arrays of tables', () => {
    expect(parseToml('[[s]]\nn = 1\n[[s]]\nn = 2\n[s.sub]\nk = "v"\n')).toEqual({
      s: [{ n: 1 }, { n: 2, sub: { k: 'v' } }],
    })
  })

  it('throws on text it cannot read', () => {
    for (const bad of ['a = ', 'a = "x', '[a', 'a = [1, 2', 'a = 1 b = 2', '= 1', 'a = "\\q"']) {
      expect(() => parseToml(bad), bad).toThrow(TomlError)
    }
  })

  it('keeps a __proto__ key an ordinary member', () => {
    const t = parseToml('[__proto__]\npolluted = true\n')
    expect(Object.prototype.hasOwnProperty.call(t, '__proto__')).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
