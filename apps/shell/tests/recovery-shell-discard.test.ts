import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * discardEditorRecovery (src/main/recovery-shell.ts): when MCP / AI closes a
 * tab without saving, each editor's own "Don't Save" removes the tab's
 * recovery copy — otherwise the copy stays "undecided" and the next launch
 * is judged abnormal. The editor mains are fakes that record the call.
 */

const discardDocsRecovery = vi.fn()
const discardSheetsRecovery = vi.fn()
const discardMindmapRecovery = vi.fn()
const hwpDiscardRecoveryCopy = vi.fn()

vi.mock('electron', () => ({ app: { getPath: () => '' } }))

vi.mock('@genoffice/electron-utils', () => ({
  createRecoveryStore: () => ({}),
  isUntitledIdentity: () => false,
  recoveryEditor: () => null,
}))

vi.mock('../../docs/src/main/docs-main', () => ({
  discardDocsRecovery: (...args: unknown[]) => discardDocsRecovery(...args),
  docsRecoveryIdentity: () => null,
}))

vi.mock('../../sheets/src/main/sheets-main', () => ({
  createSheetsView: () => ({}),
  discardSheetsRecovery: (...args: unknown[]) => discardSheetsRecovery(...args),
  migrateSheetsLegacyRecovery: () => {},
  sheetsRecoveryIdentity: () => null,
}))

vi.mock('../../pdf/src/main/pdf-main', () => ({
  createPdfView: () => ({}),
  pdfRecoveryIdentity: () => null,
}))

vi.mock('../../slides/src/main/slides-main', () => ({ slidesRecoveryIdentity: () => null }))

vi.mock('../../markdown/src/main/markdown-main', () => ({
  markdownRecoveryIdentity: () => null,
  setMarkdownRecoveryTitleSource: () => {},
}))

vi.mock('../../html/src/main/html-main', () => ({
  htmlRecoveryIdentity: () => null,
  setHtmlRecoveryTitleSource: () => {},
}))

vi.mock('../../mindmap/src/main/mindmap-main', () => ({
  discardMindmapRecovery: (...args: unknown[]) => discardMindmapRecovery(...args),
  mindmapRecoveryIdentity: () => null,
  setMindmapRecoveryTitleHook: () => {},
}))

vi.mock('../../hwp/src/main/hwp-main', () => ({
  hwpDiscardRecoveryCopy: (...args: unknown[]) => hwpDiscardRecoveryCopy(...args),
  hwpRecoveryIdentity: () => null,
  setHwpRecoveryTitle: () => {},
}))

vi.mock('../src/main/tab-manager', () => ({ createPlainEditorView: () => ({}) }))

const { discardEditorRecovery } = await import('../src/main/recovery-shell')

function contents(destroyed = false): { id: number; isDestroyed(): boolean } {
  return { id: 7, isDestroyed: () => destroyed }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('discardEditorRecovery', () => {
  it("runs the Excel editor's own Don't Save for a sheets tab", () => {
    const tab = contents()

    discardEditorRecovery('sheets', tab as never)

    expect(discardSheetsRecovery).toHaveBeenCalledTimes(1)
    expect(discardSheetsRecovery).toHaveBeenCalledWith(tab)
    expect(discardDocsRecovery).not.toHaveBeenCalled()
  })

  it('leaves a destroyed sheets tab alone', () => {
    discardEditorRecovery('sheets', contents(true) as never)

    expect(discardSheetsRecovery).not.toHaveBeenCalled()
  })

  it('still routes the other editors to their own discard', () => {
    discardEditorRecovery('docs', contents() as never)
    discardEditorRecovery('mindmap', contents() as never)
    discardEditorRecovery('hwp', contents() as never)

    expect(discardDocsRecovery).toHaveBeenCalledTimes(1)
    expect(discardMindmapRecovery).toHaveBeenCalledTimes(1)
    expect(hwpDiscardRecoveryCopy).toHaveBeenCalledTimes(1)
    expect(discardSheetsRecovery).not.toHaveBeenCalled()
  })
})
