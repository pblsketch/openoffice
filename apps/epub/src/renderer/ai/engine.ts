/**
 * The parts of the EPUB engine the AI tools run in the page: a chapter's
 * blocks and the block notation (spec §7).
 *
 * They come from their own modules, not from the package entry: the entry
 * also carries book translation, which brings Node-only modules into the
 * page's bundle (see `edit/engine.ts`). Types still come from the package
 * entry.
 */
export { openChapter } from '../../../../../packages/epub-engine/src/blocks'
export {
  blockNotation,
  blockPlainText,
  checkNotation,
  escapeNotationText,
  newBlockNotationToXhtml,
} from '../../../../../packages/epub-engine/src/notation'
