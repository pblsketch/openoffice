import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  appendSaveFailure,
  describeReopenFailure,
  reopenFailureNote,
  scrubDetail,
  sessionSourceFormat,
} from '../src/main/save-failure-log'

/**
 * Why a save could not be opened back: the record that lets a report of
 * "the saved result could not be reopened" be told apart from the next one.
 */

describe('describeReopenFailure', () => {
  it('names the engine refusal and keeps the broken part', () => {
    const failure = describeReopenFailure(
      new Error('Invalid XML in xl/styles.xml: ill-formed document: expected `</fonts>`'),
    )
    expect(failure).toEqual({
      kind: 'unreadable',
      detail: 'Invalid XML in xl/styles.xml: ill-formed document: expected `</fonts>`',
    })
    expect(reopenFailureNote(failure)).toBe(
      '[unreadable: Invalid XML in xl/styles.xml: ill-formed document: expected `</fonts>`]',
    )
  })

  it('lists where the reply did not match, never the value found there', () => {
    const schema = z.object({
      sheets: z.array(z.object({ name: z.string(), hidden: z.boolean() })),
    })
    const parsed = schema.safeParse({ sheets: [{ name: 7, hidden: 'secret-value' }] })
    expect(parsed.success).toBe(false)
    const failure = describeReopenFailure(parsed.error)
    expect(failure.kind).toBe('reply-shape')
    expect(failure.detail).toBe('sheets.0.name invalid_type; sheets.0.hidden invalid_type')
    expect(failure.detail).not.toContain('secret-value')
  })

  it('tells a timeout and a sidecar that ended from a refusal', () => {
    expect(describeReopenFailure(new Error('XLSX sidecar request timed out.'))).toEqual({
      kind: 'timeout',
      detail: '',
    })
    expect(reopenFailureNote({ kind: 'timeout', detail: '' })).toBe('[timeout]')
    expect(
      describeReopenFailure(new Error('XLSX sidecar exited with code 3 and signal null.')).kind,
    ).toBe('sidecar-ended')
    expect(describeReopenFailure(new Error('XLSX sidecar stopped.')).kind).toBe('sidecar-ended')
  })
})

describe('scrubDetail', () => {
  it('replaces Windows, UNC and POSIX paths but not part names or end tags', () => {
    expect(
      scrubDetail(
        'open C:\\Users\\kim\\AppData\\Local\\Temp\\s\\a.xlsx, \\\\nas\\share\\b.xlsx and /home/kim/c.xlsx failed in xl/worksheets/sheet1.xml at </row>',
      ),
    ).toBe('open <path>, <path> and <path> failed in xl/worksheets/sheet1.xml at </row>')
  })

  it('keeps one line and caps the length', () => {
    expect(scrubDetail('a\n  b\r\nc')).toBe('a b c')
    const long = scrubDetail('x'.repeat(1000))
    expect(long.length).toBe(240)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('sessionSourceFormat', () => {
  it('tells the formats a session can come from', () => {
    expect(sessionSourceFormat({ path: 'D:/a/book.XLSX' })).toBe('xlsx')
    expect(sessionSourceFormat({ path: 'D:/a/macro.xlsm' })).toBe('xlsm')
    expect(sessionSourceFormat({ path: 't/copy.xlsx', csvSourcePath: 'D:/a/data.csv' })).toBe('csv')
    expect(sessionSourceFormat({ path: 't/new.xlsx', unsavedNew: true })).toBe('new')
    expect(
      sessionSourceFormat({
        path: 't/copy.xlsx',
        suggestSaveAs: 'D:/a/old.xlsx',
        importTempDir: 't',
      }),
    ).toBe('converted')
    expect(sessionSourceFormat({ path: 'D:/a/locked.xlsx', password: 'pw' })).toBe('xlsx+encrypted')
  })
})

describe('appendSaveFailure', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'genoffice-save-failure-log-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes one JSON line per failure', () => {
    const file = join(dir, 'sheets-save-failures.jsonl')
    appendSaveFailure(
      file,
      {
        failure: { kind: 'unreadable', detail: 'Workbook is missing xl/styles.xml.' },
        sourceFormat: 'xlsx',
        stagedBytes: 1234,
        appVersion: '0.12.8',
      },
      new Date('2026-10-28T08:00:00Z'),
    )
    expect(JSON.parse(readFileSync(file, 'utf8').trim())).toEqual({
      time: '2026-10-28T08:00:00.000Z',
      app: '0.12.8',
      source: 'xlsx',
      bytes: 1234,
      kind: 'unreadable',
      detail: 'Workbook is missing xl/styles.xml.',
    })
  })

  it('drops the older half past the size cap and keeps whole lines', () => {
    const file = join(dir, 'sheets-save-failures.jsonl')
    for (let i = 0; i < 40; i += 1) {
      appendSaveFailure(
        file,
        {
          failure: { kind: 'unreadable', detail: `failure ${i}` },
          sourceFormat: 'xlsx',
          stagedBytes: i,
          appVersion: '0',
        },
        new Date(),
        2048,
      )
    }
    expect(statSync(file).size).toBeLessThanOrEqual(2048)
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow()
    expect(lines.at(-1)).toContain('failure 39')
  })

  it('never throws when the folder cannot be written', () => {
    expect(() =>
      appendSaveFailure(join(dir, 'missing', 'deeper', 'log.jsonl'), {
        failure: { kind: 'timeout', detail: '' },
        sourceFormat: 'xlsx',
        stagedBytes: null,
        appVersion: '0',
      }),
    ).not.toThrow()
  })
})
