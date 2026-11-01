/**
 * Download one pinned runtime archive, check it against its pinned SHA-256,
 * and unpack it. Node built-ins and JSZip only: `.zip` for Windows, `.tar.gz`
 * elsewhere (Node has gzip but not xz, so the gzip archives are pinned).
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, open, readFile, rm, stat, symlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import JSZip from 'jszip'
import type { PinnedArchive } from './runtime-pins'

export type RuntimeArchiveFailure = 'offline' | 'hash-mismatch' | 'extract-failed'

export class RuntimeArchiveError extends Error {
  constructor(
    readonly kind: RuntimeArchiveFailure,
    message: string,
  ) {
    super(message)
    this.name = 'RuntimeArchiveError'
  }
}

export type RuntimeFetch = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Stream `archive.url` into `target`, hashing as it goes. The file is deleted
 * and `hash-mismatch` thrown when the bytes are not exactly the pinned ones
 * (a longer body is cut off at the pinned size); an unreachable or refused
 * download throws `offline`.
 */
export async function downloadVerifiedArchive(
  archive: PinnedArchive,
  target: string,
  fetchImpl: RuntimeFetch,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetchImpl(archive.url, { redirect: 'follow', signal })
  } catch (error) {
    throw new RuntimeArchiveError('offline', `download failed: ${errorText(error)}`)
  }
  if (!response.ok || !response.body) {
    throw new RuntimeArchiveError('offline', `download failed: HTTP ${response.status}`)
  }
  const hash = createHash('sha256')
  let received = 0
  let tooLong = false
  const handle = await open(target, 'wx')
  try {
    const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
    for await (const chunk of body as AsyncIterable<Buffer>) {
      received += chunk.length
      if (received > archive.bytes) {
        tooLong = true
        body.destroy()
        break
      }
      hash.update(chunk)
      await handle.write(chunk)
    }
  } catch (error) {
    await handle.close().catch(() => undefined)
    await rm(target, { force: true }).catch(() => undefined)
    throw new RuntimeArchiveError('offline', `download interrupted: ${errorText(error)}`)
  }
  await handle.close()
  const digest = hash.digest('hex')
  if (tooLong || received !== archive.bytes || digest !== archive.sha256.toLowerCase()) {
    await rm(target, { force: true }).catch(() => undefined)
    throw new RuntimeArchiveError(
      'hash-mismatch',
      tooLong
        ? `download is longer than the pinned ${archive.bytes} bytes`
        : `download does not match the pinned SHA-256 (${received} bytes, ${digest})`,
    )
  }
}

/** Unpack `file` into `dest`, dropping the archive's top folder `root` */
export async function extractRuntimeArchive(
  file: string,
  format: PinnedArchive['format'],
  root: string,
  dest: string,
): Promise<void> {
  try {
    await mkdir(dest, { recursive: true })
    if (format === 'zip') await extractZip(file, root, dest)
    else await extractTarGz(file, root, dest)
  } catch (error) {
    if (error instanceof RuntimeArchiveError) throw error
    throw new RuntimeArchiveError('extract-failed', `unpacking failed: ${errorText(error)}`)
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The path below the archive's top folder as segments, or null for entries
 * outside it (and the folder itself). `..` and absolute names are refused:
 * a pinned archive never has them.
 */
function entrySegments(name: string, root: string): string[] | null {
  const raw = name.replace(/\\/g, '/')
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw new RuntimeArchiveError('extract-failed', `absolute entry in archive: ${name}`)
  }
  const segments = raw.split('/').filter((part) => part !== '' && part !== '.')
  if (segments.includes('..')) {
    throw new RuntimeArchiveError('extract-failed', `entry leaves the archive: ${name}`)
  }
  if (root) {
    if (segments[0] !== root) return null
    segments.shift()
  }
  return segments.length > 0 ? segments : null
}

function inside(dest: string, target: string): boolean {
  const base = resolve(dest)
  const full = resolve(target)
  return full === base || full.startsWith(`${base}${sep}`)
}

function targetOf(dest: string, segments: string[]): string {
  const target = join(dest, ...segments)
  if (!inside(dest, target)) {
    throw new RuntimeArchiveError(
      'extract-failed',
      `entry leaves the archive: ${segments.join('/')}`,
    )
  }
  return target
}

/** Permission bits worth keeping: read/write/execute, never set-id or sticky */
function fileMode(mode: number | null | undefined): number {
  const bits = typeof mode === 'number' && mode > 0 ? mode & 0o777 : 0o644
  return bits | 0o600
}

// ── zip ──

async function extractZip(file: string, root: string, dest: string): Promise<void> {
  const zip = await JSZip.loadAsync(await readFile(file))
  const entries: JSZip.JSZipObject[] = []
  zip.forEach((_path, entry) => entries.push(entry))
  // one entry at a time keeps only one inflated file in memory
  for (const entry of entries) {
    const segments = entrySegments(entry.name, root)
    if (!segments) continue
    const target = targetOf(dest, segments)
    if (entry.dir) {
      await mkdir(target, { recursive: true })
      continue
    }
    await mkdir(dirname(target), { recursive: true })
    const data = await entry.async('nodebuffer')
    const handle = await open(target, 'w', fileMode(entry.unixPermissions as number | null))
    try {
      await handle.write(data)
    } finally {
      await handle.close()
    }
  }
}

// ── tar.gz ──

const BLOCK = 512

/** Reads exact byte counts from a stream of chunks */
class ChunkReader {
  private chunks: Buffer[] = []
  private length = 0
  private ended = false

  constructor(private readonly source: AsyncIterator<Buffer>) {}

  private async fill(count: number): Promise<void> {
    while (this.length < count && !this.ended) {
      const next = await this.source.next()
      if (next.done) {
        this.ended = true
      } else if (next.value.length > 0) {
        this.chunks.push(next.value)
        this.length += next.value.length
      }
    }
  }

  /** Up to `max` bytes (at least one unless the stream ended), or null at the end */
  async take(max: number): Promise<Buffer | null> {
    await this.fill(1)
    if (this.length === 0) return null
    const first = this.chunks[0]!
    if (first.length <= max) {
      this.chunks.shift()
      this.length -= first.length
      return first
    }
    this.chunks[0] = first.subarray(max)
    this.length -= max
    return first.subarray(0, max)
  }

  async exact(count: number): Promise<Buffer | null> {
    await this.fill(count)
    if (this.length < count) return null
    const parts: Buffer[] = []
    let missing = count
    while (missing > 0) {
      const part = (await this.take(missing))!
      parts.push(part)
      missing -= part.length
    }
    return parts.length === 1 ? parts[0]! : Buffer.concat(parts)
  }

  /** Hand `count` bytes to `sink` piece by piece */
  async pipe(count: number, sink: (chunk: Buffer) => Promise<void>): Promise<void> {
    let remaining = count
    while (remaining > 0) {
      const chunk = await this.take(remaining)
      if (!chunk) throw new RuntimeArchiveError('extract-failed', 'archive ends inside an entry')
      remaining -= chunk.length
      await sink(chunk)
    }
  }
}

function cString(block: Buffer, offset: number, length: number): string {
  const slice = block.subarray(offset, offset + length)
  const end = slice.indexOf(0)
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8')
}

function numeric(block: Buffer, offset: number, length: number): number {
  const field = block.subarray(offset, offset + length)
  if ((field[0]! & 0x80) !== 0) {
    // base-256 (GNU) for values that do not fit the octal field
    let value = field[0]! & 0x7f
    for (let index = 1; index < field.length; index += 1) value = value * 256 + field[index]!
    return value
  }
  const text = field.toString('latin1').replace(/\0.*$/s, '').trim()
  return text ? Number.parseInt(text, 8) : 0
}

function checksumOk(block: Buffer): boolean {
  let sum = 0
  for (let index = 0; index < BLOCK; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : block[index]!
  }
  return sum === numeric(block, 148, 8)
}

/** `path` and `linkpath` from a pax extended header */
function paxRecords(data: Buffer): Map<string, string> {
  const records = new Map<string, string>()
  let offset = 0
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset)
    if (space === -1) break
    const length = Number.parseInt(data.subarray(offset, space).toString('latin1'), 10)
    if (!Number.isFinite(length) || length <= 0) break
    const record = data.subarray(space + 1, offset + length - 1).toString('utf8')
    const equals = record.indexOf('=')
    if (equals > 0) records.set(record.slice(0, equals), record.slice(equals + 1))
    offset += length
  }
  return records
}

async function extractTarGz(file: string, root: string, dest: string): Promise<void> {
  const stream = createReadStream(file).pipe(createGunzip())
  const reader = new ChunkReader((stream as AsyncIterable<Buffer>)[Symbol.asyncIterator]())
  let longName: string | null = null
  let longLink: string | null = null
  let pax = new Map<string, string>()
  try {
    for (;;) {
      const header = await reader.exact(BLOCK)
      if (!header)
        throw new RuntimeArchiveError('extract-failed', 'archive ends without its end mark')
      if (header.every((byte) => byte === 0)) break
      if (!checksumOk(header)) {
        throw new RuntimeArchiveError('extract-failed', 'archive header checksum is wrong')
      }
      const size = numeric(header, 124, 12)
      const padded = Math.ceil(size / BLOCK) * BLOCK
      const typeByte = header[156]!
      const type = typeByte === 0 ? '0' : String.fromCharCode(typeByte)

      if (type === 'x' || type === 'L' || type === 'K' || type === 'g') {
        const data = await reader.exact(padded)
        if (!data) throw new RuntimeArchiveError('extract-failed', 'archive ends inside a header')
        const body = data.subarray(0, size)
        if (type === 'x') pax = paxRecords(body)
        else if (type === 'L') longName = cString(body, 0, body.length)
        else if (type === 'K') longLink = cString(body, 0, body.length)
        continue
      }

      const ustar = cString(header, 257, 6).startsWith('ustar')
      const prefix = ustar ? cString(header, 345, 155) : ''
      const shortName = cString(header, 0, 100)
      const name = pax.get('path') ?? longName ?? (prefix ? `${prefix}/${shortName}` : shortName)
      const link = pax.get('linkpath') ?? longLink ?? cString(header, 157, 100)
      const mode = numeric(header, 100, 8)
      pax = new Map()
      longName = null
      longLink = null

      const segments = entrySegments(name, root)
      const target = segments ? targetOf(dest, segments) : null
      if (target && (type === '0' || type === '7')) {
        await mkdir(dirname(target), { recursive: true })
        const handle = await open(target, 'w', fileMode(mode))
        try {
          await reader.pipe(size, async (chunk) => {
            await handle.write(chunk)
          })
        } finally {
          await handle.close()
        }
        await skip(reader, padded - size)
        continue
      }
      if (target && type === '5') await mkdir(target, { recursive: true })
      if (target && type === '2') await linkSymbolic(dest, target, link)
      if (target && type === '1') await linkHard(dest, root, target, link)
      await skip(reader, padded)
    }
  } finally {
    stream.destroy()
  }
}

async function skip(reader: ChunkReader, count: number): Promise<void> {
  if (count > 0) await reader.pipe(count, async () => undefined)
}

/**
 * A symlink is made only when it points inside the unpacked folder. The app
 * starts runtimes by their real files, so a link the OS refuses (Windows
 * without the symlink right) is left out rather than failing the install.
 */
async function linkSymbolic(dest: string, target: string, link: string): Promise<void> {
  if (!link || isAbsolute(link) || !inside(dest, resolve(dirname(target), link))) return
  await mkdir(dirname(target), { recursive: true })
  await rm(target, { force: true })
  await symlink(link, target).catch(() => undefined)
}

async function linkHard(dest: string, root: string, target: string, link: string): Promise<void> {
  const segments = entrySegments(link, root)
  if (!segments) return
  const source = targetOf(dest, segments)
  const info = await stat(source).catch(() => null)
  if (!info?.isFile()) return
  await mkdir(dirname(target), { recursive: true })
  await copyFile(source, target)
}
