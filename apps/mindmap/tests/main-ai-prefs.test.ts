/**
 * The renderer entry applies the shell's AI panel preferences before the
 * first render, like the HTML and Word editors: a user who chose the right
 * side sees the dock there from the first paint (no jump from the left), and
 * the panel's initial open state is decided with those preferences in place.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AI_PANEL_PREFS, aiPanelInitiallyOpen, applyAiPanelPrefs } from '@genoffice/ui'

/** what the app saw when it rendered for the first time */
const firstRender = vi.hoisted(() => ({ seen: null as null | { side?: string; open: boolean } }))

vi.mock('../src/renderer/App', () => ({
  default: function App() {
    firstRender.seen ??= {
      side: document.documentElement.dataset.aiPanelSide,
      open: aiPanelInitiallyOpen('mindmapapp.showAi'),
    }
    return null
  },
}))

afterEach(() => {
  applyAiPanelPrefs({})
  delete (window as { mindmapApi?: unknown }).mindmapApi
})

describe('the renderer entry', () => {
  it('renders only after the AI panel preferences are applied', async () => {
    localStorage.setItem('mindmapapp.showAi', '1')
    let answer: ((prefs: unknown) => void) | null = null
    const changed: Array<(prefs: unknown) => void> = []
    ;(window as unknown as { mindmapApi: unknown }).mindmapApi = {
      getLanguage: async () => 'en',
      getTheme: async () => 'system',
      onThemeChanged: () => () => {},
      onLanguageChanged: () => () => {},
      getAiPanelPrefs: () => new Promise((resolve) => (answer = resolve)),
      onAiPanelPrefsChanged: (handler: (prefs: unknown) => void) => {
        changed.push(handler)
        return () => {}
      },
    }
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    await import('../src/renderer/main')
    await vi.waitFor(() => expect(answer).not.toBeNull())
    // the shell has not answered yet: nothing is drawn
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(firstRender.seen).toBeNull()

    answer!({ ...DEFAULT_AI_PANEL_PREFS, side: 'right', openInNewDocs: false })
    await vi.waitFor(() => expect(firstRender.seen).not.toBeNull())
    // first render: already on the right, and "start collapsed" already decides the open state
    expect(firstRender.seen).toEqual({ side: 'right', open: false })

    // later changes from Settings are followed
    expect(changed).toHaveLength(1)
    changed[0]!({ ...DEFAULT_AI_PANEL_PREFS, side: 'left' })
    expect(document.documentElement.dataset.aiPanelSide).toBe('left')
  })
})
