/**
 * Easy explanations in the result store (spec 6.2, 6.3): `easy/<lang>/`
 * beside `translations/<lang>/` with the same entries, and job records of
 * their own (`<kind>.<lang>.easy.json`, `mode: "easy"`). Leaving the mode
 * out reaches the plain translation exactly as before.
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documentJobs, runJobUnits } from '../src/jobs'
import {
  JOB_FILE,
  ResultStore,
  blockKeyString,
  jobModeAllowed,
  type TranslationBlockKey,
} from '../src/store'
import { sha256Hex } from '../src/tree'

const fp = (n: number) => sha256Hex(`page-${n}`)
const DOC_A = sha256Hex('doc-a')
const DOC_B = sha256Hex('doc-b')
const key = (n: number, text = `text ${n}`): TranslationBlockKey => ({
  pageFingerprint: fp(n),
  textHash: sha256Hex(text),
  occurrence: 0,
})

/** the job file pattern of the versions before easy explanations, verbatim */
const OLD_JOB_FILE =
  /^(?:ai-read|(translate|translate-page|highlight|summary)\.([A-Za-z0-9_-]{1,128}))\.json$/

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pdf-store-easy-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** every file below a folder, relative, with its bytes */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string, rel: string) => {
    if (!existsSync(d)) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(join(d, e.name), r)
      else out[r] = readFileSync(join(d, e.name), 'utf8')
    }
  }
  walk(dir, '')
  return out
}

async function writePlain(store: ResultStore, doc: string) {
  await store.writeTranslationMeta(doc, 'ko', { provider: 'codex', model: 'm1' })
  await store.writeTranslationBlocks(doc, 'ko', [
    { key: key(1), status: 'translated', text: '번역 하나' },
    { key: key(2), status: 'failed', reason: 'x' },
  ])
  await store.writeEditedTranslationBlock(doc, 'ko', key(3), '고친 번역')
  await store.writeJob(doc, { kind: 'translate', lang: 'ko', state: 'stopped' })
  await store.writeJob(doc, {
    kind: 'translate-page',
    lang: 'ko',
    state: 'complete',
    progress: { done: 2, total: 2 },
  })
}

async function writeEasy(store: ResultStore, doc: string, lang = 'ko') {
  await store.writeTranslationMeta(doc, lang, { provider: 'claude-code', model: 'e1' }, 'easy')
  await store.writeTranslationBlocks(
    doc,
    lang,
    [
      {
        key: key(1),
        status: 'translated',
        text: 'Easy one. Easy two.',
        sourceSentenceEnds: [6, 12],
        sentenceEnds: [9, 19],
      },
    ],
    'easy',
  )
  await store.writeEditedTranslationBlock(doc, lang, key(4), 'edited easy', 'easy')
  await store.writeJob(doc, { kind: 'translate', lang, state: 'stopped', mode: 'easy' })
  await store.writeJob(doc, { kind: 'translate-page', lang, state: 'running', mode: 'easy' })
}

describe('easy explanation results', () => {
  it('round-trip in easy/<lang>/ with the same layout and entries as a translation', async () => {
    const store = new ResultStore(root, { now: () => 5 })
    await writeEasy(store, DOC_A)
    const docDir = store.documentDir(DOC_A)
    expect(store.translationDir(DOC_A, 'ko', 'easy')).toBe(join(docDir, 'easy', 'ko'))
    expect(store.translationDir(DOC_A, 'ko')).toBe(join(docDir, 'translations', 'ko'))
    expect(Object.keys(snapshot(join(docDir, 'easy'))).sort()).toEqual(
      [
        'ko/translation.json',
        `ko/blocks/${fp(1)}/${key(1).textHash}.0.json`,
        `ko/blocks/${fp(4)}/${key(4).textHash}.0.json`,
      ].sort(),
    )
    expect(existsSync(join(docDir, 'translations'))).toBe(false)

    const easy = await store.readTranslation(DOC_A, 'ko', 'easy')
    expect(easy).not.toBeNull()
    expect(easy!.provider).toBe('claude-code')
    expect(easy!.model).toBe('e1')
    expect(easy!.blocks.get(blockKeyString(key(1)))).toMatchObject({
      status: 'translated',
      text: 'Easy one. Easy two.',
      sourceSentenceEnds: [6, 12],
      sentenceEnds: [9, 19],
    })
    expect(easy!.blocks.get(blockKeyString(key(4)))).toMatchObject({ edited: true })
    // the plain translation does not see it
    expect(await store.readTranslation(DOC_A, 'ko')).toBeNull()
  })

  it('never lists an easy language among the translations, and the other way round', async () => {
    const store = new ResultStore(root)
    await writePlain(store, DOC_A)
    await writeEasy(store, DOC_A, 'en')
    expect(await store.listTranslations(DOC_A)).toEqual(['ko'])
    expect(await store.listTranslations(DOC_A, 'translate')).toEqual(['ko'])
    expect(await store.listTranslations(DOC_A, 'easy')).toEqual(['en'])
    expect(await store.readTranslation(DOC_A, 'en')).toBeNull()
    expect(await store.readTranslation(DOC_A, 'ko', 'easy')).toBeNull()
  })

  it('leaves the names and bytes under translations/ as they are', async () => {
    const plainOnly = new ResultStore(join(root, 'one'), { now: () => 7 })
    const both = new ResultStore(join(root, 'two'), { now: () => 7 })
    await writePlain(plainOnly, DOC_A)
    await writePlain(both, DOC_A)
    await writeEasy(both, DOC_A)
    const plainDir = (s: ResultStore) => join(s.documentDir(DOC_A), 'translations')
    expect(snapshot(plainDir(both))).toEqual(snapshot(plainDir(plainOnly)))
    // and a plain block's entry is still the earlier shape
    const entry = JSON.parse(
      readFileSync(plainOnly.translationBlockPath(DOC_A, 'ko', key(1)), 'utf8'),
    ) as unknown
    expect(entry).toEqual({
      format: 1,
      key: key(1),
      status: 'translated',
      savedAt: 7,
      text: '번역 하나',
    })
  })

  it('reads an invalid mode as nothing and refuses to write one', async () => {
    const store = new ResultStore(root)
    await writeEasy(store, DOC_A)
    const bad = 'other' as unknown as 'easy'
    expect(await store.listTranslations(DOC_A, bad)).toEqual([])
    expect(await store.readTranslation(DOC_A, 'ko', bad)).toBeNull()
    expect(await store.countEditedTranslationBlocks(DOC_A, undefined, bad)).toBe(0)
    await expect(
      store.writeTranslationMeta(DOC_A, 'ko', { provider: 'p', model: 'm' }, bad),
    ).rejects.toThrow(TypeError)
  })

  it('deletes per mode: deleteTranslation and the restart that keeps the edits', async () => {
    const store = new ResultStore(root)
    await writePlain(store, DOC_A)
    await writeEasy(store, DOC_A)
    const plainBefore = snapshot(join(store.documentDir(DOC_A), 'translations'))

    expect(await store.deleteTranslationExceptEdited(DOC_A, 'ko', 'easy')).toBe(1)
    const kept = await store.readTranslation(DOC_A, 'ko', 'easy')
    expect([...kept!.blocks.keys()]).toEqual([blockKeyString(key(4))])
    expect(kept!.provider).toBe('claude-code')

    await store.deleteTranslation(DOC_A, 'ko', 'easy')
    expect(await store.listTranslations(DOC_A, 'easy')).toEqual([])
    expect(snapshot(join(store.documentDir(DOC_A), 'translations'))).toEqual(plainBefore)

    await writeEasy(store, DOC_A)
    await store.deleteTranslation(DOC_A, 'ko')
    expect(await store.listTranslations(DOC_A)).toEqual([])
    expect((await store.readTranslation(DOC_A, 'ko', 'easy'))!.blocks.size).toBe(2)
  })

  it('counts the edited easy blocks apart; deleting the document removes easy/ too', async () => {
    const store = new ResultStore(root)
    await writePlain(store, DOC_A)
    await writeEasy(store, DOC_A)
    await writeEasy(store, DOC_A, 'en')
    expect(await store.countEditedTranslationBlocks(DOC_A)).toBe(1)
    expect(await store.countEditedTranslationBlocks(DOC_A, undefined, 'easy')).toBe(2)
    expect(await store.countEditedTranslationBlocks(DOC_A, 'en', 'easy')).toBe(1)

    await store.deleteDocument(DOC_A)
    expect(existsSync(store.documentDir(DOC_A))).toBe(false)
    expect(await store.listTranslations(DOC_A, 'easy')).toEqual([])
    expect(await store.countEditedTranslationBlocks(DOC_A, undefined, 'easy')).toBe(0)
    expect(await store.listJobs(DOC_A)).toEqual([])
  })
})

describe('migrateDocument and easy explanations', () => {
  it('moves easy/ by page fingerprint, counted apart from the translations', async () => {
    let clock = 10
    const store = new ResultStore(root, { now: () => clock })
    await writePlain(store, DOC_A)
    await writeEasy(store, DOC_A)
    clock = 20
    const result = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_B,
      pageFingerprints: [fp(1), fp(4)],
    })
    expect(result).toEqual({
      aiReadPages: 0,
      translationBlocks: 1,
      languages: ['ko'],
      easyBlocks: 2,
      easyLanguages: ['ko'],
    })
    const moved = await store.readTranslation(DOC_B, 'ko', 'easy')
    expect([...moved!.blocks.keys()].sort()).toEqual(
      [blockKeyString(key(1)), blockKeyString(key(4))].sort(),
    )
    expect(moved!.provider).toBe('claude-code')
    expect(moved!.blocks.get(blockKeyString(key(1)))).toMatchObject({
      sourceSentenceEnds: [6, 12],
      sentenceEnds: [9, 19],
    })
    expect(moved!.blocks.get(blockKeyString(key(4)))).toMatchObject({ edited: true })
    // the plain translation moved only its own block of a surviving page
    expect([...(await store.readTranslation(DOC_B, 'ko'))!.blocks.keys()]).toEqual([
      blockKeyString(key(1)),
    ])
    // again: nothing newer to move
    const again = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_B,
      pageFingerprints: [fp(1), fp(4)],
    })
    expect(again).toEqual({ aiReadPages: 0, translationBlocks: 0, languages: [] })
  })

  it('moves only the kept block keys of easy/ with keepBlockKeys', async () => {
    const store = new ResultStore(root)
    await writeEasy(store, DOC_A)
    const result = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_B,
      pageFingerprints: [fp(1), fp(4)],
      keepBlockKeys: [key(4)],
    })
    expect(result).toEqual({
      aiReadPages: 0,
      translationBlocks: 0,
      languages: [],
      easyBlocks: 1,
      easyLanguages: ['ko'],
    })
    expect([...(await store.readTranslation(DOC_B, 'ko', 'easy'))!.blocks.keys()]).toEqual([
      blockKeyString(key(4)),
    ])
  })

  it('answers exactly as before when there is no easy explanation', async () => {
    const store = new ResultStore(root)
    await writePlain(store, DOC_A)
    const result = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_B,
      pageFingerprints: [fp(1)],
    })
    expect(result).toEqual({ aiReadPages: 0, translationBlocks: 1, languages: ['ko'] })
    expect(existsSync(join(store.documentDir(DOC_B), 'easy'))).toBe(false)
  })
})

describe('easy explanation job records', () => {
  it('have a file name of their own that the earlier pattern does not read', () => {
    const store = new ResultStore(root)
    const name = (p: string) => p.split(/[\\/]/).at(-1)!
    const easy = name(store.jobPath(DOC_A, 'translate', 'ko', 'easy'))
    const easyPage = name(store.jobPath(DOC_A, 'translate-page', 'ko', 'easy'))
    expect(easy).toBe('translate.ko.easy.json')
    expect(easyPage).toBe('translate-page.ko.easy.json')
    expect(name(store.jobPath(DOC_A, 'translate', 'ko'))).toBe('translate.ko.json')
    expect(name(store.jobPath(DOC_A, 'translate', 'ko', 'translate'))).toBe('translate.ko.json')
    for (const n of [easy, easyPage]) {
      expect(OLD_JOB_FILE.test(n)).toBe(false)
      expect(JOB_FILE.test(n)).toBe(true)
    }
    // every name the earlier pattern took is still taken, with the same groups
    for (const n of ['ai-read.json', 'translate.ko.json', 'translate-page.ko.json']) {
      expect(OLD_JOB_FILE.exec(n)?.slice(1, 3)).toEqual(JOB_FILE.exec(n)?.slice(1, 3))
    }
    expect(JOB_FILE.test(`highlight.${'r'.repeat(40)}.easy.json`)).toBe(false)
    expect(JOB_FILE.test('summary.en.easy.json')).toBe(false)
    expect(JOB_FILE.test('ai-read.easy.json')).toBe(false)
  })

  it('exist only for translate and translate-page', async () => {
    const store = new ResultStore(root)
    expect(jobModeAllowed('translate', 'easy')).toBe(true)
    expect(jobModeAllowed('translate-page', 'easy')).toBe(true)
    expect(jobModeAllowed('summary', 'easy')).toBe(false)
    expect(() => store.jobPath(DOC_A, 'summary', 'en', 'easy')).toThrow(TypeError)
    await expect(
      store.writeJob(DOC_A, { kind: 'ai-read', state: 'running', mode: 'easy' }),
    ).rejects.toThrow(TypeError)
    await expect(
      store.writeJob(DOC_A, {
        kind: 'highlight',
        runId: 'r'.repeat(40),
        state: 'running',
        mode: 'easy',
      }),
    ).rejects.toThrow(TypeError)
    expect((await store.readJob(DOC_A, 'summary', 'en', 'easy')).state).toBe('idle')
  })

  it('write mode "easy", read, heartbeat and list with their mode, apart from the plain ones', async () => {
    let clock = 1_000
    const store = new ResultStore(root, { now: () => clock })
    await store.writeJob(DOC_A, {
      kind: 'translate',
      lang: 'ko',
      state: 'running',
      mode: 'easy',
      progress: { done: 1, total: 3 },
    })
    const raw = JSON.parse(
      readFileSync(store.jobPath(DOC_A, 'translate', 'ko', 'easy'), 'utf8'),
    ) as Record<string, unknown>
    expect(raw).toEqual({
      format: 1,
      kind: 'translate',
      state: 'running',
      outputs: [],
      updatedAt: 1_000,
      lang: 'ko',
      mode: 'easy',
      progress: { done: 1, total: 3 },
    })
    expect(await store.readJob(DOC_A, 'translate', 'ko')).toEqual({
      kind: 'translate',
      lang: 'ko',
      state: 'idle',
      outputs: [],
    })
    expect(await store.readJob(DOC_A, 'translate', 'ko', 'easy')).toMatchObject({
      kind: 'translate',
      lang: 'ko',
      mode: 'easy',
      state: 'running',
      updatedAt: 1_000,
    })
    expect((await store.readJob(DOC_A, 'translate-page', 'ko', 'easy')).mode).toBe('easy')

    clock = 2_000
    expect(await store.heartbeatJob(DOC_A, 'translate', 'ko')).toBe(false)
    expect(await store.heartbeatJob(DOC_A, 'translate', 'ko', 'easy')).toBe(true)
    const beat = await store.readJob(DOC_A, 'translate', 'ko', 'easy')
    expect(beat).toMatchObject({ updatedAt: 2_000, mode: 'easy', progress: { done: 1, total: 3 } })

    await store.writeJob(DOC_A, { kind: 'translate', lang: 'ko', state: 'stopped' })
    const listed = await store.listJobs(DOC_A)
    expect(listed).toHaveLength(2)
    const easy = listed.find((j) => j.mode === 'easy')!
    const plain = listed.find((j) => j.mode === undefined)!
    expect(easy).toMatchObject({ kind: 'translate', lang: 'ko', state: 'running' })
    expect(plain).toMatchObject({ kind: 'translate', lang: 'ko', state: 'stopped' })
    expect('mode' in plain).toBe(false)
    // the resume offer sees both, each by its mode
    expect((await store.unfinishedJobs(DOC_A)).map((j) => j.mode ?? 'translate').sort()).toEqual([
      'easy',
      'translate',
    ])
  })

  it('does not read a record whose mode does not match its file', async () => {
    const store = new ResultStore(root)
    await store.writeJob(DOC_A, { kind: 'translate', lang: 'ko', state: 'stopped', mode: 'easy' })
    // the easy record copied under the plain name is not a plain record
    copyFileSync(
      store.jobPath(DOC_A, 'translate', 'ko', 'easy'),
      store.jobPath(DOC_A, 'translate', 'en'),
    )
    expect((await store.readJob(DOC_A, 'translate', 'en')).state).toBe('idle')
    expect((await store.listJobs(DOC_A)).map((j) => [j.lang, j.mode])).toEqual([['ko', 'easy']])
  })

  it('leaves a plain record byte for byte as before', async () => {
    const before = new ResultStore(join(root, 'one'), { now: () => 42 })
    const after = new ResultStore(join(root, 'two'), { now: () => 42 })
    const plain = {
      kind: 'translate' as const,
      lang: 'ko',
      state: 'stopped' as const,
      last_error: 'rate-limit',
      resetsAt: 99,
      outputs: ['a.md'],
      progress: { done: 2, total: 5 },
    }
    await before.writeJob(DOC_A, plain)
    await after.writeJob(DOC_A, { ...plain, mode: 'translate' })
    await after.writeJob(DOC_A, { ...plain, mode: 'easy' })
    const bytes = (s: ResultStore) => readFileSync(s.jobPath(DOC_A, 'translate', 'ko'), 'utf8')
    expect(bytes(after)).toBe(bytes(before))
    expect(bytes(before)).toBe(
      '{"format":1,"kind":"translate","state":"stopped","outputs":["a.md"],"updatedAt":42,' +
        '"lang":"ko","last_error":"rate-limit","resetsAt":99,"progress":{"done":2,"total":5}}',
    )
    expect(snapshot(join(after.documentDir(DOC_A), 'jobs'))['translate.ko.json']).toBe(
      bytes(before),
    )
  })

  it('an easy job holds the document like any other: one job per document', () => {
    const lease = documentJobs.acquire(
      {
        docHash: DOC_A,
        kind: 'translate',
        lang: 'ko',
        mode: 'easy',
        progress: { done: 0, total: 1 },
      },
      () => {},
    )
    try {
      expect(documentJobs.running(DOC_A)).toMatchObject({ kind: 'translate', mode: 'easy' })
      expect(() =>
        documentJobs.acquire(
          { docHash: DOC_A, kind: 'translate', lang: 'ko', progress: { done: 0, total: 1 } },
          () => {},
        ),
      ).toThrow(/already running/)
    } finally {
      lease.release()
    }
    const plain = documentJobs.acquire(
      { docHash: DOC_A, kind: 'translate', lang: 'ko', progress: { done: 0, total: 1 } },
      () => {},
    )
    expect(documentJobs.running(DOC_A)).not.toHaveProperty('mode')
    plain.release()
  })

  it('a running easy record is what another process sees as the document’s job', async () => {
    const store = new ResultStore(root)
    await store.writeJob(DOC_A, { kind: 'translate', lang: 'ko', state: 'running', mode: 'easy' })
    const running = (await store.listJobs(DOC_A)).find((j) => j.state === 'running')
    expect(running).toMatchObject({ kind: 'translate', lang: 'ko', mode: 'easy' })
  })
})

describe('the job engine records an easy job apart', () => {
  it('writes only the easy record, with its mode, from start to end', async () => {
    const store = new ResultStore(root)
    const summary = await runJobUnits({
      docHash: DOC_A,
      kind: 'translate',
      lang: 'ko',
      mode: 'easy',
      store,
      units: [1, 2],
      callModel: async (u) => u,
      persist: async () => {},
    })
    expect(summary.state).toBe('complete')
    expect(await store.readJob(DOC_A, 'translate', 'ko', 'easy')).toMatchObject({
      mode: 'easy',
      state: 'complete',
      progress: { done: 2, total: 2 },
    })
    expect((await store.readJob(DOC_A, 'translate', 'ko')).state).toBe('idle')
    expect(Object.keys(snapshot(join(store.documentDir(DOC_A), 'jobs')))).toEqual([
      'translate.ko.easy.json',
    ])
  })

  it('writes the plain record as before without a mode', async () => {
    const store = new ResultStore(root)
    await runJobUnits({
      docHash: DOC_A,
      kind: 'translate',
      lang: 'ko',
      store,
      units: [1],
      callModel: async (u) => u,
      persist: async () => {},
    })
    const raw = JSON.parse(readFileSync(store.jobPath(DOC_A, 'translate', 'ko'), 'utf8')) as Record<
      string,
      unknown
    >
    expect('mode' in raw).toBe(false)
    expect(Object.keys(snapshot(join(store.documentDir(DOC_A), 'jobs')))).toEqual([
      'translate.ko.json',
    ])
  })
})
