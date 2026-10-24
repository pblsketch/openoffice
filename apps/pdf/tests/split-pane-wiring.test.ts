/**
 * Split view (decision 0036): the shell gives each pane a role through the
 * preload bridge, the pdf dock keeps the panel mounted and folds a secondary
 * pane to the rail, and the app's own autosave says so to the save guard.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { effectiveAiPanelOpen, onAiRailClick } from '@genoffice/ui'

const APP = process.cwd()
const source = (path: string): string => readFileSync(join(APP, path), 'utf8')

describe('split-pane wiring', () => {
  it('exposes the role bridge from the preload', () => {
    const preload = source('src/preload/index.ts')
    expect(preload).toContain('splitPaneBridge(ipcRenderer)')
    expect(preload).toContain("exposeInMainWorld('aiOfficeSplit'")
  })

  it('pings focus once and reads the role for the dock', () => {
    const app = source('src/renderer/App.tsx')
    expect(app.match(/useSplitPaneFocusPing\(\)/g)).toHaveLength(1)
    expect(app).toContain('useSplitPaneRole()')
    expect(app).toContain('effectiveAiPanelOpen(!aiCollapsed, paneRole)')
    expect(app).toContain(
      'onAiRailClick(paneRole, !aiCollapsed, (open) => setAiCollapsed(!open), requestFocus)',
    )
    expect(app).toContain("className={`ai-dock${aiPanelOpen ? '' : ' collapsed'}${")
    expect(app).toContain("!aiSidebarEnabled && !aiPanelOpen ? ' ai-dock-off' : ''")
  })
})

describe('the AI panel follows the pane role', () => {
  it('forces a secondary pane to the rail and leaves the focus pane alone', () => {
    expect(effectiveAiPanelOpen(true, 'secondary')).toBe(false)
    expect(effectiveAiPanelOpen(true, 'focus')).toBe(true)
  })

  it('asks the shell for focus when the secondary rail is clicked', () => {
    const requestFocus = vi.fn()
    let open: boolean | null = null
    onAiRailClick('secondary', false, (value) => (open = value), requestFocus)
    expect(requestFocus).toHaveBeenCalledOnce()
    expect(open).toBe(true)
  })
})

describe('autosave marks itself', () => {
  it('sends the renderer autosave flag and keeps an external-modified save quiet', () => {
    const app = source('src/renderer/App.tsx')
    expect(app).toContain('auto: autosave,')
    expect(app).toContain("if (result.error !== 'external-modified') opFailed(result.error)")
    expect(app).toContain("else setSaveState('idle')")
  })
})
