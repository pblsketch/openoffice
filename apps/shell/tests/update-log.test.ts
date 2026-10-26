import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUpdateLog } from '../src/main/update-log'

/** The update record in the data folder (src/main/update-log.ts). */

let dir = ''
const fixedNow = () => new Date('2026-10-26T01:02:03.000Z')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ieum-update-log-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('update record', () => {
  it('writes one timestamped line per message', () => {
    const file = join(dir, 'update-log.txt')
    const log = createUpdateLog(file, 64 * 1024, fixedNow)
    log.info('Checking for update')
    log.warn({ code: 'X' })
    log.error(new Error('first\nsecond'))
    const lines = readFileSync(file, 'utf8').trimEnd().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('2026-10-26T01:02:03.000Z info Checking for update')
    expect(lines[1]).toBe('2026-10-26T01:02:03.000Z warn {"code":"X"}')
    expect(lines[2]).toMatch(/^2026-10-26T01:02:03\.000Z error Error: first \| second/)
  })

  it('cuts an overlong entry instead of letting it empty the file', () => {
    const file = join(dir, 'update-log.txt')
    const log = createUpdateLog(file, 6000, fixedNow)
    log.info('x'.repeat(10_000))
    const content = readFileSync(file, 'utf8')
    expect(content.length).toBeGreaterThan(4000)
    expect(content.length).toBeLessThanOrEqual(6000)
  })

  it('stays under its size by dropping the older half', () => {
    const file = join(dir, 'update-log.txt')
    const log = createUpdateLog(file, 2000, fixedNow)
    for (let i = 0; i < 200; i++) log.info(`line ${i}`)
    expect(statSync(file).size).toBeLessThanOrEqual(2000)
    const content = readFileSync(file, 'utf8')
    expect(content).toContain('line 199')
    expect(content).not.toContain('line 0\n')
    // only whole lines are kept
    expect(content.startsWith('2026-')).toBe(true)
  })

  it('never throws when the file cannot be written', () => {
    const log = createUpdateLog(join(dir, 'missing', 'update-log.txt'))
    expect(() => log.info('x')).not.toThrow()
  })
})
