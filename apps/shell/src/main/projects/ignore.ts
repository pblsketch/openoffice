/**
 * `.ieumoffice/ignore`: files and folders the AI does not see (spec 3).
 *
 * One pattern per line. Blank lines and lines starting with `#` are skipped.
 * `*` matches within one path segment, `?` one character, `**` any number of
 * folders. A trailing `/` matches folders only; a leading `/` anchors the
 * pattern to the project folder, otherwise it matches at any depth. There is no
 * `!` (re-include); such lines are skipped. Case is folded on Windows and macOS.
 * A matched folder hides everything inside it.
 */

export interface IgnoreMatcher {
  /** The patterns in effect, as written (comments and blank lines removed) */
  readonly patterns: readonly string[]
  /** Whether a folder-relative path (either separator) is ignored, itself or through a folder above it */
  ignores(relPath: string, isDir?: boolean): boolean
}

export interface IgnoreOptions {
  caseInsensitive: boolean
}

/** Case is folded where the file system ignores it */
export function ignoreFoldsCase(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'darwin'
}

interface CompiledPattern {
  regex: RegExp
  dirOnly: boolean
}

const REGEX_SYNTAX = /[\\^$.*+?()[\]{}|/]/g

function segmentSource(segment: string): string {
  let out = ''
  for (const char of segment) {
    if (char === '*') out += '[^/]*'
    else if (char === '?') out += '[^/]'
    else out += char.replace(REGEX_SYNTAX, '\\$&')
  }
  // `**` inside a segment (not a whole segment) behaves like `*`
  return out.replace(/(?:\[\^\/\]\*)+/g, '[^/]*')
}

function compileLine(line: string, options: IgnoreOptions): CompiledPattern | null {
  let pattern = line.trim().normalize('NFC').replace(/\\/g, '/')
  if (pattern === '' || pattern.startsWith('#') || pattern.startsWith('!')) return null
  const dirOnly = pattern.endsWith('/')
  pattern = pattern.replace(/\/+$/, '')
  const anchored = pattern.startsWith('/')
  pattern = pattern.replace(/^\/+/, '')
  const segments = pattern.split('/').filter((segment) => segment !== '')
  if (segments.length === 0) return null

  let body = ''
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1
    if (segment === '**') {
      body += last ? '.*' : '(?:[^/]+/)*'
      return
    }
    body += segmentSource(segment)
    if (!last) body += '/'
  })
  const source = `^${anchored ? '' : '(?:.*/)?'}${body}$`
  return { regex: new RegExp(source, options.caseInsensitive ? 'iu' : 'u'), dirOnly }
}

export function compileIgnore(text: string, options: IgnoreOptions): IgnoreMatcher {
  const patterns: string[] = []
  const compiled: CompiledPattern[] = []
  for (const line of text.split(/\r?\n/)) {
    const pattern = compileLine(line, options)
    if (!pattern) continue
    patterns.push(line.trim())
    compiled.push(pattern)
  }
  const matchesOne = (path: string, isDir: boolean): boolean =>
    compiled.some((pattern) => (!pattern.dirOnly || isDir) && pattern.regex.test(path))
  return {
    patterns,
    ignores(relPath: string, isDir = false): boolean {
      if (compiled.length === 0) return false
      const segments = relPath
        .normalize('NFC')
        .replace(/\\/g, '/')
        .split('/')
        .filter((segment) => segment !== '')
      for (let end = 1; end <= segments.length; end++) {
        const isLast = end === segments.length
        if (matchesOne(segments.slice(0, end).join('/'), isLast ? isDir : true)) return true
      }
      return false
    },
  }
}

/** The line "hide this path from AI" adds: anchored, with wildcard characters made harmless */
export function ignoreLineFor(relPath: string): string {
  const clean = relPath
    .normalize('NFC')
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '')
    .join('/')
  // A name holding `*` cannot be written literally; `?` matches that one character.
  return `/${clean.replace(/\*/g, '?')}`
}

function linesOf(text: string): string[] {
  const lines = text.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function sameLineFor(line: string, relPath: string): boolean {
  const wanted = ignoreLineFor(relPath)
  const trimmed = line.trim().normalize('NFC').replace(/\\/g, '/')
  return trimmed === wanted || `/${trimmed}` === wanted
}

/** `text` with the line for `relPath` added at the end (unchanged when already there) */
export function addIgnoreLine(text: string, relPath: string): string {
  const lines = linesOf(text)
  if (lines.some((line) => sameLineFor(line, relPath))) return text
  lines.push(ignoreLineFor(relPath))
  return `${lines.join('\n')}\n`
}

/** `text` without the lines naming exactly `relPath` (with or without the leading slash) */
export function removeIgnoreLine(text: string, relPath: string): string {
  const lines = linesOf(text)
  const kept = lines.filter((line) => !sameLineFor(line, relPath))
  if (kept.length === lines.length) return text
  return kept.length === 0 ? '' : `${kept.join('\n')}\n`
}
