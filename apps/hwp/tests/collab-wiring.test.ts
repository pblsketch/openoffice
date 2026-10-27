import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Co-editing wiring in the Hangul tab (decision 0073). The timing and the key rules are
 * in collab-flow.ts; this pins where a live guest's tab stands down: no save, no recovery
 * copy, no unsaved state of its own, no AI panel; and the shared copy's main channel.
 */
describe('HWP co-editing wiring', () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
  const app = read('src/renderer/App.tsx')

  it('renders the share button, the dialog and the notice', () => {
    expect(app).toContain('<CollabButton')
    expect(app).toContain('<CollabDialog collab={collab} lang={lang} />')
    expect(app).toContain('<CollabNotice collab={collab} lang={lang} />')
  })

  it('keeps a live guest from saving and says why', () => {
    expect(app).toContain("collabText(lang, 'guestSaveBlocked')")
    expect(app).toContain('if (!editor || collabGuestRef.current) return false')
  })

  it('keeps a live guest out of recovery copies and the unsaved state', () => {
    expect(app).toContain('!collabGuestRef.current && (await editor.commands.context()).isDirty')
    expect(app).toContain('const dirty = state && !collabGuestRef.current')
  })

  it('hides the AI panel from a guest and tells the host of AI edits', () => {
    expect(app).toContain("collab.role !== 'guest' && (")
    expect(app).toContain('collabNoteRef.current()')
  })

  it('serves the shared copy from main and the preload', () => {
    expect(read('src/main/hwp-main.ts')).toContain('registerHwpCollabIpc(recoveryHost.saveBaseOf)')
    expect(read('src/preload/index.ts')).toContain('HWP_CHANNELS.collabBase')
  })
})
