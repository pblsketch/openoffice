/**
 * Application-level tab keys: the ones people expect from a browser or an
 * MDI office app without opening a menu first.
 *
 * Ctrl+Tab / Ctrl+Shift+Tab step through the strip on every platform — on
 * macOS ⌘Tab belongs to the system app switcher, so Ctrl stays the modifier
 * there (the same choice Safari and Chrome make). Ctrl+W / ⌘W closes the
 * active tab; the editors' File menus already carry that chord, and handling
 * it here too keeps one press from closing two tabs. Home is left to its own
 * File > Close, which closes the window.
 *
 * Chords an editor already owns stay with the editor. Ctrl+PageUp/PageDown
 * switch worksheets in Sheets, and Ctrl+1..9 collide with Word's line spacing
 * and Sheets' cell formats and row hiding, so the tab handler does not take
 * them.
 */
export interface TabShortcutInput {
  /** Electron's Input.type: keyDown / keyUp / char */
  type: string
  key: string
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}

export type TabShortcut = 'next' | 'previous' | 'close'

export function tabShortcutOf(
  input: TabShortcutInput,
  platform: NodeJS.Platform = process.platform,
): TabShortcut | null {
  if (input.type !== 'keyDown' || input.alt) return null

  if (input.key === 'Tab') {
    // Ctrl only: ⌘Tab is the OS app switcher and Alt+Tab is the window switcher
    if (!input.control || input.meta) return null
    return input.shift ? 'previous' : 'next'
  }

  if (input.key.toLowerCase() !== 'w' || input.shift) return null
  // the platform's own close chord: ⌘W on macOS, Ctrl+W elsewhere
  if (platform === 'darwin') return input.meta && !input.control ? 'close' : null
  return input.control && !input.meta ? 'close' : null
}

/** What the shell can do for a tab shortcut; detached and auxiliary windows are not in it. */
export interface TabShortcutHost {
  /** the shell window's own webContents (tab strip and Home) */
  isShellContents(webContentsId: number): boolean
  /** a document tab's WebContentsView */
  hasTab(webContentsId: number): boolean
  /** kind of the active tab, or undefined when the list is empty */
  activeKind(): string | undefined
  cycle(direction: 1 | -1): void
  closeActive(): void
}

/**
 * Run a tab shortcut for a key event from `webContentsId`. Returns true when the
 * shell acted, so the caller can preventDefault and keep both the page and any
 * menu accelerator from seeing the same press twice.
 *
 * Home deliberately returns false for the close chord: its File > Close closes
 * the window, and that is the behaviour Home had before tab shortcuts existed.
 */
export function handleTabShortcut(
  input: TabShortcutInput,
  webContentsId: number,
  host: TabShortcutHost,
): boolean {
  const shortcut = tabShortcutOf(input)
  if (!shortcut) return false
  if (!host.isShellContents(webContentsId) && !host.hasTab(webContentsId)) return false
  if (shortcut === 'close') {
    if (host.activeKind() === 'home') return false
    host.closeActive()
    return true
  }
  host.cycle(shortcut === 'next' ? 1 : -1)
  return true
}
