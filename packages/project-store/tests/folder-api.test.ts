import { describe, expect, it } from 'vitest'
import {
  PROJECT_FOLDER_CHANNELS,
  PROJECT_FOLDER_EVENTS,
  isValidProjectId,
  MEMORY_BACKUP_PATTERN,
} from '../src/index.js'

describe('isValidProjectId', () => {
  it('accepts letters, digits, underscore and dash', () => {
    expect(isValidProjectId('abc')).toBe(true)
    expect(isValidProjectId('A-b_9')).toBe(true)
    expect(isValidProjectId('3f2a9c1e-7b40-4d2e-9a51-0c6b8e2f1d3a')).toBe(true)
  })

  it('rejects empty, traversal, separators and non-strings', () => {
    for (const value of ['', '.', '..', '../x', 'a/b', 'a\b', 'a b', 'a.json', 'ä', 'a\n']) {
      expect(isValidProjectId(value)).toBe(false)
    }
    for (const value of [undefined, null, 1, {}, ['a']]) {
      expect(isValidProjectId(value)).toBe(false)
    }
  })
})

describe('channel names', () => {
  it('are unique and prefixed', () => {
    const all = [...Object.values(PROJECT_FOLDER_CHANNELS), ...Object.values(PROJECT_FOLDER_EVENTS)]
    expect(new Set(all).size).toBe(all.length)
    for (const name of all) expect(name.startsWith('projectFolder:')).toBe(true)
  })
})

describe('MEMORY_BACKUP_PATTERN', () => {
  it('matches only timestamped backups', () => {
    expect(MEMORY_BACKUP_PATTERN.test('memory.20261029-071500.bak.md')).toBe(true)
    expect(MEMORY_BACKUP_PATTERN.test('memory.md')).toBe(false)
    expect(MEMORY_BACKUP_PATTERN.test('memory (conflict).md')).toBe(false)
    expect(MEMORY_BACKUP_PATTERN.test('../memory.20261029-071500.bak.md')).toBe(false)
  })
})
