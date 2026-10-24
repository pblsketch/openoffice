import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  allowsAutomaticWorkbookRecovery,
  convertedSessionRecovery,
  MAX_AUTOMATIC_RECOVERY_WORKSHEET_XML_BYTES,
  saveAsDefaultFor,
  sessionRecoveryIdentity,
} from '../src/main/recovery-policy'

describe('automatic workbook recovery policy', () => {
  it('allows normal workbooks and older sidecar metadata', () => {
    expect(allowsAutomaticWorkbookRecovery([{ sourceXmlBytes: 8 * 1024 * 1024 }])).toBe(true)
    expect(allowsAutomaticWorkbookRecovery([{}])).toBe(true)
  })

  it('disables background rewriting when any worksheet XML entry is oversized', () => {
    expect(
      allowsAutomaticWorkbookRecovery([
        { sourceXmlBytes: 4 * 1024 * 1024 },
        { sourceXmlBytes: MAX_AUTOMATIC_RECOVERY_WORKSHEET_XML_BYTES + 1 },
      ]),
    ).toBe(false)
  })

  it('accepts an entry at the memory-safe limit', () => {
    expect(
      allowsAutomaticWorkbookRecovery([
        { sourceXmlBytes: MAX_AUTOMATIC_RECOVERY_WORKSHEET_XML_BYTES },
      ]),
    ).toBe(true)
  })
})

describe('CSV and converted sessions', () => {
  it('get an untitled .xlsx copy that remembers the file they came from', () => {
    const csv = convertedSessionRecovery({ csvSourcePath: '/data/a.csv' }, '/data/a.csv')
    expect(csv?.recoveryIdentity).toMatchObject({ kind: 'sheets', ext: '.xlsx' })
    expect(csv?.recoveryOriginalPath).toBe('/data/a.csv')
    const xls = convertedSessionRecovery({ suggestSaveAs: '/data/b.xlsx' }, '/data/b.xls')
    expect(xls?.recoveryOriginalPath).toBe('/data/b.xls')
    expect(xls?.recoveryIdentity.untitledId).not.toBe(csv?.recoveryIdentity.untitledId)
  })

  it('leave every other session to its own rules', () => {
    expect(convertedSessionRecovery({}, '/data/c.xlsx')).toBeNull()
    expect(
      convertedSessionRecovery({ suggestSaveAs: '/data/d.xlsx', password: 'pw' }, '/data/d.xls'),
    ).toBeNull()
    expect(
      convertedSessionRecovery({ suggestSaveAs: '/x/New.xlsx', unsavedNew: true }, '/tmp/New.xlsx'),
    ).toBeNull()
    expect(
      convertedSessionRecovery(
        {
          csvSourcePath: '/data/e.csv',
          recoveryIdentity: { kind: 'sheets', untitledId: 'kept', ext: '.xlsx' },
        },
        '/data/e.csv',
      ),
    ).toBeNull()
  })

  it('a session with that copy writes it, unless the workbook is password protected', () => {
    const recovery = convertedSessionRecovery({ csvSourcePath: '/data/a.csv' }, '/data/a.csv')!
    const session = {
      path: '/tmp/a.xlsx',
      csvSourcePath: '/data/a.csv',
      recoveryIdentity: recovery.recoveryIdentity,
    }
    expect(sessionRecoveryIdentity(session)).toBe(recovery.recoveryIdentity)
    expect(sessionRecoveryIdentity({ ...session, password: 'pw' })).toBeNull()
    // a merge source (no identity given) still has none
    expect(
      sessionRecoveryIdentity({ path: '/tmp/a.xlsx', csvSourcePath: '/data/a.csv' }),
    ).toBeNull()
  })

  it("first Save As offers the original's folder and name, as .xlsx unless it is a workbook", () => {
    expect(saveAsDefaultFor(join('dir', 'a.csv'))).toBe(join('dir', 'a.xlsx'))
    expect(saveAsDefaultFor(join('dir', 'b.tsv'))).toBe(join('dir', 'b.xlsx'))
    expect(saveAsDefaultFor(join('dir', 'c.xls'))).toBe(join('dir', 'c.xlsx'))
    expect(saveAsDefaultFor(join('dir', 'd.xlsx'))).toBe(join('dir', 'd.xlsx'))
    expect(saveAsDefaultFor(join('dir', 'e.XLSM'))).toBe(join('dir', 'e.XLSM'))
    expect(saveAsDefaultFor(join('dir.v2', 'noext'))).toBe(join('dir.v2', 'noext.xlsx'))
  })
})
