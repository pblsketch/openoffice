// @vitest-environment node
/**
 * The Word editor's crash-recovery bookkeeping on the shared store: the
 * folder and names earlier versions used, the named per-file prompt instead
 * of the old unnamed box, copies of never-saved documents kept in app data
 * only, and which close deletes what (a quit never does). Runs a real store
 * over a temporary app data folder; the message box is a fake.
 */
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
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))

import {
  createRecoveryStore,
  markAppShuttingDown,
  resetAppShuttingDown,
  resumeDiscardedCopies,
  type RecoveryMessageBox,
} from '@genoffice/electron-utils'
import { createDocsRecovery, type DocsRecovery } from '../src/main/docs-recovery'
import { recoveryExtFor } from '../src/main/doc-format'

let root: string
let userFolder: string
let recovery: DocsRecovery
let answers: number[]
let dialog: RecoveryMessageBox & { showMessageBox: ReturnType<typeof vi.fn> }

const sha16 = (value: string) => createHash('sha1').update(value).digest('hex').slice(0, 16)
const autosaveDir = () => join(root, 'docs-autosave')
const TAB = 7
const OTHER_TAB = 8

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'docs-recovery-root-'))
  userFolder = mkdtempSync(join(tmpdir(), 'docs-recovery-user-'))
  recovery = createDocsRecovery(createRecoveryStore({ userDataDir: root }))
  answers = []
  dialog = {
    // the prompt's Esc / close answers cancelId; tests queue the button index
    showMessageBox: vi.fn(async (...args: unknown[]) => {
      const box = args[args.length - 1] as { cancelId: number }
      return { response: answers.shift() ?? box.cancelId, checkboxChecked: false }
    }),
  } as unknown as RecoveryMessageBox & { showMessageBox: ReturnType<typeof vi.fn> }
})

afterEach(() => {
  resetAppShuttingDown()
  resumeDiscardedCopies()
  rmSync(root, { recursive: true, force: true })
  rmSync(userFolder, { recursive: true, force: true })
})

function userDoc(name: string, content = 'saved'): string {
  const path = join(userFolder, name)
  writeFileSync(path, content)
  return path
}

function setMtime(path: string, ms: number): void {
  utimesSync(path, ms / 1000, ms / 1000)
}

/** every file under a folder, relative names */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
}

const write = (tab: number, filePath: string, content: string) =>
  recovery.writeCopy(tab, { filePath }, () => Buffer.from(content), 'title')

const open = (filePath: string, decision?: 'restore' | 'original') =>
  recovery.resolveOpen({ filePath, decision, dialog, lang: 'en' })

describe('copy folder and names', () => {
  it('keeps the earlier folder and sha1 naming, .odt for an ODT document', async () => {
    const docx = userDoc('report.docx')
    const odt = userDoc('form.odt')
    await write(TAB, docx, 'docx copy')
    await write(TAB, odt, 'odt copy')
    const legacyName = (p: string) => `${sha16(p)}${recoveryExtFor(p)}`
    expect(readFileSync(join(autosaveDir(), legacyName(docx)), 'utf8')).toBe('docx copy')
    expect(readFileSync(join(autosaveDir(), legacyName(odt)), 'utf8')).toBe('odt copy')
    expect(legacyName(odt).endsWith('.odt')).toBe(true)
    // copying never touches the user's files
    expect(readFileSync(docx, 'utf8')).toBe('saved')
    expect(filesUnder(userFolder).sort()).toEqual(['form.odt', 'report.docx'])
  })

  it('offers a copy an earlier version left (no metadata) with the named prompt', async () => {
    const doc = userDoc('legacy.docx')
    setMtime(doc, Date.now() - 60_000)
    mkdirSync(autosaveDir(), { recursive: true })
    writeFileSync(join(autosaveDir(), `${sha16(doc)}.docx`), 'left by 0.12')
    const result = await open(doc)
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
    const box = dialog.showMessageBox.mock.calls[0].at(-1) as { message: string; cancelId: number }
    expect(box.message).toContain('legacy.docx')
    expect(result).toMatchObject({ action: 'restore' })
    expect((result as { bytes: Buffer }).bytes.toString()).toBe('left by 0.12')
  })
})

describe('opening a file with a copy', () => {
  it('asks naming the document; Esc or closing the box restores', async () => {
    const doc = userDoc('notes.docx')
    setMtime(doc, Date.now() - 60_000)
    await write(TAB, doc, 'unsaved work')
    const result = await open(doc)
    const box = dialog.showMessageBox.mock.calls[0].at(-1) as {
      message: string
      buttons: string[]
      cancelId: number
    }
    expect(box.message).toContain('notes.docx')
    expect(box.cancelId).toBe(0)
    expect(result.action).toBe('restore')
    // the copy stays until a save, Don't Save or a discard drops it
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))?.state).toBe('undecided')
  })

  it('a file newer than the copy is said, and the copy is not deleted silently', async () => {
    const doc = userDoc('changed.docx')
    await write(TAB, doc, 'older unsaved work')
    const copyPath = recovery.store.copyPath(recovery.fileIdentity(doc))
    setMtime(copyPath, Date.now() - 120_000)
    setMtime(doc, Date.now())
    const asked = vi.fn()
    dialog.showMessageBox.mockImplementationOnce(async (...args: unknown[]) => {
      // the copy is still on disk while the question is up
      asked(existsSync(copyPath), args.at(-1))
      return { response: 0, checkboxChecked: false }
    })
    const result = await open(doc)
    expect(asked).toHaveBeenCalledTimes(1)
    const [stillThere, box] = asked.mock.calls[0] as [boolean, { detail: string }]
    expect(stillThere).toBe(true)
    expect(box.detail).toMatch(/changed/i)
    expect(result.action).toBe('restore')
    expect(existsSync(copyPath)).toBe(true)
  })

  it('"Discard" deletes the copy and opens the file', async () => {
    const doc = userDoc('drop.docx')
    setMtime(doc, Date.now() - 60_000)
    await write(TAB, doc, 'unwanted')
    answers.push(1)
    expect((await open(doc)).action).toBe('original')
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))).toBeNull()
  })

  it('"restore" chosen in the launch list restores without asking', async () => {
    const doc = userDoc('chosen.docx')
    await write(TAB, doc, 'restore me')
    recovery.store.applyLaunchDecision(recovery.fileIdentity(doc), 'restore')
    const result = await open(doc)
    expect(dialog.showMessageBox).not.toHaveBeenCalled()
    expect(result.action).toBe('restore')
    // loaded into a tab: undecided again until saved or dropped
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))?.state).toBe('undecided')
  })

  it('a decision handed over by the shell skips the prompt either way', async () => {
    const doc = userDoc('decided.docx')
    await write(TAB, doc, 'copy content')
    expect((await open(doc, 'original')).action).toBe('original')
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))).not.toBeNull()
    const restored = await open(doc, 'restore')
    expect(restored.action).toBe('restore')
    expect(dialog.showMessageBox).not.toHaveBeenCalled()
  })

  it('no copy: the file opens without a question', async () => {
    expect((await open(userDoc('plain.docx'))).action).toBe('original')
    expect(dialog.showMessageBox).not.toHaveBeenCalled()
  })
})

describe('never-saved documents', () => {
  it('keep their copy in app data only, never in a user folder', async () => {
    const result = await recovery.writeCopy(
      TAB,
      { untitledExt: '.docx' },
      () => Buffer.from('draft'),
      'Untitled.docx',
    )
    expect(result).toBe('written')
    const files = filesUnder(autosaveDir())
    expect(files.filter((f) => !f.endsWith('.meta.json'))).toHaveLength(1)
    expect(files[0].startsWith('untitled')).toBe(true)
    expect(filesUnder(userFolder)).toEqual([])
    const untitled = recovery.untitledOf(TAB)!
    expect(recovery.store.copyInfo(untitled)?.title).toBe('Untitled.docx')
    // later ticks replace the same slot
    await recovery.writeCopy(TAB, { untitledExt: '.docx' }, () => Buffer.from('more'), 'x.docx')
    expect(recovery.untitledOf(TAB)).toEqual(untitled)
    expect(
      filesUnder(join(autosaveDir(), 'untitled')).filter((f) => !f.endsWith('.json')),
    ).toHaveLength(1)
  })

  it('the first save drops the untitled copy', async () => {
    await recovery.writeCopy(TAB, { untitledExt: '.docx' }, () => Buffer.from('d'), 'U.docx')
    const untitled = recovery.untitledOf(TAB)!
    recovery.noteSaved(TAB, [join(userFolder, 'saved.docx')])
    expect(recovery.store.copyInfo(untitled)).toBeNull()
    expect(recovery.untitledOf(TAB)).toBeNull()
  })

  it('reopens an untitled copy in a tab that goes on writing to it', async () => {
    await recovery.writeCopy(TAB, { untitledExt: '.docx' }, () => Buffer.from('d1'), 'U.docx')
    const untitled = recovery.untitledOf(TAB)!
    const taken = await recovery.takeUntitledCopy(OTHER_TAB, untitled, {
      title: 'U.docx',
      ext: '.docx',
      accept: () => true,
    })
    expect(taken?.bytes.toString()).toBe('d1')
    expect(recovery.untitledOf(OTHER_TAB)).toEqual(untitled)
  })

  it('a file copy whose original is gone becomes an untitled copy; an encrypted one is left alone', async () => {
    const gone = join(userFolder, 'gone.docx')
    await write(TAB, gone, 'orphan')
    const fileCopy = recovery.fileIdentity(gone)
    const refused = await recovery.takeUntitledCopy(OTHER_TAB, fileCopy, {
      title: 'gone.docx',
      ext: '.docx',
      accept: () => false,
    })
    expect(refused).toBeNull()
    expect(recovery.store.copyInfo(fileCopy)).not.toBeNull()
    const taken = await recovery.takeUntitledCopy(OTHER_TAB, fileCopy, {
      title: 'gone.docx',
      ext: '.docx',
      accept: () => true,
    })
    expect(taken?.bytes.toString()).toBe('orphan')
    expect(recovery.store.copyInfo(fileCopy)).toBeNull()
    expect(recovery.store.copyInfo(taken!.identity)?.title).toBe('gone.docx')
    expect(filesUnder(userFolder)).toEqual([])
  })
})

describe('deleting copies', () => {
  it("a save drops the saved path's copy, and a write that started before it never lands", async () => {
    const doc = userDoc('saving.docx')
    await write(TAB, doc, 'v1')
    recovery.noteSaved(TAB, [doc])
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))).toBeNull()
    // serialization was under way when the save landed
    const late = await recovery.writeCopy(
      TAB,
      { filePath: doc },
      () => {
        recovery.noteSaved(TAB, [doc])
        return Buffer.from('stale')
      },
      'saving.docx',
    )
    expect(late).toBe('skipped')
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))).toBeNull()
  })

  it('"Don\'t Save" drops the file\'s and the untitled copy', async () => {
    const doc = userDoc('discard.docx')
    await write(TAB, doc, 'dropped')
    await recovery.writeCopy(TAB, { untitledExt: '.docx' }, () => Buffer.from('u'), 'U.docx')
    const untitled = recovery.untitledOf(TAB)!
    recovery.discard(TAB, doc)
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))).toBeNull()
    expect(recovery.store.copyInfo(untitled)).toBeNull()
  })

  it('while the window close asks the other tabs, a tab answered "Don\'t Save" writes no copy, without any teardown', async () => {
    const doc = userDoc('lingering.docx')
    await write(TAB, doc, 'dropped')
    await recovery.writeCopy(TAB, { untitledExt: '.docx' }, () => Buffer.from('u'), 'U.docx')
    const untitled = recovery.untitledOf(TAB)!
    recovery.discard(TAB, doc)
    // the renderer's next ticks (it was told its copy was dropped)
    expect(await write(TAB, doc, 'dropped, again')).toBe('skipped')
    expect(
      await recovery.writeCopy(TAB, { untitledExt: '.docx' }, () => Buffer.from('u2'), 'U.docx'),
    ).toBe('skipped')
    // the untitled document keeps its slot: a fresh one would let the edits back in
    expect(recovery.untitledOf(TAB)).toEqual(untitled)
    // the window closes and the app quits: nothing of the tab is left to offer
    markAppShuttingDown()
    expect(filesUnder(autosaveDir())).toEqual([])
    // the close is cancelled instead: the same slots take copies again
    resumeDiscardedCopies()
    expect(await write(TAB, doc, 'kept working')).toBe('written')
    expect(
      await recovery.writeCopy(TAB, { untitledExt: '.docx' }, () => Buffer.from('u3'), 'U.docx'),
    ).toBe('written')
    expect(recovery.store.copyInfo(untitled)).not.toBeNull()
  })

  it('opening the file again after "Don\'t Save" takes copies again, whatever the shell decided', async () => {
    const doc = userDoc('reopened.docx')
    await write(TAB, doc, 'dropped')
    recovery.discard(TAB, doc)
    recovery.settleClosedDocument(TAB, false)
    expect((await open(doc, 'original')).action).toBe('original')
    expect(await write(OTHER_TAB, doc, 'new edits')).toBe('written')
  })

  it('a clean close drops only the copies that tab wrote', async () => {
    const mine = userDoc('mine.docx')
    const theirs = userDoc('theirs.docx')
    await write(TAB, mine, 'leftover from an in-flight tick')
    await write(OTHER_TAB, theirs, 'another tab, still dirty')
    recovery.noteCloseCheck(TAB, false)
    recovery.settleClosedDocument(TAB, false)
    expect(recovery.store.copyInfo(recovery.fileIdentity(mine))).toBeNull()
    expect(recovery.store.copyInfo(recovery.fileIdentity(theirs))).not.toBeNull()
  })

  it('a copy written after the clean answer means the tab is dirty again: it stays', async () => {
    const doc = userDoc('edited-after.docx')
    recovery.noteCloseCheck(TAB, false)
    await write(TAB, doc, 'new edits')
    recovery.settleClosedDocument(TAB, false)
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))).not.toBeNull()
  })

  it('a teardown while the app is ending keeps every copy of a clean or undecided tab', async () => {
    const clean = userDoc('clean.docx')
    const open = userDoc('open.docx')
    await write(TAB, clean, 'just written')
    await write(OTHER_TAB, open, 'unsaved')
    await recovery.writeCopy(OTHER_TAB, { untitledExt: '.docx' }, () => Buffer.from('u'), 'U.docx')
    const untitled = recovery.untitledOf(OTHER_TAB)!
    recovery.noteCloseCheck(TAB, false)
    markAppShuttingDown()
    recovery.settleClosedDocument(TAB, false)
    recovery.settleClosedDocument(OTHER_TAB, false)
    expect(recovery.store.copyInfo(recovery.fileIdentity(clean))).not.toBeNull()
    expect(recovery.store.copyInfo(recovery.fileIdentity(open))).not.toBeNull()
    expect(recovery.store.copyInfo(untitled)).not.toBeNull()
  })

  it('"Don\'t Save" still deletes while the app is ending', async () => {
    const doc = userDoc('dont-save.docx')
    await write(TAB, doc, 'dropped at quit')
    markAppShuttingDown()
    recovery.discard(TAB, doc)
    recovery.settleClosedDocument(TAB, false)
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))).toBeNull()
  })

  it('a tab whose renderer crashed, or that closed without a close check, keeps its copies', async () => {
    const crashed = userDoc('crashed.docx')
    const unchecked = userDoc('unchecked.docx')
    await write(TAB, crashed, 'crash')
    await write(OTHER_TAB, unchecked, 'no check')
    recovery.noteCloseCheck(TAB, false)
    recovery.settleClosedDocument(TAB, true)
    recovery.settleClosedDocument(OTHER_TAB, false)
    expect(recovery.store.copyInfo(recovery.fileIdentity(crashed))).not.toBeNull()
    expect(recovery.store.copyInfo(recovery.fileIdentity(unchecked))).not.toBeNull()
  })

  it('a save that lands while an async prepare runs (pictures inlined) wins', async () => {
    const doc = userDoc('materializing.docx')
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const pending = recovery.writeCopy(
      TAB,
      { filePath: doc },
      async () => {
        await gate
        return Buffer.from('full copy')
      },
      'materializing.docx',
    )
    recovery.noteSaved(TAB, [doc])
    release()
    expect(await pending).toBe('skipped')
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))).toBeNull()
    // without a save in between, the awaited bytes land
    const written = await recovery.writeCopy(
      TAB,
      { filePath: doc },
      async () => Buffer.from('full copy'),
      'materializing.docx',
    )
    expect(written).toBe('written')
    expect((await recovery.store.readCopy(recovery.fileIdentity(doc)))?.toString()).toBe(
      'full copy',
    )
  })

  it("any save drops the tab's untitled slot (a late untitled write after the first save)", async () => {
    const doc = userDoc('first-saved.docx')
    // a write the renderer sent before it learned of its first save's path
    await recovery.writeCopy(TAB, { untitledExt: '.docx' }, () => Buffer.from('late'), 'U.docx')
    const orphan = recovery.untitledOf(TAB)!
    recovery.noteSaved(TAB, [doc])
    expect(recovery.store.copyInfo(orphan)).toBeNull()
    expect(recovery.untitledOf(TAB)).toBeNull()
  })

  it('"Close Anyway" on a hung tab keeps its copies, set aside for later', async () => {
    const doc = userDoc('hung.docx')
    const restored = userDoc('restored-hung.docx')
    await write(TAB, doc, 'hung edits')
    await recovery.writeCopy(TAB, { untitledExt: '.docx' }, () => Buffer.from('u'), 'U.docx')
    const untitled = recovery.untitledOf(TAB)!
    // a copy this tab loaded but never rewrote (restored, then it hung)
    await write(OTHER_TAB, restored, 'restored copy')
    recovery.store.markCopyLoaded(recovery.fileIdentity(restored))
    recovery.abandon(TAB, restored)
    recovery.settleClosedDocument(TAB, false)
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))?.state).toBe('later')
    expect(recovery.store.copyInfo(untitled)?.state).toBe('later')
    expect(recovery.store.copyInfo(recovery.fileIdentity(restored))?.state).toBe('later')
    // nothing undecided is left behind for the next quit's judgment
    expect(recovery.store.hasUnresolvedCopies()).toBe(false)
  })

  it('a hung tab whose earlier answer was clean still keeps its copies', async () => {
    const doc = userDoc('hung-clean.docx')
    await write(TAB, doc, 'edits')
    recovery.noteCloseCheck(TAB, false)
    recovery.abandon(TAB, doc)
    recovery.settleClosedDocument(TAB, false)
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))).not.toBeNull()
  })

  it('a copy that could not be loaded (fell back to the file) is set aside for later', async () => {
    const doc = userDoc('unreadable.docx')
    await write(TAB, doc, 'encrypted under another password')
    const restored = await open(doc, 'restore')
    expect(restored.action).toBe('restore')
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))?.state).toBe('undecided')
    recovery.restoreFailed(doc)
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))?.state).toBe('later')
    expect(recovery.store.hasUnresolvedCopies()).toBe(false)
  })

  it('a tab still open after "Don\'t Save" (the quit was cancelled) keeps its new copy at shutdown', async () => {
    const doc = userDoc('quit-cancelled.docx')
    await write(TAB, doc, 'dropped')
    recovery.discard(TAB, doc)
    // the quit was cancelled at another tab: this one stays open and copies again
    resumeDiscardedCopies()
    await write(TAB, doc, 'still unsaved')
    // the OS ends the session: the live tab writes its copy, then is torn down
    markAppShuttingDown()
    recovery.noteStillOpen(TAB)
    recovery.settleClosedDocument(TAB, false)
    expect(recovery.store.copyInfo(recovery.fileIdentity(doc))).not.toBeNull()
  })
})
