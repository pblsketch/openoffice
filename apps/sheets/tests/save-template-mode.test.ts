/**
 * A template copy (a skill's template, a co-editing share) is the workbook as
 * a save would write it, edited or not. Sent as a plain save with nothing
 * pending, the request was refused as "no changes to save".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleSave, type SaveContext } from '../src/renderer/save-actions'
import { createEditJournal } from '../src/renderer/edit-journal'
import { workbookSaveRequestSchema } from '../src/shared/desktop-api'

const workbookTemplateBytes = vi.fn()

beforeEach(() => {
  workbookTemplateBytes.mockReset().mockResolvedValue({ ok: true, bytes: new Uint8Array([7]) })
  ;(globalThis as unknown as { window: unknown }).window = {
    desktopApi: { workbookTemplateBytes },
  }
})

function cleanWorkbook(): SaveContext {
  return {
    univerRef: { current: null },
    stashViewRestore: () => {},
    lazyWorkbookRef: {
      current: {
        editJournal: createEditJournal(),
        recalc: {
          timer: null,
          generation: 0,
          failed: false,
          formulaCells: new Map(),
          overlay: new Map(),
        },
        file: { sessionId: '11111111-1111-4111-8111-111111111111' },
      },
    } as never,
    setMessage: () => {},
    openLazyWorkbook: () => {},
  }
}

describe('handleSave template mode', () => {
  it('writes an unchanged workbook too, with a request the main process accepts', async () => {
    const outcome = await handleSave(cleanWorkbook(), 'template')
    expect(outcome).toEqual({ ok: true, bytes: new Uint8Array([7]) })
    const request = workbookTemplateBytes.mock.calls[0]![0] as Record<string, unknown>
    expect(request.mode).toBe('save-as')
    expect(() => workbookSaveRequestSchema.parse(request)).not.toThrow()
  })
})
