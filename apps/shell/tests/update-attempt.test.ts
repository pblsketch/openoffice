import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clearInstallAttempt,
  INSTALL_ATTEMPT_FILE,
  installDidNotApply,
  installDirWritable,
  installFailureLevel,
  readInstallAttempt,
  recordInstallAttempt,
} from '../src/main/update-attempt'

/**
 * The record the updater leaves before handing over to the installer, and the
 * next launch's reading of it (src/main/update-attempt.ts).
 */

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ieum-attempt-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('install attempt record', () => {
  it('reads back what was recorded until it is cleared', () => {
    const attempt = { version: '0.2.0', fromVersion: '0.1.0', visible: false }
    recordInstallAttempt(dir, attempt)
    expect(readInstallAttempt(dir)).toEqual(attempt)
    expect(readInstallAttempt(dir)).toEqual(attempt)
    clearInstallAttempt(dir)
    expect(existsSync(join(dir, INSTALL_ATTEMPT_FILE))).toBe(false)
    expect(readInstallAttempt(dir)).toBeNull()
  })

  it('treats a missing, broken or foreign record as none', () => {
    expect(readInstallAttempt(dir)).toBeNull()
    for (const content of [
      '{',
      '[]',
      'null',
      '{"version":"0.2.0"}',
      '{"version":"","fromVersion":"0.1.0","visible":true}',
    ]) {
      writeFileSync(join(dir, INSTALL_ATTEMPT_FILE), content)
      expect(readInstallAttempt(dir)).toBeNull()
    }
  })

  it('never throws when the data folder cannot be written', () => {
    const missing = join(dir, 'gone', 'deeper')
    expect(() =>
      recordInstallAttempt(missing, { version: '0.2.0', fromVersion: '0.1.0', visible: false }),
    ).not.toThrow()
    expect(() => clearInstallAttempt(missing)).not.toThrow()
  })
})

describe('installDidNotApply', () => {
  const attempt = { version: '0.2.0', fromVersion: '0.1.0', visible: false }

  it('is true while the app still runs the version that started the installer', () => {
    expect(installDidNotApply(attempt, '0.1.0')).toBe(true)
  })

  it('is false once the update runs, or any other version does', () => {
    expect(installDidNotApply(attempt, '0.2.0')).toBe(false)
    expect(installDidNotApply(attempt, '0.3.0')).toBe(false)
    expect(installDidNotApply(null, '0.1.0')).toBe(false)
  })
})

describe('installFailureLevel', () => {
  it('moves from the silent install to the installer window to the download page', () => {
    expect(installFailureLevel(null)).toBe(0)
    expect(installFailureLevel({ version: '0.2.0', fromVersion: '0.1.0', visible: false })).toBe(1)
    expect(installFailureLevel({ version: '0.2.0', fromVersion: '0.1.0', visible: true })).toBe(2)
  })
})

describe('installDirWritable', () => {
  it('is true for a folder this user can write, and leaves nothing behind', () => {
    expect(installDirWritable(dir, '.probe')).toBe(true)
    expect(readdirSync(dir)).toEqual([])
  })

  it('is true when a probe from an earlier run is still there', () => {
    writeFileSync(join(dir, '.probe'), '')
    expect(installDirWritable(dir, '.probe')).toBe(true)
  })

  it('is false when the file cannot be created', () => {
    expect(installDirWritable(join(dir, 'no-such-folder'), '.probe')).toBe(false)
  })
})
