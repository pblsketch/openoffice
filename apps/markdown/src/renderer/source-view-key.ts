const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')

/** Shown in the ribbon tip; the key itself is handled by `isSourceViewKey`. */
export const SOURCE_VIEW_SHORTCUT = IS_MAC ? '⌘E' : 'Ctrl+E'

export interface SourceViewKeyInput {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  /** the OS repeating a held key must not toggle the view on and off */
  repeat?: boolean
}

/**
 * Ctrl+E (⌘E on macOS) swaps the rendered editor for the raw-Markdown source
 * view, the chord Obsidian uses. Shift is deliberately excluded: Ctrl+Shift+V
 * must keep pasting without formatting (the Docs editor uses it for that), so
 * the VS Code Markdown preview binding is not adopted here.
 */
export function isSourceViewKey(input: SourceViewKeyInput): boolean {
  if (input.repeat || input.altKey || input.shiftKey) return false
  if (!(input.ctrlKey || input.metaKey)) return false
  return input.key.toLowerCase() === 'e'
}
