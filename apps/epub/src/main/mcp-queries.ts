/**
 * What the in-app MCP server asks an open book. The book lives in the main
 * process. A read first asks the renderer to flush pending edits, then reads
 * chapters in spine order, with headings as `#` lines and unsaved edits included.
 * Saving goes through `epubSaveToPath` in the main module.
 */
export { epubReadText, epubSaveToPath } from './epub-main'
