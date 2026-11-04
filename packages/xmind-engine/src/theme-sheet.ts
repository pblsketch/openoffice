/**
 * Putting a theme onto a sheet. This is the only place a sheet's `theme` is
 * written, and it runs for two reasons only: the user picked a theme, or a
 * sheet was just made. Opening, recognising and saving never come through
 * here, so a file whose theme nobody chose keeps it as it was.
 */

import { setDefaultSheetTheme } from './create'
import type { XmindDocument } from './document'
import { newXmindId } from './ids'
import { DEFAULT_THEME_ID, type ThemeId } from './theme-data'
import { LINE_TAPERED, MAP_LEVEL, MULTI_LINE_COLORS, SETTING_OFF, TAPERED } from './theme-line-keys'
import { sheetLineSettings } from './theme-lines'
import { writtenThemeProperties } from './theme-table'
import type { XmindSheet } from './types'

/** One level of a theme as the file holds it. */
export interface XmindThemeLevel {
  id: string
  properties: Record<string, string>
}

/** A sheet's `theme` value as this app writes it: level name to level. */
export type XmindThemeTable = Record<string, XmindThemeLevel>

/**
 * A theme as a new `theme` value: the table written for it today, each level
 * with a fresh id, the way the format's own writer hands them out. Every call
 * gives a separate object that the caller may keep in a sheet.
 */
export function themeTable(id: ThemeId): XmindThemeTable {
  return Object.fromEntries(
    Object.entries(writtenThemeProperties(id)).map(([name, properties]) => [
      name,
      { id: newXmindId(), properties: { ...properties } },
    ]),
  )
}

/**
 * Sets a sheet's theme, replacing whatever theme it had. The two map-wide
 * line settings are the user's, not the theme's, so they carry over: the new
 * table differs from the one written for the theme only where the sheet's
 * settings differ from it (see `theme-lines.ts`). The caller marks the
 * document changed; `applySheetTheme` does both.
 */
export function writeSheetTheme(sheet: XmindSheet, id: ThemeId): void {
  const settings = sheetLineSettings(sheet)
  const table = themeTable(id)
  const map = table[MAP_LEVEL]?.properties
  if (map) {
    if (settings.tapered) map[LINE_TAPERED] = TAPERED
    if (!settings.rainbow) map[MULTI_LINE_COLORS] = SETTING_OFF
  }
  sheet.theme = table
}

/** The user picked a theme for a sheet: writes it and marks the document changed. */
export function applySheetTheme(document: XmindDocument, sheetIndex: number, id: ThemeId): void {
  const sheet = document.sheets[sheetIndex]
  if (!sheet) throw new Error(`xmind: there is no sheet ${sheetIndex}`)
  writeSheetTheme(sheet, id)
  document.markChanged()
}

// Every new sheet, and so every new file, starts with the default theme.
// Loading this module is what switches that on; the package's index loads it.
setDefaultSheetTheme((sheet) => writeSheetTheme(sheet, DEFAULT_THEME_ID))
