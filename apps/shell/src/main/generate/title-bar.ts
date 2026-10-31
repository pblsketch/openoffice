import type { TitleBarOverlay } from 'electron'

/**
 * The height of the generate window's own title band. The window uses
 * `titleBarStyle: 'hidden'` on Windows/Linux so its caption buttons can take
 * the app's theme: Electron can theme the overlay, but Windows paints a native
 * frame light even when `nativeTheme.themeSource` is dark.
 *
 * Must match `.gen-head`'s height in generate.css.
 */
export const GENERATE_TITLE_BAR_HEIGHT = 44

/** Overlay colors from tokens.css: --surface and --text in each theme. */
export function generateTitleBarOverlay(dark: boolean): TitleBarOverlay {
  return dark
    ? { color: '#1e1e1e', symbolColor: '#e4e4e4', height: GENERATE_TITLE_BAR_HEIGHT }
    : { color: '#ffffff', symbolColor: '#242424', height: GENERATE_TITLE_BAR_HEIGHT }
}
