import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { RecoveryCopyFilter, RecoveryIdentity } from '@genoffice/electron-utils'
import {
  LAUNCH_NEEDS_USER_MESSAGE,
  createLaunchListGate,
  createOsSessionEnd,
  liveSessionSource,
  liveTabContents,
  normalizeLaunchListResult,
  planLaunch,
  resolveLaunchDecisions,
  type LaunchCopy,
  type LaunchPlan,
  type PlanLaunchInput,
} from '../src/main/launch-recovery'
import {
  createSessionRecorder,
  sessionSnapshotFrom,
  type SessionRecord,
  type SessionRecordReadResult,
} from '../src/main/session-record'
import type { RecoveryListItem } from '../src/shared/recovery-list-api'

/**
 * The launch side of crash recovery (spec 4, 5.1, 5.2, 5.3, 6, 8): what the
 * shell rebuilds and asks at launch, how the launch list's answer turns into
 * store decisions and tabs, the list's IPC semantics, the OS-shutdown order
 * and the MCP mapping of a document that waits on the user.
 */

const DIR = join('C:', 'Users', 'me', 'Documents')
const file = (name: string) => join(DIR, name)

function copy(overrides: Partial<LaunchCopy> & { identity: RecoveryIdentity }): LaunchCopy {
  const identity = overrides.identity
  const isFile = 'filePath' in identity
  return {
    kind: identity.kind,
    filePath: isFile ? identity.filePath : null,
    untitledId: isFile ? null : identity.untitledId,
    title: isFile ? identity.filePath.split(/[\\/]/).pop()! : 'Untitled',
    writtenAt: 1_000,
    state: 'undecided',
    fileChangedAfterCopy: false,
    originalMissing: false,
    originalPath: null,
    ...overrides,
  }
}

/** a fake store answering listCopies like the real one (states / untitled filters) */
function storeOf(copies: LaunchCopy[]) {
  return {
    listCopies: (filter: RecoveryCopyFilter = {}) =>
      copies.filter(
        (c) =>
          (!filter.states || filter.states.includes(c.state)) &&
          (filter.untitled === undefined || filter.untitled === (c.filePath === null)) &&
          (!filter.kinds || filter.kinds.includes(c.kind)),
      ),
  }
}

function record(overrides: Partial<SessionRecord> = {}): SessionRecordReadResult {
  return {
    status: 'ok',
    record: {
      version: 1,
      cleanExit: false,
      startedAt: 1,
      restoreRun: false,
      pastStartup: true,
      tabs: [],
      ...overrides,
    },
  }
}

const abnormal = { abnormal: true, crashLoop: false }
const normal = { abnormal: false, crashLoop: false }

function plan(input: Partial<PlanLaunchInput> & { copies?: LaunchCopy[] }): LaunchPlan {
  return planLaunch({
    judgment: input.judgment ?? abnormal,
    previous: input.previous ?? { status: 'missing' },
    copies: storeOf(input.copies ?? []),
    launchPaths: input.launchPaths ?? [],
  })
}

const docA = { kind: 'docs' as const, filePath: file('a.docx') }
const sheetB = { kind: 'sheets' as const, filePath: file('b.xlsx') }
const mdUntitled = { kind: 'markdown' as const, untitledId: 'u-md-1', ext: '.md' }
const hwpUntitled = { kind: 'hwp' as const, untitledId: 'u-hwp-1', ext: '.hwp' }

describe('planLaunch: the launch decision matrix', () => {
  it('after a normal exit with nothing to ask, keeps today launch flow', () => {
    const p = plan({ judgment: normal, previous: record({ cleanExit: true }) })
    expect(p.plainLaunch).toBe(true)
    expect(p.restoreRun).toBe(false)
    expect(p.tabs).toEqual([])
    expect(p.items).toEqual([])
  })

  it('with no session record at all (first run) is a plain launch', () => {
    const p = plan({ judgment: normal, previous: { status: 'missing' } })
    expect(p.plainLaunch).toBe(true)
  })

  it('after a normal exit lists only the untitled "later" copies, not file copies', () => {
    const p = plan({
      judgment: normal,
      previous: record({
        cleanExit: true,
        tabs: [{ kind: 'docs', title: 'a.docx', filePath: docA.filePath }],
      }),
      copies: [
        copy({ identity: mdUntitled, state: 'later', title: 'Notes' }),
        copy({ identity: docA, state: 'later' }),
      ],
    })
    expect(p.plainLaunch).toBe(false)
    expect(p.restoreRun).toBe(false)
    // the previous tabs are not rebuilt after a normal exit
    expect(p.tabs).toEqual([])
    expect(p.items).toHaveLength(1)
    expect(p.items[0]).toMatchObject({
      editorKind: 'markdown',
      name: 'Notes',
      folder: null,
      untitled: true,
    })
  })

  it('after an abnormal exit rebuilds the previous tabs (detached ones too) as unloaded tabs', () => {
    const p = plan({
      previous: record({
        tabs: [
          { kind: 'docs', title: 'a.docx', filePath: docA.filePath },
          { kind: 'sheets', title: 'b.xlsx', filePath: sheetB.filePath, detached: true },
        ],
        active: 0,
      }),
    })
    expect(p.restoreRun).toBe(true)
    expect(p.tabs.map((t) => [t.kind, t.filePath, t.open.type])).toEqual([
      ['docs', docA.filePath, 'file'],
      ['sheets', sheetB.filePath, 'file'],
    ])
    expect(p.front).toBe(p.tabs[0].key)
    expect(p.items).toEqual([])
    expect(p.plainLaunch).toBe(false)
  })

  it('lists every undecided and restore-chosen copy, also ones outside the previous tabs', () => {
    const elsewhere = { kind: 'pdf' as const, filePath: join('D:', 'old', 'c.pdf') }
    const p = plan({
      previous: record({ tabs: [{ kind: 'docs', title: 'a.docx', filePath: docA.filePath }] }),
      copies: [
        copy({ identity: docA, state: 'undecided', writtenAt: 50 }),
        copy({ identity: elsewhere, state: 'restoreChosen', fileChangedAfterCopy: true }),
        copy({ identity: sheetB, state: 'later' }),
        copy({ identity: mdUntitled, state: 'later', title: 'Notes' }),
      ],
    })
    expect(p.items.map((i) => [i.editorKind, i.name, i.folder])).toEqual([
      ['docs', 'a.docx', DIR],
      ['pdf', 'c.pdf', join('D:', 'old')],
      ['markdown', 'Notes', null],
    ])
    expect(p.items[0].lastCopyTime).toBe(50)
    expect(p.items[1].fileChangedAfterCopy).toBe(true)
    // the ids map back to the copies
    for (const item of p.items) expect(p.copies.get(item.id)).toBeDefined()
  })

  it('keeps an untitled tab only when its copy is still there, and remaps the split', () => {
    const p = plan({
      previous: record({
        tabs: [
          { kind: 'markdown', title: 'Gone', untitled: { untitledId: 'u-gone', ext: '.md' } },
          {
            kind: 'hwp',
            title: 'Draft',
            untitled: { untitledId: hwpUntitled.untitledId, ext: '.hwp' },
          },
          { kind: 'docs', title: 'a.docx', filePath: docA.filePath },
        ],
        active: 2,
        split: { a: 1, b: 2, orientation: 'side', ratio: 0.4, focus: 'b' },
      }),
      copies: [copy({ identity: hwpUntitled, title: 'Draft' })],
    })
    expect(p.tabs.map((t) => t.title)).toEqual(['Draft', 'a.docx'])
    expect(p.tabs[0].open).toEqual({ type: 'untitledCopy', copy: hwpUntitled })
    expect(p.tabs[0].filePath).toBeUndefined()
    expect(p.split).toEqual({
      a: p.tabs[0].key,
      b: p.tabs[1].key,
      orientation: 'side',
      ratio: 0.4,
      focus: 'b',
    })
    expect(p.front).toBe(p.tabs[1].key)
  })

  it('in a crash loop keeps the strip and the list but loads nothing', () => {
    const p = plan({
      judgment: { abnormal: true, crashLoop: true },
      previous: record({
        tabs: [
          { kind: 'docs', title: 'a.docx', filePath: docA.filePath },
          { kind: 'sheets', title: 'b.xlsx', filePath: sheetB.filePath },
        ],
        active: 0,
        split: { a: 0, b: 1, orientation: 'side', ratio: 0.5, focus: 'a' },
      }),
      copies: [copy({ identity: docA })],
    })
    expect(p.tabs).toHaveLength(2)
    expect(p.items).toHaveLength(1)
    expect(p.front).toBeUndefined()
    expect(p.split).toBeUndefined()
  })

  it('with a file argument rebuilds the tabs but puts the file in front instead', () => {
    const p = plan({
      previous: record({
        tabs: [{ kind: 'docs', title: 'a.docx', filePath: docA.filePath }],
        active: 0,
      }),
      launchPaths: [file('new.xlsx')],
    })
    expect(p.tabs).toHaveLength(1)
    expect(p.front).toBeUndefined()
    expect(p.launchPaths).toEqual([file('new.xlsx')])
    expect(p.plainLaunch).toBe(false)
  })

  it('a normal launch with a file argument stays a plain launch', () => {
    const p = plan({ judgment: normal, launchPaths: [file('x.docx')] })
    expect(p.plainLaunch).toBe(true)
    expect(p.launchPaths).toEqual([file('x.docx')])
  })

  it('an abnormal exit with a corrupt record still offers the copies', () => {
    const p = plan({ previous: { status: 'corrupt' }, copies: [copy({ identity: docA })] })
    expect(p.tabs).toEqual([])
    expect(p.items).toHaveLength(1)
    expect(p.restoreRun).toBe(true)
  })

  it("shows the original's folder for an untitled copy that names its file (a CSV's)", () => {
    const csv = { kind: 'sheets' as const, untitledId: 'u-csv-1', ext: '.xlsx' }
    const p = plan({
      copies: [copy({ identity: csv, title: 'data.csv', originalPath: file('data.csv') })],
    })
    expect(p.items[0]).toMatchObject({
      name: 'data.csv',
      folder: DIR,
      untitled: true,
      originalMissing: false,
    })
  })

  it('marks a missing original on its row', () => {
    const p = plan({ copies: [copy({ identity: docA, originalMissing: true })] })
    expect(p.items[0]).toMatchObject({ originalMissing: true, untitled: false })
  })
})

describe('resolveLaunchDecisions: applying the list', () => {
  const previous = record({
    tabs: [
      { kind: 'docs', title: 'a.docx', filePath: docA.filePath },
      {
        kind: 'markdown',
        title: 'Notes',
        untitled: { untitledId: mdUntitled.untitledId, ext: '.md' },
      },
      { kind: 'sheets', title: 'b.xlsx', filePath: sheetB.filePath },
    ],
    active: 1,
  })
  const copies = [
    copy({ identity: docA }),
    copy({ identity: mdUntitled, title: 'Notes' }),
    copy({ identity: sheetB, originalMissing: true }),
  ]
  const idOf = (p: LaunchPlan, identity: RecoveryIdentity) =>
    [...p.copies.entries()].find(([, c]) => c.identity === identity)![0]

  it('without a list loads the planned front tab and split at once', () => {
    const p = plan({
      previous: record({
        tabs: previous.status === 'ok' ? previous.record.tabs.slice(0, 1) : [],
        active: 0,
      }),
    })
    const out = resolveLaunchDecisions(p, null)
    expect(out.storeDecisions).toEqual([])
    expect(out.front).toBe(p.tabs[0].key)
    expect(out.remove).toEqual([])
  })

  it('a dismissed list records "later" for every row and drops untitled tabs', () => {
    const p = plan({ previous, copies })
    const out = resolveLaunchDecisions(p, { dismissed: true })
    expect(out.storeDecisions.map((d) => d.decision)).toEqual(['later', 'later', 'later'])
    // the untitled tab is not created: it comes back in the next launch's list
    const md = p.tabs.find((t) => t.kind === 'markdown')!
    expect(out.remove).toEqual([md.key])
    // file tabs stay; their file asks again when first clicked
    expect(out.replace).toEqual([])
    expect(out.append).toEqual([])
    // the front tab was the dropped untitled one: Home stays in front
    expect(out.front).toBeUndefined()
  })

  it('restore keeps the untitled tab, discard drops it; file tabs stay either way', () => {
    const p = plan({ previous, copies })
    const out = resolveLaunchDecisions(p, {
      decisions: {
        [idOf(p, docA)]: 'discard',
        [idOf(p, mdUntitled)]: 'restore',
        [idOf(p, sheetB)]: 'discard',
      },
    })
    expect(out.storeDecisions).toEqual([
      { identity: docA, decision: 'discard' },
      { identity: mdUntitled, decision: 'restore' },
      { identity: sheetB, decision: 'discard' },
    ])
    expect(out.remove).toEqual([])
    expect(out.front).toBe(p.tabs.find((t) => t.kind === 'markdown')!.key)
  })

  it('a restored copy whose original is missing opens untitled with the old path as Save As default', () => {
    const p = plan({ previous, copies })
    const out = resolveLaunchDecisions(p, { decisions: { [idOf(p, sheetB)]: 'restore' } })
    const sheetTab = p.tabs.find((t) => t.kind === 'sheets')!
    expect(out.replace).toEqual([
      {
        key: sheetTab.key,
        kind: 'sheets',
        title: 'b.xlsx',
        open: { type: 'untitledCopy', copy: sheetB, saveAsDefaultPath: sheetB.filePath },
      },
    ])
    // rows without a decision count as "later"
    expect(out.storeDecisions.find((d) => d.identity === docA)?.decision).toBe('later')
  })

  it('restored copies outside the strip are appended (file, untitled, original missing)', () => {
    const other = { kind: 'html' as const, filePath: file('page.html') }
    const lost = { kind: 'mindmap' as const, filePath: file('map.xmind') }
    const p = plan({
      copies: [
        copy({ identity: other }),
        copy({ identity: hwpUntitled, title: 'Draft' }),
        copy({ identity: lost, originalMissing: true }),
        copy({ identity: docA }),
      ],
    })
    const out = resolveLaunchDecisions(p, {
      decisions: {
        [idOf(p, other)]: 'restore',
        [idOf(p, hwpUntitled)]: 'restore',
        [idOf(p, lost)]: 'restore',
        [idOf(p, docA)]: 'discard',
      },
    })
    expect(out.append.map((t) => [t.kind, t.title, t.filePath, t.open])).toEqual([
      ['html', 'page.html', other.filePath, { type: 'file' }],
      ['hwp', 'Draft', undefined, { type: 'untitledCopy', copy: hwpUntitled }],
      [
        'mindmap',
        'map.xmind',
        undefined,
        { type: 'untitledCopy', copy: lost, saveAsDefaultPath: lost.filePath },
      ],
    ])
    // nothing was in front: the first restored document comes forward
    expect(out.front).toBe(out.append[0].key)
    expect(out.splitMemoryOrHome).toBe(false)
  })

  it("a restored untitled copy of a CSV offers the original's path as its first Save As", () => {
    const csv = { kind: 'sheets' as const, untitledId: 'u-csv-2', ext: '.xlsx' }
    const kept = { kind: 'sheets' as const, untitledId: 'u-csv-3', ext: '.xlsx' }
    const csvCopy = copy({ identity: csv, title: 'data.csv', originalPath: file('data.csv') })
    const keptCopy = copy({ identity: kept, title: 'old.tsv', originalPath: file('old.tsv') })
    // one was a tab when the app ended (an untitled tab of its own), one was not
    const p = plan({
      previous: record({
        tabs: [
          { kind: 'sheets', title: 'old.tsv', untitled: { untitledId: 'u-csv-3', ext: '.xlsx' } },
        ],
      }),
      copies: [csvCopy, keptCopy],
    })
    const inStrip = p.tabs[0]
    expect(inStrip.open).toEqual({
      type: 'untitledCopy',
      copy: kept,
      saveAsDefaultPath: file('old.tsv'),
    })
    const out = resolveLaunchDecisions(p, {
      decisions: { [idOf(p, csv)]: 'restore', [idOf(p, kept)]: 'restore' },
    })
    expect(out.append.map((t) => [t.title, t.open])).toEqual([
      ['data.csv', { type: 'untitledCopy', copy: csv, saveAsDefaultPath: file('data.csv') }],
    ])
  })

  it('after a normal exit with the list, an untouched launch falls back to today flow', () => {
    const p = plan({ judgment: normal, copies: [copy({ identity: mdUntitled, state: 'later' })] })
    const out = resolveLaunchDecisions(p, { dismissed: true })
    expect(out.splitMemoryOrHome).toBe(true)
    expect(out.append).toEqual([])
  })

  it('after a normal exit, a restored untitled copy opens in front', () => {
    const p = plan({ judgment: normal, copies: [copy({ identity: mdUntitled, state: 'later' })] })
    const out = resolveLaunchDecisions(p, { decisions: { [p.items[0].id]: 'restore' } })
    expect(out.append).toHaveLength(1)
    expect(out.front).toBe(out.append[0].key)
    expect(out.splitMemoryOrHome).toBe(false)
  })

  it('launch files are opened last and keep the front to themselves', () => {
    const p = plan({
      judgment: normal,
      copies: [copy({ identity: mdUntitled, state: 'later' })],
      launchPaths: [file('x.docx')],
    })
    const out = resolveLaunchDecisions(p, { decisions: { [p.items[0].id]: 'restore' } })
    expect(out.launchPaths).toEqual([file('x.docx')])
    expect(out.front).toBeUndefined()
    expect(out.splitMemoryOrHome).toBe(false)
  })

  it('a crash loop never brings a restored document forward', () => {
    const p = plan({
      judgment: { abnormal: true, crashLoop: true },
      copies: [copy({ identity: docA })],
    })
    const out = resolveLaunchDecisions(p, { decisions: { [p.items[0].id]: 'restore' } })
    expect(out.append).toHaveLength(1)
    expect(out.front).toBeUndefined()
  })

  it('a split loses a pane that was dropped', () => {
    const p = plan({
      previous: record({
        tabs: [
          {
            kind: 'markdown',
            title: 'Notes',
            untitled: { untitledId: mdUntitled.untitledId, ext: '.md' },
          },
          { kind: 'docs', title: 'a.docx', filePath: docA.filePath },
        ],
        active: 1,
        split: { a: 0, b: 1, orientation: 'stack', ratio: 0.5, focus: 'b' },
      }),
      copies: [copy({ identity: mdUntitled })],
    })
    const out = resolveLaunchDecisions(p, { dismissed: true })
    expect(out.split).toBeUndefined()
    expect(out.front).toBe(p.tabs[1].key)
  })
})

describe('normalizeLaunchListResult', () => {
  const ids = ['r0', 'r1']
  it('accepts a dismissal and known decisions only', () => {
    expect(normalizeLaunchListResult({ dismissed: true }, ids)).toEqual({ dismissed: true })
    expect(
      normalizeLaunchListResult(
        { decisions: { r0: 'restore', r1: 'discard', r9: 'restore' } },
        ids,
      ),
    ).toEqual({ decisions: { r0: 'restore', r1: 'discard' } })
  })
  it('rejects anything else', () => {
    for (const bad of [null, 'x', {}, { decisions: { r0: 'later' } }, { decisions: [] }]) {
      expect(() => normalizeLaunchListResult(bad, ids)).toThrow()
    }
  })
})

describe('launch list gate (IPC get / submit)', () => {
  const item: RecoveryListItem = {
    id: 'r0',
    editorKind: 'docs',
    name: 'a.docx',
    folder: DIR,
    lastCopyTime: 1,
    untitled: false,
    fileChangedAfterCopy: false,
    originalMissing: false,
  }

  it('get waits until the launch flow knows the list', async () => {
    const gate = createLaunchListGate()
    let answer: unknown = 'pending'
    void gate.get().then((rows) => (answer = rows))
    await Promise.resolve()
    expect(answer).toBe('pending')
    expect(gate.blocking()).toBe(true)
    gate.publish([item], async () => undefined)
    await new Promise((r) => setTimeout(r, 0))
    expect(answer).toEqual([item])
  })

  it('keeps returning the same rows until a result is submitted, then nothing', async () => {
    const gate = createLaunchListGate()
    const apply = vi.fn(async () => undefined)
    gate.publish([item], apply)
    expect(await gate.get()).toEqual([item])
    expect(await gate.get()).toEqual([item])
    await gate.submit({ decisions: { r0: 'restore' } })
    expect(apply).toHaveBeenCalledWith({ decisions: { r0: 'restore' } })
    expect(await gate.get()).toBeNull()
    expect(gate.blocking()).toBe(false)
    // a late second submit does nothing
    await gate.submit({ dismissed: true })
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('lets restored tabs load while the answer is applied (applying loads the front tab)', async () => {
    const gate = createLaunchListGate()
    let blockedDuringApply: boolean | undefined
    gate.publish([item], () => {
      blockedDuringApply = gate.blocking()
    })
    expect(gate.blocking()).toBe(true)
    await gate.submit({ dismissed: true })
    expect(blockedDuringApply).toBe(false)
  })

  it('a failed apply leaves the list up for another try', async () => {
    const gate = createLaunchListGate()
    const apply = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValueOnce(undefined)
    gate.publish([item], apply)
    await expect(gate.submit({ dismissed: true })).rejects.toThrow('disk')
    expect(await gate.get()).toEqual([item])
    expect(gate.blocking()).toBe(true)
    await gate.submit({ dismissed: true })
    expect(await gate.get()).toBeNull()
  })

  it('an invalid result is refused without applying', async () => {
    const gate = createLaunchListGate()
    const apply = vi.fn(async () => undefined)
    gate.publish([item], apply)
    await expect(gate.submit({ nope: 1 })).rejects.toThrow()
    expect(apply).not.toHaveBeenCalled()
  })

  it('with nothing to ask answers null at once and blocks nothing', async () => {
    const gate = createLaunchListGate()
    gate.publishNone()
    expect(await gate.get()).toBeNull()
    expect(gate.blocking()).toBe(false)
  })
})

describe('OS shutdown', () => {
  it('latches the app as ending and stops the record before any copy is written, then ends', async () => {
    const order: string[] = []
    const end = createOsSessionEnd({
      markShuttingDown: () => order.push('latch'),
      markSessionOsEnd: () => order.push('record'),
      editors: () => [
        { writeCopiesNow: async () => void order.push('docs') },
        {
          writeCopiesNow: async () => {
            order.push('hwp')
            throw new Error('ignored')
          },
        },
      ],
      finish: () => order.push('finish'),
    })
    await end()
    expect(order.slice(0, 2)).toEqual(['latch', 'record'])
    expect(order).toContain('docs')
    expect(order).toContain('hwp')
    expect(order.at(-1)).toBe('finish')
    // a second signal (query-session-end then session-end) runs nothing again
    await end()
    expect(order.filter((o) => o === 'finish')).toHaveLength(1)
  })

  it('does not wait forever on an editor that never answers', async () => {
    vi.useFakeTimers()
    try {
      const finish = vi.fn()
      const end = createOsSessionEnd({
        markShuttingDown: () => undefined,
        markSessionOsEnd: () => undefined,
        editors: () => [{ writeCopiesNow: () => new Promise<void>(() => undefined) }],
        finish,
        timeoutMs: 500,
      })
      const done = end()
      await vi.advanceTimersByTimeAsync(600)
      await done
      expect(finish).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves no clean mark even when will-quit still runs afterwards', () => {
    const writes: SessionRecord[] = []
    const rec = createSessionRecorder({
      userDataDir: join('C:', 'nowhere'),
      writeJson: (_path, value) => void writes.push(value as SessionRecord),
    })
    rec.startRun({ restoreRun: false })
    rec.markOsSessionEnd()
    rec.markCleanExit()
    expect(writes.at(-1)?.cleanExit).toBe(false)
    rec.dispose()
  })
})

describe('liveSessionSource', () => {
  it('records an untitled document by its copy even when its tab points at a temp file', () => {
    const source = liveSessionSource({
      strip: {
        tabs: [
          {
            id: 't1',
            kind: 'sheets',
            title: 'Book1.xlsx',
            filePath: join('T:', 'imports', 'Book1.xlsx'),
          },
          { id: 't2', kind: 'docs', title: 'a.docx', filePath: docA.filePath },
          { id: 't3', kind: 'markdown', title: 'Notes' },
        ],
        activeId: 't1',
        split: null,
      },
      detached: [{ id: 'd1', kind: 'hwp', title: 'Draft' }],
      untitledOf: (tab) =>
        tab.id === 't1'
          ? { untitledId: 'u-sheet', ext: '.xlsx' }
          : tab.id === 't3'
            ? { untitledId: 'u-md', ext: '.md' }
            : tab.id === 'd1'
              ? { untitledId: 'u-hwp', ext: '.hwp' }
              : undefined,
    })
    const snapshot = sessionSnapshotFrom(source)
    expect(snapshot.tabs).toEqual([
      { kind: 'sheets', title: 'Book1.xlsx', untitled: { untitledId: 'u-sheet', ext: '.xlsx' } },
      { kind: 'docs', title: 'a.docx', filePath: docA.filePath },
      { kind: 'markdown', title: 'Notes', untitled: { untitledId: 'u-md', ext: '.md' } },
      {
        kind: 'hwp',
        title: 'Draft',
        untitled: { untitledId: 'u-hwp', ext: '.hwp' },
        detached: true,
      },
    ])
    expect(snapshot.active).toBe(0)
  })
})

describe('MCP / @ lookups of a restored tab', () => {
  it('loads an unloaded tab and hands out its live webContents', async () => {
    const wc = { id: 7 }
    const ensureLoaded = vi.fn(async () => ({ status: 'ready' as const, webContents: wc }))
    const contents = await liveTabContents('t1', {
      ensureLoaded,
      detached: () => undefined,
      titleOf: () => 'a.docx',
    })
    expect(contents).toBe(wc)
    expect(ensureLoaded).toHaveBeenCalledWith('t1')
  })

  it('fails clearly when the document waits on the user', async () => {
    await expect(
      liveTabContents('t1', {
        ensureLoaded: async () => ({ status: 'needs-user' as const }),
        detached: () => undefined,
        titleOf: () => 'a.docx',
      }),
    ).rejects.toThrow(LAUNCH_NEEDS_USER_MESSAGE)
  })

  it('falls back to a detached window, and to nothing for an unknown id', async () => {
    const wc = { id: 9 }
    const deps = {
      ensureLoaded: async () => ({ status: 'missing' as const }),
      detached: (id: string) => (id === 'd1' ? wc : undefined),
      titleOf: () => undefined,
    }
    expect(await liveTabContents('d1', deps)).toBe(wc)
    expect(await liveTabContents('zz', deps)).toBeUndefined()
  })
})
