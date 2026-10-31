export declare const AGENT_PLUGIN_ID: 'ieum-agent'

import type { DocumentProfile } from '@genoffice/doc-rules'

/**
 * What the document is made of, for the format checks of `@genoffice/doc-rules`. The
 * editor does not know the file's extension, so the app fills `format` in.
 */
export type AgentDocumentProfile = Omit<DocumentProfile, 'format'>

/** One place a searched text occurs. */
export interface AgentMatch {
  /** 1-based position among all matches, in reading order */
  occurrence: number
  inTable: boolean
  /** the match with some text around it; absent when it could not be read */
  context?: string
  /** false for text inside an equation, which has no replace path */
  replaceable?: false
}

export interface AgentFindResult {
  count: number
  /** the first matches only; `count` is the real total */
  matches: AgentMatch[]
}

/**
 * Where a change is, for the editor to show: the paragraph (for a cell, the body paragraph
 * its table sits in and the path to the cell paragraph), and a run of characters in it.
 */
export interface AgentPlace {
  sec: number
  para: number
  path?: { controlIndex: number; cellIndex: number; cellParaIndex: number }[]
  offset: number
  length: number
}

export type AgentReplaceResult =
  | { ok: true; count: number; inTable: boolean; place: AgentPlace }
  | {
      ok: false
      reason: 'not_found' | 'ambiguous' | 'no_such_occurrence' | 'unsupported_place'
      count: number
      matches?: AgentMatch[]
    }

export type AgentReplaceAllResult =
  { ok: true; count: number; place: AgentPlace } | { ok: false; reason: 'not_found'; count: 0 }

/** Why a paragraph edit did nothing: the anchor could not be decided, or an object is in the way. */
export interface AgentPlaceRefusal {
  ok: false
  reason: 'not_found' | 'ambiguous' | 'no_such_occurrence' | 'unsupported_place' | 'has_objects'
  count: number
  matches?: AgentMatch[]
}

/** Where a paragraph edit goes relative to the anchor paragraph; "end" is the end of the document. */
export type AgentWhere = 'after' | 'before' | 'end'

export type AgentInsertResult =
  { ok: true; count: number; inTable: boolean; place: AgentPlace } | AgentPlaceRefusal

export type AgentDeleteResult =
  | {
      ok: true
      /** the removed text, cut to a few hundred characters */
      text: string
      /** the paragraph kept its place as an empty line (the first of its cell or section) */
      emptied: boolean
      inTable: boolean
      place: AgentPlace
    }
  | AgentPlaceRefusal

export type AgentTableResult =
  | { ok: true; rows: number; cols: number; inTable: boolean; place: AgentPlace }
  | AgentPlaceRefusal
  /** the anchor is inside a table cell, where a table cannot be made */
  | { ok: false; reason: 'in_table'; count: number }

/** A picture put into the document: where it now sits. */
export type AgentPictureResult =
  { ok: true; inTable: boolean; place: AgentPlace } | AgentPlaceRefusal

/** Character formatting to change; what is left out stays as it is. */
export interface AgentTextFormat {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  /** font size in points */
  size?: number
  /** text colour, #RRGGBB */
  color?: string
  /** highlight colour, #RRGGBB, or "none" to take it away */
  highlight?: string
  /** font name; one the document lacks is added to its fonts */
  font?: string
  /** a character style of the document, by its name (listStyles); set before the rest */
  charStyle?: string
}

/** Formatting of a whole paragraph: its own properties, and character formatting for all its text. */
export interface AgentParagraphFormat extends AgentTextFormat {
  align?: 'left' | 'center' | 'right' | 'justify'
  /** line spacing in percent of the font height */
  lineSpacing?: number
  /** first-line indent in points; negative hangs the first line out */
  indent?: number
  /** left and right margins of the paragraph, in points */
  marginLeft?: number
  marginRight?: number
  /** space above and below the paragraph, in points */
  spacingBefore?: number
  spacingAfter?: number
  /** a paragraph style of the document, by its name (listStyles) */
  style?: string
}

/** A call named a style the document does not have; `styles` are the ones of that kind it has. */
export interface AgentNoSuchStyle {
  ok: false
  reason: 'no_such_style'
  /** the kind of style that was looked for; any: a style of either kind */
  kind: 'paragraph' | 'character' | 'any'
  styles: string[]
}

/** The styles of the document by name. */
export interface AgentStyleNames {
  paragraph: string[]
  character: string[]
}

export type AgentStyleKind = 'paragraph' | 'character'

/** What a style looks like, in the units the format calls take; paragraph properties for a paragraph style only. */
export interface AgentStyleLook {
  font: string
  size: number
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  color: string
  align?: string
  lineSpacing?: number
  indent?: number
  marginLeft?: number
  marginRight?: number
  spacingBefore?: number
  spacingAfter?: number
}

export type AgentReadStyleResult =
  | {
      ok: true
      name: string
      englishName: string
      kind: AgentStyleKind
      /** the paragraph style that follows a paragraph of this one (paragraph styles) */
      nextStyle?: string
      look: AgentStyleLook
    }
  | AgentNoSuchStyle

/** The look of a style: formatting without styles. */
export type AgentStyleFormat = Omit<AgentParagraphFormat, 'style' | 'charStyle'>

export interface AgentNewStyle {
  name: string
  englishName?: string | null
  /** paragraph when not given */
  kind?: AgentStyleKind | null
  /** the style whose look it starts from; 바탕글 when not given */
  basedOn?: string | null
  /** the paragraph style that follows; the new style itself when not given */
  nextStyle?: string | null
  format?: AgentStyleFormat | null
}

export interface AgentStyleChanges {
  /** a new name */
  name?: string | null
  englishName?: string | null
  nextStyle?: string | null
  format?: AgentStyleFormat | null
}

export type AgentStyleResult =
  | { ok: true; name: string; kind: AgentStyleKind }
  /** another style already has the name */
  | { ok: false; reason: 'style_exists' }
  | AgentNoSuchStyle

/** A place in a table, rows and columns from 1. */
export interface AgentCellPlace {
  row: number
  col: number
}

export type AgentMergeCellsResult =
  | { ok: true; merged: number; place: AgentPlace }
  | { ok: false; reason: 'no_such_table'; count: number }
  | { ok: false; reason: 'unsupported_place' }
  | { ok: false; reason: 'no_such_cell'; rows: number; cols: number }
  | { ok: false; reason: 'crosses_merged' | 'named_cells'; cells: AgentCellPlace[] }

export type AgentSplitCellResult =
  | { ok: true; unmerged: boolean; place: AgentPlace }
  | { ok: false; reason: 'no_such_table'; count: number }
  | { ok: false; reason: 'unsupported_place' | 'not_merged' | 'holds_object' }
  | { ok: false; reason: 'no_such_cell'; rows: number; cols: number }

export type AgentFormatCellsResult =
  | { ok: true; count: number; place: AgentPlace }
  | { ok: false; reason: 'no_such_table'; count: number }
  | { ok: false; reason: 'unsupported_place'; count: number }
  | {
      ok: false
      reason: 'no_such_cell'
      cells: { row: number; col: number }[]
      rows: number
      cols: number
    }

export type AgentFormatTextResult =
  | { ok: true; count: number; place: AgentPlace }
  | {
      ok: false
      reason: 'not_found' | 'ambiguous' | 'no_such_occurrence' | 'unsupported_place' | 'has_objects'
      count: number
      matches?: AgentMatch[]
    }
  | AgentNoSuchStyle

/** What replaceFont changed: runs of text, and paragraphs holding at least one. */
export interface AgentReplaceFontResult {
  ok: true
  ranges: number
  paragraphs: number
  /** the cap stopped it: some text still uses the old font */
  truncated?: true
}

export type AgentFormatParagraphResult =
  | {
      ok: true
      inTable: boolean
      place: AgentPlace
      /** 1 when the paragraph took the style's name but kept its own look (as in formatSelection) */
      keptOwnLook?: number
    }
  | AgentPlaceRefusal
  | AgentNoSuchStyle

/** One table of the document, as listTables lists it. */
export interface AgentTableSummary {
  /** 1-based position among all tables in reading order; what readTable and fillCells take */
  table: number
  rows: number
  cols: number
  /** the number of the table whose cell this one sits in; absent for a table of the body */
  inTable?: number
  /** the line of text the table follows, cut short; empty when there is none close by */
  near: string
  /** the text of its first cells that hold any, each cut short */
  preview: string[]
}

export interface AgentTableList {
  /** all tables found; `tables` holds the first ones only */
  count: number
  /** the search for tables inside table cells ran out of budget: some may be missing */
  partial: boolean
  tables: AgentTableSummary[]
}

/** One cell of a table. A merged cell is listed once, at its first row and column. */
export interface AgentTableCell {
  /** 1-based */
  row: number
  col: number
  rowSpan?: number
  colSpan?: number
  /** the paragraphs of the cell joined by line breaks, cut when long */
  text: string
  /** numbers (as in listFields) of the click-here fields that sit in the cell */
  fields?: number[]
  /** the box its paragraph is bulleted with (a form's □ choice box), when it is unchecked */
  box?: string
  /** a picture, a shape or a table sits in the cell or floats over it: not empty, whatever its text */
  object?: true
}

export type AgentReadTableResult =
  | {
      ok: true
      table: number
      rows: number
      cols: number
      cells: AgentTableCell[]
      /** the table goes on: the row to read from next */
      nextRow?: number
    }
  | { ok: false; reason: 'no_such_table'; count: number }

/** Text for one cell: 1-based place, and the text (a line break starts a new paragraph). */
export interface AgentCellText {
  row: number
  col: number
  text: string
}

export type AgentFillCellsResult =
  | { ok: true; table: number; count: number; place: AgentPlace }
  | { ok: false; reason: 'no_such_table'; count: number }
  | {
      ok: false
      /**
       * no_such_cell: the places are outside the table. occupied: the cells hold text and
       * overwrite was not given. has_fields: the cells hold several form fields each.
       * holds_object: the cells hold a picture or another object.
       */
      reason: 'no_such_cell' | 'occupied' | 'has_fields' | 'holds_object'
      cells: { row: number; col: number; text?: string; fields?: number[] }[]
      rows: number
      cols: number
    }
  /** the change would have removed an object of the document, and was rolled back */
  | { ok: false; reason: 'has_objects'; count: number }

/** One cell whose choice box is to be ticked: 1-based place, and the words beside it when needed. */
export interface AgentCheckBox {
  row: number
  col: number
  /** the words beside the box, when the cell has more than one */
  choice?: string
}

export type AgentCheckBoxesResult =
  | { ok: true; table: number; count: number; place: AgentPlace }
  | { ok: false; reason: 'no_such_table'; count: number }
  | {
      ok: false
      /**
       * no_such_cell: the places are outside the table. no_box: no tick box was found (it
       * may be a picture or a form control, which this editor cannot tick).
       * ambiguous_box: the cell has more than one box and choice named none of them.
       */
      reason: 'no_such_cell' | 'no_box' | 'ambiguous_box'
      cells: { row: number; col: number; choices?: string[] }[]
      rows: number
      cols: number
    }
  /** the change would have removed an object of the document, and was rolled back */
  | { ok: false; reason: 'has_objects'; count: number }

export interface AgentField {
  /** 1-based position in the document; what fillField takes */
  field: number
  /** not unique: a field nobody named carries its guide text */
  name: string
  guide: string
  value: string
  /** a named table cell rather than a click-here field */
  inCell: boolean
}

export type AgentFillResult =
  | { ok: true; name: string; place?: AgentPlace }
  | { ok: false; reason: 'no_such_field'; count: number }

/** One run of a selection: the text selected in one paragraph, and where it is. */
export interface AgentSegment extends AgentPlace {
  text: string
}

export type AgentSelectionResult =
  | {
      ok: true
      inTable: boolean
      /**
       * the runs are the paragraphs of one stretch (the body, or one cell), so the selection
       * can be rewritten into more or fewer paragraphs; false for table cells and the like
       */
      contiguous: boolean
      /** the plugin made this selection itself when it showed a change; the user did not */
      own: boolean
      /** one run per paragraph touched, in reading order */
      segments: AgentSegment[]
    }
  | {
      ok: false
      /**
       * none: nothing is selected. unsupported: the selection is at a place without an
       * address here (a note, a header). too_long: beyond the sanity limit of a selection.
       */
      reason: 'none' | 'unsupported' | 'too_long'
    }

export type AgentReplaceSelectionResult =
  | { ok: true; segments: AgentSegment[]; place: AgentPlace }
  /** a run no longer holds the text it held when the selection was read */
  | { ok: false; reason: 'changed' }
  /** the texts are not as many as the runs, and the runs are not one stretch of paragraphs */
  | { ok: false; reason: 'count'; count: number }
  | { ok: false; reason: 'has_objects'; count: number }

export type AgentFormatSelectionResult =
  | {
      ok: true
      count: number
      place: AgentPlace
      /**
       * paragraphs that took the style's name but kept their own look: the editor keeps a
       * paragraph's own paragraph formatting whole when it differs from its former style's
       */
      keptOwnLook?: number
    }
  | { ok: false; reason: 'changed' | 'unsupported_place' }
  | { ok: false; reason: 'has_objects'; count: number }
  | AgentNoSuchStyle

/** Rows or columns of a table. */
export type AgentTableLines = 'rows' | 'columns'

/** Why a row or column call did nothing. */
export type AgentTableLinesRefusal =
  | { ok: false; reason: 'no_such_table'; count: number }
  | {
      ok: false
      /**
       * nested: the table sits inside a cell of another table, where the engine cannot add
       * or remove lines. no_such_line: the row or column is outside the table.
       * would_empty: nothing would be left of the table.
       */
      reason: 'nested' | 'no_such_line' | 'would_empty'
      rows: number
      cols: number
    }
  | {
      ok: false
      /** cells of those lines hold a picture or another object */
      reason: 'holds_object'
      cells: { row: number; col: number }[]
      rows: number
      cols: number
    }
  | { ok: false; reason: 'has_objects'; count: number }

export type AgentAddLinesResult =
  | {
      ok: true
      table: number
      /** the size of the table now */
      rows: number
      cols: number
      /** 1-based number of the first new row or column */
      first: number
      count: number
      place?: AgentPlace
    }
  | AgentTableLinesRefusal

export type AgentRemoveLinesResult =
  | {
      ok: true
      table: number
      rows: number
      cols: number
      count: number
      /** the text that went with them, cut to a few hundred characters */
      text: string
      place: AgentPlace
    }
  | AgentTableLinesRefusal

export type AgentDeleteTableResult =
  | {
      ok: true
      table: number
      rows: number
      cols: number
      /** the tables inside its cells that went with it */
      inner: number
      /** the text that went with it, cut to a few hundred characters */
      text: string
      place: AgentPlace
    }
  | { ok: false; reason: 'no_such_table'; count: number }
  | { ok: false; reason: 'holds_object'; cells: { row: number; col: number }[] }
  | { ok: false; reason: 'has_objects'; count: number }

/** What a File menu item of the editor asks the app to do. */
export type AgentFileCommand = 'save' | 'saveAs' | 'pdf' | 'preview' | 'print'

/** The event those items fire on the editor's window; `detail` is the AgentFileCommand. */
export declare const FILE_COMMAND_EVENT: 'ieum:file-command'

/** The parts of the editor toolbar's style list (a select element) syncStyleList uses. */
export interface StyleListElement {
  readonly options: ArrayLike<{ value: string; textContent: string | null }>
  selectedIndex: number
  value: string
  replaceChildren(...nodes: unknown[]): void
  readonly ownerDocument: {
    createElement(name: 'option'): { value: string; textContent: string | null }
  }
}

/**
 * Fill the editor toolbar's style list with the document's styles when they differ from what
 * it shows, keeping the number shown where a style still has it. True when it was refilled.
 */
export declare function syncStyleList(
  select: StyleListElement,
  styles: { id: number; name: string }[],
): boolean

/** The event the plugin fires on the editor's window when the unsaved state changes; `detail` is the new state. */
export declare const DIRTY_EVENT: 'ieum:dirty-changed'

export type AgentNoteKind = 'footnote' | 'endnote'

/** One footnote or endnote of the body, as listNotes lists it. */
export interface AgentNote {
  /** 1-based position among the notes of the body in reading order; what editNote and deleteNote take */
  note: number
  kind: AgentNoteKind
  /** the number the document shows (footnotes and endnotes are counted apart) */
  number: number
  /** the text in front of the note's mark */
  after: string
  /** the note's text, a line per paragraph, cut when long */
  text: string
  /** it holds something besides text (an equation, a picture): it is not rewritten */
  objects?: true
}

export interface AgentNoteList {
  count: number
  /** notes inside table cells or text boxes, which have no address here */
  elsewhere: number
  notes: AgentNote[]
}

export type AgentInsertNoteResult =
  { ok: true; kind: AgentNoteKind; number: number | null; place: AgentPlace } | AgentPlaceRefusal

export type AgentEditNoteResult =
  | { ok: true; kind: AgentNoteKind; number: number; was: string; place: AgentPlace }
  | { ok: false; reason: 'no_such_note'; count: number }
  | { ok: false; reason: 'has_objects'; count: number }

export type AgentDeleteNoteResult =
  | { ok: true; kind: AgentNoteKind; number: number; text: string; place: AgentPlace }
  | { ok: false; reason: 'no_such_note'; count: number }
  | { ok: false; reason: 'has_objects'; count: number }

/** Where a memo anchor sits, as the engine reports it. */
export type AgentMemoPlace =
  'body' | 'tableCell' | 'textBox' | 'header' | 'footer' | 'footnote' | 'endnote' | 'unknown'

/** One step of the engine's memo path; a text box has no cell index. */
export interface AgentMemoPathStep {
  type: 'cell' | 'textbox'
  controlIndex: number
  cellIndex?: number
  paraIndex: number
}

/** A memo anchor in the editor's place terms, before it is put in the document. */
export interface AgentMemoAnchor {
  place: 'body' | 'tableCell' | 'textBox'
  sectionIndex: number
  paraIndex: number
  startCharIdx: number
  endCharIdx: number
  /** null for the body; the editor's cell path for a cell or a text box */
  path: { controlIndex: number; cellIndex: number; cellParaIndex: number }[] | null
}

/** A rectangle a memo anchor covers on a page; a caret anchor has width 0. */
export interface AgentMemoRect {
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
}

/** One memo of the document, as the panel lists it. */
export interface AgentMemo {
  id: number
  /** the number the file gives it; it can repeat, unlike id */
  index: number
  author: string
  date: string | null
  text: string
  place: AgentMemoPlace
  sectionIndex: number | null
  paraIndex: number | null
  startCharIdx: number | null
  endCharIdx: number | null
  path: AgentMemoPathStep[] | null
  /** the page the anchor starts on (1-based); 0 when it cannot be told */
  page: number
  editable: boolean
  readOnlyReason: 'formatted' | 'object' | 'unsupported_place' | 'protected' | null
  /** the anchor in the terms reveal() and the editor use; null for a memo without an address */
  anchor: AgentPlace | null
  rects: AgentMemoRect[]
  /** the first words of the text, for a card */
  preview: string
}

export interface AgentMemoList {
  count: number
  memos: AgentMemo[]
  /** false when this engine build has no memo API; the panel stays closed then */
  supported?: boolean
}

export type AgentMemoSelectionResult =
  | {
      ok: true
      place: 'body' | 'tableCell' | 'textBox'
      sectionIndex: number
      paraIndex: number
      startCharIdx: number
      endCharIdx: number
      path: AgentMemoAnchor['path']
      /** the text the memo would be put on, or words around the caret */
      preview: string
      /** the same anchor, as insertMemo takes it */
      anchor: AgentMemoAnchor
    }
  | {
      ok: false
      /**
       * none: no caret. multi_paragraph: the selection runs over more than one paragraph.
       * unsupported_place: a note, a header, a block of cells. overlap: a memo is there
       * already. protected: the document cannot be saved.
       */
      reason: 'none' | 'multi_paragraph' | 'unsupported_place' | 'overlap' | 'protected'
    }

/** What an AI change may be told about memos: the default asks before taking one away. */
export interface AgentChangeOptions {
  /** the user approved the memos this change takes: only for the one retried change */
  allowMemoRemoval?: boolean
  /** "ask" (the default) refuses and asks; "allow" is the same as allowMemoRemoval */
  memoPolicy?: 'ask' | 'allow'
  /** the memos the user approved taking (ids of the refusal): any other one is refused again */
  approvedMemoIds?: number[]
}

/**
 * An AI change that would take memos with it was rolled back. The panel shows these memos
 * and retries the same change with `allowMemoRemoval` when the user says yes. A mutating
 * call answers this in place of its usual result; a caller that expects it widens the
 * call's answer with this type.
 */
export interface AgentMemoRemovalRefusal {
  ok: false
  reason: 'memo_removal_requires_approval'
  count: number
  memos: {
    id: number
    index: number
    author: string
    /** the first words of the text, cut short */
    text: string
    place: AgentMemoPlace
    page: number
  }[]
}

export type AgentInsertMemoResult =
  { ok: true; id: number; index: number } | { ok: false; reason: string }

export type AgentSetMemoResult = { ok: true } | { ok: false; reason: string; why?: string | null }

export type AgentRemoveMemoResult =
  { ok: true } | { ok: false; reason: string; why?: string | null }

/** The event the plugin fires when a user's own edit took memos away. */
export declare const MEMO_REMOVED_EVENT: 'ieum:memo-removed'

/** The event the plugin fires when a paste brought text without the memos copied with it. */
export declare const MEMO_NOT_COPIED_EVENT: 'ieum:memo-not-copied'

/** One heading of a table of contents: text it contains, and its level (1 to 3). */
export interface AgentTocEntry {
  find: string
  /** which occurrence of find, when it occurs more than once */
  occurrence?: number | null
  level: number
}

/** A tab a save found without a width: see TabSpot in src/main/tab-widths.ts. */
export interface AgentTabSpot {
  sec: number
  para: number
  cells: { table: number; cell: number; para: number }[]
  tab: number
  tabs: number
}

/** Width in HWPUNIT; kind (0 left, 1 right, 2 centre, 3 decimal) and leader of its tab stop. */
export interface AgentTabMeasure {
  width: number
  type: number
  fill: number
}

export type AgentInsertTocResult =
  | { ok: true; count: number; pages: number[]; place: AgentPlace }
  | AgentPlaceRefusal
  | { ok: false; reason: 'in_table'; count: number }
  /** a heading could not be decided: `why` is not_found, ambiguous, no_such_occurrence or unsupported_place */
  | {
      ok: false
      reason: 'no_heading'
      heading: string
      why: string
      count: number
      matches?: AgentMatch[]
    }

export type AgentRefreshTocResult =
  | {
      ok: true
      /** rows that hold a page number */
      lines: number
      changed: number
      /** headings no longer found in the body */
      missing?: string[]
      place: AgentPlace
    }
  | AgentPlaceRefusal
  | { ok: false; reason: 'in_table'; count: number }
  | { ok: false; reason: 'no_toc'; count: number }

export type AgentUndoResult =
  { ok: boolean; undone: number } | { ok: false; reason: 'changed'; undone: 0 }

/** One picture of the document, as listPictures lists it. */
export interface AgentPicture {
  /** 1-based position in reading order; what readPicture takes */
  picture: number
  /** image MIME type, for example image/png */
  type: string
  /** the page its paragraph starts on, as the document numbers pages; null when unknown */
  page: number | null
  /** the text beside it, cut short; empty when its paragraph holds no text */
  near: string
  /** the table it sits in, as listTables numbers tables; null when it is in the body text */
  table: number | null
}

export interface AgentPictureList {
  count: number
  /** more pictures exist than the list holds: `pictures` is the first ones */
  limited: boolean
  pictures: AgentPicture[]
}

export type AgentReadPictureResult =
  | { ok: true; mime: string; base64: string }
  /** the number is not in the current list */
  | { ok: false; reason: 'no_such_picture'; count: number }
  /** larger than the panel sends to the model */
  | { ok: false; reason: 'too_large'; bytes: number }

/** What the plugin answers to, by method name (the studio's `plugins.invoke`). */
export interface AgentPluginSurface {
  foreignChanges(): number
  readText(): string
  listPictures(): AgentPictureList
  readPicture(picture: number): AgentReadPictureResult
  /** What the document is made of (paragraphs, tables, pictures, fonts); reads only. */
  documentProfile(): AgentDocumentProfile
  findText(find: string): AgentFindResult
  replaceText(
    find: string,
    replacement: string,
    occurrence?: number | null,
    options?: AgentChangeOptions,
  ): AgentReplaceResult
  replaceAllText(
    find: string,
    replacement: string,
    options?: AgentChangeOptions,
  ): AgentReplaceAllResult
  insertParagraphs(
    anchor: string,
    occurrence: number | null,
    where: AgentWhere,
    paragraphs: string[],
    options?: AgentChangeOptions,
  ): AgentInsertResult
  deleteParagraph(
    find: string,
    occurrence: number | null,
    options?: AgentChangeOptions,
  ): AgentDeleteResult
  insertTable(
    anchor: string,
    occurrence: number | null,
    where: AgentWhere,
    rows: string[][],
    header?: boolean,
    options?: AgentChangeOptions,
  ): AgentTableResult
  insertPicture(
    anchor: string,
    occurrence: number | null,
    where: AgentWhere,
    /** base64 bytes of a PNG, JPEG or GIF; the extension has to be that format */
    base64: string,
    /** the width on the page, in points; the height follows the natural pixel size */
    widthPt: number,
    naturalWidthPx: number,
    naturalHeightPx: number,
    extension: 'png' | 'jpg' | 'gif',
    options?: AgentChangeOptions,
  ): AgentPictureResult
  formatText(
    find: string,
    occurrence: number | null,
    all: boolean,
    format: AgentTextFormat,
    options?: AgentChangeOptions,
  ): AgentFormatTextResult
  /** every run of text whose Hangul font is `from` becomes `to`; one undo step */
  replaceFont(from: string, to: string): AgentReplaceFontResult
  formatParagraph(
    find: string,
    occurrence: number | null,
    format: AgentParagraphFormat,
    options?: AgentChangeOptions,
  ): AgentFormatParagraphResult
  listTables(): AgentTableList
  readTable(table: number, fromRow?: number | null): AgentReadTableResult
  fillCells(
    table: number,
    cells: AgentCellText[],
    overwrite: boolean,
    options?: AgentChangeOptions,
  ): AgentFillCellsResult
  checkBoxes(
    table: number,
    cells: AgentCheckBox[],
    options?: AgentChangeOptions,
  ): AgentCheckBoxesResult
  addTableLines(
    table: number,
    what: AgentTableLines,
    at: number,
    where: 'after' | 'before',
    count: number,
    options?: AgentChangeOptions,
  ): AgentAddLinesResult
  removeTableLines(
    table: number,
    what: AgentTableLines,
    at: number,
    count: number,
    options?: AgentChangeOptions,
  ): AgentRemoveLinesResult
  deleteTable(table: number, options?: AgentChangeOptions): AgentDeleteTableResult
  installFileMenu(labels: Record<AgentFileCommand, string>): { ok: boolean }
  reveal(place: AgentPlace): { ok: boolean }
  selection(): AgentSelectionResult
  replaceSelection(
    segments: AgentSegment[],
    texts: string[],
    options?: AgentChangeOptions,
  ): AgentReplaceSelectionResult
  formatSelection(
    segments: AgentSegment[],
    format: AgentParagraphFormat,
    options?: AgentChangeOptions,
  ): AgentFormatSelectionResult
  listFields(): AgentField[]
  fillField(field: number, value: string, options?: AgentChangeOptions): AgentFillResult
  insertToc(
    anchor: string,
    occurrence: number | null,
    where: AgentWhere,
    title: string | null,
    entries: AgentTocEntry[],
    options?: AgentChangeOptions,
  ): AgentInsertTocResult
  refreshToc(
    title: string,
    occurrence: number | null,
    options?: AgentChangeOptions,
  ): AgentRefreshTocResult
  listNotes(): AgentNoteList
  insertNote(
    kind: AgentNoteKind,
    anchor: string,
    occurrence: number | null,
    text: string,
    options?: AgentChangeOptions,
  ): AgentInsertNoteResult
  editNote(note: number, text: string, options?: AgentChangeOptions): AgentEditNoteResult
  deleteNote(note: number, options?: AgentChangeOptions): AgentDeleteNoteResult
  measureTabs(spots: AgentTabSpot[]): { tabs: (AgentTabMeasure | null)[] }
  listStyles(): AgentStyleNames
  readStyle(name: string): AgentReadStyleResult
  createStyle(spec: AgentNewStyle, options?: AgentChangeOptions): AgentStyleResult
  editStyle(
    name: string,
    changes: AgentStyleChanges,
    options?: AgentChangeOptions,
  ): AgentStyleResult
  /** pages for printing from `from`, as many as are drawn in about two seconds */
  printPages(from: number): AgentPrintPages
  /** one page as the print path draws it, for the preview; `page` is 0-based */
  previewPage(page: number): AgentPreviewPage
  /** the first body paragraph that starts on `page`, for Ctrl+Enter in the preview */
  pageTarget(page: number): AgentPageTarget
  mergeCells(
    table: number,
    from: AgentCellPlace,
    to: AgentCellPlace,
    options?: AgentChangeOptions,
  ): AgentMergeCellsResult
  splitCell(
    table: number,
    row: number,
    col: number,
    rows?: number | null,
    cols?: number | null,
    options?: AgentChangeOptions,
  ): AgentSplitCellResult
  formatCells(
    table: number,
    cells: { row: number; col: number }[],
    background: string,
    options?: AgentChangeOptions,
  ): AgentFormatCellsResult
  /** take the marks of the changes made so far off the pages */
  clearMarks(): { ok: true }
  undo(steps: number, expectedForeign: number): AgentUndoResult
  /** the memos of the document in document order, with their pages and anchor rectangles */
  listMemos(): AgentMemoList
  /** whether the selection (or the caret) may carry a memo anchor */
  memoSelection(): AgentMemoSelectionResult
  /** add a memo at an anchor memoSelection gave; one undo step */
  insertMemo(
    anchor: AgentMemoAnchor,
    author: string,
    text: string,
    options?: AgentChangeOptions,
  ): AgentInsertMemoResult
  /** replace the text of a memo, keeping its author and date; one undo step */
  setMemo(id: number, text: string, options?: AgentChangeOptions): AgentSetMemoResult
  /** remove a memo and keep the text it was put on; one undo step */
  removeMemo(id: number, options?: AgentChangeOptions): AgentRemoveMemoResult
  /** show the memo anchors on the pages while the panel is open, or take them off */
  showMemoAnchors(shown: boolean): { ok: true; shown: boolean }
  /** make one memo's anchor stronger on the pages, or none */
  selectMemo(id: number | null): { ok: true; id: number | null }
  /** take the editor's input away while the app's memo modal is open */
  setMemoLock(locked: boolean): { ok: true; locked: boolean }
}

/** Pages drawn for printing: SVG, and each page's size in CSS pixels. */
export interface AgentPrintPages {
  pageCount: number
  from: number
  pages: { svg: string; width: number; height: number }[]
}

/** One page for the print preview, with the count it belongs to. */
export interface AgentPreviewPage {
  pageCount: number
  page: number
  svg: string
  width: number
  height: number
  /** the page's text margins, in CSS pixels, for the preview's margin guide */
  margins: { left: number; top: number; right: number; bottom: number }
}

export type AgentPageTarget =
  | {
      ok: true
      page: number
      target: {
        kind: 'body_paragraph'
        section: number
        paragraph: number
        charOffset: 0
        length: number
      }
    }
  | { ok: false; reason: 'no_paragraph' }

/** The part of the studio's plugin host this plugin uses. */
export interface AgentPluginHost {
  read<T>(fn: (doc: never) => T): T
  transaction<T>(label: string, fn: (tx: { doc(): never; deferPagination(): void }) => T): T
  events: { on(name: 'document-changed', handler: () => void): unknown }
  automation: {
    execute(command: string, params?: unknown): { ok?: boolean } | null | undefined
    registerCommand?(command: {
      id: string
      label: string
      shortcutLabel?: string
      execute(services: never, params?: never): void
    }): void
    addMenuItem?(spec: { menuId: string; commandId: string; position?: 'top' | 'bottom' }): void
  }
}

export declare const agentPlugin: {
  id: typeof AGENT_PLUGIN_ID
  apiVersion: 1
  activate(host: AgentPluginHost): AgentPluginSurface
}

export default agentPlugin
