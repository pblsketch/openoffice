/**
 * The menu the map asks for on a boundary (`MapHost.onBoundaryMenu`): one
 * entry, "remove boundary". It opens where the press was and closes on a
 * press anywhere else, on Esc, and after its entry is chosen.
 */
import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n/locale'

export interface BoundaryMenuProps {
  /** where it opens, in page pixels */
  x: number
  y: number
  onRemove(): void
  onClose(): void
}

export function BoundaryMenu(p: BoundaryMenuProps) {
  const { t } = useI18n()
  const menu = useRef<HTMLDivElement>(null)
  const { onClose } = p
  useEffect(() => {
    const away = (event: Event): void => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return
      onClose()
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    // captured: the map takes its own presses before they bubble
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', key, true)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])
  return (
    <div
      ref={menu}
      className="mm-boundary-menu"
      role="menu"
      style={{ left: p.x, top: p.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="mm-boundary-menu-item"
        data-action="boundary-remove"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          p.onRemove()
          p.onClose()
        }}
      >
        {t('meRemoveBoundary')}
      </button>
    </div>
  )
}
