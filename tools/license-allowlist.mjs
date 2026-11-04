/**
 * The permissive license allowlist shared by the npm dependency gate
 * (check-licenses.mjs) and the draw.io bundle gate (check-drawio-bundle.mjs).
 */
export const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'Zlib',
  'Unlicense',
  'Python-2.0',
  'Unicode-3.0',
  'OFL-1.1',
])

/** Minimal SPDX expression check: OR passes if any branch is allowed,
 * AND requires every branch, WITH falls back to the base license. */
export function isAllowed(expr) {
  let s = expr.trim()
  while (s.startsWith('(') && s.endsWith(')')) {
    const inner = s.slice(1, -1)
    let depth = 0
    let balanced = true
    for (const ch of inner) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      if (depth < 0) balanced = false
    }
    if (!balanced || depth !== 0) break
    s = inner.trim()
  }
  const splitTop = (sep) => {
    const parts = []
    let depth = 0
    let start = 0
    for (let i = 0; i <= s.length - sep.length; i++) {
      if (s[i] === '(') depth++
      else if (s[i] === ')') depth--
      else if (depth === 0 && s.startsWith(sep, i)) {
        parts.push(s.slice(start, i))
        start = i + sep.length
        i += sep.length - 1
      }
    }
    parts.push(s.slice(start))
    return parts
  }
  const orParts = splitTop(' OR ')
  if (orParts.length > 1) return orParts.some(isAllowed)
  const andParts = splitTop(' AND ')
  if (andParts.length > 1) return andParts.every(isAllowed)
  // legacy "A/B" dual-license shorthand
  const slashParts = s.includes('/') ? s.split('/') : [s]
  if (slashParts.length > 1) return slashParts.some(isAllowed)
  const withParts = s.split(' WITH ')
  return ALLOWED.has(withParts[0].trim())
}
