/**
 * The draw.io bundle the diagram editor ships: download, verify, trim.
 *
 * The repository pins draw.io in drawio.json (release, URL, SHA-256, the
 * removal list and the one approved cut) and lists every shipped component
 * with its license in inventory.json. Nothing of draw.io itself is checked
 * in: the release's draw.war is downloaded once into vendor/drawio/.cache
 * (gitignored; node_modules/.cache can be a junction into another checkout),
 * verified against the pinned hash, and unpacked from there.
 *
 * Every shipped file is byte-identical to the release except one: a copy of
 * js/extensions.min.js with the byte ranges of three standalone files cut out
 * (ELK, EPL-2.0; libavoid and its routing core, LGPL-2.1). Those ranges must
 * each occur exactly once, and the result must match the pinned hash, so a
 * draw.io upgrade that changes the bundle fails the build instead of shipping
 * an unreviewed file.
 *
 * Output: apps/diagram/out/drawio/ (DRAWIO_OUT). The shell resolves the
 * diagram module's out directory (resources/modules/diagram when packaged)
 * and serves `<out>/drawio/` through its own protocol.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

export const VENDOR_DIR = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(VENDOR_DIR, '..', '..')
export const CACHE_DIR = join(VENDOR_DIR, '.cache')
export const DRAWIO_OUT = join(ROOT, 'apps', 'diagram', 'out', 'drawio')

const require = createRequire(join(ROOT, 'package.json'))

export const loadConfig = () => JSON.parse(readFileSync(join(VENDOR_DIR, 'drawio.json'), 'utf8'))
export const loadInventory = () =>
  JSON.parse(readFileSync(join(VENDOR_DIR, 'inventory.json'), 'utf8'))

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in apps/diagram/tests/drawio-bundle.test.ts)
// ---------------------------------------------------------------------------

/** `**` crosses folders, `*` and `?` stay inside one; the whole path must match */
export function globToRegExp(pattern) {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '*' && pattern[i + 1] === '*') {
      re += '.*'
      i++
    } else if (ch === '*') re += '[^/]*'
    else if (ch === '?') re += '[^/]'
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

export const matchesAny = (path, patterns) => patterns.some((p) => globToRegExp(p).test(path))

/** true when the release file is on the removal list (never shipped) */
export const isRemoved = (path, config) => matchesAny(path, config.remove)

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** throws unless the bytes hash to the pinned value */
export function verifySha256(bytes, expected, label) {
  const actual = sha256(bytes)
  if (actual !== expected.toLowerCase()) {
    throw new Error(
      `${label}: SHA-256 mismatch\n  expected ${expected}\n  actual   ${actual}\n` +
        'The file is not the pinned draw.io release (vendor/drawio/drawio.json).',
    )
  }
}

/** a zip entry name that stays inside the output folder */
export function isSafeEntryName(name) {
  if (name === '' || name.includes('\\') || name.includes('\0')) return false
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false
  return !name.split('/').some((seg) => seg === '..' || seg === '.')
}

/**
 * Removes each piece's bytes from target. A piece must occur exactly once;
 * otherwise the release no longer has the layout the cut was approved for.
 */
export function cutPieces(target, pieces, label = 'target') {
  const ranges = []
  for (const { name, bytes } of pieces) {
    if (bytes.length === 0) throw new Error(`cut ${label}: ${name} is empty`)
    const offset = target.indexOf(bytes)
    if (offset < 0) {
      throw new Error(
        `cut ${label}: the bytes of ${name} were not found in it. The draw.io release ` +
          'changed how it bundles that file; review the cut in vendor/drawio/drawio.json.',
      )
    }
    if (target.indexOf(bytes, offset + 1) >= 0) {
      throw new Error(`cut ${label}: the bytes of ${name} occur more than once in it`)
    }
    ranges.push({ name, offset, length: bytes.length })
  }
  ranges.sort((a, b) => a.offset - b.offset)
  for (let i = 1; i < ranges.length; i++) {
    const prev = ranges[i - 1]
    if (prev.offset + prev.length > ranges[i].offset) {
      throw new Error(`cut ${label}: ${prev.name} and ${ranges[i].name} overlap`)
    }
  }
  const parts = []
  let at = 0
  for (const r of ranges) {
    parts.push(target.subarray(at, r.offset))
    at = r.offset + r.length
  }
  parts.push(target.subarray(at))
  return { bytes: Buffer.concat(parts), ranges }
}

/** first OR-level branches of an SPDX expression ("A OR B" -> [A, B]) */
const orBranches = (expr) =>
  expr
    .replace(/^\((.*)\)$/, '$1')
    .split(/\s+OR\s+/)
    .map((s) => s.trim())

/**
 * Problems with the shipped file set against the inventory: a removed file
 * that would ship, a file no component covers, a license off the allowlist,
 * a dual-license choice that is not one of the offered branches, and
 * inventory or removal patterns that match nothing (stale after an upgrade).
 */
export function checkInventory({ releaseFiles, shippedFiles, inventory, config, isAllowed }) {
  const problems = []
  for (const f of shippedFiles) {
    if (isRemoved(f, config)) problems.push(`removed file would ship: ${f}`)
  }
  const compiled = inventory.components.map((c) => ({
    c,
    res: c.files.map((p) => ({ p, re: globToRegExp(p), hits: 0 })),
  }))
  for (const f of shippedFiles) {
    let covered = false
    for (const { res } of compiled) {
      for (const r of res) {
        if (r.re.test(f)) {
          r.hits++
          covered = true
        }
      }
    }
    if (!covered) problems.push(`not covered by vendor/drawio/inventory.json: ${f}`)
  }
  for (const { c, res } of compiled) {
    if (!c.license || !isAllowed(c.license)) {
      problems.push(`${c.name}: license ${c.license ?? '(none)'} is not on the allowlist`)
    }
    if (c.offered && !orBranches(c.offered).includes(c.license)) {
      problems.push(`${c.name}: chosen license ${c.license} is not offered by "${c.offered}"`)
    }
    for (const r of res) {
      if (r.hits === 0) problems.push(`${c.name}: pattern matches no shipped file: ${r.p}`)
    }
  }
  for (const p of config.remove) {
    const re = globToRegExp(p)
    if (!releaseFiles.some((f) => re.test(f))) {
      problems.push(`removal pattern matches no release file: ${p}`)
    }
  }
  return problems
}

// ---------------------------------------------------------------------------
// Download and cache
// ---------------------------------------------------------------------------

export const cachedWarPath = (config, cacheDir = CACHE_DIR) =>
  join(cacheDir, config.version, 'draw.war')

/**
 * The verified draw.war: from the cache when present (never re-downloaded),
 * otherwise downloaded from the pinned URL. Either way the hash must match;
 * a mismatch fails and leaves nothing new in the cache.
 */
export async function ensureWar({
  config = loadConfig(),
  cacheDir = CACHE_DIR,
  fetchImpl = globalThis.fetch,
  log = console.log,
} = {}) {
  const dest = cachedWarPath(config, cacheDir)
  if (existsSync(dest)) {
    const bytes = readFileSync(dest)
    try {
      verifySha256(bytes, config.sha256, `cached ${dest}`)
    } catch (err) {
      throw new Error(`${err.message}\nDelete ${dest} to download it again.`, { cause: err })
    }
    return { path: dest, bytes }
  }
  log(`draw.io ${config.version}: downloading ${config.url}`)
  let res
  try {
    res = await fetchImpl(config.url, { redirect: 'follow' })
  } catch (err) {
    throw new Error(`draw.io download failed: ${config.url}: ${err.message}`, {
      cause: err,
    })
  }
  if (!res.ok) throw new Error(`draw.io download failed: ${config.url}: HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  verifySha256(bytes, config.sha256, `downloaded ${config.url}`)
  mkdirSync(dirname(dest), { recursive: true })
  const part = `${dest}.part`
  writeFileSync(part, bytes)
  renameSync(part, dest)
  log(`draw.io ${config.version}: verified and cached at ${dest}`)
  return { path: dest, bytes }
}

// ---------------------------------------------------------------------------
// Reading the release and producing the trimmed bundle
// ---------------------------------------------------------------------------

/**
 * The release as a map-like reader: every file entry (folders dropped),
 * after checking each name stays inside the output folder.
 */
export async function openRelease(warBytes) {
  const JSZip = require('jszip')
  const zip = await JSZip.loadAsync(warBytes)
  const files = []
  zip.forEach((name, entry) => {
    if (entry.dir) return
    if (!isSafeEntryName(name)) throw new Error(`draw.war has an unsafe entry name: ${name}`)
    files.push(name)
  })
  files.sort()
  const read = (name) => {
    const entry = zip.file(name)
    if (!entry) throw new Error(`draw.war has no ${name}`)
    return entry.async('nodebuffer')
  }
  return { files, read }
}

/** the cut files of the bundle, each checked against its pinned hash */
export async function derivedFiles(release, config) {
  const out = new Map()
  for (const cut of config.cut) {
    const target = await release.read(cut.file)
    const pieces = []
    for (const name of cut.pieces) pieces.push({ name, bytes: await release.read(name) })
    const { bytes, ranges } = cutPieces(target, pieces, cut.file)
    verifySha256(bytes, cut.sha256, `derived ${cut.file}`)
    out.set(cut.file, { bytes, ranges, originalLength: target.length })
  }
  return out
}

/** the release opened and trimmed: what ships and how it differs from the release */
export async function loadDrawio(options = {}) {
  const config = options.config ?? loadConfig()
  const war = await ensureWar({ ...options, config })
  const release = await openRelease(war.bytes)
  const shippedFiles = release.files.filter((f) => !isRemoved(f, config))
  const removedFiles = release.files.filter((f) => isRemoved(f, config))
  const derived = await derivedFiles(release, config)
  const read = async (name) => derived.get(name)?.bytes ?? release.read(name)
  return { config, war, releaseFiles: release.files, shippedFiles, removedFiles, derived, read }
}

const stampPath = (outDir) => `${outDir}.stamp.json`
const stampFor = (config) =>
  JSON.stringify({
    version: config.version,
    sha256: config.sha256,
    config: sha256(readFileSync(join(VENDOR_DIR, 'drawio.json'))),
  })

/**
 * Writes the trimmed bundle to outDir (default apps/diagram/out/drawio).
 * Skips the work when the stamp beside it says the same pin and config
 * produced it; otherwise rebuilds into a sibling folder and swaps it in.
 */
export async function prepareDrawio({ outDir = DRAWIO_OUT, log = console.log, ...options } = {}) {
  const config = options.config ?? loadConfig()
  const stamp = stampFor(config)
  if (
    existsSync(join(outDir, 'index.html')) &&
    existsSync(stampPath(outDir)) &&
    readFileSync(stampPath(outDir), 'utf8') === stamp
  ) {
    log(`draw.io ${config.version}: ${outDir} is up to date`)
    return { outDir, skipped: true }
  }
  const drawio = await loadDrawio({ ...options, config, log })
  const tmp = `${outDir}.tmp`
  rmSync(tmp, { recursive: true, force: true })
  for (const name of drawio.shippedFiles) {
    const dest = join(tmp, ...name.split('/'))
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, await drawio.read(name))
  }
  rmSync(stampPath(outDir), { force: true })
  rmSync(outDir, { recursive: true, force: true })
  renameSync(tmp, outDir)
  writeFileSync(stampPath(outDir), stamp)
  log(
    `draw.io ${config.version}: wrote ${drawio.shippedFiles.length} files to ${outDir} ` +
      `(${drawio.removedFiles.length} release files left out)`,
  )
  return { outDir, skipped: false, drawio }
}

/** every file under dir as a forward-slash relative path */
export function listTree(dir) {
  const out = []
  const walk = (at) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      const p = join(at, e.name)
      if (e.isDirectory()) walk(p)
      else out.push(posix.join(...p.slice(dir.length + 1).split(/[\\/]/)))
    }
  }
  if (existsSync(dir)) walk(dir)
  return out.sort()
}
