/**
 * What a co-editing session switches off in the Word editor (collab-gate.ts):
 * a guest changes only the shared body, the host keeps everything but what
 * would replace the document under the others.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collabText } from '@genoffice/collab'
import { getLang } from '../src/renderer/i18n/locale'

const toast = vi.fn()
vi.mock('../src/renderer/components/toast-bus', () => ({
  showToast: (...args: unknown[]) => toast(...args),
  setToastEmitter: () => {},
}))

const { collabGuardActions, collabOff, isCollabGuest, refuseInCollab, setCollabGate } =
  await import('../src/renderer/collab-gate')

afterEach(() => {
  setCollabGate(null)
  toast.mockClear()
  vi.useRealTimers()
})

const FEATURES = [
  'comment',
  'note',
  'headerFooter',
  'pageSetup',
  'style',
  'listDefinition',
  'watermark',
  'ink',
  'theme',
  'protection',
  'toc',
  'citation',
  'compare',
  'ai',
  'aiRollback',
  'replaceDocument',
] as const

describe('the co-editing gate', () => {
  it('lets everything through outside a session', () => {
    for (const feature of FEATURES) expect(collabOff(feature)).toBeNull()
    expect(refuseInCollab('comment')).toBe(false)
    expect(isCollabGuest()).toBe(false)
    expect(toast).not.toHaveBeenCalled()
  })

  it('refuses a guest everything beside the shared body, and says why', () => {
    setCollabGate({ role: 'guest', othersIn: true })
    expect(isCollabGuest()).toBe(true)
    for (const feature of FEATURES) expect(collabOff(feature)).toBe('guestBlocked')
    expect(refuseInCollab('style')).toBe(true)
    expect(toast).toHaveBeenCalledWith(collabText(getLang(), 'guestBlocked'), 'error')
  })

  it('lets the host keep its own features but not replace the shared document', () => {
    setCollabGate({ role: 'host', othersIn: false })
    expect(collabOff('comment')).toBeNull()
    expect(collabOff('headerFooter')).toBeNull()
    // nobody else is in yet: a rollback only touches the host's own edits
    expect(collabOff('aiRollback')).toBeNull()
    expect(collabOff('replaceDocument')).toBe('guestBlocked')
    setCollabGate({ role: 'host', othersIn: true })
    expect(collabOff('aiRollback')).toBe('hostBlocked')
    expect(collabOff('replaceDocument')).toBe('hostBlocked')
    expect(collabOff('ai')).toBeNull()
  })

  it('does not repeat the same notice within a moment', () => {
    vi.useFakeTimers()
    // well past any notice an earlier test showed
    vi.setSystemTime(Date.now() + 60_000)
    setCollabGate({ role: 'guest', othersIn: true })
    refuseInCollab('ink')
    refuseInCollab('ink')
    expect(toast).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    refuseInCollab('ink')
    expect(toast).toHaveBeenCalledTimes(2)
  })

  it('guards the ribbon callbacks that touch what only the host may change', () => {
    const calls: string[] = []
    const actions = collabGuardActions({
      onSection: (_next: unknown) => calls.push('section'),
      onInkTool: (tool: string) => calls.push(`ink:${tool}`),
      onZoom: (_zoom: number) => calls.push('zoom'),
      onOpen: () => calls.push('open'),
    })
    setCollabGate({ role: 'guest', othersIn: true })
    expect(actions.onSection({})).toBeNull()
    actions.onInkTool('pen')
    actions.onInkTool('select')
    actions.onZoom(120)
    actions.onOpen()
    expect(calls).toEqual(['ink:select', 'zoom'])

    setCollabGate({ role: 'host', othersIn: true })
    actions.onSection({})
    actions.onInkTool('pen')
    actions.onOpen()
    expect(calls).toEqual(['ink:select', 'zoom', 'section', 'ink:pen'])
  })
})
