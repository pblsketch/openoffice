// @vitest-environment node
/**
 * Style Skill sidecar path next to the open draft: the extension gate must
 * match the case-insensitive replace, or a Windows `.PPTX` path fails open.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getName: () => 't', getVersion: () => '0', once: () => {} },
  ipcMain: { handle: () => {}, on: () => {}, removeHandler: () => {} },
  nativeImage: {},
  net: {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
}))

vi.mock('../src/main/shaped-metrics', () => ({
  shapedMetricsReady: async () => {},
  refineComplexWidths: async () => {},
  complexScriptOf: () => null,
  initShapedMetrics: () => {},
  gtMeasure: (t: string) => ({ width: t.length * 8 }),
  shapedFamily: () => null,
  shapedMeasure: () => ({ width: 0 }),
}))

vi.mock('@genoffice/ai-provider/subscription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider/subscription')>()),
  ensureSubscriptionIpc: () => ({}),
  sharedSubscriptionStatuses: () => ({}),
}))

import { styleSkillSidecarPath } from '../src/main/ai-ipc'

describe('styleSkillSidecarPath', () => {
  it('accepts lowercase and uppercase pptx extensions', () => {
    expect(styleSkillSidecarPath('/d/deck.pptx')).toBe('/d/deck.styleskill.json')
    expect(styleSkillSidecarPath('C:\\Users\\me\\Deck.PPTX')).toBe(
      'C:\\Users\\me\\Deck.styleskill.json',
    )
    expect(styleSkillSidecarPath('/tmp/Show.Pptx')).toBe('/tmp/Show.styleskill.json')
  })

  it('rejects missing paths and non-pptx files', () => {
    expect(styleSkillSidecarPath(null)).toBeNull()
    expect(styleSkillSidecarPath(undefined)).toBeNull()
    expect(styleSkillSidecarPath('')).toBeNull()
    expect(styleSkillSidecarPath('/d/deck.docx')).toBeNull()
    expect(styleSkillSidecarPath('/d/deck.pptx.bak')).toBeNull()
  })
})
