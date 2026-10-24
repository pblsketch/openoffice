/**
 * The editor's keyboard shortcuts. The shell's menu shows these keys but
 * registers no accelerators for this editor, so the page handles them, in
 * its own document and inside the chapter frame alike.
 */

export type EditCommand =
  'undo' | 'redo' | 'find' | 'replace' | 'save' | 'saveAs' | 'bold' | 'italic'

type KeyInfo = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

/** The letter of a key, also when an input method or another layout is active (`KeyZ` → `z`). */
function letterOf(e: KeyInfo): string {
  const key = (e.key ?? '').toLowerCase()
  if (/^[a-z]$/.test(key)) return key
  const code = /^Key([A-Z])$/.exec(e.code ?? '')
  return code ? code[1]!.toLowerCase() : key
}

/** The command a key press asks for, or null. */
export function shortcutOf(e: KeyInfo): EditCommand | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  switch (letterOf(e)) {
    case 'z':
      return e.shiftKey ? 'redo' : 'undo'
    case 'y':
      return e.shiftKey ? null : 'redo'
    case 'f':
      return e.shiftKey ? null : 'find'
    case 'h':
      return e.shiftKey ? null : 'replace'
    case 's':
      return e.shiftKey ? 'saveAs' : 'save'
    case 'b':
      return e.shiftKey ? null : 'bold'
    case 'i':
      return e.shiftKey ? null : 'italic'
    default:
      return null
  }
}

/** Commands a text field of the page keeps for itself (its own undo, its own selection). */
const FIELD_COMMANDS = new Set<EditCommand>(['undo', 'redo', 'bold', 'italic'])

/** Whether the page leaves a command to the focused field (an input, a text area, an editable element). */
export function belongsToField(command: EditCommand, target: EventTarget | null): boolean {
  if (!FIELD_COMMANDS.has(command)) return false
  const el = target as (Element & { isContentEditable?: boolean }) | null
  if (!el || typeof el.closest !== 'function') return false
  const name = el.localName?.toLowerCase()
  if (name === 'textarea' || name === 'select') return true
  if (name === 'input') return true
  return el.isContentEditable === true || el.closest('[contenteditable="true"]') !== null
}
