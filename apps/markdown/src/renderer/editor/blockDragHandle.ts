import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { installPopoverDismiss } from '@genoffice/ui'
import { t } from '../i18n/locale'
import { moveSelectedBlocks, uiOp } from './ops'

/**
 * Notion-style block gutter: a `+` (insert below, opens the slash menu) and a
 * grip that follows the hovered block. A list item counts as a block of its
 * own, so the gutter sits beside the bullet the pointer is on. Dragging the
 * grip hands the block to ProseMirror's native drag machinery; clicking it
 * opens a small block menu (duplicate / move / delete — backed by the
 * BlockKeymap commands).
 */
export const BlockDragHandle = Extension.create({
  name: 'blockDragHandle',

  addProseMirrorPlugins() {
    return [dragHandlePlugin(this.editor)]
  },
})

const LIST_ITEM_NODES = new Set(['listItem', 'taskItem'])

/**
 * The block under the pointer: the list item when the pointer is inside a list
 * (one bullet = one block), otherwise the top-level block.
 */
function blockPosAt(view: EditorView, coords: { left: number; top: number }): number | null {
  const found = view.posAtCoords(coords)
  if (!found) return null
  const $pos = view.state.doc.resolve(found.inside >= 0 ? found.inside : found.pos)
  if ($pos.depth === 0) return found.inside >= 0 ? found.inside : null
  for (let depth = $pos.depth; depth >= 1; depth--) {
    if (LIST_ITEM_NODES.has($pos.node(depth).type.name)) return $pos.before(depth)
  }
  return $pos.before(1)
}

const GRIP_SVG =
  '<svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">' +
  '<circle cx="2.5" cy="3" r="1.4" fill="currentColor"/><circle cx="7.5" cy="3" r="1.4" fill="currentColor"/>' +
  '<circle cx="2.5" cy="8" r="1.4" fill="currentColor"/><circle cx="7.5" cy="8" r="1.4" fill="currentColor"/>' +
  '<circle cx="2.5" cy="13" r="1.4" fill="currentColor"/><circle cx="7.5" cy="13" r="1.4" fill="currentColor"/>' +
  '</svg>'

const PLUS_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>'

// .md-gutter-btn height in styles.css — the buttons are centred on the block's
// first line by offsetting it by half the difference.
const HANDLE_HEIGHT = 22

/** Line box of a block's first line, in layout pixels. */
function firstLineHeight(el: HTMLElement): number {
  const style = getComputedStyle(el)
  const lineHeight = Number.parseFloat(style.lineHeight)
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight
  const fontSize = Number.parseFloat(style.fontSize)
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.4 : HANDLE_HEIGHT
}

function dragHandlePlugin(editor: Editor): Plugin {
  return new Plugin({
    key: new PluginKey('blockDragHandle'),
    view(view) {
      const container = view.dom.parentElement

      const handle = document.createElement('div')
      handle.className = 'md-block-gutter'
      handle.style.display = 'none'
      handle.setAttribute('contenteditable', 'false')

      const plus = document.createElement('button')
      plus.type = 'button'
      plus.className = 'md-gutter-btn md-gutter-plus'
      plus.innerHTML = PLUS_SVG
      plus.dataset.tip = t('blockAddBelow')
      plus.setAttribute('aria-label', t('blockAddBelow'))

      const grip = document.createElement('button')
      grip.type = 'button'
      grip.className = 'md-gutter-btn md-gutter-grip'
      grip.draggable = true
      grip.innerHTML = GRIP_SVG
      grip.dataset.tip = t('blockGripHint')
      grip.setAttribute('aria-label', t('blockGripHint'))

      handle.append(plus, grip)

      const menu = document.createElement('div')
      menu.className = 'md-block-menu'
      menu.style.display = 'none'

      if (container) container.append(handle, menu)

      // TipTap's React EditorContent adopts the editor after its view exists: it
      // moves every child of the element the view was built in into its own div
      // (EditorContent.init) and only then calls setOptions({ element }). The
      // parent captured above is thrown away by that move, so measuring against
      // its rect (0,0) put the gutter in the middle of the page. The gutter is
      // moved into the live page (the element that owns the document's side
      // margin, `.doc-page`) on the first hover and measured against it, so the
      // `left`/`top` we write are relative to the element we measured.
      let containing: HTMLElement | null = null
      let containingWas = ''
      let containingChanged = false

      const containingBlock = (): HTMLElement | null => {
        const parent = handle.parentElement
        // a plain wrapper (tests, embeds) falls back to whatever holds the gutter
        const target = (handle.closest('.doc-page') as HTMLElement | null) ?? parent
        if (!target) return null
        if (target !== parent) target.append(handle, menu)
        if (target === containing) return target
        if (containing && containingChanged) containing.style.position = containingWas
        containing = target
        containingChanged = false
        const position = getComputedStyle(target).position
        if (!position || position === 'static') {
          containingWas = target.style.position
          containingChanged = true
          target.style.position = 'relative'
        }
        return target
      }

      let hoverPos: number | null = null
      let menuPos: number | null = null
      let lineHeightPos = -1
      let lineHeightPx = HANDLE_HEIGHT

      const hideHandle = () => {
        handle.style.display = 'none'
        hoverPos = null
      }

      // Unified dismissal (outside press / window blur / shell chrome press);
      // installed on open, torn down here so it runs exactly once per open —
      // every close path (item click, scroll, doc change, destroy, the
      // installer's own close) funnels through hideMenu.
      let offDismiss: (() => void) | null = null

      const hideMenu = () => {
        menu.style.display = 'none'
        menuPos = null
        offDismiss?.()
        offDismiss = null
      }

      const onMouseMove = (event: MouseEvent) => {
        if (!view.editable) return
        const pos = blockPosAt(view, { left: event.clientX, top: event.clientY })
        if (pos === null) return
        const node = view.state.doc.nodeAt(pos)
        if (!node) return hideHandle()
        const dom = view.nodeDOM(pos)
        if (!(dom instanceof HTMLElement)) return hideHandle()
        const container = containingBlock()
        if (!container) return hideHandle()
        const blockRect = dom.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        // DOMRect values are viewport pixels, while absolute offsets inside a
        // CSS-zoomed page are layout pixels. Convert the deltas back so the
        // gutter is scaled exactly once with the rest of the page.
        const scale = container.offsetWidth ? containerRect.width / container.offsetWidth : 1
        // the mousemove fires far more often than the block under the pointer
        // changes, and reading line-height costs a style recalculation
        if (lineHeightPos !== pos) {
          lineHeightPos = pos
          lineHeightPx = firstLineHeight(dom)
        }
        hoverPos = pos
        handle.style.display = 'flex'
        // top-left of the block, like Notion: the buttons sit beside the first
        // line, not in the middle of a multi-line block
        handle.style.top = `${Math.max(
          0,
          (blockRect.top - containerRect.top) / scale +
            container.scrollTop +
            (lineHeightPx - HANDLE_HEIGHT) / 2,
        )}px`
        handle.style.left = `${Math.max(0, (blockRect.left - containerRect.left) / scale - 52)}px`
      }

      // hoverPos was computed on a past mousemove — validate before selecting
      const selectHovered = (): NodeSelection | null => {
        const pos = menuPos ?? hoverPos
        if (pos === null || pos >= view.state.doc.content.size) return null
        if (!view.state.doc.nodeAt(pos)) return null
        try {
          return NodeSelection.create(view.state.doc, pos)
        } catch {
          return null
        }
      }

      const onDragStart = (event: DragEvent) => {
        hideMenu()
        if (!event.dataTransfer) return
        const selection = selectHovered()
        if (!selection) return event.preventDefault()
        view.dispatch(view.state.tr.setSelection(selection))
        view.dragging = { slice: selection.content(), move: true }
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', ' ')
        const dom = view.nodeDOM(selection.from)
        if (dom instanceof HTMLElement) event.dataTransfer.setDragImage(dom, 0, 0)
      }

      // insert an empty block below the hovered one and type "/" so the slash
      // menu opens. Inside a list the new block is another item of that list —
      // a paragraph between items would be invalid content for the list.
      const onPlusClick = () => {
        hideMenu()
        const selection = selectHovered()
        if (!selection) return
        const after = selection.to
        const node = view.state.doc.nodeAt(selection.from)
        const block =
          node && LIST_ITEM_NODES.has(node.type.name)
            ? node.type.create(
                node.type.name === 'taskItem' ? { checked: false } : node.attrs,
                editor.schema.nodes.paragraph!.create(),
              )
            : editor.schema.nodes.paragraph!.create()
        let tr = view.state.tr.insert(after, block)
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)))
        view.dispatch(tr)
        view.focus()
        editor.commands.insertContent('/')
      }

      const menuAction = (run: () => void) => () => {
        const selection = selectHovered()
        hideMenu()
        if (!selection) return
        view.dispatch(view.state.tr.setSelection(selection))
        run()
        view.focus()
      }

      const MENU_ITEMS: Array<{
        labelKey: Parameters<typeof t>[0]
        danger?: boolean
        run: () => void
      }> = [
        { labelKey: 'blockAddBelow', run: () => onPlusClick() },
        {
          labelKey: 'blockDuplicate',
          run: () => void uiOp(editor, { op: 'duplicateBlocks', target: 'selection' }),
        },
        { labelKey: 'blockMoveUp', run: () => void moveSelectedBlocks(editor, -1) },
        { labelKey: 'blockMoveDown', run: () => void moveSelectedBlocks(editor, 1) },
        {
          labelKey: 'blockDelete',
          danger: true,
          run: () => void uiOp(editor, { op: 'deleteBlocks', target: 'selection' }),
        },
      ]

      const openMenu = () => {
        if (hoverPos === null || !container) return
        menuPos = hoverPos
        menu.replaceChildren(
          ...MENU_ITEMS.map((item) => {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = `md-block-menu-item${item.danger ? ' danger' : ''}`
            btn.textContent = t(item.labelKey)
            btn.addEventListener(
              'click',
              item.labelKey === 'blockAddBelow' ? item.run : menuAction(item.run),
            )
            return btn
          }),
        )
        menu.style.display = 'block'
        menu.style.top = `${parseFloat(handle.style.top) + 26}px`
        menu.style.left = handle.style.left
        // presses inside the menu or the gutter are the popover's own; anything
        // else closes it. Hiding the gutter too matches the old outside-press
        // behavior — the editor's mousemove re-syncs it on the next hover.
        offDismiss ??= installPopoverDismiss(
          () => {
            hideMenu()
            hideHandle()
          },
          { inside: () => [menu, handle] },
        )
      }

      const onGripClick = () => {
        if (menu.style.display === 'block') hideMenu()
        else openMenu()
      }

      const onScrollOrLeave = () => {
        hideHandle()
        hideMenu()
      }

      // The gutter sits 52px left of the block with a page-background gap in
      // between, so reaching it always raises mouseleave on the editor first.
      // Hide on a grace period instead of instantly; entering the gutter (or
      // coming back into the editor) cancels the pending hide.
      let hideTimer: number | null = null
      const cancelHide = () => {
        if (hideTimer !== null) window.clearTimeout(hideTimer)
        hideTimer = null
      }
      const scheduleHide = () => {
        cancelHide()
        hideTimer = window.setTimeout(() => {
          hideTimer = null
          if (menu.style.display !== 'block') hideHandle()
        }, 250)
      }

      const onHandleMouseMove = (event: MouseEvent) => event.stopPropagation()
      view.dom.addEventListener('mousemove', onMouseMove)
      view.dom.addEventListener('mouseenter', cancelHide)
      view.dom.addEventListener('mouseleave', scheduleHide)
      handle.addEventListener('mousemove', onHandleMouseMove)
      handle.addEventListener('mouseenter', cancelHide)
      handle.addEventListener('mouseleave', scheduleHide)
      grip.addEventListener('dragstart', onDragStart)
      grip.addEventListener('click', onGripClick)
      plus.addEventListener('click', onPlusClick)
      document.addEventListener('scroll', onScrollOrLeave, true)

      return {
        update(_view, prevState) {
          // any doc change invalidates the menu's captured position
          if (!prevState.doc.eq(view.state.doc)) hideMenu()
        },
        destroy() {
          cancelHide()
          hideMenu() // also tears down the popover-dismiss listeners
          view.dom.removeEventListener('mousemove', onMouseMove)
          view.dom.removeEventListener('mouseenter', cancelHide)
          view.dom.removeEventListener('mouseleave', scheduleHide)
          handle.removeEventListener('mousemove', onHandleMouseMove)
          handle.removeEventListener('mouseenter', cancelHide)
          handle.removeEventListener('mouseleave', scheduleHide)
          grip.removeEventListener('dragstart', onDragStart)
          grip.removeEventListener('click', onGripClick)
          plus.removeEventListener('click', onPlusClick)
          document.removeEventListener('scroll', onScrollOrLeave, true)
          handle.remove()
          menu.remove()
          if (containing && containingChanged) containing.style.position = containingWas
        },
      }
    },
  })
}
