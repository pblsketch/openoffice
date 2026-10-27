import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * LAN co-editing in the shell (decision 0073): the service is registered once,
 * a guest's tab opens like a template copy, and every close path lets a live
 * guest go without a save prompt. index.ts needs a running Electron, so the
 * wiring is pinned by reading the source.
 */

const src = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const EDITORS = ['docs', 'sheets', 'slides', 'pdf', 'markdown', 'html', 'mindmap', 'hwp', 'epub']

describe('co-editing wiring', () => {
  it('registers the service once, opens guests like template copies and ends it on quit', () => {
    const index = src('../src/main/index.ts')
    expect(index.match(/registerCollabIpc\(/g)).toHaveLength(1)
    expect(index).toMatch(/openGuestTab:[\s\S]*?openTemplateCopyTab\(copy\)/)
    expect(index).toMatch(/copy\.editor === 'epub'[\s\S]*?openEpubTab\(copy\.path\)/)
    expect(index).toMatch(/app\.on\('will-quit', \(\) => collabService\.dispose\(\)\)/)
  })

  it('closes a live guest tab without asking, everywhere a close can ask', () => {
    const tabs = src('../src/main/tab-manager.ts')
    expect(tabs).toMatch(
      /isLiveCollabGuest\(tab\.view\.webContents\.id\)[\s\S]{0,80}this\.removeTab\(id\)/,
    )
    expect(tabs).toMatch(/dropGenerateHandoff\(removed\.view\.webContents\.id\)\s+dropCollabTab\(/)
    const guard = src('../src/main/window-close-guard.ts')
    for (const list of [
      'dirtySheetsTabs',
      'dirtyPdfTabs',
      'dirtyMarkdownTabs',
      'dirtyHtmlTabs',
      'dirtyMindmapTabs',
      'dirtyOrMemoHwpTabs',
      'dirtyEpubTabs',
      'dirtySlidesTabs',
      'docsTabs',
    ]) {
      expect(guard, list).toContain(`withoutLiveGuests(manager.${list}())`)
    }
    expect(src('../src/main/detached-windows.ts')).toMatch(
      /if \(isLiveCollabGuest\(wc\.id\)\) return false/,
    )
  })

  it('exposes the bridge in every editor preload', () => {
    for (const editor of EDITORS) {
      const preload = src(`../../${editor}/src/preload/index.ts`)
      expect(preload, editor).toContain(
        'contextBridge.exposeInMainWorld(COLLAB_BRIDGE_KEY, collabBridge())',
      )
    }
  })
})
