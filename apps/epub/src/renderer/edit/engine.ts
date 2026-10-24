/**
 * The parts of the EPUB engine the editing screen runs in the page: reading
 * a chapter's blocks with their source ranges and the block notation.
 *
 * They come from their own modules, not from the package entry: the entry
 * also carries book translation, which brings Node-only modules into the
 * page's bundle (the PDF editor's page reads pdf-structure the same way).
 * Types still come from the package entry.
 */
export { OPAQUE_ELEMENTS, openChapter } from '../../../../../packages/epub-engine/src/blocks'
export {
  blockPlainText,
  escapeNotationText,
} from '../../../../../packages/epub-engine/src/notation'
