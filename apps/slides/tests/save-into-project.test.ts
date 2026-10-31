import { afterEach, describe, expect, it, vi } from 'vitest'

// file-actions pulls export-render → pptx-render → konva → native `canvas`
// (missing in CI): mock the UI-only modules, as save-serialization does.
vi.mock('../src/renderer/export-render', () => ({ renderSlidesToPngBase64: vi.fn() }))
vi.mock('../src/renderer/components/toast-bus', () => ({ showToast: vi.fn() }))
vi.mock('../src/renderer/i18n/locale', () => ({ t: (k: string) => k, getLang: () => 'ko' }))

import { saveIntoProject } from '../src/renderer/file-actions'
import { showToast } from '../src/renderer/components/toast-bus'
import type { ActionCtx } from '../src/renderer/action-context'

/**
 * Project folders (spec 6), renderer side: after a handed-over run ended
 * well, an untitled deck asks main to save it into the panel's project and
 * then becomes that file (path, title, clean state). Without a project
 * nothing changes; a refused write keeps it untitled and says why.
 */
function ctx(path: string | null) {
  const calls = {
    setPath: vi.fn(),
    setDirty: vi.fn(),
    setStatus: vi.fn(),
    setSlides: vi.fn(),
  }
  const context = {
    flushActiveEditRef: { current: () => Promise.resolve() },
    editingActiveRef: { current: false },
    flushNotes: () => Promise.resolve(),
    slides: [],
    current: 0,
    setSlides: calls.setSlides,
    setSelectedIds: () => {},
    setEnteredGroupId: () => {},
    setEditing: () => {},
    setEditingCell: () => {},
    setDirty: calls.setDirty,
    setPath: calls.setPath,
    setStatus: calls.setStatus,
    path,
  } as unknown as ActionCtx
  return { context, calls }
}

function stubApi(answer: unknown) {
  const call = vi.fn(async () => answer)
  vi.stubGlobal('window', { slidesApi: { saveIntoProject: call } })
  return call
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(showToast).mockClear()
})

describe('saveIntoProject (slides renderer)', () => {
  it('adopts the saved path and clears the unsaved state', async () => {
    const call = stubApi({ ok: true, path: 'D:/Project/Deck.pptx', slides: [] })
    const { context, calls } = ctx(null)
    expect(await saveIntoProject(() => context)).toBe(true)
    expect(call).toHaveBeenCalledTimes(1)
    // the renderer sends nothing that names a place
    expect(call).toHaveBeenCalledWith()
    expect(calls.setPath).toHaveBeenCalledWith('D:/Project/Deck.pptx')
    expect(calls.setDirty).toHaveBeenCalledWith(false)
    expect(calls.setSlides).toHaveBeenCalledWith([])
  })

  it('without a project keeps the deck as it is and says nothing', async () => {
    stubApi({ ok: false, skipped: true })
    const { context, calls } = ctx(null)
    expect(await saveIntoProject(() => context)).toBe(false)
    expect(calls.setPath).not.toHaveBeenCalled()
    expect(calls.setDirty).not.toHaveBeenCalled()
    expect(calls.setStatus).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('a refused write keeps the deck untitled and shows the reason', async () => {
    stubApi({ ok: false, error: 'missing-folder' })
    const { context, calls } = ctx(null)
    expect(await saveIntoProject(() => context)).toBe(false)
    expect(calls.setPath).not.toHaveBeenCalled()
    const shown = calls.setStatus.mock.calls[0]![0] as string
    expect(shown).toContain('missing-folder')
    expect(shown).toContain('프로젝트 폴더')
    expect(showToast).toHaveBeenCalledWith(shown, 'error')
  })

  it('does not ask for a deck that already has a file', async () => {
    const call = stubApi({ ok: true, path: 'x' })
    const { context } = ctx('D:/Other/deck.pptx')
    expect(await saveIntoProject(() => context)).toBe(false)
    expect(call).not.toHaveBeenCalled()
  })
})
