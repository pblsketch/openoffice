/**
 * The editor's own icons: one set, drawn for this app. None of them is taken
 * from another product.
 *
 * How the set is drawn, so that a new icon fits in:
 *
 * - a 20-unit grid shown at 20 pixels, so one unit is one pixel and the 1.5
 *   stroke is 1.5 pixels wide; nothing is scaled. The two small ones (plus,
 *   close) have a smaller grid of their own, again one unit to the pixel;
 * - line drawings only: no fill, round ends and round corners, in the current
 *   text colour. The one exception is a dot (a hole, a blob of paint), which
 *   is a filled circle of radius 1;
 * - the drawing stays inside the middle 14 units, on quarter-unit positions,
 *   so the straight strokes cover a whole pixel and half of the next one, the
 *   same way in every icon;
 * - a topic is a box with fully round ends, a branch is a curve that leaves
 *   and arrives level. Every icon about the map is made of those two.
 */
import type { ReactNode } from 'react'

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** A filled dot: the only filled shape of the set. */
function Dot({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r="1" fill="currentColor" stroke="none" />
}

export const IconSave = () => (
  <Icon>
    <path d="M3.75 4.75a1 1 0 0 1 1-1h8.25l3.25 3.25v8.25a1 1 0 0 1-1 1H4.75a1 1 0 0 1-1-1z" />
    <path d="M6.75 3.75v3.5h5.5v-3.5M6.25 16.25v-4.5h7.5v4.5" />
  </Icon>
)

export const IconUndo = () => (
  <Icon>
    <path d="M7.25 4.75 3.75 8.25l3.5 3.5" />
    <path d="M3.75 8.25h8.5a4 4 0 0 1 0 8h-4" />
  </Icon>
)

export const IconRedo = () => (
  <Icon>
    <path d="m12.75 4.75 3.5 3.5-3.5 3.5" />
    <path d="M16.25 8.25h-8.5a4 4 0 0 0 0 8h4" />
  </Icon>
)

/** a topic with a branch going down to a new one */
export const IconChild = () => (
  <Icon>
    <rect x="2.75" y="3.75" width="8" height="4.5" rx="2.25" />
    <path d="M6.75 8.25v2.5a3.5 3.5 0 0 0 3.5 3.5" />
    <rect x="10.25" y="11.75" width="7" height="4.5" rx="2.25" />
  </Icon>
)

/** two topics on one branch, and a plus for the one being added */
export const IconSibling = () => (
  <Icon>
    <rect x="2.75" y="3.75" width="8.5" height="4.5" rx="2.25" />
    <rect x="2.75" y="11.75" width="8.5" height="4.5" rx="2.25" />
    <path d="M15.25 11.75v4.5M13 14h4.5" />
  </Icon>
)

/** a line with an arrow head from one topic to another */
export const IconRelationship = () => (
  <Icon>
    <path d="M3.75 14.25c1.75-8.5 10.75-8.5 12.5 0" />
    <path d="m13.5 12 2.75 2.25 1-3.25" />
  </Icon>
)

/** a brace over branches, and the topic that sums them up */
export const IconSummary = () => (
  <Icon>
    <path d="M4.75 3.75c1.75 0 2.5 1 2.5 2.5v1.5c0 1.5.75 2.25 2 2.25-1.25 0-2 .75-2 2.25v1.5c0 1.5-.75 2.5-2.5 2.5" />
    <rect x="11.25" y="7.75" width="6" height="4.5" rx="2.25" />
  </Icon>
)

export const IconNote = () => (
  <Icon>
    <path d="M5.75 2.75h5.5l4 4v9.5a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-12.5a1 1 0 0 1 1-1z" />
    <path d="M11.25 2.75v4h4M7.75 10.75h4.5M7.75 13.75h2.5" />
  </Icon>
)

export const IconLabel = () => (
  <Icon>
    <path d="M3.75 5.75a1 1 0 0 1 1-1h5.5l6 5.25-6 5.25h-5.5a1 1 0 0 1-1-1z" />
    <Dot cx={7.25} cy={10} />
  </Icon>
)

export const IconLink = () => (
  <Icon>
    <path d="M8.5 11.5a3 3 0 0 0 4.25 0l2.5-2.5A3 3 0 0 0 11 4.75l-1 1" />
    <path d="M11.5 8.5a3 3 0 0 0-4.25 0l-2.5 2.5A3 3 0 0 0 9 15.25l1-1" />
  </Icon>
)

/** a picture: a frame with a hill and the sun */
export const IconPicture = () => (
  <Icon>
    <rect x="3.75" y="4.75" width="12.5" height="10.5" rx="1" />
    <path d="m3.75 13.25 4-4 3.5 3.5 1.75-1.75 3.25 3.25" />
    <Dot cx={12.75} cy={8.25} />
  </Icon>
)

/** how the branches are laid out: one topic, and the two it forks into */
export const IconLayout = () => (
  <Icon>
    <rect x="2.75" y="7.75" width="5.5" height="4.5" rx="2.25" />
    <path d="M8.25 10h1.5c1.75 0 .5-4.25 2.5-4.25M9.75 10c1.75 0 .5 4.25 2.5 4.25" />
    <rect x="12.25" y="3.75" width="5" height="4" rx="2" />
    <rect x="12.25" y="12.25" width="5" height="4" rx="2" />
  </Icon>
)

/** a palette: the thumb hole and three blobs of paint */
export const IconTheme = () => (
  <Icon>
    <path d="M10 2.75c-4 0-7.25 3.25-7.25 7.25s3.25 7.25 7.25 7.25c1 0 1.75-.75 1.75-1.75 0-.45-.2-.85-.45-1.15-.3-.3-.45-.7-.45-1.15 0-.95.8-1.7 1.75-1.7h1.9c1.5 0 2.75-1.25 2.75-2.75 0-3.3-3.25-6-7.25-6z" />
    <Dot cx={6.25} cy={10.25} />
    <Dot cx={8} cy={6.75} />
    <Dot cx={12} cy={6.25} />
  </Icon>
)

/** the branches close in */
export const IconFoldAll = () => (
  <Icon>
    <path d="M6.25 4.25 10 7.75l3.75-3.5M6.25 15.75 10 12.25l3.75 3.5" />
    <path d="M3.75 10h12.5" />
  </Icon>
)

/** the branches open out */
export const IconUnfoldAll = () => (
  <Icon>
    <path d="M6.25 7.25 10 3.75l3.75 3.5M6.25 12.75 10 16.25l3.75-3.5" />
    <path d="M3.75 10h12.5" />
  </Icon>
)

export const IconZoomIn = () => (
  <Icon>
    <circle cx="8.75" cy="8.75" r="5" />
    <path d="m12.5 12.5 3.75 3.75M8.75 6.5v4.5M6.5 8.75H11" />
  </Icon>
)

export const IconZoomOut = () => (
  <Icon>
    <circle cx="8.75" cy="8.75" r="5" />
    <path d="m12.5 12.5 3.75 3.75M6.5 8.75H11" />
  </Icon>
)

/** the corners of the window around the map */
export const IconFit = () => (
  <Icon>
    <path d="M3.75 7.25v-2.5a1 1 0 0 1 1-1h2.5M12.75 3.75h2.5a1 1 0 0 1 1 1v2.5M16.25 12.75v2.5a1 1 0 0 1-1 1h-2.5M7.25 16.25h-2.5a1 1 0 0 1-1-1v-2.5" />
    <rect x="6.75" y="7.25" width="6.5" height="5.5" rx="1.75" />
  </Icon>
)

/** a topic, an arrow, and the new document made from it */
export const IconMakeFrom = () => (
  <Icon>
    <rect x="2.75" y="7.75" width="5" height="4.5" rx="2.25" />
    <path d="M8.75 10h1.75M9.25 8.5l1.5 1.5-1.5 1.5" />
    <path d="M12.25 4.75h2.5l2 2v7.5a1 1 0 0 1-1 1h-3.5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1z" />
    <path d="M14.75 4.75v2h2M13.25 10.25h1.5M13.25 12.75h1.5" />
  </Icon>
)

export const IconPlus = () => (
  <Icon size={14}>
    <path d="M7 2.75v8.5M2.75 7h8.5" />
  </Icon>
)

export const IconClose = () => (
  <Icon size={12}>
    <path d="m3.25 3.25 5.5 5.5M8.75 3.25l-5.5 5.5" />
  </Icon>
)

// ---- text format ----

/** the letter B */
export const IconBold = () => (
  <Icon>
    <path d="M6.75 4.75h4a2.5 2.5 0 0 1 0 5h-4zM6.75 9.75h4.75a2.75 2.75 0 0 1 0 5.5h-4.75z" />
  </Icon>
)

/** a slanted stroke between two serifs */
export const IconItalic = () => (
  <Icon>
    <path d="M9.25 4.75h5M5.75 15.25h5M11.75 4.75l-3.5 10.5" />
  </Icon>
)

/** the letter U on a line */
export const IconUnderline = () => (
  <Icon>
    <path d="M6.25 3.75v5a3.75 3.75 0 0 0 7.5 0v-5M5.25 16.25h9.5" />
  </Icon>
)

/** the letter S, struck through */
export const IconStrike = () => (
  <Icon>
    <path d="M13.25 6c-.5-.9-1.6-1.25-3.25-1.25-1.9 0-3.25.85-3.25 2.25 0 .8.4 1.35 1.15 1.75M4.75 10h10.5M7 13.25c.5 1.25 1.6 2 3.25 2 2 0 3.5-.9 3.5-2.4 0-.6-.2-1.05-.6-1.35" />
  </Icon>
)

/** a large and a small A: the whole text format */
export const IconTextFormat = () => (
  <Icon>
    <path d="M3.75 15.25l3.5-10.5 3.5 10.5M5 11.25h4.5" />
    <path d="M12.25 15.25l2.25-6 2.25 6M12.9 13.25h3.2" />
  </Icon>
)

export const IconAlignLeft = () => (
  <Icon>
    <path d="M3.75 5.25h12.5M3.75 8.5h8M3.75 11.75h12.5M3.75 15h8" />
  </Icon>
)

export const IconAlignCenter = () => (
  <Icon>
    <path d="M3.75 5.25h12.5M6 8.5h8M3.75 11.75h12.5M6 15h8" />
  </Icon>
)

export const IconAlignRight = () => (
  <Icon>
    <path d="M3.75 5.25h12.5M8.25 8.5h8M3.75 11.75h12.5M8.25 15h8" />
  </Icon>
)

export const IconMinus = () => (
  <Icon size={14}>
    <path d="M2.75 7h8.5" />
  </Icon>
)
