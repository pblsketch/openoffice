/**
 * Spreadsheet copies (Excel, and this app's sheet editor) put a picture of
 * the cells on the clipboard next to their text and HTML table, for chat
 * apps and image editors. A paste target that also takes text should treat
 * such a clipboard as text: the picture is only a rendering of it. A real
 * picture copy carries no text, or HTML with an <img> in it.
 */
export function clipboardPictureIsRendering(html: string, text: string): boolean {
  if (/<(table|tr|td|th)\b/i.test(html)) return true
  return text.trim() !== '' && !/<img\b/i.test(html)
}
