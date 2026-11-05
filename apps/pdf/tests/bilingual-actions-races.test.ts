/**
 * Side-by-side translation view, the actions controller against a save that
 * lands while a write is in flight (reading-assist spec 3.5, 4.5): an edit or
 * a "translate again" stored under the hash the press started on is carried
 * to the saved file's new hash afterwards, and an editor left open across the
 * save follows the new hash with the text typed so far.
 *
 * The one-off translation call is replaced by a fake (`retranslateBlock`), and
 * the store is a fake: no provider, no subscription program and no network.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from '@genoffice/i18n'
import { normalizeAiSettings } from '@genoffice/ai-provider/browser'
import { DocumentJobRegistry } from '../../../packages/pdf-structure/src/jobs'
import type { TranslationBlockKey } from '../../../packages/pdf-structure/src/store/keys'
import { strings } from '../src/renderer/i18n/strings'
import type { TFunc } from '../src/renderer/i18n/locale'
import { DocumentJobSession } from '../src/renderer/doc-jobs/job-session'
import type { DocumentJobRoute } from '../src/renderer/doc-jobs/route'
import type { BilingualUnit } from '../src/renderer/bilingual/model'
import type { BilingualData } from '../src/renderer/bilingual/useBilingualData'

const retranslate = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('../src/renderer/bilingual/retranslate', () => ({
  retranslateBlock: retranslate.fn,
}))

import {
  BilingualActionsController,
  type BilingualStoreApi,
} from '../src/renderer/bilingual/actions-controller'

const translate = createI18n(strings)
const t: TFunc = (key, params) => translate('en', key, params)

const OLD = 'a'.repeat(64)
const NEW = 'b'.repeat(64)
const PATH = 'C:\\docs\\paper.pdf'

const KEY: TranslationBlockKey = {
  pageFingerprint: 'fp1',
  textHash: 'h1',
  occurrence: 0,
} as unknown as TranslationBlockKey

const unit: BilingualUnit = {
  unitKey: 'p1.0',
  key: KEY,
  keyString: 'fp1/h1/0',
  page: 1,
  source: [{ kind: 'text', text: 'Hello.' }],
  state: 'translated',
  runs: [{ kind: 'text', text: '안녕.' }],
  edited: false,
  sourceHasMarks: false,
}

const ROUTE: DocumentJobRoute = {
  state: 'ready',
  provider: 'claude-code',
  model: '',
  metered: false,
  paid: false,
  settings: normalizeAiSettings({}),
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function setup() {
  /** the hash of the file on disk: a save changes it */
  let onDisk = OLD
  const calls: string[] = []
  const store = {
    write: vi.fn(async () => ({ ok: true as const })),
    docHash: vi.fn(async () => ({ ok: true as const, docHash: onDisk })),
    migrate: vi.fn(async (input: { oldDocHash: string }) => {
      calls.push(`migrate:${input.oldDocHash}`)
      return { ok: true as const, docHash: onDisk }
    }),
    unfinishedJobs: vi.fn(async () => ({ ok: true as const, jobs: [] })),
    translation: vi.fn(),
    aiReadPages: vi.fn(),
  }
  const session = new DocumentJobSession(new DocumentJobRegistry())
  const ctl = new BilingualActionsController({
    session,
    store: store as unknown as BilingualStoreApi,
    lang: 'en',
    t,
    filePath: PATH,
    password: undefined,
  })
  ctl.bindHost({ route: () => ROUTE, admit: () => true })
  const refresh = vi.fn(() => calls.push('refresh'))
  const dataOf = (docHash: string | null): BilingualData =>
    ({
      load: docHash ? { kind: 'ready' } : { kind: 'loading', done: 0, total: 0 },
      docHash,
      tree: null,
      lang: docHash ? 'ko' : null,
      mode: 'translate',
      storedLangs: [],
      setLang: () => {},
      model: null,
      refresh,
    }) as BilingualData
  ctl.setData(dataOf(OLD))
  return {
    ctl,
    store,
    calls,
    refresh,
    dataOf,
    save: () => {
      onDisk = NEW
    },
  }
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  retranslate.fn.mockReset()
})

describe('a save during an edit write', () => {
  it('carries the stored edit to the new hash, then reads it again', async () => {
    const s = setup()
    const write = deferred<{ ok: true }>()
    s.store.write.mockImplementationOnce(() => write.promise)
    s.ctl.openEditor(OLD, 'ko', unit)
    const saving = s.ctl.saveEdit('사람이 고침')
    // the window lost focus: the autosave changed the file while the write runs
    s.save()
    write.resolve({ ok: true })
    await saving
    await flush()
    expect(s.store.write).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'editedTranslationBlock', docHash: OLD }),
    )
    expect(s.store.migrate).toHaveBeenCalledWith(
      expect.objectContaining({ path: PATH, oldDocHash: OLD }),
    )
    // read again only after the carry, so the column shows the edit under the new hash
    expect(s.calls).toEqual([`migrate:${OLD}`, 'refresh'])
    expect(s.ctl.snapshot().editing).toBeNull()
  })

  it('does not carry when the file did not change', async () => {
    const s = setup()
    s.ctl.openEditor(OLD, 'ko', unit)
    await s.ctl.saveEdit('사람이 고침')
    await flush()
    expect(s.store.migrate).not.toHaveBeenCalled()
    expect(s.refresh).toHaveBeenCalledTimes(1)
  })

  it('a failed write keeps the editor on the hash the view moved to', async () => {
    const s = setup()
    const write = deferred<{ ok: false; error: string }>()
    s.store.write.mockImplementationOnce(() => write.promise as never)
    s.ctl.openEditor(OLD, 'ko', unit)
    const saving = s.ctl.saveEdit('사람이 고침')
    s.ctl.setData(s.dataOf(NEW))
    write.resolve({ ok: false, error: 'x' })
    await saving
    const e = s.ctl.snapshot().editing
    expect(e?.docHash).toBe(NEW)
    expect(e?.saving).toBe(false)
    expect(e?.error).toBe(t('blEditSaveFailed'))
  })
})

describe('a save during "translate again"', () => {
  it('carries the new translation to the new hash, then reads it again', async () => {
    const s = setup()
    const call = deferred<{ ok: true; text: string }>()
    retranslate.fn.mockImplementationOnce(() => call.promise)
    s.ctl.pressRetranslate(OLD, 'ko', unit)
    await flush()
    expect(retranslate.fn).toHaveBeenCalledWith(expect.objectContaining({ docHash: OLD }))
    s.save()
    call.resolve({ ok: true, text: '[ko] Hello.' })
    await flush()
    expect(s.store.migrate).toHaveBeenCalledWith(
      expect.objectContaining({ path: PATH, oldDocHash: OLD }),
    )
    expect(s.calls).toEqual([`migrate:${OLD}`, 'refresh'])
    expect(s.ctl.snapshot().retranslating).toBeNull()
  })
})

describe('an editor open across a save', () => {
  it('follows the new hash and keeps the text typed so far', () => {
    const s = setup()
    s.ctl.openEditor(OLD, 'ko', unit)
    s.ctl.setDraft('반쯤 고친 글')
    // the tree is rebuilt: no hash while it loads, then the saved file's
    s.ctl.setData(s.dataOf(null))
    expect(s.ctl.snapshot().editing?.docHash).toBe(OLD)
    s.ctl.setData(s.dataOf(NEW))
    const e = s.ctl.snapshot().editing
    expect(e?.docHash).toBe(NEW)
    expect(e?.keyString).toBe(unit.keyString)
    expect(e?.initial).toBe('반쯤 고친 글')
  })

  it('a save of the re-keyed editor writes under the new hash', async () => {
    const s = setup()
    s.ctl.openEditor(OLD, 'ko', unit)
    s.save()
    s.ctl.setData(s.dataOf(NEW))
    await s.ctl.saveEdit('고친 글')
    expect(s.store.write).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'editedTranslationBlock', docHash: NEW, text: '고친 글' }),
    )
    expect(s.store.migrate).not.toHaveBeenCalled()
  })
})
