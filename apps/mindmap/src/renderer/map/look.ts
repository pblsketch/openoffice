/**
 * How a map is drawn: a theme of the engine turned into what the drawing
 * library and `map.css` need.
 *
 * A look is a skeleton (the shapes), a colour band and a ground variant. Its
 * values all come from the engine's `themeLook`; this module only hands them
 * on, as custom properties whose names start with `--mm-` and as the two
 * branch-line functions. `map.css` holds the rules and no colour of its own.
 *
 * The colours of a map are document content. They do not follow the app's
 * light or dark setting and nothing here reads a chrome token. What does
 * follow the app (the selection outline, the edit box, the context menu, the
 * fold handles) is styled in `styles.css` instead.
 *
 * Two places carry the properties: the map's container (everything that is
 * the same for the whole map, set through the library's theme) and each main
 * branch's wrapper (the colour of that branch and its soft forms, set by
 * `decorate.ts`), so a rule deep inside a branch can tint from its branch.
 */
import type { Theme } from 'mind-elixir'
import {
  contrastRatio,
  DEFAULT_THEME_ID,
  mixColors,
  recogniseSheetTheme,
  sheetLineSettings,
  themeLook,
  type ThemeLook,
  type ThemeTopicShape,
  type XmindSheet,
} from '@genoffice/xmind-engine'
import { type BranchGeometry, mainBranchPath, subBranchPath } from './branches'
import type { MapLineSettings } from './line-resolve'

/**
 * A look as a sheet is drawn with it: the theme's look and the sheet's
 * map-wide line settings. The settings belong to the sheet, not to the theme,
 * so a look made from a theme alone has none and leaves those of the sheet
 * as they were (`TopicDecorator.setLook`).
 */
export interface SheetLook extends ThemeLook {
  lineSettings?: MapLineSettings
}

/** The map-wide line settings of a sheet, whatever its theme: the default look follows them too. */
export function lineSettingsOfSheet(sheet: XmindSheet): MapLineSettings {
  const { tapered, rainbow } = sheetLineSettings(sheet)
  return { tapered, rainbow }
}

/**
 * The look a sheet is drawn with: its own theme when this app wrote it, the
 * default look otherwise, with the sheet's line settings either way.
 */
export function lookOfSheet(sheet: XmindSheet): SheetLook {
  const look = themeLook(recogniseSheetTheme(sheet) ?? DEFAULT_THEME_ID)
  return { ...look, lineSettings: lineSettingsOfSheet(sheet) }
}

/** Line height for a font size, in whole pixels so that topic boxes land on whole pixels. */
export function lineHeightFor(fontSize: number): number {
  return Math.round(fontSize * 1.42)
}

const px = (value: number): string => `${value}px`

/** A `#rrggbb` colour at an opacity, in the form CSS takes. */
export function withAlpha(color: string, alpha: number): string {
  const value = Number.parseInt(color.slice(1, 7), 16)
  return `rgb(${value >> 16} ${(value >> 8) & 0xff} ${value & 0xff} / ${alpha})`
}

/** The width of the outline drawn around a topic of this shape; an underline is part of the branch line instead. */
function outlineWidth(shape: ThemeTopicShape): number {
  return shape.border === 'outline' ? shape.borderWidth : 0
}

/** Padding as CSS, less the outline, so an outlined topic is as large as a filled one. */
function padding(shape: ThemeTopicShape): string {
  const outline = outlineWidth(shape)
  return `${shape.padding[0] - outline}px ${shape.padding[1] - outline}px`
}

function shapeVars(level: 'central' | 'main' | 'sub', shape: ThemeTopicShape) {
  return {
    [`--mm-${level}-size`]: px(shape.fontSize),
    [`--mm-${level}-weight`]: String(shape.fontWeight),
    [`--mm-${level}-lh`]: px(lineHeightFor(shape.fontSize)),
    [`--mm-${level}-pad`]: padding(shape),
    [`--mm-${level}-radius`]: px(shape.radius),
    [`--mm-${level}-border-width`]: px(outlineWidth(shape)),
  }
}

/** The levels below the third: `--mm-level-<n>-size` and `-lh`, `n` from 4 (see `THEME_DEEP_LEVELS`). */
function deepShapeVars(look: ThemeLook) {
  const vars: Record<string, string> = {}
  look.deepSizes.forEach((size, at) => {
    const level = at + 4
    vars[`--mm-level-${level}-size`] = px(size)
    vars[`--mm-level-${level}-lh`] = px(lineHeightFor(size))
  })
  return vars
}

/** Of the band's two ends, the one that reads better on a fill. */
export function readableOn(look: ThemeLook, fill: string): string {
  const light = look.bandColors[0]
  const dark = look.bandColors[5]
  return contrastRatio(light, fill) >= contrastRatio(dark, fill) ? light : dark
}

/** The quiet colours of what hangs on no branch: relationships, summaries, the central topic's labels. */
function neutralColors(look: ThemeLook) {
  return {
    relation: mixColors(look.text, look.ground, 0.3),
    summary: mixColors(look.text, look.ground, 0.4),
    labelFill: mixColors(look.ground, look.strongText, 0.1),
  }
}

/** The shadow under the central topic: soft on a light ground, a faint ring on a dark one. */
function centralShadow(look: ThemeLook): string {
  if (look.central.fill === null) return 'none'
  return look.variant === 'dark'
    ? `0 0 0 6px ${withAlpha(look.bandColors[0], 0.08)}`
    : `0 10px 24px -12px ${withAlpha(look.bandColors[5], 0.5)}`
}

/** Everything of a look that is the same for the whole map, as custom properties of the container. */
export function containerVars(look: ThemeLook): Record<string, string> {
  const { shapes, spacing, lines } = look
  const neutral = neutralColors(look)
  return {
    '--mm-ground': look.ground,
    '--mm-text': look.text,
    '--mm-strong': look.strongText,
    '--mm-central-fill': look.central.fill ?? 'transparent',
    '--mm-central-text': look.central.text,
    '--mm-central-border': look.central.border ?? 'transparent',
    '--mm-central-shadow': centralShadow(look),
    '--mm-central-label-fill': look.central.fill === null ? neutral.labelFill : look.ground,
    '--mm-central-label-text': look.text,
    ...shapeVars('central', shapes.central),
    ...shapeVars('main', shapes.main),
    ...shapeVars('sub', shapes.sub),
    ...deepShapeVars(look),
    '--mm-line-main': String(lines.main.width),
    '--mm-line-sub': String(lines.sub.width),
    '--mm-line-sub-opacity': String(lines.sub.opacity),
    '--mm-row-pad': px(spacing.subGapY / 2),
    '--mm-relation': neutral.relation,
    '--mm-summary': neutral.summary,
    // what a topic outside every branch falls back to
    '--mm-branch': look.strongText,
    '--mm-label-fill': neutral.labelFill,
    '--mm-label-text': look.text,
  }
}

/** How many branch colours a look has; main branch `n` uses colour `n % count`. */
export function branchCount(look: ThemeLook): number {
  return look.branches.length
}

/** The colours of one main branch and everything below it, as custom properties of its wrapper. */
export function branchVars(look: ThemeLook, index: number): Record<string, string> {
  const branch = look.branches[index % look.branches.length]!
  return {
    '--mm-branch': branch.color,
    '--mm-main-fill': branch.main.fill ?? 'transparent',
    '--mm-main-text': branch.main.text,
    '--mm-main-border': branch.main.border ?? 'transparent',
    // only a topic filled with its branch colour lifts off the ground a little
    '--mm-main-shadow':
      look.shapes.main.fill === 'solid'
        ? `0 6px 14px -8px ${withAlpha(branch.color, 0.6)}`
        : 'none',
    '--mm-sub-fill': branch.sub.fill ?? 'transparent',
    '--mm-sub-text': branch.sub.text,
    '--mm-sub-border': branch.sub.border ?? 'transparent',
    '--mm-label-fill': branch.label.fill,
    '--mm-label-text': branch.label.text,
    // a label on a filled topic sits on the ground colour, or it would melt into the fill
    '--mm-main-label-fill': branch.main.fill === null ? branch.label.fill : look.ground,
    '--mm-sub-label-fill': branch.sub.fill === null ? branch.label.fill : look.ground,
  }
}

/** How far inside a filled central topic a main branch starts; the topic is drawn over that end. */
const HIDDEN_START = 6

/** What the branch-line functions need to know about a look. */
export function branchGeometry(look: ThemeLook): BranchGeometry {
  const { shapes, spacing, lines } = look
  return {
    subShape: lines.sub.shape,
    cornerRadius: lines.cornerRadius,
    mainUnderline: shapes.main.border === 'underline' ? shapes.main.borderWidth : null,
    subUnderline: shapes.sub.border === 'underline' ? shapes.sub.borderWidth : null,
    centralInset: look.central.fill === null ? shapes.central.borderWidth / 2 : HIDDEN_START,
    subPadX: spacing.subGapX,
    subPadY: spacing.subGapY / 2,
    downPadX: spacing.subGapY,
  }
}

/** A look as the library's theme: its variables, the `--mm-` properties and the branch-line functions. */
export function libraryTheme(look: ThemeLook): Theme {
  const { spacing } = look
  const geometry = branchGeometry(look)
  return {
    name: look.id,
    type: look.variant === 'dark' ? 'dark' : 'light',
    // The library colours a line by its place on screen; `decorate.ts` colours it by its place in the map.
    palette: look.branches.map((branch) => branch.color),
    cssVar: {
      '--node-gap-x': px(spacing.subGapX),
      '--node-gap-y': px(spacing.subGapY),
      '--main-gap-x': px(spacing.mainGapX),
      '--main-gap-y': px(spacing.mainGapY),
      '--bgcolor': look.ground,
      '--color': look.text,
      '--main-color': look.strongText,
      '--main-bgcolor': look.ground,
      '--main-bgcolor-transparent': look.ground,
      '--root-color': look.central.text,
      '--root-bgcolor': look.central.fill ?? look.ground,
      '--root-border-color': look.central.border ?? 'transparent',
      '--root-radius': px(look.shapes.central.radius),
      '--main-radius': px(look.shapes.main.radius),
      '--topic-padding': padding(look.shapes.sub),
      '--map-padding': '60px 90px',
      // the menu and the tips are app chrome; `styles.css` gives them their colours
      '--panel-color': look.text,
      '--panel-bgcolor': look.ground,
      '--panel-border-color': look.text,
      '--selected': look.strongText,
      '--accent-color': look.branches[0]?.color ?? look.strongText,
      ...containerVars(look),
    } as Theme['cssVar'],
    generateMainBranch: (boxes) => mainBranchPath(geometry, boxes),
    generateSubBranch: (boxes) => subBranchPath(geometry, boxes),
  }
}
