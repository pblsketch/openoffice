/**
 * One drag of the presenter view's splitter (PresenterView): follows the
 * pointer on the window, shows each new width at most once a frame, and
 * reports the width on release only when the pointer actually moved, so a
 * plain press never overwrites the remembered width with the one this window
 * happens to clamp it to. The returned function ends the drag without
 * committing; PresenterView calls it when the view goes away mid-drag
 * (Esc during a drag).
 */

export interface SideDragOptions {
  /** the column width for the pointer at `clientX`, already clamped */
  widthAt(clientX: number): number
  /** a new width while dragging (once a frame) */
  preview(width: number): void
  /** the drag ended after the pointer moved: the width to remember */
  commit(width: number): void
  /** the window the pointer is followed on, and its frame scheduler; injectable for tests */
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'>
  frame?: { request(cb: () => void): number; cancel(id: number): void }
  /** the element whose cursor shows col-resize while dragging */
  cursorHost?: { style: { cursor: string } }
}

/** Starts a drag; returns the function that ends it early (listeners off, cursor back, nothing saved). */
export function startSideDrag(opts: SideDragOptions): () => void {
  const win = opts.win ?? window
  const frame = opts.frame ?? {
    request: (cb: () => void) => requestAnimationFrame(cb),
    cancel: (id: number) => cancelAnimationFrame(id),
  }
  const cursorHost = opts.cursorHost ?? document.body
  cursorHost.style.cursor = 'col-resize'
  let width: number | null = null
  let raf = 0
  let ended = false

  const end = () => {
    if (ended) return
    ended = true
    win.removeEventListener('pointermove', onMove as EventListener)
    win.removeEventListener('pointerup', onUp)
    win.removeEventListener('pointercancel', onUp)
    if (raf) frame.cancel(raf)
    raf = 0
    cursorHost.style.cursor = ''
  }
  const onMove = (ev: PointerEvent) => {
    width = opts.widthAt(ev.clientX)
    if (!raf)
      raf = frame.request(() => {
        raf = 0
        if (width !== null) opts.preview(width)
      })
  }
  const onUp = () => {
    end()
    if (width !== null) opts.commit(width)
  }
  win.addEventListener('pointermove', onMove as EventListener)
  win.addEventListener('pointerup', onUp)
  win.addEventListener('pointercancel', onUp)
  return end
}
