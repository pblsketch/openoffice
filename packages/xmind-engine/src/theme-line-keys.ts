/**
 * The two map-wide line settings a sheet's theme holds on its `map` level, in
 * the file's own words. They are read and written for compatibility; this app
 * adds no key of its own.
 *
 * Kept apart from `theme-table.ts` and `theme-lines.ts` so that both can use
 * them without loading each other. Not exported from the package.
 */

/** The level of a theme that holds the settings of the whole map. */
export const MAP_LEVEL = 'map'

/** `tapered` or `none`: lines from the centre narrow towards their ends. */
export const LINE_TAPERED = 'line-tapered'

/** A space-separated colour list, one per main branch, or `none`. */
export const MULTI_LINE_COLORS = 'multi-line-colors'

/** The value `line-tapered` takes when switched on. */
export const TAPERED = 'tapered'

/** The value either setting takes when switched off. */
export const SETTING_OFF = 'none'

/** The two keys, for telling a theme that holds nothing else. */
export const MAP_LINE_SETTINGS: readonly string[] = [LINE_TAPERED, MULTI_LINE_COLORS]
