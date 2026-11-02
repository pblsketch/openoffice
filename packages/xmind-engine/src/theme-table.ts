/**
 * A theme in the file's own terms, and telling one of ours when it comes back.
 *
 * The format keeps a sheet's theme as one property table per level (`map`,
 * `centralTopic`, `mainTopic`, `subTopic`), each wrapped as
 * `{ id, properties }`. The property names and the `org.xmind.*` class names
 * below are identifiers of the file format, read and written for
 * compatibility; every value written under them is this project's own.
 *
 * The app puts no mark of its own into the file. A theme is recognised by its
 * table alone: property for property the same as one this app writes, or
 * wrote in an earlier release. Anything else, such as a theme from another
 * program or one of ours that another program saved again with different
 * properties, is not recognised, and nothing here ever changes it.
 *
 * Two properties of the `map` level are the user's own settings rather than
 * part of the theme (see `theme-lines.ts`): whether lines taper, and whether
 * each branch line takes its own colour. Recognising leaves the value of the
 * first out, and takes the second either as `none` or as the theme's own
 * colour list.
 */

import { contrastRatio, mixColors } from './theme-color'
import {
  THEME_IDS,
  THEME_RULES,
  type ThemeBranchShape,
  type ThemeId,
  type ThemeTopicShape,
} from './theme-data'
import { LINE_TAPERED, MAP_LEVEL, MULTI_LINE_COLORS, SETTING_OFF } from './theme-line-keys'
import { themeLook, type ThemeLook } from './theme-look'
import { isRecord, type XmindSheet } from './types'

/** The properties of one level, by the name the file uses for each. */
export type ThemeLevelProperties = Readonly<Record<string, string>>

/** A theme as the file holds it, without the ids: level name to properties. */
export type ThemeProperties = Readonly<Record<string, ThemeLevelProperties>>

/** One table and the theme it stands for. */
export interface ThemeTableEntry {
  themeId: ThemeId
  properties: ThemeProperties
}

const ROUNDED_SHAPE = 'org.xmind.topicShape.roundedRect'
const UNDERLINE_SHAPE = 'org.xmind.topicShape.underline'
const BRANCH_CLASS: Readonly<Record<ThemeBranchShape, string>> = {
  curve: 'org.xmind.branchConnection.curve',
  'rounded-elbow': 'org.xmind.branchConnection.roundedElbow',
}
/** the format's word for "take this from the branch the topic is on" */
const INHERITED = 'inherited'
/**
 * Share of the strongest text colour in a soft fill as the file gets it. The
 * format has no "a little of the branch colour", so a softly filled topic is
 * written with one quiet fill for all branches.
 */
const SOFT_FILL_IN_FILE = 0.08

/**
 * The file takes whole numbers. A half rounds down, so that a line drawn
 * thinner on screen is still the thinner one in the file. The editor writes a
 * value it draws the same way (its format painter).
 */
export function wholeNumber(value: number): number {
  return Math.ceil(value - 0.5)
}

function points(value: number): string {
  return `${wholeNumber(value)}pt`
}

interface LevelColors {
  fill: string
  text: string
  line: string
  border: string
}

/** How far a text colour is moved in one step while looking for one that reads. */
const TEXT_STEPS = 20

/**
 * The one text colour a level gets in the file. `wanted` when it reads on
 * every colour the file may put under the text; otherwise the first step from
 * it towards one of `ends` that does; otherwise the step that reads best on
 * the worst of them. That last case only arises for a fill taken from the
 * branch, whose four colours can be too far apart for any single text colour.
 */
function textOn(surfaces: readonly string[], wanted: string, ends: readonly string[]): string {
  const worst = (color: string): number =>
    Math.min(...surfaces.map((surface) => contrastRatio(color, surface)))
  let best = wanted
  for (const end of ends) {
    for (let step = 0; step <= TEXT_STEPS; step++) {
      const candidate = mixColors(wanted, end, step / TEXT_STEPS)
      const reach = worst(candidate)
      if (reach >= THEME_RULES.readableContrast) return candidate
      if (reach > worst(best)) best = candidate
    }
  }
  return best
}

function topicProperties(
  shape: ThemeTopicShape,
  colors: LevelColors,
  lineWidth: number,
  branch: ThemeBranchShape,
): ThemeLevelProperties {
  return {
    'fo:font-size': points(shape.fontSize),
    'fo:font-weight': String(wholeNumber(shape.fontWeight / 100) * 100),
    'fo:color': colors.text,
    'svg:fill': colors.fill,
    'fill-pattern': shape.fill === 'none' ? 'none' : 'solid',
    'line-width': points(lineWidth),
    'line-color': colors.line,
    'border-line-color': colors.border,
    'border-line-width': points(shape.borderWidth),
    'shape-class': shape.border === 'underline' ? UNDERLINE_SHAPE : ROUNDED_SHAPE,
    'line-class': BRANCH_CLASS[branch],
  }
}

/**
 * The properties this app writes for a look.
 *
 * How the skeletons carry over: a pill and a capsule are a rounded rectangle
 * (the pill with a quiet fill, the capsule with an outline), a block is a
 * rounded rectangle filled with its branch colour, and the line skeleton is
 * the underline shape. Sizes, weights and line widths go in as whole numbers.
 * No font name is written: each program uses its own font.
 *
 * The text colour is written on every level. Left out, a program falls back to
 * fixed colours of its own, which on a dark ground or a dark fill need not read
 * at all. Each level gets the look's own text colour, moved only as far as it
 * must to read on what the file puts under it: the map for a level without a
 * fill, the written fill, or every branch colour for a fill taken from the
 * branch.
 *
 * The fills come from `mixColors` and `raiseColor` alone (see
 * `theme-color.ts`); the text colours are then chosen by contrast. The tables
 * are pinned by a test, so none of this shifts between releases unnoticed.
 */
export function themePropertiesOf(look: ThemeLook): ThemeProperties {
  const { shapes, ground, strongText } = look
  const softFill = mixColors(ground, strongText, SOFT_FILL_IN_FILE)
  const branchFills = look.branches.map((branch) => branch.color)
  const ends = [strongText, '#ffffff', '#000000']
  const branchColors = (
    shape: ThemeTopicShape,
    wanted: (branch: ThemeLook['branches'][number]) => string,
    plain: string,
  ): LevelColors => {
    const fill = shape.fill === 'soft' ? softFill : INHERITED
    const surfaces =
      shape.fill === 'none' ? [ground] : shape.fill === 'soft' ? [softFill] : branchFills
    const text = shape.fill === 'solid' ? wanted(look.branches[0]!) : plain
    return { fill, text: textOn(surfaces, text, ends), line: INHERITED, border: INHERITED }
  }
  const centralFill = shapes.central.fill === 'none' ? ground : strongText
  return {
    map: {
      'svg:fill': ground,
      'multi-line-colors': look.branches.map((branch) => branch.color).join(' '),
      'color-list': look.bandColors.join(' '),
      'line-tapered': 'none',
    },
    centralTopic: topicProperties(
      shapes.central,
      {
        fill: centralFill,
        text: textOn([centralFill], look.central.text, ends),
        line: strongText,
        border: strongText,
      },
      look.lines.main.width,
      look.lines.main.shape,
    ),
    mainTopic: topicProperties(
      shapes.main,
      branchColors(shapes.main, (branch) => branch.main.text, strongText),
      look.lines.sub.width,
      look.lines.sub.shape,
    ),
    subTopic: topicProperties(
      shapes.sub,
      branchColors(shapes.sub, (branch) => branch.sub.text, look.text),
      look.lines.sub.width,
      look.lines.sub.shape,
    ),
  }
}

/**
 * What a table is compared by: its levels and their properties in a fixed
 * order, as text. Null for anything that is not a table of properties. The
 * `id` of a level is left out, because it is made anew on every write; a
 * level with any other key beside `properties` is not ours. So is the value
 * of `line-tapered` on the map level, which the user switches without
 * changing the theme: only whether the property is there is compared.
 */
function tableKey(theme: unknown): string | null {
  if (!isRecord(theme)) return null
  const levels: [string, [string, string][]][] = []
  for (const name of Object.keys(theme).sort()) {
    const level = theme[name]
    if (!isRecord(level) || !isRecord(level.properties)) return null
    if (Object.keys(level).some((key) => key !== 'id' && key !== 'properties')) return null
    const { properties } = level
    const pairs: [string, string][] = []
    for (const property of Object.keys(properties).sort()) {
      const value = properties[property]
      if (typeof value !== 'string') return null
      const ignored = name === MAP_LEVEL && property === LINE_TAPERED
      pairs.push([property, ignored ? '' : value])
    }
    levels.push([name, pairs])
  }
  return JSON.stringify(levels)
}

function propertiesKey(properties: ThemeProperties): string {
  const table = Object.fromEntries(
    Object.entries(properties).map(([name, level]) => [name, { properties: level }]),
  )
  return tableKey(table)!
}

/**
 * A table with the branch colours switched off, the way the theme panel
 * leaves it. A table without the property stays as it is.
 */
function withRainbowOff(properties: ThemeProperties): ThemeProperties {
  const map = properties[MAP_LEVEL]
  if (map?.[MULTI_LINE_COLORS] === undefined) return properties
  return { ...properties, [MAP_LEVEL]: { ...map, [MULTI_LINE_COLORS]: SETTING_OFF } }
}

function frozen(properties: ThemeProperties): ThemeProperties {
  for (const level of Object.values(properties)) Object.freeze(level)
  return Object.freeze(properties)
}

/**
 * The first of the two lists: the table written for each theme today. One
 * entry per theme, in the order of `THEME_IDS`, worked out from the theme
 * table.
 */
export const WRITTEN_THEME_TABLES: readonly ThemeTableEntry[] = THEME_IDS.map((themeId) => ({
  themeId,
  properties: frozen(themePropertiesOf(themeLook(themeId))),
}))

/**
 * The sizes the 0.12 releases wrote for the three levels, in the units of the
 * file. They are put back into today's tables to make the tables those
 * releases wrote.
 */
const SHIPPED_FONT_SIZES: Readonly<Record<string, string>> = {
  centralTopic: '21pt',
  mainTopic: '15pt',
  subTopic: '14pt',
}

/** A table this app wrote before the text sizes changed: today's table with the sizes of that release. */
function shippedProperties(properties: ThemeProperties): ThemeProperties {
  const levels: Record<string, ThemeLevelProperties> = {}
  for (const [name, level] of Object.entries(properties)) {
    const size = SHIPPED_FONT_SIZES[name]
    levels[name] = size === undefined ? level : { ...level, 'fo:font-size': size }
  }
  return frozen(levels)
}

/**
 * The second list: tables an earlier release wrote for a theme whose values
 * have changed since. They are recognised and never written.
 *
 * A file saved by an older release must still open as the theme its user
 * picked. So before changing a value that has shipped (a band colour, a size,
 * a rule), copy the table each affected theme has in the last release into
 * this list, under the same theme id, and only then change the value. Such a
 * file is then drawn with the theme's present look, and keeps the old
 * properties until the user picks a theme again. `tests/theme-table.test.ts`
 * pins the tables written today and fails when one of them moves, as the
 * reminder to do this.
 *
 * The 0.12 releases wrote 21pt, 15pt and 14pt. The text is smaller now, so
 * every theme has the table of 0.12 in here: today's table with those sizes
 * put back. A test pins this list as well, so a colour or a rule that moves
 * later is caught before it changes what an older file is recognised by. The
 * tables in here are then written out by hand, as the rule above says.
 */
export const SHIPPED_THEME_TABLES: readonly ThemeTableEntry[] = WRITTEN_THEME_TABLES.map(
  ({ themeId, properties }) => ({ themeId, properties: shippedProperties(properties) }),
)

const written = new Map(WRITTEN_THEME_TABLES.map((entry) => [entry.themeId, entry.properties]))

/** The table written for a theme today. Frozen: copy it before putting it into a sheet. */
export function writtenThemeProperties(id: ThemeId): ThemeProperties {
  const properties = written.get(id)
  if (!properties) throw new Error(`xmind: there is no theme ${String(id)}`)
  return properties
}

/** Tells which theme a sheet's `theme` value is, or null when it is none this app wrote. */
export type ThemeRecogniser = (theme: unknown) => ThemeId | null

/**
 * A recogniser over the two lists. A table must be equal to a listed one in
 * every level and every property (their order does not matter, the level ids
 * are not compared). On the map level, `line-tapered` may hold any value, and
 * `multi-line-colors` may be `none` in the place of the listed colours.
 *
 * Throws when two different themes share a table: a file could then not be
 * told apart, whichever of the two wrote it. With the lists of this module
 * that would be a mistake in the theme table, and it surfaces as soon as the
 * module is loaded, in every test.
 */
export function createThemeRecogniser(
  writtenTables: readonly ThemeTableEntry[],
  shippedBefore: readonly ThemeTableEntry[] = [],
): ThemeRecogniser {
  const themes = new Map<string, ThemeId>()
  for (const { themeId, properties } of [...writtenTables, ...shippedBefore]) {
    for (const key of [propertiesKey(properties), propertiesKey(withRainbowOff(properties))]) {
      const known = themes.get(key)
      if (known !== undefined && known !== themeId) {
        throw new Error(`xmind: themes ${known} and ${themeId} have the same table`)
      }
      themes.set(key, themeId)
    }
  }
  return (theme) => {
    const key = tableKey(theme)
    return key === null ? null : (themes.get(key) ?? null)
  }
}

/** Which of this app's themes a `theme` value is; null when it is not one of them. */
export const recogniseTheme: ThemeRecogniser = createThemeRecogniser(
  WRITTEN_THEME_TABLES,
  SHIPPED_THEME_TABLES,
)

/**
 * Which of this app's themes a sheet carries; null when its theme is absent
 * or not one this app wrote, in which case the editor draws the default look
 * and leaves the file's theme alone. Only reads: the sheet is never changed
 * and the document is not marked.
 */
export function recogniseSheetTheme(sheet: XmindSheet): ThemeId | null {
  return recogniseTheme(sheet.theme)
}
