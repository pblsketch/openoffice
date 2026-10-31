import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  normalizeProjectsSettings,
  readProjectsSettings,
  updateProjectsSettings,
  writeAppSetting,
} from '../src/main/app-settings'

/** The `projects` key of app-settings.json (spec 4) */

let dir: string
let settingsPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'project-settings-'))
  settingsPath = join(dir, 'app-settings.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const abs = (name: string) => join(dir, name)
const hash = 'a'.repeat(64)

describe('normalizeProjectsSettings', () => {
  it('reads nothing as an empty registry', () => {
    expect(normalizeProjectsSettings(undefined)).toEqual({
      installId: '',
      list: [],
      trust: {},
      outsideDocuments: {},
      optedOutDocuments: {},
      settings: {},
      syncNoticeShown: [],
    })
    expect(normalizeProjectsSettings([1, 2]).list).toEqual([])
  })

  it('keeps well-formed values and drops malformed ones', () => {
    const value = normalizeProjectsSettings({
      installId: 'inst_1',
      list: [
        { id: 'p1', path: abs('a'), pinned: true, lastUsedAt: '2026-10-29T00:00:00.000Z' },
        { id: 'p1', path: abs('dup'), pinned: false, lastUsedAt: '2026-10-29T00:00:00.000Z' },
        { id: 'bad id', path: abs('b') },
        { id: 'p2', path: 'relative' },
        { id: 'p3', path: abs('c'), lastUsedAt: 'never' },
      ],
      trust: {
        p1: { decision: 'use', hashes: { instructions: hash, memory: 'short', other: hash } },
        p2: { decision: 'maybe', hashes: {} },
      },
      outsideDocuments: {
        [abs('x.docx')]: { projectId: 'p1', lastChatId: 'c1' },
        [abs('y.docx')]: { projectId: null, lastChatId: 'c1' },
        relative: { projectId: 'p1' },
      },
      optedOutDocuments: { [abs('a/z.docx')]: { projectId: 'p1' }, [abs('q')]: {} },
      settings: { p1: { memoryEnabled: false }, 'b d': { memoryEnabled: false } },
      homeProjectId: 'p1',
      syncNoticeShown: ['p1', 'p1', 'bad id'],
    })
    expect(value.installId).toBe('inst_1')
    expect(value.list.map((item) => item.id)).toEqual(['p1', 'p3'])
    expect(value.list[1]!.lastUsedAt).toBe(new Date(0).toISOString())
    expect(value.trust).toEqual({ p1: { decision: 'use', hashes: { instructions: hash } } })
    expect(value.outsideDocuments).toEqual({
      [abs('x.docx')]: { projectId: 'p1', lastChatId: 'c1' },
      [abs('y.docx')]: { projectId: null },
    })
    expect(value.optedOutDocuments).toEqual({ [abs('a/z.docx')]: { projectId: 'p1' } })
    expect(value.settings).toEqual({ p1: { memoryEnabled: false, readAgentsFiles: true } })
    expect(value.homeProjectId).toBe('p1')
    expect(value.syncNoticeShown).toEqual(['p1'])
  })
})

describe('reading and writing', () => {
  it('keeps the other keys of the file', () => {
    writeAppSetting(settingsPath, 'uiLanguage', 'ja')
    updateProjectsSettings(settingsPath, (settings) => {
      settings.installId = 'abc'
    })
    const raw = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>
    expect(raw.uiLanguage).toBe('ja')
    expect((raw.projects as { installId: string }).installId).toBe('abc')
    expect(readProjectsSettings(settingsPath).installId).toBe('abc')
  })

  it('reads a missing file as empty', () => {
    expect(readProjectsSettings(join(dir, 'missing.json')).list).toEqual([])
  })
})
