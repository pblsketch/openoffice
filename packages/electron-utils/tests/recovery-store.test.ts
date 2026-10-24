import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RECOVERY_COPY_MAX_AGE_MS,
  RECOVERY_EDITOR_KINDS,
  createRecoveryStore,
  isAppShuttingDown,
  markAppShuttingDown,
  newUntitledRecoveryId,
  recoveryFolderName,
  recoveryRunId,
  resetAppShuttingDown,
  resumeDiscardedCopies,
  type RecoveryIdentity,
  type RecoveryStore,
} from '../src/recovery-store'

const DAY = 24 * 60 * 60 * 1000

let root: string
let userFolder: string
let store: RecoveryStore

const sha16 = (value: string) => createHash('sha1').update(value).digest('hex').slice(0, 16)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'genoffice-recovery-root-'))
  userFolder = mkdtempSync(join(tmpdir(), 'genoffice-recovery-user-'))
  store = createRecoveryStore({ userDataDir: root })
})

afterEach(() => {
  resetAppShuttingDown()
  resumeDiscardedCopies()
  rmSync(root, { recursive: true, force: true })
  rmSync(userFolder, { recursive: true, force: true })
})

/** a document in the "user folder" that exists on disk */
function userDoc(name: string, content = 'saved'): string {
  const path = join(userFolder, name)
  writeFileSync(path, content)
  return path
}

function setMtime(path: string, ms: number): void {
  utimesSync(path, ms / 1000, ms / 1000)
}

function allFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
}

describe('copy addressing', () => {
  it('keeps the folder names of the three editors that already wrote copies', () => {
    expect(recoveryFolderName('docs')).toBe('docs-autosave')
    expect(recoveryFolderName('sheets')).toBe('sheets-autosave')
    expect(recoveryFolderName('slides')).toBe('slides-autosave')
  })

  it('gives every new editor a folder of the same form', () => {
    expect(RECOVERY_EDITOR_KINDS.map(recoveryFolderName)).toEqual([
      'docs-autosave',
      'sheets-autosave',
      'slides-autosave',
      'hwp-autosave',
      'pdf-autosave',
      'markdown-autosave',
      'html-autosave',
      'mindmap-autosave',
    ])
  })

  it('names a Word copy like the previous version: sha1(path)[0..16] + .docx or .odt', () => {
    const docx = 'C:\\Users\\me\\Report.docx'
    const odt = 'C:\\Users\\me\\Letter.ODT'
    expect(store.copyPath({ kind: 'docs', filePath: docx })).toBe(
      join(root, 'docs-autosave', `${sha16(docx)}.docx`),
    )
    expect(store.copyPath({ kind: 'docs', filePath: odt })).toBe(
      join(root, 'docs-autosave', `${sha16(odt)}.odt`),
    )
  })

  it('names Excel copies .xlsx and PowerPoint copies .pptx whatever the source extension', () => {
    const xlsm = '/home/me/budget.xlsm'
    const pptx = '/home/me/deck.pptx'
    expect(store.copyPath({ kind: 'sheets', filePath: xlsm })).toBe(
      join(root, 'sheets-autosave', `${sha16(xlsm)}.xlsx`),
    )
    expect(store.copyPath({ kind: 'slides', filePath: pptx })).toBe(
      join(root, 'slides-autosave', `${sha16(pptx)}.pptx`),
    )
  })

  it('keeps the document extension for the new editors (.hwp stays .hwp, .hwpx stays .hwpx)', () => {
    const hwp = '/d/a.HWP'
    const hwpx = '/d/a.hwpx'
    expect(store.copyPath({ kind: 'hwp', filePath: hwp })).toBe(
      join(root, 'hwp-autosave', `${sha16(hwp)}.hwp`),
    )
    expect(store.copyPath({ kind: 'hwp', filePath: hwpx })).toBe(
      join(root, 'hwp-autosave', `${sha16(hwpx)}.hwpx`),
    )
    expect(store.copyPath({ kind: 'mindmap', filePath: '/d/m.xmind' })).toMatch(/\.xmind$/)
  })

  it('finds a copy the previous version left (no metadata) and reads it as "later"', async () => {
    const doc = userDoc('old.docx')
    const legacy = join(root, 'docs-autosave', `${sha16(doc)}.docx`)
    mkdirSync(join(root, 'docs-autosave'), { recursive: true })
    writeFileSync(legacy, 'legacy bytes')
    const info = store.copyInfo({ kind: 'docs', filePath: doc })
    expect(info).not.toBeNull()
    expect(info!.state).toBe('later')
    expect(info!.copyPath).toBe(legacy)
    expect(store.openPlan({ kind: 'docs', filePath: doc }).action).toBe('ask')
    expect((await store.readCopy({ kind: 'docs', filePath: doc }))?.toString()).toBe('legacy bytes')
  })

  it('keeps untitled copies inside the app data folder, never next to a user file', async () => {
    const id = newUntitledRecoveryId()
    const identity: RecoveryIdentity = { kind: 'markdown', untitledId: id, ext: '.md' }
    await store.writeCopy(identity, Buffer.from('# draft'), { title: 'Untitled 1' })
    const path = store.copyPath(identity)
    expect(path.startsWith(join(root, 'markdown-autosave'))).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe('# draft')
    expect(allFiles(userFolder)).toEqual([])
  })

  it('refuses untitled ids and extensions that could leave the folder', () => {
    expect(() => store.copyPath({ kind: 'html', untitledId: '../escape', ext: '.html' })).toThrow()
    expect(() => store.copyPath({ kind: 'html', untitledId: 'ok-id', ext: '/../x' })).toThrow()
    expect(() => store.copyPath({ kind: 'html', untitledId: 'ok-id', ext: 'html' })).toThrow()
  })

  it('makes a fresh untitled id each time', () => {
    expect(newUntitledRecoveryId()).not.toBe(newUntitledRecoveryId())
  })
})

describe('writing a copy', () => {
  it('writes the bytes atomically and leaves no temp file behind', async () => {
    const doc = userDoc('a.hwp')
    const identity = { kind: 'hwp' as const, filePath: doc }
    expect(await store.writeCopy(identity, Buffer.from('v1'))).toBe('written')
    expect(await store.writeCopy(identity, Buffer.from('v2'))).toBe('written')
    expect(readFileSync(store.copyPath(identity), 'utf8')).toBe('v2')
    expect(allFiles(join(root, 'hwp-autosave')).filter((p) => p.endsWith('.tmp'))).toEqual([])
  })

  it('never touches the original file', async () => {
    const doc = userDoc('keep.md', 'original')
    const before = readFileSync(doc)
    await store.writeCopy({ kind: 'markdown', filePath: doc }, Buffer.from('edited'))
    expect(readFileSync(doc)).toEqual(before)
    expect(allFiles(userFolder)).toEqual([doc])
  })

  it('keeps metadata without any document content', async () => {
    const doc = userDoc('secret.html')
    const identity = { kind: 'html' as const, filePath: doc }
    const marker = 'TOP-SECRET-CONTENT-MARKER'
    await store.writeCopy(identity, Buffer.from(`<p>${marker}</p>`), { title: 'secret.html' })
    const metas = allFiles(join(root, 'html-autosave')).filter((p) => p.endsWith('.json'))
    expect(metas).toHaveLength(1)
    const raw = readFileSync(metas[0]!, 'utf8')
    expect(raw).not.toContain(marker)
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(
      ['filePath', 'kind', 'runId', 'state', 'title', 'untitledId', 'version', 'writtenAt'].sort(),
    )
  })

  it('records kind, original path, title, time and the writing run', async () => {
    const doc = userDoc('plan.xmind')
    const before = Date.now()
    await store.writeCopy({ kind: 'mindmap', filePath: doc }, Buffer.from('x'), { title: 'Plan' })
    const info = store.copyInfo({ kind: 'mindmap', filePath: doc })!
    expect(info.kind).toBe('mindmap')
    expect(info.filePath).toBe(doc)
    expect(info.untitledId).toBeNull()
    expect(info.title).toBe('Plan')
    expect(info.runId).toBe(recoveryRunId())
    expect(info.writtenAt).toBeGreaterThanOrEqual(before)
    expect(info.state).toBe('undecided')
  })

  it('titles a file copy with the file name when no title is given', async () => {
    const doc = userDoc('notes.md')
    await store.writeCopy({ kind: 'markdown', filePath: doc }, Buffer.from('x'))
    expect(store.copyInfo({ kind: 'markdown', filePath: doc })!.title).toBe('notes.md')
  })
})

describe('delete versus a late write', () => {
  it('a delete that started wins over a write still in flight', async () => {
    const doc = userDoc('race.docx')
    const identity = { kind: 'docs' as const, filePath: doc }
    const write = store.writeCopy(identity, Buffer.from('late'))
    expect(store.deleteCopy(identity, 'saved')).toBe('deleted')
    expect(await write).toBe('superseded')
    expect(existsSync(store.copyPath(identity))).toBe(false)
    expect(store.copyInfo(identity)).toBeNull()
  })

  it('a delete that arrives while the bytes are landing undoes the write', async () => {
    const doc = userDoc('mid.docx')
    const identity = { kind: 'docs' as const, filePath: doc }
    const write = store.writeCopy(identity, Buffer.alloc(4 * 1024 * 1024, 7))
    // let the queued write start: its metadata is written before the bytes
    for (let i = 0; i < 5 && !existsSync(`${store.copyPath(identity)}.meta.json`); i += 1)
      await Promise.resolve()
    expect(existsSync(`${store.copyPath(identity)}.meta.json`)).toBe(true)
    expect(store.deleteCopy(identity, 'dontSave')).toBe('deleted')
    expect(await write).toBe('superseded')
    expect(existsSync(store.copyPath(identity))).toBe(false)
    expect(store.copyInfo(identity)).toBeNull()
  })

  it('a write whose ticket predates a successful save never lands', async () => {
    const doc = userDoc('ticket.pptx')
    const identity = { kind: 'slides' as const, filePath: doc }
    const ticket = store.beginWrite(identity)
    store.deleteCopy(identity, 'saved')
    expect(await store.writeCopy(identity, Buffer.from('stale'), { ticket })).toBe('superseded')
    expect(existsSync(store.copyPath(identity))).toBe(false)
  })

  it('a write started after the delete still lands', async () => {
    const doc = userDoc('after.docx')
    const identity = { kind: 'docs' as const, filePath: doc }
    const first = store.writeCopy(identity, Buffer.from('old'))
    store.deleteCopy(identity, 'saved')
    const second = store.writeCopy(identity, Buffer.from('new'))
    expect(await first).toBe('superseded')
    expect(await second).toBe('written')
    expect(readFileSync(store.copyPath(identity), 'utf8')).toBe('new')
    expect(store.copyInfo(identity)!.state).toBe('undecided')
  })

  it('a ticket taken for one document cannot be used for another', async () => {
    const a = { kind: 'docs' as const, filePath: userDoc('a.docx') }
    const b = { kind: 'docs' as const, filePath: userDoc('b.docx') }
    const ticket = store.beginWrite(a)
    await expect(store.writeCopy(b, Buffer.from('x'), { ticket })).rejects.toThrow()
  })
})

describe('states', () => {
  const identityOf = () => ({ kind: 'pdf' as const, filePath: userDoc('s.pdf') })

  it('a new or updated copy is undecided', async () => {
    const identity = identityOf()
    await store.writeCopy(identity, Buffer.from('1'))
    expect(store.copyInfo(identity)!.state).toBe('undecided')
    store.applyLaunchDecision(identity, 'later')
    await store.writeCopy(identity, Buffer.from('2'))
    expect(store.copyInfo(identity)!.state).toBe('undecided')
  })

  it('restore from the launch list → restoreChosen, opened without asking', async () => {
    const identity = identityOf()
    await store.writeCopy(identity, Buffer.from('1'))
    store.applyLaunchDecision(identity, 'restore')
    expect(store.copyInfo(identity)!.state).toBe('restoreChosen')
    expect(store.openPlan(identity).action).toBe('restore')
  })

  it('later → later, asked again when the file opens', async () => {
    const identity = identityOf()
    await store.writeCopy(identity, Buffer.from('1'))
    store.applyLaunchDecision(identity, 'later')
    expect(store.copyInfo(identity)!.state).toBe('later')
    expect(store.openPlan(identity).action).toBe('ask')
  })

  it('discard → the copy and its metadata are gone', async () => {
    const identity = identityOf()
    await store.writeCopy(identity, Buffer.from('1'))
    store.applyLaunchDecision(identity, 'discard')
    expect(store.copyInfo(identity)).toBeNull()
    expect(store.openPlan(identity).action).toBe('none')
    expect(allFiles(join(root, 'pdf-autosave'))).toEqual([])
  })

  it('an undecided copy is asked about', async () => {
    const identity = identityOf()
    await store.writeCopy(identity, Buffer.from('1'))
    expect(store.openPlan(identity).action).toBe('ask')
  })

  it('a loaded copy goes back to undecided (its content now lives in an open tab)', async () => {
    const identity = identityOf()
    await store.writeCopy(identity, Buffer.from('1'))
    store.applyLaunchDecision(identity, 'restore')
    store.markCopyLoaded(identity)
    expect(store.copyInfo(identity)!.state).toBe('undecided')
  })

  it('a legacy copy gains metadata when its state is set', async () => {
    const doc = userDoc('legacy.xlsx')
    const identity = { kind: 'sheets' as const, filePath: doc }
    mkdirSync(join(root, 'sheets-autosave'), { recursive: true })
    writeFileSync(store.copyPath(identity), 'legacy')
    store.applyLaunchDecision(identity, 'restore')
    expect(store.copyInfo(identity)!.state).toBe('restoreChosen')
  })

  it('setting the state of a missing copy reports false', () => {
    expect(store.setCopyState({ kind: 'pdf', filePath: '/nowhere.pdf' }, 'later')).toBe(false)
  })
})

describe('queries', () => {
  it('flags a file changed after the copy was written', async () => {
    const doc = userDoc('changed.docx')
    const identity = { kind: 'docs' as const, filePath: doc }
    await store.writeCopy(identity, Buffer.from('copy'))
    const copyTime = Date.now() - 60_000
    setMtime(store.copyPath(identity), copyTime)
    setMtime(doc, copyTime + 30_000)
    const info = store.copyInfo(identity)!
    expect(info.fileChangedAfterCopy).toBe(true)
    expect(info.originalMissing).toBe(false)
  })

  it('does not flag a file older than the copy', async () => {
    const doc = userDoc('older.docx')
    setMtime(doc, Date.now() - 120_000)
    const identity = { kind: 'docs' as const, filePath: doc }
    await store.writeCopy(identity, Buffer.from('copy'))
    expect(store.copyInfo(identity)!.fileChangedAfterCopy).toBe(false)
  })

  it('flags an original that is gone', async () => {
    const doc = userDoc('gone.hwpx')
    const identity = { kind: 'hwp' as const, filePath: doc }
    await store.writeCopy(identity, Buffer.from('copy'))
    rmSync(doc)
    const info = store.copyInfo(identity)!
    expect(info.originalMissing).toBe(true)
    expect(info.fileChangedAfterCopy).toBe(false)
  })

  it('untitled copies are never missing or changed', async () => {
    const identity = { kind: 'slides' as const, untitledId: newUntitledRecoveryId(), ext: '.pptx' }
    await store.writeCopy(identity, Buffer.from('deck'), { title: 'Presentation 1' })
    const info = store.copyInfo(identity)!
    expect(info.filePath).toBeNull()
    expect(info.untitledId).toBe(identity.untitledId)
    expect(info.originalMissing).toBe(false)
    expect(info.fileChangedAfterCopy).toBe(false)
  })

  it('lists copies by state, by kind and untitled only', async () => {
    const a = { kind: 'docs' as const, filePath: userDoc('a.docx') }
    const b = { kind: 'hwp' as const, filePath: userDoc('b.hwp') }
    const u = { kind: 'markdown' as const, untitledId: newUntitledRecoveryId(), ext: '.md' }
    await store.writeCopy(a, Buffer.from('a'))
    await store.writeCopy(b, Buffer.from('b'))
    await store.writeCopy(u, Buffer.from('u'), { title: 'Untitled' })
    store.applyLaunchDecision(b, 'restore')
    store.applyLaunchDecision(u, 'later')

    const pathsOf = (list: { copyPath: string }[]) => list.map((c) => c.copyPath).sort()
    expect(pathsOf(store.listCopies())).toEqual(
      [store.copyPath(a), store.copyPath(b), store.copyPath(u)].sort(),
    )
    expect(pathsOf(store.listCopies({ states: ['undecided'] }))).toEqual([store.copyPath(a)])
    expect(pathsOf(store.listCopies({ states: ['restoreChosen'] }))).toEqual([store.copyPath(b)])
    expect(pathsOf(store.listCopies({ untitled: true }))).toEqual([store.copyPath(u)])
    expect(pathsOf(store.listCopies({ untitled: false, kinds: ['hwp'] }))).toEqual([
      store.copyPath(b),
    ])
    expect(store.listCopies({ untitled: true })[0]!.title).toBe('Untitled')
  })

  it('does not list a legacy file copy (no path to show) but still finds it per file', () => {
    const doc = userDoc('legacy.pptx')
    const identity = { kind: 'slides' as const, filePath: doc }
    mkdirSync(join(root, 'slides-autosave'), { recursive: true })
    writeFileSync(store.copyPath(identity), 'legacy')
    expect(store.listCopies()).toEqual([])
    expect(store.copyInfo(identity)!.state).toBe('later')
  })

  it('ignores Excel’s old unsaved-new index file', () => {
    mkdirSync(join(root, 'sheets-autosave'), { recursive: true })
    writeFileSync(join(root, 'sheets-autosave', 'unsaved-new.json'), '[]')
    expect(store.listCopies()).toEqual([])
  })

  it('answers whether undecided or restoreChosen copies are left', async () => {
    expect(store.hasUnresolvedCopies()).toBe(false)
    const a = { kind: 'docs' as const, filePath: userDoc('a.docx') }
    await store.writeCopy(a, Buffer.from('a'))
    expect(store.hasUnresolvedCopies()).toBe(true)
    store.applyLaunchDecision(a, 'later')
    expect(store.hasUnresolvedCopies()).toBe(false)
    store.applyLaunchDecision(a, 'restore')
    expect(store.hasUnresolvedCopies()).toBe(true)
    store.applyLaunchDecision(a, 'discard')
    expect(store.hasUnresolvedCopies()).toBe(false)
  })
})

describe('30-day prune', () => {
  it('is 30 days by default', () => {
    expect(RECOVERY_COPY_MAX_AGE_MS).toBe(30 * DAY)
  })

  it('removes copies untouched for longer than the limit, with their metadata', async () => {
    const old = { kind: 'docs' as const, filePath: userDoc('old.docx') }
    const recent = { kind: 'docs' as const, filePath: userDoc('recent.docx') }
    await store.writeCopy(old, Buffer.from('old'))
    await store.writeCopy(recent, Buffer.from('recent'))
    setMtime(store.copyPath(old), Date.now() - 31 * DAY)
    setMtime(store.copyPath(recent), Date.now() - 29 * DAY)
    expect(store.pruneStaleCopies()).toBe(1)
    expect(store.copyInfo(old)).toBeNull()
    expect(store.copyInfo(recent)).not.toBeNull()
    expect(allFiles(join(root, 'docs-autosave'))).toHaveLength(2) // recent copy + its metadata
  })

  it('removes old legacy copies, untitled copies and leftover temp files too', async () => {
    mkdirSync(join(root, 'sheets-autosave'), { recursive: true })
    const legacy = join(root, 'sheets-autosave', `${sha16('/x.xlsx')}.xlsx`)
    writeFileSync(legacy, 'legacy')
    const tmp = join(root, 'sheets-autosave', `.${sha16('/y.xlsx')}.xlsx.abcdef123456.tmp`)
    writeFileSync(tmp, 'half written')
    const index = join(root, 'sheets-autosave', 'unsaved-new.json')
    writeFileSync(index, '[]')
    const u = { kind: 'html' as const, untitledId: newUntitledRecoveryId(), ext: '.html' }
    await store.writeCopy(u, Buffer.from('u'), { title: 'Untitled' })
    const old = Date.now() - 40 * DAY
    for (const path of [legacy, tmp, index, store.copyPath(u)]) setMtime(path, old)
    expect(store.pruneStaleCopies()).toBe(3)
    expect(existsSync(legacy)).toBe(false)
    expect(existsSync(tmp)).toBe(false)
    expect(store.copyInfo(u)).toBeNull()
    expect(existsSync(index)).toBe(true)
  })

  it('takes a tunable limit', async () => {
    const a = { kind: 'pdf' as const, filePath: userDoc('a.pdf') }
    await store.writeCopy(a, Buffer.from('a'))
    setMtime(store.copyPath(a), Date.now() - 2 * DAY)
    expect(store.pruneStaleCopies(DAY)).toBe(1)
  })
})

describe('shutdown latch', () => {
  it('refuses ordinary deletions while the app is ending', async () => {
    const identity = { kind: 'docs' as const, filePath: userDoc('teardown.docx') }
    await store.writeCopy(identity, Buffer.from('keep me'))
    markAppShuttingDown()
    expect(isAppShuttingDown()).toBe(true)
    expect(store.deleteCopy(identity, 'closedClean')).toBe('refused')
    expect(store.deleteCopy(identity, 'discarded')).toBe('refused')
    expect(store.applyLaunchDecision(identity, 'discard')).toBe(false)
    expect(readFileSync(store.copyPath(identity), 'utf8')).toBe('keep me')
  })

  it('still deletes for an explicit "don\'t save" and for a successful save', async () => {
    const dontSave = { kind: 'docs' as const, filePath: userDoc('dont.docx') }
    const saved = { kind: 'docs' as const, filePath: userDoc('saved.docx') }
    await store.writeCopy(dontSave, Buffer.from('x'))
    await store.writeCopy(saved, Buffer.from('y'))
    markAppShuttingDown()
    expect(store.deleteCopy(dontSave, 'dontSave')).toBe('deleted')
    expect(store.deleteCopy(saved, 'saved')).toBe('deleted')
    expect(store.copyInfo(dontSave)).toBeNull()
    expect(store.copyInfo(saved)).toBeNull()
  })

  it('a refused deletion does not cancel a copy write in flight', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('flight.pptx') }
    markAppShuttingDown()
    const write = store.writeCopy(identity, Buffer.from('last words'))
    expect(store.deleteCopy(identity, 'closedClean')).toBe('refused')
    expect(await write).toBe('written')
    expect(readFileSync(store.copyPath(identity), 'utf8')).toBe('last words')
  })

  it('a save during shutdown still blocks a late write', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('late.pptx') }
    markAppShuttingDown()
    const ticket = store.beginWrite(identity)
    expect(store.deleteCopy(identity, 'saved')).toBe('deleted')
    expect(await store.writeCopy(identity, Buffer.from('late'), { ticket })).toBe('superseded')
    expect(existsSync(store.copyPath(identity))).toBe(false)
  })

  it('does not prune while the app is ending', async () => {
    const identity = { kind: 'docs' as const, filePath: userDoc('p.docx') }
    await store.writeCopy(identity, Buffer.from('x'))
    setMtime(store.copyPath(identity), Date.now() - 40 * DAY)
    markAppShuttingDown()
    expect(store.pruneStaleCopies()).toBe(0)
    expect(store.copyInfo(identity)).not.toBeNull()
  })

  it('reset lets ordinary deletions through again (a vetoed quit)', async () => {
    const identity = { kind: 'docs' as const, filePath: userDoc('veto.docx') }
    await store.writeCopy(identity, Buffer.from('x'))
    markAppShuttingDown()
    resetAppShuttingDown()
    expect(isAppShuttingDown()).toBe(false)
    expect(store.deleteCopy(identity, 'closedClean')).toBe('deleted')
  })

  it('is shared by every bundled copy of the module', async () => {
    vi.resetModules()
    const other = await import('../src/recovery-store')
    markAppShuttingDown()
    expect(other.isAppShuttingDown()).toBe(true)
    other.resetAppShuttingDown()
    expect(isAppShuttingDown()).toBe(false)
    expect(other.recoveryRunId()).toBe(recoveryRunId())
  })
})

describe('adopting an old untitled copy', () => {
  it('moves a copy from the editor folder into an untitled slot marked later', async () => {
    mkdirSync(join(root, 'sheets-autosave'), { recursive: true })
    const legacy = join(root, 'sheets-autosave', `${sha16('C:\\tmp\\Book1.xlsx')}.xlsx`)
    writeFileSync(legacy, 'workbook')
    const identity = store.adoptUntitledCopy('sheets', legacy, { title: 'Book1', ext: '.xlsx' })
    expect(identity).not.toBeNull()
    expect(existsSync(legacy)).toBe(false)
    const info = store.copyInfo(identity!)!
    expect(info.state).toBe('later')
    expect(info.title).toBe('Book1')
    expect(readFileSync(info.copyPath, 'utf8')).toBe('workbook')
  })

  it('refuses a source outside the editor folder and leaves it alone', () => {
    const outside = userDoc('Book2.xlsx', 'user file')
    expect(store.adoptUntitledCopy('sheets', outside, { title: 'Book2', ext: '.xlsx' })).toBeNull()
    expect(readFileSync(outside, 'utf8')).toBe('user file')
  })

  it('keeps the original path it is given', () => {
    mkdirSync(join(root, 'sheets-autosave'), { recursive: true })
    const legacy = join(root, 'sheets-autosave', `${sha16('C:\\tmp\\Book3.xlsx')}.xlsx`)
    writeFileSync(legacy, 'workbook')
    const original = join(userFolder, 'Book3.csv')
    const identity = store.adoptUntitledCopy('sheets', legacy, {
      title: 'Book3.csv',
      ext: '.xlsx',
      originalPath: original,
    })
    expect(store.copyInfo(identity!)!.originalPath).toBe(original)
  })
})

describe('an untitled copy of a file the editor cannot write back to', () => {
  const untitled = () => ({
    kind: 'sheets' as const,
    untitledId: newUntitledRecoveryId(),
    ext: '.xlsx',
  })

  it('carries the original path through every state change, and lists it', async () => {
    const original = userDoc('data.csv', 'a,b')
    const identity = untitled()
    await store.writeCopy(identity, Buffer.from('xlsx'), {
      title: 'data.csv',
      originalPath: original,
    })
    expect(store.copyInfo(identity)!.originalPath).toBe(original)
    store.applyLaunchDecision(identity, 'restore')
    expect(store.copyInfo(identity)!.originalPath).toBe(original)
    store.markCopyLoaded(identity)
    expect(store.copyInfo(identity)!.originalPath).toBe(original)
    store.applyLaunchDecision(identity, 'later')
    const [listed] = store.listCopies({ untitled: true })
    expect(listed!.originalPath).toBe(original)
    // still an untitled copy: never missing or changed, and the file is untouched
    expect(listed!.filePath).toBeNull()
    expect(listed!.originalMissing).toBe(false)
    expect(listed!.fileChangedAfterCopy).toBe(false)
    expect(readFileSync(original, 'utf8')).toBe('a,b')
  })

  it('a later write without the path drops it', async () => {
    const identity = untitled()
    await store.writeCopy(identity, Buffer.from('1'), { originalPath: userDoc('x.tsv') })
    await store.writeCopy(identity, Buffer.from('2'))
    expect(store.copyInfo(identity)!.originalPath).toBeNull()
  })

  it('is null for copies written without it, and earlier metadata still reads', async () => {
    const identity = untitled()
    await store.writeCopy(identity, Buffer.from('x'), { title: 'Book' })
    const info = store.copyInfo(identity)!
    expect(info.originalPath).toBeNull()
    expect(info.legacy).toBe(false)
    // metadata written before the field existed
    const meta = `${store.copyPath(identity)}.meta.json`
    const raw = JSON.parse(readFileSync(meta, 'utf8')) as Record<string, unknown>
    expect('originalPath' in raw).toBe(false)
    expect(store.listCopies({ untitled: true })).toHaveLength(1)
  })

  it('a file copy never records one', async () => {
    const doc = userDoc('kept.xlsx')
    const identity = { kind: 'sheets' as const, filePath: doc }
    await store.writeCopy(identity, Buffer.from('x'), { originalPath: userDoc('other.csv') })
    expect(store.copyInfo(identity)!.originalPath).toBeNull()
    const raw = JSON.parse(readFileSync(`${store.copyPath(identity)}.meta.json`, 'utf8'))
    expect('originalPath' in raw).toBe(false)
  })

  it('ignores a damaged original path in the metadata', async () => {
    const identity = untitled()
    await store.writeCopy(identity, Buffer.from('x'), { originalPath: userDoc('y.csv') })
    const meta = `${store.copyPath(identity)}.meta.json`
    const raw = JSON.parse(readFileSync(meta, 'utf8')) as Record<string, unknown>
    writeFileSync(meta, JSON.stringify({ ...raw, originalPath: 42 }))
    const info = store.copyInfo(identity)!
    expect(info.legacy).toBe(false)
    expect(info.originalPath).toBeNull()
  })

  it('streams with the original path too', async () => {
    const original = userDoc('z.xls')
    const identity = untitled()
    await store.writeCopyStreamed(identity, async (temp) => writeFileSync(temp, 'x'), {
      originalPath: original,
    })
    expect(store.copyInfo(identity)!.originalPath).toBe(original)
  })
})

describe('damaged metadata', () => {
  it('lists nothing for metadata that does not match its copy, and does not throw', async () => {
    const identity = { kind: 'docs' as const, filePath: userDoc('m.docx') }
    await store.writeCopy(identity, Buffer.from('x'))
    const meta = `${store.copyPath(identity)}.meta.json`
    for (const broken of ['{', '{"filePath":""}', '{"filePath":"/other.docx","kind":"docs"}']) {
      writeFileSync(meta, broken)
      expect(store.listCopies()).toEqual([])
      expect(store.copyInfo(identity)!.state).toBe('later')
    }
  })
})

describe('streaming a copy to disk', () => {
  const tempsIn = (dir: string) => allFiles(dir).filter((p) => p.endsWith('.tmp'))

  /** a writer that holds its temp file half written until `release` is called */
  function heldWriter(content: string) {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let started!: (tempPath: string) => void
    const begun = new Promise<string>((resolve) => (started = resolve))
    const write = vi.fn(async (tempPath: string) => {
      writeFileSync(tempPath, content.slice(0, 1))
      started(tempPath)
      await gate
      writeFileSync(tempPath, content)
    })
    return { write, begun, release }
  }

  it('moves what the writer put in its temp file into place and leaves no temp behind', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('deck.pptx') }
    const write = vi.fn(async (tempPath: string) => writeFileSync(tempPath, 'streamed'))
    expect(await store.writeCopyStreamed(identity, write)).toBe('written')
    expect(write).toHaveBeenCalledTimes(1)
    expect(readFileSync(store.copyPath(identity), 'utf8')).toBe('streamed')
    expect(tempsIn(join(root, 'slides-autosave'))).toEqual([])
  })

  it('hands the writer a temp file beside the copy, of the kind the prune removes', async () => {
    const identity = { kind: 'slides' as const, untitledId: 'u-1', ext: '.pptx' }
    let seen = ''
    await store.writeCopyStreamed(
      identity,
      async (tempPath) => {
        seen = tempPath
        writeFileSync(tempPath, 'x')
      },
      { title: 'Deck' },
    )
    expect(dirname(seen)).toBe(dirname(store.copyPath(identity)))
    expect(basename(seen)).toMatch(/^\.u-1\.pptx\.[0-9a-f]{12}\.tmp$/)
  })

  it('writes the same metadata as a buffered copy: undecided, title, run, no content', async () => {
    const doc = userDoc('plan.pptx')
    const identity = { kind: 'slides' as const, filePath: doc }
    const before = Date.now()
    await store.writeCopyStreamed(identity, async (p) => writeFileSync(p, 'SECRET-MARKER'))
    const info = store.copyInfo(identity)!
    expect(info.state).toBe('undecided')
    expect(info.title).toBe('plan.pptx')
    expect(info.filePath).toBe(doc)
    expect(info.runId).toBe(recoveryRunId())
    expect(info.writtenAt).toBeGreaterThanOrEqual(before)
    expect(readFileSync(`${store.copyPath(identity)}.meta.json`, 'utf8')).not.toContain('SECRET')

    const untitled = { kind: 'slides' as const, untitledId: 'u-2', ext: '.pptx' }
    await store.writeCopyStreamed(untitled, async (p) => writeFileSync(p, 'u'), { title: 'Draft' })
    expect(store.listCopies({ untitled: true }).map((c) => c.title)).toEqual(['Draft'])
  })

  it('marks a replaced copy undecided again', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('again.pptx') }
    await store.writeCopy(identity, Buffer.from('v1'))
    store.applyLaunchDecision(identity, 'later')
    await store.writeCopyStreamed(identity, async (p) => writeFileSync(p, 'v2'))
    expect(store.copyInfo(identity)!.state).toBe('undecided')
    expect(readFileSync(store.copyPath(identity), 'utf8')).toBe('v2')
  })

  it('rejects when the writer fails, removing its temp file and keeping the last copy', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('fail.pptx') }
    await store.writeCopy(identity, Buffer.from('previous'))
    const failing = store.writeCopyStreamed(identity, async (p) => {
      writeFileSync(p, 'half')
      throw new Error('disk full')
    })
    await expect(failing).rejects.toThrow('disk full')
    expect(readFileSync(store.copyPath(identity), 'utf8')).toBe('previous')
    expect(tempsIn(join(root, 'slides-autosave'))).toEqual([])
  })

  it('rejects when the copy folder cannot be made', async () => {
    writeFileSync(join(root, 'slides-autosave'), 'not a folder')
    const identity = { kind: 'slides' as const, filePath: userDoc('blocked.pptx') }
    const write = vi.fn(async (p: string) => writeFileSync(p, 'x'))
    await expect(store.writeCopyStreamed(identity, write)).rejects.toThrow()
  })

  it('does not call the writer when a delete came after the ticket', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('stale.pptx') }
    const ticket = store.beginWrite(identity)
    store.deleteCopy(identity, 'saved')
    const write = vi.fn(async (p: string) => writeFileSync(p, 'stale'))
    expect(await store.writeCopyStreamed(identity, write, { ticket })).toBe('superseded')
    expect(write).not.toHaveBeenCalled()
    expect(existsSync(store.copyPath(identity))).toBe(false)
  })

  it('a delete while the writer runs wins: no copy, no metadata, temp removed', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('race.pptx') }
    const held = heldWriter('late bytes')
    const write = store.writeCopyStreamed(identity, held.write)
    const tempPath = await held.begun
    expect(store.deleteCopy(identity, 'dontSave')).toBe('deleted')
    held.release()
    expect(await write).toBe('superseded')
    expect(existsSync(tempPath)).toBe(false)
    expect(existsSync(store.copyPath(identity))).toBe(false)
    expect(existsSync(`${store.copyPath(identity)}.meta.json`)).toBe(false)
    expect(tempsIn(join(root, 'slides-autosave'))).toEqual([])
  })

  it('a delete while the writer runs also removes the copy an earlier write left', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('older.pptx') }
    await store.writeCopy(identity, Buffer.from('older'))
    const held = heldWriter('late bytes')
    const write = store.writeCopyStreamed(identity, held.write)
    await held.begun
    store.deleteCopy(identity, 'saved')
    held.release()
    expect(await write).toBe('superseded')
    expect(store.copyInfo(identity)).toBeNull()
  })

  it('a refused deletion while the app is ending does not cancel the write', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('flight.pptx') }
    markAppShuttingDown()
    const held = heldWriter('last words')
    const write = store.writeCopyStreamed(identity, held.write)
    await held.begun
    expect(store.deleteCopy(identity, 'closedClean')).toBe('refused')
    held.release()
    expect(await write).toBe('written')
    expect(readFileSync(store.copyPath(identity), 'utf8')).toBe('last words')
  })

  it('a save while the app is ending still drops the write', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('late.pptx') }
    markAppShuttingDown()
    const held = heldWriter('late')
    const write = store.writeCopyStreamed(identity, held.write)
    const tempPath = await held.begun
    expect(store.deleteCopy(identity, 'saved')).toBe('deleted')
    held.release()
    expect(await write).toBe('superseded')
    expect(existsSync(tempPath)).toBe(false)
    expect(existsSync(store.copyPath(identity))).toBe(false)
  })

  it('a write started after the delete still lands', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('after.pptx') }
    const held = heldWriter('old')
    const first = store.writeCopyStreamed(identity, held.write)
    await held.begun
    store.deleteCopy(identity, 'saved')
    const second = store.writeCopyStreamed(identity, async (p) => writeFileSync(p, 'new'))
    held.release()
    expect(await first).toBe('superseded')
    expect(await second).toBe('written')
    expect(readFileSync(store.copyPath(identity), 'utf8')).toBe('new')
    expect(store.copyInfo(identity)!.state).toBe('undecided')
  })

  it('is queued with buffered writes of the same document, in call order', async () => {
    const identity = { kind: 'slides' as const, filePath: userDoc('order.pptx') }
    const held = heldWriter('streamed')
    const streamed = store.writeCopyStreamed(identity, held.write)
    await held.begun
    const buffered = store.writeCopy(identity, Buffer.from('buffered'))
    held.release()
    expect(await streamed).toBe('written')
    expect(await buffered).toBe('written')
    expect(readFileSync(store.copyPath(identity), 'utf8')).toBe('buffered')
  })

  it('refuses a ticket taken for another document without calling the writer', async () => {
    const a = { kind: 'slides' as const, filePath: userDoc('a.pptx') }
    const b = { kind: 'slides' as const, filePath: userDoc('b.pptx') }
    const ticket = store.beginWrite(a)
    const write = vi.fn(async (p: string) => writeFileSync(p, 'x'))
    await expect(store.writeCopyStreamed(b, write, { ticket })).rejects.toThrow()
    expect(write).not.toHaveBeenCalled()
  })
})

describe('a document discarded with "Don\'t Save"', () => {
  const tempsIn = (dir: string) => allFiles(dir).filter((p) => p.endsWith('.tmp'))

  it('takes no new copy while its close is still in progress', async () => {
    const identity = { kind: 'docs' as const, filePath: userDoc('gone.docx') }
    await store.writeCopy(identity, Buffer.from('edits'))
    expect(store.deleteCopy(identity, 'dontSave')).toBe('deleted')
    expect(await store.writeCopy(identity, Buffer.from('edits again'))).toBe('superseded')
    expect(existsSync(store.copyPath(identity))).toBe(false)
    expect(existsSync(`${store.copyPath(identity)}.meta.json`)).toBe(false)
    expect(store.isDiscarded(identity)).toBe(true)
  })

  it('does not call a streamed writer and leaves no temp file', async () => {
    const identity: RecoveryIdentity = {
      kind: 'slides',
      untitledId: newUntitledRecoveryId(),
      ext: '.pptx',
    }
    store.deleteCopy(identity, 'dontSave')
    const write = vi.fn(async (p: string) => writeFileSync(p, 'deck'))
    expect(await store.writeCopyStreamed(identity, write)).toBe('superseded')
    expect(write).not.toHaveBeenCalled()
    expect(existsSync(store.copyPath(identity))).toBe(false)
    expect(tempsIn(root)).toEqual([])
  })

  it('other reasons do not block later copies', async () => {
    const identity = { kind: 'hwp' as const, filePath: userDoc('kept.hwp') }
    for (const reason of ['saved', 'discarded', 'closedClean'] as const) {
      store.deleteCopy(identity, reason)
      expect(store.isDiscarded(identity)).toBe(false)
      expect(await store.writeCopy(identity, Buffer.from(reason))).toBe('written')
    }
  })

  it('copies resume once the close is cancelled', async () => {
    const a = { kind: 'markdown' as const, filePath: userDoc('a.md') }
    const b = { kind: 'mindmap' as const, filePath: userDoc('b.xmind') }
    store.deleteCopy(a, 'dontSave')
    store.deleteCopy(b, 'dontSave')
    resumeDiscardedCopies()
    expect(store.isDiscarded(a)).toBe(false)
    expect(await store.writeCopy(a, Buffer.from('a'))).toBe('written')
    expect(await store.writeCopy(b, Buffer.from('b'))).toBe('written')
    expect(store.copyInfo(a)!.state).toBe('undecided')
  })

  it('opening the document again lifts the block for that document only', async () => {
    const reopened = { kind: 'html' as const, filePath: userDoc('again.html') }
    const other = { kind: 'html' as const, filePath: userDoc('other.html') }
    store.deleteCopy(reopened, 'dontSave')
    store.deleteCopy(other, 'dontSave')
    expect(store.openPlan(reopened)).toEqual({ action: 'none' })
    expect(await store.writeCopy(reopened, Buffer.from('new edits'))).toBe('written')
    expect(await store.writeCopy(other, Buffer.from('discarded'))).toBe('superseded')
  })

  it('an explicit clear, and loading a copy, lift it too', async () => {
    const cleared = { kind: 'pdf' as const, filePath: userDoc('c.pdf') }
    const loaded = { kind: 'pdf' as const, filePath: userDoc('l.pdf') }
    store.deleteCopy(cleared, 'dontSave')
    store.clearDiscarded(cleared)
    expect(await store.writeCopy(cleared, Buffer.from('c'))).toBe('written')
    store.deleteCopy(loaded, 'dontSave')
    store.markCopyLoaded(loaded)
    expect(await store.writeCopy(loaded, Buffer.from('l'))).toBe('written')
  })

  it('is shared by every bundled copy of the module', async () => {
    const identity = { kind: 'docs' as const, filePath: userDoc('shared.docx') }
    vi.resetModules()
    const other = await import('../src/recovery-store')
    const otherStore = other.createRecoveryStore({ userDataDir: root })
    otherStore.deleteCopy(identity, 'dontSave')
    expect(await store.writeCopy(identity, Buffer.from('x'))).toBe('superseded')
    other.resumeDiscardedCopies()
    expect(await store.writeCopy(identity, Buffer.from('x'))).toBe('written')
  })

  it('leaves the shutdown latch alone: "Don\'t Save" still deletes, others are refused', async () => {
    const dropped = { kind: 'docs' as const, filePath: userDoc('d.docx') }
    const kept = { kind: 'docs' as const, filePath: userDoc('k.docx') }
    await store.writeCopy(dropped, Buffer.from('x'))
    await store.writeCopy(kept, Buffer.from('y'))
    markAppShuttingDown()
    expect(store.deleteCopy(dropped, 'dontSave')).toBe('deleted')
    expect(store.deleteCopy(kept, 'closedClean')).toBe('refused')
    expect(await store.writeCopy(dropped, Buffer.from('late'))).toBe('superseded')
    expect(await store.writeCopy(kept, Buffer.from('last'))).toBe('written')
    resumeDiscardedCopies()
    expect(isAppShuttingDown()).toBe(true)
  })
})
