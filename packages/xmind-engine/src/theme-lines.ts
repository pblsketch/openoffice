/**
 * The two line settings of a whole map, kept on the `map` level of a sheet's
 * theme in the file's own properties:
 *
 *  - `line-tapered`: `tapered` makes the lines from the centre narrow towards
 *    their ends; `none` (or no value) draws them evenly.
 *  - `multi-line-colors`: a space-separated colour list gives each main branch
 *    line its own colour; `none` switches that off. No value means on, with
 *    the colours of the look the map is drawn with.
 *
 * They are the user's settings, not part of a theme: recognising a theme
 * leaves them out (`theme-table.ts`), picking another theme carries them over
 * (`theme-sheet.ts`), and a theme that holds nothing else counts as no theme.
 *
 * Like a theme, a setting is written only when the user switches it, and then
 * only its own key: nothing else in the theme is touched, whoever wrote it.
 * No key or mark of this app's own goes into the file.
 */

import type { XmindDocument } from './document'
import { newXmindId } from './ids'
import {
  LINE_TAPERED,
  MAP_LEVEL,
  MAP_LINE_SETTINGS,
  MULTI_LINE_COLORS,
  SETTING_OFF,
  TAPERED,
} from './theme-line-keys'
import { recogniseTheme, SHIPPED_THEME_TABLES, WRITTEN_THEME_TABLES } from './theme-table'
import { isRecord, type XmindSheet } from './types'

/** The map-wide line settings of a sheet, as its theme holds them. */
export interface SheetLineSettings {
  /** The lines from the centre to the main branches narrow towards their ends. */
  tapered: boolean
  /** Each main branch line takes its own colour. */
  rainbow: boolean
  /**
   * The colour list exactly as the file holds it, while the rainbow is on and
   * a list is written; otherwise null. A caller that switches the rainbow off
   * keeps this to hand it back when switching it on again.
   */
  rainbowColors: string | null
}

/** The properties of the map level, when the theme has one that is a table. */
function mapProperties(theme: unknown): Record<string, unknown> | null {
  if (!isRecord(theme)) return null
  const level = theme[MAP_LEVEL]
  if (!isRecord(level) || !isRecord(level.properties)) return null
  return level.properties
}

/**
 * Reads the two settings of a sheet. A sheet without a theme, or with one
 * that is not a table, reads as the default look: not tapered, rainbow on.
 * Only reads.
 */
export function sheetLineSettings(sheet: XmindSheet): SheetLineSettings {
  const properties = mapProperties(sheet.theme)
  const tapered = properties?.[LINE_TAPERED]
  const colors = properties?.[MULTI_LINE_COLORS]
  const rainbow = colors !== SETTING_OFF
  return {
    tapered: tapered === TAPERED,
    rainbow,
    rainbowColors: rainbow && typeof colors === 'string' && colors !== '' ? colors : null,
  }
}

/**
 * Whether a `theme` value amounts to no theme: absent, empty, or holding
 * nothing but the two map-wide line settings (what switching one on a sheet
 * without a theme leaves). Such a sheet is drawn with the default look and
 * is no theme to warn about.
 */
export function isBlankSheetTheme(theme: unknown): boolean {
  if (theme === undefined || theme === null) return true
  if (!isRecord(theme)) return false
  const names = Object.keys(theme)
  if (names.length === 0) return true
  if (names.length !== 1 || names[0] !== MAP_LEVEL) return false
  const level = theme[MAP_LEVEL]
  if (!isRecord(level) || !isRecord(level.properties)) return false
  if (Object.keys(level).some((key) => key !== 'id' && key !== 'properties')) return false
  return Object.entries(level.properties).every(
    ([key, value]) => MAP_LINE_SETTINGS.includes(key) && typeof value === 'string',
  )
}

/**
 * Whether a sheet carries a theme this app did not write, which the editor
 * draws with the default look and tells the user about. A theme that is not a
 * table at all is not counted (the editor never did), nor is a blank one.
 */
export function isUnknownSheetTheme(sheet: XmindSheet): boolean {
  return (
    isRecord(sheet.theme) && !isBlankSheetTheme(sheet.theme) && recogniseTheme(sheet.theme) === null
  )
}

/**
 * The map level's properties, made when the sheet has no theme, the theme no
 * map level, or the level no properties; each new level gets a fresh id, the
 * way the format's writer hands them out. Null, with nothing changed, when
 * the theme or the level is there but is something a key cannot be added to.
 */
function writableMapProperties(sheet: XmindSheet): Record<string, unknown> | null {
  if (sheet.theme === undefined || sheet.theme === null) sheet.theme = {}
  const theme = sheet.theme
  if (!isRecord(theme)) return null
  if (theme[MAP_LEVEL] === undefined) theme[MAP_LEVEL] = { id: newXmindId(), properties: {} }
  const level = theme[MAP_LEVEL]
  if (!isRecord(level)) return null
  if (level.properties === undefined) level.properties = {}
  return isRecord(level.properties) ? level.properties : null
}

/** Puts one value on the map level, in its place when the key is there already. */
function writeSetting(sheet: XmindSheet, key: string, value: string): boolean {
  const properties = writableMapProperties(sheet)
  if (!properties) return false
  properties[key] = value
  return true
}

/**
 * Takes a key off the map level. A theme left with nothing but an empty map
 * level is taken off the sheet as well: it is what switching a setting on a
 * sheet without a theme made, and the sheet goes back to having none.
 */
function removeSetting(sheet: XmindSheet, key: string): boolean {
  const properties = mapProperties(sheet.theme)
  if (!properties || !(key in properties)) return false
  delete properties[key]
  if (isBlankSheetTheme(sheet.theme) && Object.keys(properties).length === 0) delete sheet.theme
  return true
}

/**
 * Switches the tapered lines of a sheet: `tapered` on, `none` off. Writes
 * nothing when the sheet already reads that way. Returns whether the sheet
 * changed; it also stays as it was when its theme is not a table a key can
 * be added to. The caller marks the document; `applySheetTapered` does both.
 */
export function writeSheetTapered(sheet: XmindSheet, on: boolean): boolean {
  if (sheetLineSettings(sheet).tapered === on) return false
  return writeSetting(sheet, LINE_TAPERED, on ? TAPERED : SETTING_OFF)
}

/**
 * The colour list of a theme of this app, with the rainbow switched back on:
 * the list of the table the theme is recognised by. Today's and an earlier
 * release's tables are tried in turn.
 */
function ownColors(
  theme: Record<string, unknown>,
  properties: Record<string, unknown>,
): string | null {
  const id = recogniseTheme(theme)
  if (id === null) return null
  const lists = new Set<string>()
  for (const entry of [...WRITTEN_THEME_TABLES, ...SHIPPED_THEME_TABLES]) {
    const list = entry.themeId === id ? entry.properties[MAP_LEVEL]?.[MULTI_LINE_COLORS] : undefined
    if (list !== undefined) lists.add(list)
  }
  const level = theme[MAP_LEVEL] as Record<string, unknown>
  for (const list of lists) {
    const candidate = {
      ...theme,
      [MAP_LEVEL]: { ...level, properties: { ...properties, [MULTI_LINE_COLORS]: list } },
    }
    if (recogniseTheme(candidate) === id) return list
  }
  return null
}

/**
 * Switches the branch colours of a sheet. Off writes `none`. On writes, in
 * this order of choice: the colour list of the sheet's theme when it is one
 * of this app's; else `previousColors`, the list the sheet held before it was
 * switched off (the caller keeps it from `sheetLineSettings`, the file keeps
 * no copy); else nothing, taking the key off. Writes nothing when the sheet
 * already reads that way. Returns whether the sheet changed. The caller marks
 * the document; `applySheetRainbow` does both.
 */
export function writeSheetRainbow(
  sheet: XmindSheet,
  on: boolean,
  previousColors?: string | null,
): boolean {
  if (sheetLineSettings(sheet).rainbow === on) return false
  if (!on) return writeSetting(sheet, MULTI_LINE_COLORS, SETTING_OFF)
  // Reading off means the map level holds `none`, so there is a table here.
  const theme = sheet.theme as Record<string, unknown>
  const properties = mapProperties(theme)!
  const own = ownColors(theme, properties)
  if (own !== null) return writeSetting(sheet, MULTI_LINE_COLORS, own)
  if (
    typeof previousColors === 'string' &&
    previousColors !== '' &&
    previousColors !== SETTING_OFF
  ) {
    return writeSetting(sheet, MULTI_LINE_COLORS, previousColors)
  }
  return removeSetting(sheet, MULTI_LINE_COLORS)
}

function sheetAt(document: XmindDocument, sheetIndex: number): XmindSheet {
  const sheet = document.sheets[sheetIndex]
  if (!sheet) throw new Error(`xmind: there is no sheet ${sheetIndex}`)
  return sheet
}

/** The user switched the tapered lines of a sheet: written, and the document marked, when it changed. */
export function applySheetTapered(
  document: XmindDocument,
  sheetIndex: number,
  on: boolean,
): boolean {
  const changed = writeSheetTapered(sheetAt(document, sheetIndex), on)
  if (changed) document.markChanged()
  return changed
}

/** The user switched the branch colours of a sheet: written, and the document marked, when it changed. */
export function applySheetRainbow(
  document: XmindDocument,
  sheetIndex: number,
  on: boolean,
  previousColors?: string | null,
): boolean {
  const changed = writeSheetRainbow(sheetAt(document, sheetIndex), on, previousColors)
  if (changed) document.markChanged()
  return changed
}
