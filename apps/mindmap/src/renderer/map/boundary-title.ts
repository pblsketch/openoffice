/**
 * The box a boundary's title is typed in. It is the same kind of box the
 * library opens for a relationship's title (`#input-box`, plain text only),
 * so everything that waits for a typed title (saving, reading the map, the
 * keys of the map) treats it alike: the text is taken when the box loses the
 * focus. Enter takes it too, Esc leaves the title as it was. A title is one
 * line, as a relationship's is: Shift+Enter breaks none, and a break that
 * comes in anyway (pasted) becomes a space. The text is read as text and goes
 * back as text; nothing typed becomes markup.
 */

/** A title as one line: each line break, with the spaces around it, is one space. */
export function oneLineTitle(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, ' ').trim()
}

export interface BoundaryTitleBox {
  /** where `me-nodes` is, the layer the boundaries are drawn in */
  nodes: HTMLElement
  title: string
  /** where the box starts, in the coordinates of `me-nodes` */
  x: number
  y: number
  /** the title typed, on one line and trimmed (an empty one is no title); null when it was left with Esc */
  done(title: string | null): void
}

export function openBoundaryTitleBox(options: BoundaryTitleBox): HTMLElement {
  const box = options.nodes.ownerDocument.createElement('div')
  box.id = 'input-box'
  box.dataset.type = 'boundary'
  box.contentEditable = 'plaintext-only'
  box.spellcheck = false
  box.textContent = options.title
  box.style.left = `${options.x}px`
  box.style.top = `${options.y}px`
  options.nodes.appendChild(box)
  let cancelled = false
  box.addEventListener('keydown', (event) => {
    // the map's own keys stay out of the box
    event.stopPropagation()
    if (event.isComposing) return
    if (event.key === 'Escape') {
      cancelled = true
      box.blur()
      box.dispatchEvent(new FocusEvent('blur'))
    } else if (event.key === 'Enter') {
      // a title has no second line: Shift+Enter does nothing
      event.preventDefault()
      if (event.shiftKey) return
      box.blur()
      box.dispatchEvent(new FocusEvent('blur'))
    }
  })
  box.addEventListener(
    'blur',
    () => {
      const typed = oneLineTitle(box.innerText ?? box.textContent ?? '')
      box.remove()
      options.done(cancelled ? null : typed)
    },
    { once: true },
  )
  box.focus()
  const selection = box.ownerDocument.getSelection()
  if (selection) {
    const range = box.ownerDocument.createRange()
    range.selectNodeContents(box)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  return box
}
