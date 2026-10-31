import { readSync, statSync } from 'node:fs'
import { flagString, type ParsedArgs } from './args'
import { readTextFile, resolveInput, stripBom, type PathContext } from './fs'
import { MAX_TRANSFER_BYTES } from './mcp/files'
import { CliError, EXIT } from './result'

/** Same ceiling as MCP file transfers: decks inline pictures as base64 in addPicture.bytes. */
export const MAX_OPS_BYTES = MAX_TRANSFER_BYTES
const STDIN_CHUNK_BYTES = 1024 * 1024

function throwIfOpsOverBudget(bytes: number, source: string, cap: number): void {
  if (bytes > cap) {
    throw new CliError(
      EXIT.file,
      `ops input too large: ${source} is ${bytes} bytes (cap ${cap}); split into smaller batches`,
      { source, bytes, cap },
      {
        reason: 'resource_limit',
        suggestion: 'split into smaller --ops batches',
      },
    )
  }
}

/**
 * Reads a stream fd to its end, throwing as soon as the running total passes the cap.
 * `cap` exists so tests can exercise the limit without writing 256 MB; callers keep the default.
 */
export function readOpsStream(fd: number, source: string, cap = MAX_OPS_BYTES): string {
  const chunks: Buffer[] = []
  const buf = Buffer.allocUnsafe(STDIN_CHUNK_BYTES)
  let total = 0
  for (;;) {
    const n = readSync(fd, buf, 0, STDIN_CHUNK_BYTES, null)
    if (n === 0) break
    total += n
    throwIfOpsOverBudget(total, source, cap)
    chunks.push(Buffer.from(buf.subarray(0, n)))
  }
  return Buffer.concat(chunks, total).toString('utf-8')
}

/** `--ops <file>` or `--ops -` (stdin); returns the raw text and a label for error messages. */
export function readOpsInput(
  args: ParsedArgs,
  ctx: PathContext,
  cap = MAX_OPS_BYTES,
): { text: string; source: string } {
  const spec = flagString(args, 'ops')
  if (!spec)
    throw new CliError(EXIT.usage, 'missing --ops <file|->', undefined, {
      reason: 'missing_argument',
    })
  if (spec === '-') return { text: stripBom(readOpsStream(0, 'stdin', cap)), source: 'stdin' }
  const path = resolveInput(spec, ctx)
  const size = statSync(path).size
  throwIfOpsOverBudget(size, path, cap)
  return { text: stripBom(readTextFile(path)), source: path }
}
