/**
 * The export button of the toolbar: a menu of the four exports (PNG and SVG
 * picture, PDF, Markdown outline). Print is not here; it is in the File menu.
 *
 * The menu is the app's shared popover (`gs-dd-pop`), anchored to the button.
 * Like the other tool buttons, pressing it does not take the keyboard from
 * the map.
 */
import { useEffect, useRef, useState } from 'react'
import { useDismissablePopover } from '@genoffice/ui'
import { useI18n } from '../i18n/locale'
import type { ExportFormat } from '../../shared/ipc'

/**
 * Export: a tray with an arrow leaving it upwards. Drawn on the grid of the
 * editor's icon set (`icons.tsx`): 20 units, 1.5 line, round ends, inside the
 * middle 14 units.
 */
export const IconExport = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M10 12.25V3.75M6.75 7 10 3.75 13.25 7" />
    <path d="M3.75 11.75v3.5a1 1 0 0 0 1 1h10.5a1 1 0 0 0 1-1v-3.5" />
  </svg>
)

const ITEMS = [
  { format: 'png', label: 'exportPng' },
  { format: 'svg', label: 'exportSvg' },
  { format: 'pdf', label: 'exportPdf' },
  { format: 'markdown', label: 'exportMarkdown' },
] as const

export function ExportMenu(p: { disabled: boolean; onExport(format: ExportFormat): void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<ExportFormat | null>(null)
  const wrap = useRef<HTMLSpanElement>(null)
  useDismissablePopover(open, () => setOpen(false), { inside: () => [wrap.current] })
  // Escape closes the menu wherever the keyboard is (the map keeps it), and does nothing else
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open])
  const pick = (format: ExportFormat): void => {
    setOpen(false)
    p.onExport(format)
  }
  return (
    <span ref={wrap} className="gs-dd mm-export-menu">
      <button
        type="button"
        className={`rb-btn mm-tool${open ? ' active' : ''}`}
        data-action="export"
        data-tip={open ? undefined : t('tbExport')}
        aria-label={t('tbExport')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={p.disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((was) => !was)}
      >
        <IconExport />
      </button>
      {open && (
        <div className="gs-dd-pop" role="menu" aria-label={t('tbExport')}>
          {ITEMS.map((item) => (
            <button
              key={item.format}
              type="button"
              role="menuitem"
              className={`gs-dd-item${active === item.format ? ' active' : ''}`}
              data-export={item.format}
              onMouseEnter={() => setActive(item.format)}
              onMouseLeave={() => setActive(null)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item.format)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
