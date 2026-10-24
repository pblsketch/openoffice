import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CRASH_LOOP_WINDOW_MS,
  SESSION_RECORD_WRITE_DELAY_MS,
  createSessionRecorder,
  initSessionRecord,
  judgePreviousExit,
  markSessionCleanExit,
  markSessionClosedToTray,
  markSessionOsEnd,
  noteSessionChanged,
  parseSessionRecord,
  readSessionRecord,
  resetSessionRecordForTests,
  sessionRecordPath,
  sessionRecorder,
  sessionRestoreLayout,
  sessionSnapshotFrom,
  type SessionRecord,
  type SessionRecordReadResult,
  type SessionRecorderOptions,
  type SessionSnapshotSource,
  type SessionStripState,
  type SessionStripTab,
} from '../src/main/session-record'

/**
 * Session record and the normal / abnormal exit judgment (crash recovery spec
 * 4, 5.2, 5.3, 11). Real files in a temp userData folder; timers are faked so
 * the debounce and the crash-loop window are deterministic.
 */

let dir: string
let clock: number

const store = (unresolved: boolean) => ({ hasUnresolvedCopies: () => unresolved })

function recorder(extra: Partial<SessionRecorderOptions> = {}) {
  return createSessionRecorder({ userDataDir: dir, now: () => clock, ...extra })
}

function stored(): SessionRecord {
  const result = readSessionRecord(sessionRecordPath(dir))
  if (result.status !== 'ok') throw new Error(`no record: ${result.status}`)
  return result.record
}

function seed(value: unknown): void {
  writeFileSync(sessionRecordPath(dir), typeof value === 'string' ? value : JSON.stringify(value))
}

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    version: 1,
    cleanExit: false,
    startedAt: 1_000,
    restoreRun: false,
    pastStartup: false,
    tabs: [],
    ...overrides,
  }
}

const ok = (r: SessionRecord): SessionRecordReadResult => ({ status: 'ok', record: r })

const strip = (tabs: SessionStripTab[], activeId: string | null = null): SessionStripState => ({
  tabs,
  activeId,
  split: null,
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'session-record-'))
  clock = 1_000_000
  vi.useFakeTimers()
})

afterEach(() => {
  resetSessionRecordForTests()
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

describe('judging the previous exit (spec 4)', () => {
  it('no record at all is normal (first run, first run after the update)', () => {
    expect(judgePreviousExit({ status: 'missing' }, store(true))).toEqual({
      abnormal: false,
      reason: 'noRecord',
      crashLoop: false,
    })
  })

  it('the clean mark with no undecided or restore-chosen copy is normal', () => {
    expect(judgePreviousExit(ok(record({ cleanExit: true })), store(false))).toEqual({
      abnormal: false,
      reason: 'clean',
      crashLoop: false,
    })
  })

  it('the clean mark with such copies left is abnormal', () => {
    expect(judgePreviousExit(ok(record({ cleanExit: true })), store(true))).toMatchObject({
      abnormal: true,
      reason: 'unresolvedCopies',
    })
  })

  it('a record without the clean mark is abnormal, copies or not', () => {
    for (const unresolved of [false, true]) {
      expect(judgePreviousExit(ok(record()), store(unresolved))).toMatchObject({
        abnormal: true,
        reason: 'notClean',
      })
    }
  })

  it('an unreadable record is abnormal only when such copies are left', () => {
    expect(judgePreviousExit({ status: 'corrupt' }, store(false)).abnormal).toBe(false)
    expect(judgePreviousExit({ status: 'corrupt' }, store(true))).toMatchObject({
      abnormal: true,
      reason: 'corruptRecord',
      crashLoop: false,
    })
  })

  it('a restore run that died before outliving the startup window is a crash loop', () => {
    const died = ok(record({ restoreRun: true, pastStartup: false }))
    expect(judgePreviousExit(died, store(false)).crashLoop).toBe(true)
  })

  it('no crash loop when the restore run outlived the window, was no restore run, or quit cleanly', () => {
    const cases = [
      record({ restoreRun: true, pastStartup: true }),
      record({ restoreRun: false }),
      record({ restoreRun: true, cleanExit: true }),
    ]
    for (const r of cases) expect(judgePreviousExit(ok(r), store(true)).crashLoop).toBe(false)
  })
})

describe('the run lifecycle on disk', () => {
  it('a run is not clean until the quit completes; the next launch then judges it normal', () => {
    const run = recorder()
    expect(run.previous).toEqual({ status: 'missing' })
    run.startRun({ restoreRun: false })
    expect(stored()).toMatchObject({ cleanExit: false, startedAt: clock, restoreRun: false })
    expect(
      judgePreviousExit(readSessionRecord(sessionRecordPath(dir)), store(false)).abnormal,
    ).toBe(true)

    run.markCleanExit()
    const next = recorder()
    expect(judgePreviousExit(next.previous, store(false))).toMatchObject({
      abnormal: false,
      reason: 'clean',
    })
  })

  it('a clean quit keeps the tab list, so a quit that left copies still rebuilds the tabs', () => {
    const run = recorder()
    run.startRun({ restoreRun: false })
    run.update({ tabs: [{ kind: 'sheets', title: 'b.xlsx', filePath: 'C:\\b.xlsx' }], active: 0 })
    run.markCleanExit()
    expect(stored()).toMatchObject({ cleanExit: true, active: 0 })
    expect(stored().tabs).toHaveLength(1)
  })

  it('nothing is written after the quit completed', () => {
    const run = recorder()
    run.startRun({ restoreRun: false })
    run.markCleanExit()
    run.update({ tabs: [{ kind: 'docs', title: 'late.docx', filePath: 'C:\\late.docx' }] })
    vi.advanceTimersByTime(SESSION_RECORD_WRITE_DELAY_MS * 2)
    run.flush()
    expect(stored()).toMatchObject({ cleanExit: true, tabs: [] })
  })

  it('closing the main window into the tray empties the tabs and is a normal exit', () => {
    const run = recorder()
    run.startRun({ restoreRun: false })
    run.update({
      tabs: [{ kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' }],
      active: 0,
    })
    run.markClosedToTray()
    expect(stored()).toEqual(expect.objectContaining({ cleanExit: true, tabs: [] }))
    expect(stored().active).toBeUndefined()
    // a power loss now: the next launch sees a normal exit and no tabs
    expect(judgePreviousExit(recorder().previous, store(false)).abnormal).toBe(false)
  })

  it('a window reopened from the tray clears the clean mark with its first tab change', () => {
    const run = recorder()
    run.startRun({ restoreRun: false })
    run.markClosedToTray()
    run.update({ tabs: [{ kind: 'pdf', title: 'p.pdf', filePath: 'C:\\p.pdf' }] })
    expect(stored()).toMatchObject({ cleanExit: false })
    expect(stored().tabs).toHaveLength(1)
  })

  it('an OS session end writes what is pending and never sets the clean mark', () => {
    const run = recorder()
    run.startRun({ restoreRun: false })
    run.update({ tabs: [{ kind: 'hwp', title: 'h.hwp', filePath: 'C:\\h.hwp' }] })
    run.markOsSessionEnd()
    expect(stored().tabs).toHaveLength(1)
    // will-quit may still run during an OS shutdown
    run.markCleanExit()
    expect(stored().cleanExit).toBe(false)
    expect(judgePreviousExit(recorder().previous, store(false)).abnormal).toBe(true)
  })

  it('marks the run past startup once it outlives the crash-loop window', () => {
    const run = recorder()
    run.startRun({ restoreRun: true })
    vi.advanceTimersByTime(CRASH_LOOP_WINDOW_MS - 1)
    expect(judgePreviousExit(recorder().previous, store(false)).crashLoop).toBe(true)
    vi.advanceTimersByTime(1)
    expect(stored().pastStartup).toBe(true)
    expect(judgePreviousExit(recorder().previous, store(false))).toMatchObject({
      abnormal: true,
      crashLoop: false,
    })
  })

  it('a restore run starts from the previous tabs; any other run starts empty', () => {
    seed(
      record({
        tabs: [
          { kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' },
          { kind: 'hwp', title: 'b.hwp', filePath: 'C:\\b.hwp' },
        ],
        active: 1,
        split: { a: 0, b: 1, orientation: 'side', ratio: 0.5, focus: 'b' },
      }),
    )
    const restore = recorder()
    restore.startRun({ restoreRun: true })
    expect(stored()).toMatchObject({ restoreRun: true, active: 1, startedAt: clock })
    expect(stored().tabs).toHaveLength(2)
    expect(stored().split).toEqual({ a: 0, b: 1, orientation: 'side', ratio: 0.5, focus: 'b' })
    restore.dispose()

    seed(record({ tabs: [{ kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' }] }))
    const plain = recorder()
    plain.startRun({ restoreRun: false })
    expect(stored()).toMatchObject({ restoreRun: false, tabs: [] })
  })

  it('updates before the run starts are dropped', () => {
    const run = recorder()
    run.update({ tabs: [{ kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' }] })
    vi.advanceTimersByTime(SESSION_RECORD_WRITE_DELAY_MS * 2)
    expect(existsSync(sessionRecordPath(dir))).toBe(false)
  })

  it('a failing write never throws into a tab change or the quit', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const run = recorder({
      writeJson: () => {
        throw new Error('disk full')
      },
    })
    expect(() => run.startRun({ restoreRun: false })).not.toThrow()
    expect(() => run.markCleanExit()).not.toThrow()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('debounced writes', () => {
  it('coalesces a burst of changes into one write after the delay', () => {
    const writes: unknown[] = []
    const run = recorder({ writeJson: (_path, value) => writes.push(structuredClone(value)) })
    run.startRun({ restoreRun: false })
    expect(writes).toHaveLength(1)
    for (let i = 0; i < 20; i++) {
      run.update({
        tabs: [
          { kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' },
          { kind: 'docs', title: 'b.docx', filePath: 'C:\\b.docx' },
        ],
        split: { a: 0, b: 1, orientation: 'side', ratio: 0.3 + i / 100, focus: 'a' },
      })
    }
    expect(writes).toHaveLength(1)
    vi.advanceTimersByTime(SESSION_RECORD_WRITE_DELAY_MS)
    expect(writes).toHaveLength(2)
    expect((writes[1] as SessionRecord).split?.ratio).toBeCloseTo(0.49)
  })

  it('skips the write when nothing changed', () => {
    const writes: unknown[] = []
    const run = recorder({ writeJson: (_path, value) => writes.push(value) })
    run.startRun({ restoreRun: false })
    run.update({ tabs: [] })
    vi.advanceTimersByTime(SESSION_RECORD_WRITE_DELAY_MS * 3)
    expect(writes).toHaveLength(1)
  })

  it('flush and the clean mark write the pending change at once', () => {
    const run = recorder()
    run.startRun({ restoreRun: false })
    run.update({ tabs: [{ kind: 'html', title: 'x.html', filePath: 'C:\\x.html' }] })
    expect(stored().tabs).toHaveLength(0)
    run.flush()
    expect(stored().tabs).toHaveLength(1)
    run.update({ tabs: [] })
    run.markCleanExit()
    expect(stored()).toMatchObject({ cleanExit: true, tabs: [] })
  })
})

describe('reading a damaged record', () => {
  it('reads a missing file as missing and garbage as corrupt', () => {
    const path = sessionRecordPath(dir)
    expect(readSessionRecord(path)).toEqual({ status: 'missing' })
    for (const bad of [
      '{not json',
      '[]',
      'null',
      '"text"',
      JSON.stringify({ ...record(), version: 2 }),
      JSON.stringify({ ...record(), cleanExit: 'yes' }),
      JSON.stringify({ ...record(), startedAt: 'today' }),
      JSON.stringify({ ...record(), tabs: {} }),
    ]) {
      seed(bad)
      expect(readSessionRecord(path)).toEqual({ status: 'corrupt' })
    }
  })

  it('a corrupt record is ignored: the run starts fresh and overwrites it', () => {
    seed('{"version":1,"tabs":')
    const run = recorder()
    expect(run.previous).toEqual({ status: 'corrupt' })
    run.startRun({ restoreRun: true })
    expect(stored()).toMatchObject({ restoreRun: true, tabs: [] })
  })

  it('drops malformed tab entries and remaps the indices that pointed past them', () => {
    const parsed = parseSessionRecord({
      ...record(),
      tabs: [
        { kind: 'home', title: 'Home' },
        { kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' },
        { kind: 'docs', title: 7 },
        { kind: 'hwp', title: 'Untitled', untitled: { untitledId: '../../evil', ext: '.hwp' } },
        { kind: 'markdown', title: 'Notes', untitled: { untitledId: 'u-1', ext: '.md' } },
        null,
        { kind: 'pdf', title: 'p.pdf', filePath: '' },
        { kind: 'sheets', title: 's.xlsx', filePath: 'C:\\s.xlsx' },
      ],
      active: 7,
      split: { a: 1, b: 4, orientation: 'stack', ratio: 0.4, focus: 'b' },
    })
    expect(parsed?.tabs).toEqual([
      { kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' },
      { kind: 'markdown', title: 'Notes', untitled: { untitledId: 'u-1', ext: '.md' } },
      { kind: 'sheets', title: 's.xlsx', filePath: 'C:\\s.xlsx' },
    ])
    expect(parsed?.active).toBe(2)
    expect(parsed?.split).toEqual({ a: 0, b: 1, orientation: 'stack', ratio: 0.4, focus: 'b' })
  })

  it('ignores an active index or split that points at a dropped or missing tab', () => {
    const parsed = parseSessionRecord({
      ...record(),
      tabs: [{ kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' }, { kind: 'nope' }],
      active: 1,
      split: { a: 0, b: 1, orientation: 'side', ratio: 0.5, focus: 'a' },
    })
    expect(parsed?.active).toBeUndefined()
    expect(parsed?.split).toBeUndefined()
    const bad = parseSessionRecord({
      ...record(),
      tabs: [
        { kind: 'docs', title: 'a', filePath: 'C:\\a' },
        { kind: 'docs', title: 'b', filePath: 'C:\\b' },
      ],
      active: 'first',
      split: { a: 0, b: 1, orientation: 'diagonal', ratio: 0.5, focus: 'a' },
    })
    expect(bad?.active).toBeUndefined()
    expect(bad?.split).toBeUndefined()
  })
})

describe('what the record holds (spec 11)', () => {
  it('stores no document content, only kind, title, path and the untitled copy id', () => {
    const source = {
      strip: {
        tabs: [
          {
            id: 't1',
            kind: 'docs',
            title: 'a.docx',
            filePath: 'C:\\a.docx',
            content: 'SECRET-BODY',
            html: '<p>SECRET-BODY</p>',
          },
          { id: 't2', kind: 'markdown', title: 'Notes', text: 'SECRET-BODY' },
        ],
        activeId: 't1',
        split: null,
      },
      untitledCopyFor: () => ({ untitledId: 'u-1', ext: '.md', bytes: 'SECRET-BODY' }),
    } as unknown as SessionSnapshotSource
    const run = recorder()
    run.startRun({ restoreRun: false })
    run.update(sessionSnapshotFrom(source))
    run.flush()
    const text = readFileSync(sessionRecordPath(dir), 'utf8')
    expect(text).not.toContain('SECRET-BODY')
    expect(stored().tabs).toEqual([
      { kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' },
      { kind: 'markdown', title: 'Notes', untitled: { untitledId: 'u-1', ext: '.md' } },
    ])
    const keys = Object.keys(JSON.parse(text) as object).sort()
    expect(keys).toEqual(
      ['active', 'cleanExit', 'pastStartup', 'restoreRun', 'startedAt', 'tabs', 'version'].sort(),
    )
  })

  it('records the split by index, detached tabs after the strip, and untitled copy ids', () => {
    const snapshot = sessionSnapshotFrom({
      strip: {
        tabs: [
          { id: 't1', kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' },
          { id: 't2', kind: 'hwp', title: 'Untitled HWP' },
          { id: 't3', kind: 'sheets', title: 'c.xlsx', filePath: 'C:\\c.xlsx' },
        ],
        activeId: 't3',
        split: { aTabId: 't3', bTabId: 't1', orientation: 'stack', ratio: 0.6, focus: 'a' },
      },
      detached: [
        { id: 'detached:9', kind: 'pdf', title: 'p.pdf', filePath: 'C:\\p.pdf' },
        { id: 'detached:10', kind: 'markdown', title: 'Draft' },
      ],
      untitledCopyFor: ({ id }) => (id === 't2' ? { untitledId: 'abc', ext: '.hwpx' } : undefined),
    })
    expect(snapshot).toEqual({
      tabs: [
        { kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' },
        { kind: 'hwp', title: 'Untitled HWP', untitled: { untitledId: 'abc', ext: '.hwpx' } },
        { kind: 'sheets', title: 'c.xlsx', filePath: 'C:\\c.xlsx' },
        { kind: 'pdf', title: 'p.pdf', filePath: 'C:\\p.pdf', detached: true },
        { kind: 'markdown', title: 'Draft', detached: true },
      ],
      active: 2,
      split: { a: 2, b: 0, orientation: 'stack', ratio: 0.6, focus: 'a' },
    })
  })

  it('Home in front records no active tab; a split with a missing pane is dropped', () => {
    const snapshot = sessionSnapshotFrom({
      strip: {
        tabs: [{ id: 't1', kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' }],
        activeId: 'home',
        split: { aTabId: 't1', bTabId: 't7', orientation: 'side', ratio: 0.5, focus: 'a' },
      },
    })
    expect(snapshot.active).toBeUndefined()
    expect(snapshot.split).toBeUndefined()
    expect(sessionSnapshotFrom({ strip: null })).toEqual({ tabs: [] })
  })

  it('does not ask for an untitled id for a tab that has a file', () => {
    const untitledCopyFor = vi.fn(() => ({ untitledId: 'x', ext: '.docx' }))
    sessionSnapshotFrom({
      strip: strip([{ id: 't1', kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' }]),
      untitledCopyFor,
    })
    expect(untitledCopyFor).not.toHaveBeenCalled()
  })
})

describe('the restore layout', () => {
  const previous = record({
    tabs: [
      { kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' },
      { kind: 'docs', title: 'b.docx', filePath: 'C:\\b.docx' },
      { kind: 'pdf', title: 'p.pdf', filePath: 'C:\\p.pdf', detached: true },
    ],
    active: 1,
    split: { a: 0, b: 1, orientation: 'side', ratio: 0.5, focus: 'b' },
  })

  it('keeps every tab (detached ones into the main window), the front tab and the split', () => {
    expect(sessionRestoreLayout(previous, { crashLoop: false })).toEqual({
      tabs: previous.tabs,
      active: 1,
      split: previous.split,
    })
  })

  it('a crash loop keeps the strip but preloads nothing', () => {
    expect(sessionRestoreLayout(previous, { crashLoop: true })).toEqual({ tabs: previous.tabs })
  })
})

describe('explicit init (headless export and second instances never touch the record)', () => {
  it('every module-level helper is a no-op until initSessionRecord', () => {
    expect(sessionRecorder()).toBeNull()
    noteSessionChanged({
      strip: strip([{ id: 't1', kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' }]),
    })
    markSessionClosedToTray()
    markSessionOsEnd()
    markSessionCleanExit()
    vi.advanceTimersByTime(CRASH_LOOP_WINDOW_MS * 2)
    expect(existsSync(sessionRecordPath(dir))).toBe(false)
  })

  it('a record left by the running instance is neither read nor rewritten by a quitting one', () => {
    seed(record({ cleanExit: false, tabs: [{ kind: 'docs', title: 'a', filePath: 'C:\\a' }] }))
    const before = readFileSync(sessionRecordPath(dir), 'utf8')
    // a second instance that lost the lock still runs will-quit
    markSessionCleanExit()
    expect(readFileSync(sessionRecordPath(dir), 'utf8')).toBe(before)
  })

  it('init returns one recorder per process, and the helpers then reach it', () => {
    const first = initSessionRecord({ userDataDir: dir, now: () => clock })
    expect(initSessionRecord({ userDataDir: join(dir, 'other') })).toBe(first)
    expect(sessionRecorder()).toBe(first)
    first.startRun({ restoreRun: false })
    noteSessionChanged({
      strip: strip([{ id: 't1', kind: 'docs', title: 'a.docx', filePath: 'C:\\a.docx' }], 't1'),
    })
    markSessionCleanExit()
    expect(stored()).toMatchObject({ cleanExit: true, active: 0 })
  })
})
