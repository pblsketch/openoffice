/**
 * The Hanja dictionary behind the editor's 한자로 바꾸기 (studio-plugin/hanja.mjs).
 *
 * libhangul's data/hanja/hanja.txt carries its own BSD-3-Clause notice (the library itself is
 * LGPL; this data file is not). The build fetches it from a pinned commit, checks its hash and
 * writes a cut-down copy beside the studio: one line per Hangul reading, the candidates in the
 * dictionary's order separated by tabs, a single syllable's meaning after a slash. The notice
 * goes with it.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const HANJA_COMMIT = '717409ce61524bb3d8426060a384822f21354c62'
export const HANJA_SHA256 = 'b1004034589f1357daaea3534a6136f6b5ef825afa8779886b20f0b7908bbe3b'
const HANJA_URL = `https://raw.githubusercontent.com/libhangul/libhangul/${HANJA_COMMIT}/data/hanja/hanja.txt`

const SYLLABLES = /^[가-힣]+$/
const isSyllable = (ch) => ch >= '가' && ch <= '힣'

/** The notice at the top of hanja.txt (its leading `#` lines), as plain text. */
export function hanjaNotice(source) {
  const lines = []
  for (const line of source.split(/\r?\n/)) {
    if (!line.startsWith('#')) break
    lines.push(line.replace(/^# ?/, ''))
  }
  return lines.join('\n').trim() + '\n'
}

/**
 * The cut-down dictionary. Only readings made of whole Hangul syllables are kept, with
 * candidates as long as the reading (a candidate may keep a Hangul syllable, as Hangul's own
 * dictionary does); a duplicate candidate keeps its first place.
 */
export function compactHanja(source) {
  const groups = new Map()
  for (const line of source.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const parts = line.split(':')
    if (parts.length < 2) continue
    const [key, value] = parts
    const meaning = parts.slice(2).join(':').trim()
    if (!SYLLABLES.test(key)) continue
    const chars = [...value]
    if (chars.length !== key.length || value === key) continue
    if (key.length === 1 && isSyllable(value)) continue
    const items = groups.get(key) ?? []
    if (!items.some((item) => item.hanja === value)) {
      items.push({ hanja: value, meaning: key.length === 1 ? meaning : '' })
    }
    groups.set(key, items)
  }
  let out = ''
  for (const [key, items] of groups) {
    const cells = items.map((item) =>
      item.meaning ? `${item.hanja}/${item.meaning.replace(/[\t/]/g, ' ')}` : item.hanja,
    )
    out += `${key}\t${cells.join('\t')}\n`
  }
  return out
}

/** Fetches hanja.txt once into the cache and stops the build if it is not the pinned file. */
export async function fetchHanja(cacheDir) {
  const file = join(cacheDir, HANJA_COMMIT, 'hanja.txt')
  if (!existsSync(file)) {
    const response = await fetch(HANJA_URL)
    if (!response.ok) throw new Error(`hanja.txt: ${response.status} from ${HANJA_URL}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, bytes)
  }
  const bytes = readFileSync(file)
  const sha = createHash('sha256').update(bytes).digest('hex')
  if (sha !== HANJA_SHA256) {
    throw new Error(`hanja.txt at ${HANJA_COMMIT} hashed to ${sha}, expected ${HANJA_SHA256}`)
  }
  return bytes.toString('utf8')
}

/** Writes the dictionary and its notice into `outDir` (the studio's `hanja/` folder). */
export async function writeHanjaDictionary(cacheDir, outDir) {
  const source = await fetchHanja(cacheDir)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'hanja-dict.txt'), compactHanja(source))
  writeFileSync(join(outDir, 'LICENSE-libhangul-hanja.txt'), hanjaNotice(source))
}
