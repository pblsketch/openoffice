/**
 * F5 / Ctrl+F5 / Esc for the editors' presentation modes.
 *
 * The meaning is the office-app one: F5 starts a show, Ctrl+F5 (or PowerPoint's
 * Shift+F5) starts it from where the reader is, and F5 or Esc ends it. What
 * "where the reader is" means is the editor's business (PDF: the current page;
 * Docs: the current scroll position); this only classifies the chord.
 *
 * F11 is deliberately absent: Electron's `togglefullscreen` role already owns
 * it, and it must not enter a presentation mode.
 */
export type PresentationKey = 'present' | 'present-windowed' | 'exit'

export interface PresentationKeyInput {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  /** the OS repeating a held key must not toggle the show on and off */
  repeat?: boolean
}

export function presentationKeyOf(
  input: PresentationKeyInput,
  presenting: boolean,
): PresentationKey | null {
  if (input.repeat || input.altKey) return null
  if (input.key === 'Escape') return presenting ? 'exit' : null
  if (input.key !== 'F5') return null
  if (presenting) return 'exit'
  // Ctrl+F5 (the request) and Shift+F5 (PowerPoint's "from here") both start
  // from the reader's position; a bare F5 starts at the beginning.
  return input.ctrlKey || input.metaKey || input.shiftKey ? 'present-windowed' : 'present'
}
