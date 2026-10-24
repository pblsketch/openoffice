/**
 * What the in-app MCP server asks an open book. The book lives in the main
 * process, so the text is read here, without asking the renderer: chapters in
 * spine order, headings as `#` lines, the edits this side holds included.
 * Saving goes through `epubSaveToPath` in the main module.
 */
export { epubReadText, epubSaveToPath } from './epub-main'
