import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  recoveryEditor,
  recoveryEditors,
  registerRecoveryEditor,
  type RecoveryEditorContract,
} from '../src/recovery-contract'

function fakeEditor(kind: RecoveryEditorContract['kind']): RecoveryEditorContract {
  return {
    kind,
    writeCopiesNow: vi.fn(async () => {}),
    openFileWithDecision: vi.fn(),
    openUntitledCopy: vi.fn(),
    isUnprotectable: vi.fn(() => false),
  }
}

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

describe('recovery editor registry', () => {
  it('finds a registered editor by kind until it is unregistered', () => {
    const hwp = fakeEditor('hwp')
    const unregister = registerRecoveryEditor(hwp)
    expect(recoveryEditor('hwp')).toBe(hwp)
    expect(recoveryEditors()).toContain(hwp)
    unregister()
    expect(recoveryEditor('hwp')).toBeNull()
  })

  it('replaces an earlier registration of the same kind', () => {
    const first = fakeEditor('pdf')
    const second = fakeEditor('pdf')
    cleanups.push(registerRecoveryEditor(first))
    cleanups.push(registerRecoveryEditor(second))
    expect(recoveryEditor('pdf')).toBe(second)
    expect(recoveryEditors().filter((e) => e.kind === 'pdf')).toEqual([second])
  })

  it('an old unregister does not remove a newer registration', () => {
    const first = fakeEditor('html')
    const second = fakeEditor('html')
    const unregisterFirst = registerRecoveryEditor(first)
    cleanups.push(registerRecoveryEditor(second))
    unregisterFirst()
    expect(recoveryEditor('html')).toBe(second)
  })

  it('is shared by every bundled copy of the module', async () => {
    const docs = fakeEditor('docs')
    cleanups.push(registerRecoveryEditor(docs))
    vi.resetModules()
    const other = await import('../src/recovery-contract')
    expect(other.recoveryEditor('docs')).toBe(docs)
  })
})
