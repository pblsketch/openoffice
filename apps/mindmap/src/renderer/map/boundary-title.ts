/**
 * The box a boundary's title is typed in. It is the same kind of box the
 * library opens for a relationship's title (`#input-box`, plain text only),
 * so everything that waits for a typed title (saving, reading the map, the
 * keys of the map) treats it alike: the text is taken when the box loses the
 * focus. Enter takes it too, Esc leaves the title as it was. The text is read
 * as text and goes back as text; nothing typed becomes markup.
 */

export interface BoundaryTitleBox {
  /** where `me-nodes` is, the layer the boundaries are drawn in */
  nodes: HTMLElement
  title: string
  /** where the box starts, in the coordinates of `me-nodes` */
  x: number
  y: number
  /** the title typed, trimmed (an empty one is no title); null when it was left with Esc */
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
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      box.blur()
      box.dispatchEvent(new FocusEvent('blur'))
    }
  })
  box.addEventListener(
    'blur',
    () => {
      const typed = (box.innerText ?? box.textContent ?? '').trim()
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
