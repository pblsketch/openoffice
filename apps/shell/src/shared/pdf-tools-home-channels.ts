// Home's channel into the PDF tools window. Kept apart from pdf-tools-api.ts
// on purpose: the shell preload (index) and the PDF tools window's preload are
// separate bundle entries, and a module both import by value is split into a
// shared chunk that a sandboxed preload cannot load.
export const PDF_TOOLS_HOME_CHANNELS = {
  open: 'pdf-tools:open',
} as const
