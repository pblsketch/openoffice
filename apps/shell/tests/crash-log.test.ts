import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendCrashLog, crashLine, errorReason } from '../src/main/crash-log'

/**
 * The crash record stays on this PC and holds only what tells one crash from
 * another: time, what ended, the reason word, the exit code, the editor. A
 * document's text, a path or a file name must never reach it, and the file
 * must not grow without bound.
 */

const AT = new Date('2026-10-15T01:02:03.000Z')

describe('crashLine', () => {
  it('writes the allowed fields as one JSON line', () => {
    const line = crashLine(
      { kind: 'renderer', reason: 'oom', exitCode: -536870904, editor: 'docs' },
      AT,
    )
    expect(line.endsWith('\n')).toBe(true)
    expect(JSON.parse(line)).toEqual({
      at: '2026-10-15T01:02:03.000Z',
      kind: 'renderer',
      reason: 'oom',
      exitCode: -536870904,
      editor: 'docs',
    })
  })

  it('records the child-process type for GPU and utility crashes', () => {
    expect(
      JSON.parse(
        crashLine({ kind: 'child-process', reason: 'crashed', exitCode: 1, process: 'GPU' }, AT),
      ),
    ).toMatchObject({ kind: 'child-process', process: 'GPU' })
  })

  it('records an agent start with its program and the error type, never a message', () => {
    expect(
      JSON.parse(
        crashLine(
          {
            kind: 'agent-start',
            program: 'codex',
            reason: 'refused thread.start -32600',
            cause: 'AgentProgramError',
          },
          AT,
        ),
      ),
    ).toEqual({
      at: '2026-10-15T01:02:03.000Z',
      kind: 'agent-start',
      program: 'codex',
      reason: 'refused thread.start -32600',
      cause: 'AgentProgramError',
    })
    const line = crashLine(
      {
        kind: 'agent-start',
        program: '/Users/someone/.local/bin/codex',
        cause: 'Codex app-server: filesystem glob path `/Users/someone/[final]` only supports deny',
      },
      AT,
    )
    expect(JSON.parse(line)).toEqual({ at: '2026-10-15T01:02:03.000Z', kind: 'agent-start' })
  })

  it('drops any value that could carry a path, a file name or a message', () => {
    const line = crashLine(
      {
        kind: 'renderer',
        reason: 'C:\\Users\\someone\\Documents\\salary.xlsx',
        editor: '/home/someone/plan.docx',
        process: 'ENOENT: no such file or directory, open "C:\\secret.docx"',
      },
      AT,
    )
    expect(JSON.parse(line)).toEqual({ at: '2026-10-15T01:02:03.000Z', kind: 'renderer' })
    expect(line).not.toMatch(/salary|plan\.docx|secret|Users/)
  })

  it('writes memory figures as whole non-negative numbers only', () => {
    const line = crashLine(
      {
        kind: 'low-memory',
        appMB: 2048,
        freeMB: 0,
        totalMB: 7.5,
        aiStreams: -1,
        cliChildren: 'C:\\secret' as never,
      },
      AT,
    )
    expect(JSON.parse(line)).toEqual({
      at: '2026-10-15T01:02:03.000Z',
      kind: 'low-memory',
      appMB: 2048,
      freeMB: 0,
    })
  })

  it('ignores fields it does not know', () => {
    const entry = { kind: 'renderer', reason: 'crashed', url: 'docs://x/?file=a.docx' } as never
    expect(crashLine(entry, AT)).not.toContain('a.docx')
  })
})

describe('errorReason', () => {
  it('keeps the class name and code, never the message', () => {
    const error = Object.assign(new Error('open C:\\Users\\someone\\a.docx failed'), {
      code: 'ENOENT',
    })
    expect(errorReason(error)).toBe('Error:ENOENT')
    expect(errorReason(new TypeError('cannot read "x" of C:\\private'))).toBe('TypeError')
  })

  it('names the type of a thrown non-error', () => {
    expect(errorReason('C:\\Users\\someone\\a.docx')).toBe('string')
    expect(errorReason(undefined)).toBe('undefined')
  })
})

describe('appendCrashLog', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'crash-log-'))
    file = join(dir, 'crash-log.jsonl')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('appends one line per entry', () => {
    appendCrashLog(file, { kind: 'renderer', reason: 'crashed', editor: 'sheets' }, 1024, AT)
    appendCrashLog(file, { kind: 'child-process', reason: 'oom', process: 'GPU' }, 1024, AT)
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines.map((l) => JSON.parse(l).kind)).toEqual(['renderer', 'child-process'])
  })

  it('stays under the cap, keeping the newest lines', () => {
    for (let i = 0; i < 200; i++) {
      appendCrashLog(file, { kind: 'renderer', reason: 'crashed', exitCode: i }, 2048, AT)
    }
    expect(statSync(file).size).toBeLessThanOrEqual(2048)
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(JSON.parse(lines[lines.length - 1]).exitCode).toBe(199)
    expect(lines.every((l) => JSON.parse(l).kind === 'renderer')).toBe(true)
  })

  it('never throws, even when the folder is gone', () => {
    expect(() =>
      appendCrashLog(join(dir, 'missing', 'crash-log.jsonl'), { kind: 'main-exception' }),
    ).not.toThrow()
  })

  it('starts over from a file it cannot parse back into lines', () => {
    writeFileSync(file, 'x'.repeat(5000))
    appendCrashLog(file, { kind: 'renderer', reason: 'oom' }, 1024, AT)
    expect(statSync(file).size).toBeLessThanOrEqual(1024)
    expect(JSON.parse(readFileSync(file, 'utf8').trim()).reason).toBe('oom')
  })
})
