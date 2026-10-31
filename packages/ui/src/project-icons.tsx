import type { ReactNode } from 'react'
import type { ProjectEditor } from '@genoffice/project-store'

/**
 * Plain line icons for the project-folder parts of the AI panel. Generic
 * shapes only (folders, pages, a grid, a house); none imitates another
 * company's mark (decision 0052).
 */
function Svg({ size = 14, children }: { size?: number | undefined; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function IconProjectFolder({ size }: { size?: number | undefined }) {
  return (
    <Svg size={size}>
      <path d="M1.8 4.2c0-.6.4-1 1-1h3.3l1.4 1.5h5.7c.6 0 1 .4 1 1v6.6c0 .6-.4 1-1 1H2.8c-.6 0-1-.4-1-1z" />
    </Svg>
  )
}

/** "No project": an outline folder crossed out */
export function IconNoProject({ size }: { size?: number | undefined }) {
  return (
    <Svg size={size}>
      <path d="M1.8 4.2c0-.6.4-1 1-1h3.3l1.4 1.5h5.7c.6 0 1 .4 1 1v6.6c0 .6-.4 1-1 1H2.8c-.6 0-1-.4-1-1z" />
      <path d="M2.5 13.5 13.5 3" />
    </Svg>
  )
}

export function IconFolderAdd({ size }: { size?: number | undefined }) {
  return (
    <Svg size={size}>
      <path d="M1.8 4.2c0-.6.4-1 1-1h3.3l1.4 1.5h5.7c.6 0 1 .4 1 1v6.6c0 .6-.4 1-1 1H2.8c-.6 0-1-.4-1-1z" />
      <path d="M8 7.2v4M6 9.2h4" />
    </Svg>
  )
}

export function IconPlus({ size }: { size?: number | undefined }) {
  return (
    <Svg size={size}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  )
}

export function IconCheck({ size }: { size?: number | undefined }) {
  return (
    <Svg size={size}>
      <path d="M3.2 8.4 6.5 11.6 12.8 4.6" />
    </Svg>
  )
}

export function IconPin({ size }: { size?: number | undefined }) {
  return (
    <Svg size={size}>
      <path d="M6 2.2h4M6.6 2.2l-.4 4.3-2 2.2h7.6l-2-2.2-.4-4.3M8 8.7v5" />
    </Svg>
  )
}

/** Unpin: the pin with a stroke through it */
export function IconUnpin({ size }: { size?: number | undefined }) {
  return (
    <Svg size={size}>
      <path d="M6 2.2h4M6.6 2.2l-.4 4.3-2 2.2h7.6l-2-2.2-.4-4.3M8 8.7v5" />
      <path d="M2.6 2.6l10.8 10.8" />
    </Svg>
  )
}

/** "Open folder": a folder with an arrow out of it */
export function IconFolderOpen({ size }: { size?: number | undefined }) {
  return (
    <Svg size={size}>
      <path d="M7 12.8H2.8c-.6 0-1-.4-1-1V4.2c0-.6.4-1 1-1h3.3l1.4 1.5h5.7c.6 0 1 .4 1 1v1.6" />
      <path d="M9.5 13.5 14 9M11 9h3v3" />
    </Svg>
  )
}

/** "Remove from list": a minus in a circle (the folder itself stays) */
export function IconRemoveFromList({ size }: { size?: number | undefined }) {
  return (
    <Svg size={size}>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M5.4 8h5.2" />
    </Svg>
  )
}

export function IconClose({ size }: { size?: number | undefined }) {
  return (
    <Svg size={size}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  )
}

export function IconCaretDown({ size = 10 }: { size?: number | undefined }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      <path
        d="M2 3.5 5 6.5l3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A page outline every document icon starts from */
const PAGE = 'M4 1.8h5.4L12.5 5v8.2c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1V2.8c0-.6.4-1 1-1z'

/** The last editor of a chat, as a small generic glyph */
export function IconProjectEditor({
  editor,
  size,
}: {
  editor: ProjectEditor
  size?: number | undefined
}) {
  switch (editor) {
    case 'sheets':
      return (
        <Svg size={size}>
          <rect x="2" y="2.5" width="12" height="11" rx="1" />
          <path d="M2 6.2h12M2 9.8h12M6 2.5v11M10 2.5v11" />
        </Svg>
      )
    case 'slides':
      return (
        <Svg size={size}>
          <rect x="1.8" y="2.8" width="12.4" height="8" rx="1" />
          <path d="M8 10.8v2.6M5.5 13.4h5" />
        </Svg>
      )
    case 'pdf':
      return (
        <Svg size={size}>
          <path d={PAGE} />
          <path d="M9.4 1.8V5h3.1" />
        </Svg>
      )
    case 'markdown':
      return (
        <Svg size={size}>
          <path d={PAGE} />
          <path d="M5.5 7v4l1.4-1.6L8.3 11V7M10 8.6v2.4M9.1 10.1l.9.9.9-.9" />
        </Svg>
      )
    case 'html':
      return (
        <Svg size={size}>
          <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
        </Svg>
      )
    case 'mindmap':
      return (
        <Svg size={size}>
          <circle cx="8" cy="8" r="1.8" />
          <circle cx="2.8" cy="3.6" r="1.2" />
          <circle cx="13.2" cy="3.6" r="1.2" />
          <circle cx="13.2" cy="12.4" r="1.2" />
          <path d="M3.8 4.4 6.5 6.9M12.2 4.4 9.5 6.9M12.2 11.6 9.5 9.1" />
        </Svg>
      )
    case 'hwp':
      return (
        <Svg size={size}>
          <path d={PAGE} />
          <path d="M5.4 7h5M5.4 9.2h5M5.4 11.4h3" />
          <circle cx="10.5" cy="11.4" r=".6" />
        </Svg>
      )
    case 'epub':
      return (
        <Svg size={size}>
          <path d="M8 4.2C6.6 3 4.4 2.7 2 3v9.6c2.4-.3 4.6 0 6 1.2 1.4-1.2 3.6-1.5 6-1.2V3c-2.4-.3-4.6 0-6 1.2zM8 4.2v9.6" />
        </Svg>
      )
    case 'home':
      return (
        <Svg size={size}>
          <path d="M2.2 7.4 8 2.6l5.8 4.8M3.8 6.2v7h3v-3.6h2.4v3.6h3v-7" />
        </Svg>
      )
    case 'docs':
    default:
      return (
        <Svg size={size}>
          <path d={PAGE} />
          <path d="M5.4 7h5M5.4 9.2h5M5.4 11.4h5" />
        </Svg>
      )
  }
}
