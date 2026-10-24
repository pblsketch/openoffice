import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import type { BrowserWindow } from 'electron'
import {
  promptRecoveryForFile,
  resolveRecoveryOnOpen,
  type RecoveryMessageBox,
} from '../src/recovery-prompt'
import {
  RECOVERY_PROMPT_STRINGS,
  recoveryPromptLabels,
  unprotectableNoticeText,
} from '../src/recovery-labels'
import { createRecoveryStore, type RecoveryStore } from '../src/recovery-store'

/** a fake dialog that answers with the given button index */
function fakeDialog(response: number) {
  const showMessageBox = vi.fn(async (..._args: unknown[]) => ({
    response,
    checkboxChecked: false,
  }))
  return { dialog: { showMessageBox } as unknown as RecoveryMessageBox, showMessageBox }
}

const optionsOf = (mock: ReturnType<typeof fakeDialog>['showMessageBox']) => {
  const call = mock.mock.lastCall as unknown[] | undefined
  expect(call).toBeDefined()
  return call![call!.length - 1] as {
    message: string
    detail: string
    buttons: string[]
    defaultId: number
    cancelId: number
  }
}

describe('promptRecoveryForFile', () => {
  it('shows the document name and the restore / discard buttons', async () => {
    const fake = fakeDialog(0)
    await promptRecoveryForFile({
      dialog: fake.dialog,
      documentName: 'Quarterly report.docx',
      fileChangedAfterCopy: false,
      lang: 'en',
    })
    const options = optionsOf(fake.showMessageBox)
    expect(options.message).toContain('Quarterly report.docx')
    expect(options.buttons).toEqual(['Restore', 'Discard'])
    expect(options.defaultId).toBe(0)
  })

  it('treats Esc and closing the box as restore', async () => {
    const fake = fakeDialog(0)
    const answer = await promptRecoveryForFile({
      dialog: fake.dialog,
      documentName: 'a.hwp',
      fileChangedAfterCopy: false,
      lang: 'ko',
    })
    expect(optionsOf(fake.showMessageBox).cancelId).toBe(0)
    expect(answer).toBe('restore')
  })

  it('answers discard only for the discard button', async () => {
    const discard = await promptRecoveryForFile({
      dialog: fakeDialog(1).dialog,
      documentName: 'a.hwp',
      fileChangedAfterCopy: false,
      lang: 'ko',
    })
    expect(discard).toBe('discard')
    const odd = await promptRecoveryForFile({
      dialog: fakeDialog(7).dialog,
      documentName: 'a.hwp',
      fileChangedAfterCopy: false,
      lang: 'ko',
    })
    expect(odd).toBe('restore')
  })

  it('adds the "file changed since" line only when the file is newer than the copy', async () => {
    const labels = recoveryPromptLabels('ko', 'x')
    const plain = fakeDialog(0)
    await promptRecoveryForFile({
      dialog: plain.dialog,
      documentName: 'x',
      fileChangedAfterCopy: false,
      lang: 'ko',
    })
    expect(optionsOf(plain.showMessageBox).detail).not.toContain(labels.fileChanged)
    const changed = fakeDialog(0)
    await promptRecoveryForFile({
      dialog: changed.dialog,
      documentName: 'x',
      fileChangedAfterCopy: true,
      lang: 'ko',
    })
    expect(optionsOf(changed.showMessageBox).detail).toContain(labels.fileChanged)
  })

  it('sits over a live parent window and drops a destroyed one', async () => {
    const live = { isDestroyed: () => false } as unknown as BrowserWindow
    const dead = { isDestroyed: () => true } as unknown as BrowserWindow
    const a = fakeDialog(0)
    await promptRecoveryForFile({
      dialog: a.dialog,
      parent: live,
      documentName: 'x',
      fileChangedAfterCopy: false,
      lang: 'en',
    })
    expect(a.showMessageBox.mock.lastCall![0]).toBe(live)
    const b = fakeDialog(0)
    await promptRecoveryForFile({
      dialog: b.dialog,
      parent: dead,
      documentName: 'x',
      fileChangedAfterCopy: false,
      lang: 'en',
    })
    expect(b.showMessageBox.mock.lastCall).toHaveLength(1)
  })

  it('does not expand placeholders inside a document name', async () => {
    const fake = fakeDialog(0)
    await promptRecoveryForFile({
      dialog: fake.dialog,
      documentName: '{name} draft.md',
      fileChangedAfterCopy: false,
      lang: 'en',
    })
    expect(optionsOf(fake.showMessageBox).message).toContain('{name} draft.md')
  })
})

describe('recovery strings', () => {
  const keys = Object.keys(
    RECOVERY_PROMPT_STRINGS.zh,
  ) as (keyof typeof RECOVERY_PROMPT_STRINGS.zh)[]

  it('covers all 21 UI languages with every key filled', () => {
    expect(LANGS).toHaveLength(21)
    for (const lang of LANGS) {
      const dict = RECOVERY_PROMPT_STRINGS[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual([...keys].sort())
      for (const key of keys) expect(dict[key]?.trim(), `${lang}.${key}`).toBeTruthy()
    }
  })

  it('puts the document name into every language’s message', () => {
    for (const lang of LANGS) {
      expect(RECOVERY_PROMPT_STRINGS[lang].message, lang).toContain('{name}')
      expect(recoveryPromptLabels(lang, 'Plan.xmind').message, lang).toContain('Plan.xmind')
    }
  })

  it('never fills a language with the English text', () => {
    const en = RECOVERY_PROMPT_STRINGS.en
    for (const lang of LANGS) {
      if (lang === 'en') continue
      for (const key of keys) {
        expect(RECOVERY_PROMPT_STRINGS[lang][key], `${lang}.${key}`).not.toBe(en[key])
      }
    }
  })

  it('writes the Korean and English buttons as the spec names them', () => {
    expect(recoveryPromptLabels('ko', 'x').restore).toBe('되살리기')
    expect(recoveryPromptLabels('ko', 'x').discard).toBe('버리기')
    expect(recoveryPromptLabels('en', 'x').restore).toBe('Restore')
    expect(recoveryPromptLabels('en', 'x').discard).toBe('Discard')
  })

  it('has a notice for documents that cannot get a copy', () => {
    for (const lang of LANGS) expect(unprotectableNoticeText(lang).length, lang).toBeGreaterThan(0)
    expect(unprotectableNoticeText('ko-KR')).toBe(RECOVERY_PROMPT_STRINGS.ko.unprotectable)
  })
})

describe('resolveRecoveryOnOpen', () => {
  let root: string
  let docDir: string
  let store: RecoveryStore

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'genoffice-recovery-open-'))
    docDir = mkdtempSync(join(tmpdir(), 'genoffice-recovery-open-doc-'))
    store = createRecoveryStore({ userDataDir: () => root })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(docDir, { recursive: true, force: true })
  })

  const docAt = (name: string) => {
    const path = join(docDir, name)
    writeFileSync(path, 'saved')
    return path
  }

  it('opens the original without asking when there is no copy', async () => {
    const fake = fakeDialog(1)
    const result = await resolveRecoveryOnOpen({
      store,
      identity: { kind: 'markdown', filePath: docAt('a.md') },
      dialog: fake.dialog,
      lang: 'en',
    })
    expect(result).toEqual({ action: 'original' })
    expect(fake.showMessageBox).not.toHaveBeenCalled()
  })

  it('opens a restoreChosen copy without asking', async () => {
    const identity = { kind: 'hwp' as const, filePath: docAt('a.hwp') }
    await store.writeCopy(identity, Buffer.from('copy bytes'))
    store.applyLaunchDecision(identity, 'restore')
    const fake = fakeDialog(1)
    const result = await resolveRecoveryOnOpen({ store, identity, dialog: fake.dialog, lang: 'en' })
    expect(fake.showMessageBox).not.toHaveBeenCalled()
    expect(result.action).toBe('restore')
    expect(result.action === 'restore' && result.bytes.toString()).toBe('copy bytes')
    expect(store.copyInfo(identity)!.state).toBe('undecided')
  })

  it('asks for an undecided copy, naming the file, and restores on Esc', async () => {
    const identity = { kind: 'docs' as const, filePath: docAt('Plan.docx') }
    await store.writeCopy(identity, Buffer.from('copy'))
    const fake = fakeDialog(0)
    const result = await resolveRecoveryOnOpen({ store, identity, dialog: fake.dialog, lang: 'en' })
    expect(optionsOf(fake.showMessageBox).message).toContain('Plan.docx')
    expect(result.action).toBe('restore')
    expect(store.copyInfo(identity)).not.toBeNull()
  })

  it('asks for a later copy and deletes it on discard', async () => {
    const identity = { kind: 'pdf' as const, filePath: docAt('b.pdf') }
    await store.writeCopy(identity, Buffer.from('copy'))
    store.applyLaunchDecision(identity, 'later')
    const result = await resolveRecoveryOnOpen({
      store,
      identity,
      dialog: fakeDialog(1).dialog,
      lang: 'en',
    })
    expect(result).toEqual({ action: 'original' })
    expect(store.copyInfo(identity)).toBeNull()
  })

  it('tells the prompt when the file is newer than the copy', async () => {
    const path = docAt('c.html')
    const identity = { kind: 'html' as const, filePath: path }
    await store.writeCopy(identity, Buffer.from('copy'))
    const t = Date.now() / 1000
    utimesSync(store.copyPath(identity), t - 60, t - 60)
    utimesSync(path, t, t)
    const fake = fakeDialog(0)
    await resolveRecoveryOnOpen({ store, identity, dialog: fake.dialog, lang: 'en' })
    expect(optionsOf(fake.showMessageBox).detail).toContain(
      recoveryPromptLabels('en', 'c.html').fileChanged,
    )
  })

  it('uses the given document name over the file name', async () => {
    const identity = { kind: 'docs' as const, filePath: docAt('d.docx') }
    await store.writeCopy(identity, Buffer.from('copy'))
    const fake = fakeDialog(0)
    await resolveRecoveryOnOpen({
      store,
      identity,
      dialog: fake.dialog,
      lang: 'en',
      documentName: 'Shown name',
    })
    expect(optionsOf(fake.showMessageBox).message).toContain('Shown name')
  })
})
