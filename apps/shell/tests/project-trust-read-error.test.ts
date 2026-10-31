import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A chat whose messages cannot be read to the end counts as written elsewhere
 * (trust.ts `hasForeignMessage`), so under "without" it stays out of the list.
 * The read error is simulated: a stream for a file whose name holds `broken`
 * fails after it opened.
 */

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    createReadStream: ((path: string, options?: unknown) => {
      if (String(path).includes('broken')) {
        return new Readable({
          read() {
            this.destroy(new Error('EIO: i/o error, read'))
          },
        })
      }
      return actual.createReadStream(path, options as never)
    }) as typeof actual.createReadStream,
  }
})

const { hasForeignMessage } = await import('../src/main/projects/trust')

const INSTALL = 'install-here'
let root: string

function chatFile(name: string, lines: object[]): void {
  const dir = join(root, '.ieumoffice', 'chats')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), lines.map((line) => `${JSON.stringify(line)}\n`).join(''))
}

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'project-trust-')))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('hasForeignMessage', () => {
  it('reads a chat of this install as its own and one of another install as foreign', async () => {
    chatFile('mine.jsonl', [{ origin: INSTALL, text: 'a' }])
    chatFile('theirs.jsonl', [{ origin: INSTALL }, { origin: 'install-elsewhere' }])
    expect(await hasForeignMessage(root, 'mine', INSTALL)).toBe(false)
    expect(await hasForeignMessage(root, 'theirs', INSTALL)).toBe(true)
    expect(await hasForeignMessage(root, 'absent', INSTALL)).toBe(false)
  })

  it('counts a chat it cannot read as foreign', async () => {
    chatFile('broken.jsonl', [{ origin: INSTALL, text: 'a' }])
    expect(await hasForeignMessage(root, 'broken', INSTALL)).toBe(true)
  })
})
