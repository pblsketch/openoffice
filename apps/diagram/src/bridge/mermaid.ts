/**
 * Mermaid with draw.io's own converter, inside the draw.io page (spec 7, 8.2).
 * The result is what draw.io's Insert › Mermaid makes: the converted cells in
 * an editable group that carries the Mermaid source (so a double click edits
 * it in draw.io), with the text alternative as its tooltip. Converting
 * changes nothing; the app imports the XML later, inside one edit.
 */
import type { DrawioUi } from './drawio-adapter'

declare const EditorUi: any
declare const mxMermaidToDrawio: any

/** How long the converter may take (it parses synchronously when no web font is needed). */
const CONVERT_TIMEOUT_MS = 20_000

/** The converter's own words for a failure. */
function reasonOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (error !== null && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return typeof error === 'string' && error ? error : 'the converter gave no reason'
}

/**
 * The converter defaults a new drawing takes (and stores): the current ones,
 * as draw.io's dialog uses, unless they draw in a web font (Mermaid 12's
 * redux themes use one from the web). Then none: Mermaid 11's defaults, which
 * need no font from outside, so nothing the AI draws points at the web.
 */
function offlineVersion(text: string): string | null {
  const current: unknown =
    typeof EditorUi.getInsertMermaidVersion === 'function'
      ? EditorUi.getInsertMermaidVersion()
      : null
  if (current == null) return null
  try {
    const fonts: unknown =
      typeof mxMermaidToDrawio.getFonts === 'function'
        ? mxMermaidToDrawio.getFonts(text, null, { version: current })
        : null
    return Array.isArray(fonts) && fonts.length > 0 ? null : String(current)
  } catch {
    // the converter reports a text it cannot read when it parses it
    return String(current)
  }
}

/** Converts Mermaid source into draw.io XML; rejects with the converter's reason. */
export function convertMermaid(ui: DrawioUi, text: string): Promise<{ xml: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (run: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      run()
    }
    const fail = (error: unknown): void => settle(() => reject(new Error(reasonOf(error))))
    const timer = setTimeout(() => fail('the Mermaid converter did not answer'), CONVERT_TIMEOUT_MS)
    if (typeof text !== 'string' || text.trim() === '') {
      fail('the Mermaid text is empty')
      return
    }
    try {
      const version = offlineVersion(text)
      ui.parseMermaidDiagram(
        text,
        null,
        (xml: string) => {
          try {
            const config =
              typeof EditorUi.getInsertMermaidConfig === 'function'
                ? EditorUi.getInsertMermaidConfig()
                : null
            const wrapped: string = mxMermaidToDrawio.wrapGroup(
              xml,
              text,
              config,
              version != null ? { version } : null,
            )
            const out: string =
              typeof ui.addMermaidTooltip === 'function' ? ui.addMermaidTooltip(wrapped) : wrapped
            settle(() => resolve({ xml: out }))
          } catch (err) {
            fail(err)
          }
        },
        fail,
        null,
        version,
      )
    } catch (err) {
      fail(err)
    }
  })
}
