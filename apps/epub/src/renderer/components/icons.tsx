/**
 * The editor's own line icons (24×24, stroke = currentColor).
 */
import type { ReactNode } from 'react'

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export const IconSave = () => (
  <Icon size={16}>
    <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4z" />
    <path d="M8 4v5h7V4" />
    <path d="M8 20v-6h8v6" />
  </Icon>
)

export const IconSearch = () => (
  <Icon>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
  </Icon>
)

export const IconToc = () => (
  <Icon>
    <path d="M4 6h1M4 12h1M4 18h1" />
    <path d="M8 6h12M8 12h12M8 18h12" />
  </Icon>
)

export const IconTextSmaller = () => (
  <Icon>
    <path d="M4 19l5-13 5 13" />
    <path d="M6 14h6" />
    <path d="M16 9h5" />
  </Icon>
)

export const IconTextLarger = () => (
  <Icon>
    <path d="M4 19l5-13 5 13" />
    <path d="M6 14h6" />
    <path d="M16 9h5M18.5 6.5v5" />
  </Icon>
)

export const IconLineSpacing = () => (
  <Icon>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M5 4v16M3 6l2-2 2 2M3 18l2 2 2-2" />
  </Icon>
)

export const IconMoon = () => (
  <Icon>
    <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />
  </Icon>
)

export const IconPrev = () => (
  <Icon size={16}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
)

export const IconNext = () => (
  <Icon size={16}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
)

export const IconClose = () => (
  <Icon size={14}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const IconBlockedBook = () => (
  <Icon size={40}>
    <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" />
    <path d="M5 17a3 3 0 0 1 3-3h10" />
    <path d="M9 8l5 4M14 8l-5 4" />
  </Icon>
)

export const IconUndo = () => (
  <Icon size={16}>
    <path d="M9 5L4.5 9.5 9 14" />
    <path d="M4.5 9.5H15a5 5 0 0 1 0 10h-4" />
  </Icon>
)

export const IconRedo = () => (
  <Icon size={16}>
    <path d="M15 5l4.5 4.5L15 14" />
    <path d="M19.5 9.5H9a5 5 0 0 0 0 10h4" />
  </Icon>
)

export const IconBold = () => (
  <Icon>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" />
    <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
  </Icon>
)

export const IconItalic = () => (
  <Icon>
    <path d="M11 5h7M6 19h7M14.5 5l-5 14" />
  </Icon>
)

/** find and replace: a search glass and a turning arrow */
export const IconReplace = () => (
  <Icon>
    <circle cx="9" cy="9" r="4.5" />
    <path d="M12.3 12.3L15 15" />
    <path d="M13 19.5h7M17.5 17l2.5 2.5-2.5 2.5" />
  </Icon>
)
