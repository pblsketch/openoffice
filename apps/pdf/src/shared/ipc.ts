import type { AiPanelPrefs } from '@genoffice/ui'
import type { Lang } from '@genoffice/i18n'
import type { AiSettings, AiStreamChunk, AiStreamRequest } from '@genoffice/ai-provider'
import type { SubscriptionApi } from './subscription-api'
import type { DocumentTree, InlineRun } from '../../../../packages/pdf-structure/src/tree/types'
import type { PageFingerprint } from '../../../../packages/pdf-structure/src/tree/extract'
import type { MarkdownWarning } from '../../../../packages/pdf-structure/src/markdown/write'
import type { TranslationReport } from '../../../../packages/pdf-structure/src/translate/result'
import type { WritebackReport } from '../../../../packages/pdf-structure/src/writeback/types'
import type {
  AiReadPageEntry,
  AiReadPayload,
  JobKind,
  JobRecordInput,
  JobStatus,
  TranslationBlockEntry,
  TranslationBlockInput,
} from '../../../../packages/pdf-structure/src/store/store'
import type {
  HighlightBlockEntry,
  HighlightBlockInput,
  HighlightRun,
  HighlightSuggestionState,
  InsightsEntry,
  PassageCard,
  PassageCardInput,
} from '../../../../packages/pdf-structure/src/store/reading'
import type { TranslationBlockKey } from '../../../../packages/pdf-structure/src/store/keys'

/**
 * The PDF tools window's tasks the ribbon's "PDF tools" menu opens with the
 * view's file (decision 0030); the shell checks the name again.
 */
export const PDF_TOOLS_HANDOFF = [
  'blankPages',
  'duplex',
  'overlay',
  'stripAnnots',
  'toText',
  'compress',
  'encrypt',
  'decrypt',
  'repair',
] as const
export type PdfToolsHandoffTool = (typeof PDF_TOOLS_HANDOFF)[number]

export const PDF_CHANNELS = {
  consumePending: 'pdf:consume-pending',
  readFile: 'pdf:read-file',
  save: 'pdf:save',
  requestRedactionCopy: 'pdf:request-redaction-copy',
  autoRename: 'pdf:auto-rename',
  isUntitled: 'pdf:is-untitled',
  isUntitledCopy: 'pdf:is-untitled-copy',
  templateBytes: 'pdf:template-bytes',
  adoptUntitledCopy: 'pdf:adopt-untitled-copy',
  validateTextEdits: 'pdf:validate-text-edits',
  listEditFonts: 'pdf:list-edit-fonts',
  canDrawText: 'pdf:can-draw-text',
  listPageImages: 'pdf:list-page-images',
  listStaticFormFills: 'pdf:list-static-form-fills',
  pageImagePng: 'pdf:page-image-png',
  ocrPage: 'pdf:ocr-page',
  pagePreviewPng: 'pdf:page-preview-png',
  extractPages: 'pdf:extract-pages',
  insertPdf: 'pdf:insert-pdf',
  insertBlankPage: 'pdf:insert-blank-page',
  splitPdf: 'pdf:split-pdf',
  mergePdf: 'pdf:merge-pdf',
  mergePages: 'pdf:merge-pages',
  replacePages: 'pdf:replace-pages',
  setPageSize: 'pdf:set-page-size',
  splitPages: 'pdf:split-pages',
  cropPages: 'pdf:crop-pages',
  exportImages: 'pdf:export-images',
  convertOffice: 'pdf:convert-office',
  createDocument: 'pdf:create-document',
  openInPdfTools: 'pdf:open-in-pdf-tools',
  generateImage: 'pdf:generate-image',
  listDigitalSignatures: 'pdf:list-digital-signatures',
  pickCertificate: 'pdf:pick-certificate',
  listSystemCertificates: 'pdf:list-system-certificates',
  releaseCertificate: 'pdf:release-certificate',
  inspectCertificate: 'pdf:inspect-certificate',
  signWithCertificate: 'pdf:sign-with-certificate',
  listSignatures: 'pdf:list-signatures',
  addSignature: 'pdf:add-signature',
  removeSignature: 'pdf:remove-signature',
  getUsername: 'pdf:get-username',
  annotSubjects: 'pdf:annot-subjects',
  // the note of each PDF (reading-assist 4.9): the view's own PDF, no path from the renderer
  noteOpen: 'pdf:note-open',
  noteInsert: 'pdf:note-insert',
  noteUnsaved: 'pdf:note-unsaved',
  dirtyChanged: 'pdf:dirty-changed',
  closeSaveRequest: 'pdf:close-save-request',
  closeSaveResult: 'pdf:close-save-result',
  saveAsRequest: 'pdf:save-as-request',
  saveAsResult: 'pdf:save-as-result',
  saveAsFlow: 'pdf:save-as-flow',
  printRequest: 'pdf:print-request',
  fileRenamed: 'pdf:file-renamed',
  // crash recovery: copies of unsaved edits in the app data folder (never the file itself)
  recoveryState: 'pdf:recovery-state',
  recoveryWriteCopy: 'pdf:recovery-write-copy',
  recoveryUnprotectable: 'pdf:recovery-unprotectable',
  recoveryFlushRequest: 'pdf:recovery-flush-request',
  recoveryFlushDone: 'pdf:recovery-flush-done',
  // "Don't Save" answered (true) or the close cancelled (false); the renderer resumes on input
  recoveryDropped: 'pdf:recovery-dropped',
  recoveryResume: 'pdf:recovery-resume',
  getLanguage: 'app:get-language',
  languageChanged: 'app:language-changed',
  getTheme: 'app:get-theme',
  themeChanged: 'app:theme-changed',
  getAiPanelPrefs: 'app:get-ai-panel-prefs',
  aiPanelPrefsChanged: 'app:ai-panel-prefs-changed',
  // document-structure jobs (run in a separate process the shell starts per job)
  structurePickTarget: 'pdf:structure-pick-target',
  structureTree: 'pdf:structure-tree',
  structureText: 'pdf:structure-text',
  structureConvert: 'pdf:structure-convert',
  structureExtractImages: 'pdf:structure-extract-images',
  structureWriteBack: 'pdf:structure-write-back',
  structureCancel: 'pdf:structure-cancel',
  structureProgress: 'pdf:structure-progress',
  // result store (AI-read pages, translations, job records)
  storeDocHash: 'pdf:store-doc-hash',
  storeAiReadPages: 'pdf:store-ai-read-pages',
  storeTranslations: 'pdf:store-translations',
  storeTranslation: 'pdf:store-translation',
  storeUnfinishedJobs: 'pdf:store-unfinished-jobs',
  storeWrite: 'pdf:store-write',
  storeMigrate: 'pdf:store-migrate',
  storeDeleteDocument: 'pdf:store-delete-document',
  // result store: the reading assistant (passage cards, AI highlights, insights)
  storePassages: 'pdf:store-passages',
  storeHighlightRuns: 'pdf:store-highlight-runs',
  storeHighlightBlocks: 'pdf:store-highlight-blocks',
  storeLatestHighlight: 'pdf:store-latest-highlight',
  storeInsights: 'pdf:store-insights',
  storeDeleteCounts: 'pdf:store-delete-counts',
  storePageFingerprints: 'pdf:store-page-fingerprints',
  storeTranslationRecency: 'pdf:store-translation-recency',
  // Markdown / EPUB conversion screen (the jobs themselves go through structure*)
  convertDialogRequest: 'pdf:convert-dialog-request',
  convertReleaseTarget: 'pdf:convert-release-target',
  convertOpenResult: 'pdf:convert-open-result',
  convertRevealResult: 'pdf:convert-reveal-result',
} as const

export const VISUAL_SIGNATURE_CONTENT_PREFIX = 'GenOffice visual signature field: '

/** Signature strokes: pad pixel coords, scaled proportionally and y-flipped when placed on the page */
export interface SignatureStrokes {
  paths: number[][]
  width: number
  height: number
}

/** Confirmed signature awaiting placement: hand strokes (Ink) or a bitmap (Stamp) */
export type SignatureData =
  | ({ kind: 'strokes' } & SignatureStrokes)
  | {
      kind: 'image'
      /** base64 PNG, without the data: prefix */
      image: string
      width: number
      height: number
    }

/** One X.509 certificate, flattened for display */
export interface CertificateInfo {
  /** Subject common name, falling back to the whole subject when no CN is present */
  commonName: string
  /** Full subject, one RDN per line ("CN=…") */
  subject: string
  issuerCommonName: string
  issuer: string
  /** Hex, upper case, no separators */
  serialNumber: string
  /** ISO 8601 */
  validFrom: string
  validTo: string
  /** SHA-256 fingerprint, "AA:BB:…" */
  fingerprint: string
  /** e.g. "RSA 2048", "EC prime256v1" */
  keyAlgorithm: string
  selfSigned: boolean
}

export type PdfSignatureProblem =
  /** The signed bytes no longer match the signature: the document was altered */
  | 'digest-mismatch'
  | 'signature-invalid'
  | 'malformed'
  | 'unsupported-algorithm'
  | 'signer-certificate-missing'
  /** Bytes were appended after the signed revision (later edits or signatures) */
  | 'document-changed-after-signing'
  | 'self-signed'
  | 'untrusted-issuer'
  | 'certificate-expired'
  | 'certificate-not-yet-valid'

/** One signature field that carries a value, as read from the file (not trusting the file's own claims) */
export interface PdfSignatureInfo {
  fieldName: string
  /** Zero-based page of the signature widget; -1 when it has none */
  pageIndex: number
  kind: 'signature' | 'timestamp'
  /** Derived from `problems`: invalid (altered or unreadable) > warning (weakened) > untrusted (intact, chain reaches no trusted root) > valid */
  status: 'valid' | 'untrusted' | 'warning' | 'invalid'
  problems: PdfSignatureProblem[]
  subFilter: string
  signerName?: string
  reason?: string
  location?: string
  contactInfo?: string
  /** ISO 8601; the signed signingTime attribute when present, else the unverified /M entry */
  signingTime?: string
  /** Whether `signingTime` comes from the signature itself */
  signingTimeSigned: boolean
  digestAlgorithm?: string
  /** True when the signature covers every byte of the file */
  coversWholeDocument: boolean
  /** DocMDP level (1 no changes, 2 form fill + signing, 3 plus annotations) of a certifying signature */
  certifiedLevel?: 1 | 2 | 3
  signer?: CertificateInfo
  /** Signer first, then each issuer found in the signature; the last entry may be a root */
  chain: CertificateInfo[]
  /** Whether the chain ends at a root in the operating-system / Mozilla trust store */
  trusted: boolean
}

export type CertificateErrorCode =
  | 'cert-password'
  | 'cert-invalid'
  | 'cert-unsupported-key'
  | 'cert-no-key'
  /** The system store holds the key but will not hand it over */
  | 'cert-not-exportable'
  | 'cert-store-locked'
  | 'cert-store-tool-missing'
  /** The system store is not supported on this platform (macOS for now) */
  | 'cert-store-unsupported'

/** A signing identity found in the operating system's certificate store */
export interface SystemCertificateInfo {
  /** Opaque id for this view; pass it where a picked certificate file's id goes */
  certId: string
  label: string
  commonName: string
  issuerCommonName: string
  /** ISO 8601 */
  validTo: string
  expired: boolean
}

export type SystemStoreIssue = 'nss-tools-missing' | 'store-locked' | 'platform-unsupported'

export interface ListSystemCertificatesResult {
  certs: SystemCertificateInfo[]
  issues: SystemStoreIssue[]
}

export type InspectCertificateResult =
  | { ok: true; signer: CertificateInfo; chain: CertificateInfo[] }
  | { ok: false; error: CertificateErrorCode }

export type SignaturePosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center'

export interface SignWithCertificateRequest {
  path: string
  /** Opaque id returned by pickCertificate for this view */
  certId: string
  password: string
  /** Unlocks a locked system store (NSS) when the identity has to be exported again */
  storePassword?: string
  reason?: string
  location?: string
  contactInfo?: string
  /** Makes this a certifying signature (DocMDP); only valid for a document with no signatures yet */
  certifyLevel?: 1 | 2 | 3
  /** Visible signature box; omitted = invisible signature */
  visible?: {
    pageIndex: number
    position: SignaturePosition
    /** Box size in PDF points */
    width: number
    height: number
    /** base64 PNG of the box contents, drawn by the renderer (any script or font) */
    png: string
  }
}

export type SignWithCertificateResult =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
  | {
      ok: false
      cancelled?: false
      error: CertificateErrorCode | 'pdf-encrypted' | 'sign-failed'
      message?: string
    }

/** A reusable signature persisted in userData (shared across documents, WPS-style) */
export interface SavedSignature {
  id: string
  createdAt: number
  data: SignatureData
}

export type PdfConvertFormat = 'docx' | 'xlsx' | 'pptx'

/** the reflowable formats the conversion dialog writes (document-structure jobs) */
export type PdfReflowFormat = 'md' | 'epub'

/** a converted file and the open PDF it came from (the shell checks the view owns that PDF) */
export interface PdfConvertOutputRequest {
  /** the open file of this view */
  source: string
  /** the written file (or the picked folder) */
  path: string
}

/** target file type of the AI create_document tool (mirrors the docs app's contract) */
export type CreateDocumentType = 'docx' | 'pdf' | 'md' | 'html'

export interface CreateDocumentRequest {
  type: CreateDocumentType
  /** file name stem (sanitized main-side) */
  title: string
  /** docx/pdf: restricted HTML; md: Markdown source */
  content: string
}

export interface CreateDocumentResult {
  ok: boolean
  /** the created file, when it is written directly (pdf/md); docx opens as a new tab that saves itself */
  path?: string
  error?: string
}

export type UiTheme = 'light' | 'dark' | 'system'

export type MarkupType = 'highlight' | 'underline' | 'strikeout'

/** A text markup to write; quads are 4-point groups in PDF coords (y up) [x1,yTop,x2,yTop,x1,yBottom,x2,yBottom] */
export interface MarkupInput {
  pageIndex: number
  type: MarkupType
  /** rgb normalized to 0-1 */
  color: [number, number, number]
  quads: number[][]
  /**
   * The category of an accepted AI highlight, saved as /Subj (reading-assist
   * spec 5.7). Absent: the markup saves exactly as it did before the field.
   */
  subject?: string
}

/** a markup annotation's /Subj in the file (an accepted AI highlight's category) */
export interface PdfAnnotSubject {
  /** 0-based original page */
  pageIndex: number
  /** PDF object number (pdf.js annotation id "123R" → 123) */
  objNum: number
  subj: string
}

/** "Open note" (reading-assist 4.9): the title heads a note made now */
export interface PdfNoteOpenRequest {
  /** the PDF's title ('' or absent: the file name) */
  title?: string
}

/**
 * "Add to note": text parts only. The main process knows the view's PDF and
 * its linked note, and builds the inserted Markdown (quote, page link, body).
 */
export type PdfNoteInsertRequest =
  | {
      kind: 'quote'
      /** the marked text or passage ('' for an item without text) */
      excerpt: string
      /** 1-based page of the PDF file on disk */
      page: number
      /** a memo, an AI answer; omitted when empty */
      body?: string
      title?: string
    }
  | {
      kind: 'overview'
      /** "Document overview" in the UI language */
      heading: string
      body: string
      title?: string
    }

/**
 * unsaved: the PDF has no saved path yet; unavailable: no shell to open the
 * note in (standalone); cancelled: the save dialog was closed; busy: this
 * view's dialog is still open
 */
export type PdfNoteResult =
  | { ok: true }
  | {
      ok: false
      reason: 'unsaved' | 'unavailable' | 'cancelled' | 'busy' | 'failed'
      message?: string
    }

/** Delete an annotation already saved in the file. Object number is only a lookup
    hint; subtype + rect guard against (and recover from) object renumbering by a rewrite.
    'note' targets Text (comment) annotations. */
export interface AnnotDeleteInput {
  pageIndex: number
  /** PDF object number (pdf.js annotation id "123R" → 123) */
  objNum: number
  subtype: MarkupType | 'note'
  /** Annotation /Rect in PDF user space, for fallback matching */
  rect: [number, number, number, number]
  /** /Contents to match. Required identity for notes: every comment of a thread shares
      the root's rect, so rect alone would delete the wrong member. */
  contents?: string
}

/** Reply target: a note (Text) annotation saved in the file. The object number is only a
    lookup hint — pdfium stages that run before pdf-lib may renumber objects — so the
    parent is confirmed by rect + contents at write time. */
export interface NoteReplyTarget {
  objNum: number
  rect: [number, number, number, number]
  contents: string
}

/** Rewrite the /Contents of a note (Text) annotation saved in the file, in place —
    the object keeps its number so saved replies' /IRT chains stay intact (unlike
    delete + re-add). Identity matches like NoteReplyTarget: rect + current contents,
    with the object number as a tie-break hint. */
export interface NoteEditInput {
  pageIndex: number
  objNum: number
  rect: [number, number, number, number]
  /** /Contents currently in the file (identity match) */
  oldContents: string
  contents: string
}

/** Drawing annotations (all coords in PDF user space, y up).
    One union member per kind; a union-literal kind would break TS narrowing. */
interface DrawBase {
  pageIndex: number
  color: [number, number, number]
  width: number
  /** AcroForm field explicitly associated with a visual Ink signature. */
  formFieldName?: string
}

export type DrawingInput =
  | (DrawBase & {
      kind: 'ink'
      /** Each stroke as [x1,y1,x2,y2,...] */
      paths: number[][]
    })
  | (DrawBase & { kind: 'rect'; rect: [number, number, number, number] })
  | (DrawBase & { kind: 'ellipse'; rect: [number, number, number, number] })
  | (DrawBase & { kind: 'line'; from: [number, number]; to: [number, number] })
  | (DrawBase & { kind: 'arrow'; from: [number, number]; to: [number, number] })
  | {
      /** Image signature/stamp placed by the user; written as a Stamp annotation */
      kind: 'image'
      pageIndex: number
      /** base64 PNG, without the data: prefix */
      image: string
      /** PDF user space [x1,y1,x2,y2] */
      rect: [number, number, number, number]
      /** AcroForm field explicitly associated with a visual image signature. */
      formFieldName?: string
    }
  | {
      kind: 'note'
      pageIndex: number
      color: [number, number, number]
      at: [number, number]
      contents: string
      /** Annotation author (/T); omitted → 'GenOffice' */
      author?: string
      /** Creation time (ms since epoch) → /CreationDate and /M; omitted → save time */
      createdMs?: number
      /** Key for parenting replies inside the same request (parents sort before children) */
      localId?: string
      /** This note replies to a note saved in the file */
      replyToSaved?: NoteReplyTarget
      /** This note replies to another note in this request, by its localId */
      replyToLocalId?: string
    }

/**
 * Stamp layer (watermark/header/footer/page numbers all go through it).
 * The renderer rasterizes the bitmap via canvas (with rotation and fonts, bypassing
 * pdf-lib's lack of CJK support); the main process only embeds and positions it.
 */
export interface StampInput {
  pageIndex: number
  /** base64 PNG, without the data: prefix */
  image: string
  /** PDF user space [x1,y1,x2,y2] */
  rect: [number, number, number, number]
  opacity?: number
}

/** Document info; an empty string clears the field */
export interface MetadataInput {
  title?: string
  author?: string
  subject?: string
  keywords?: string
}

/**
 * Content-stream text replacement (pdfium). The renderer only knows pdf.js text items;
 * the main process re-locates the actual text objects by rect intersection and verifies
 * against oldText, because one pdf.js item may span many objects (CJK is often one per glyph).
 */
export interface TextEditInput {
  pageIndex: number
  /** PDF user space [x1,y1,x2,y2] of the run being replaced */
  rect: [number, number, number, number]
  /** Text currently displayed in rect; matching is whitespace-insensitive */
  oldText: string
  /** Replacement; '\n' splits it into stacked lines (one text object per line) */
  newText: string
  /** Original run's font size in PDF pt (fallback sizing for the rebuilt object) */
  fontSize: number
  /** User-chosen size in PDF pt; absent = keep the original run's size */
  newFontSize?: number
  /** User-chosen fill color (0-255 RGB); absent = keep the original run's color */
  newColor?: [number, number, number]
  /** Selection-level fill colors: [start,end) code-unit ranges into newText, ascending
      and non-overlapping. Chars outside every range keep newColor ?? the original run's
      color. The engine splits each rebuilt line into one text object per color.
      Legacy input form — new senders use styleRuns; still accepted by the engine. */
  colorRuns?: { start: number; end: number; color: [number, number, number] }[]
  /** Selection-level style overrides: [start,end) code-unit ranges into newText,
      ascending and non-overlapping. Each present field overrides the whole-edit value
      (newColor / newFont / newFontSize / newBold / newItalic) for the covered range;
      absent fields inherit it. The engine splits each rebuilt line into one text
      object per distinct style, drawing each with its own font face and size.
      Generalizes colorRuns. */
  styleRuns?: {
    start: number
    end: number
    color?: [number, number, number]
    font?: string
    size?: number
    bold?: boolean
    italic?: boolean
  }[]
  /** User-chosen rebuild font (EDIT_FONTS id); absent = keep the original font (embedded
      subset when it covers the replacement, else the same-named installed font, else
      fallback). An explicit id is honored only when the face's cmap covers the whole
      replacement (else fallback) */
  newFont?: string
  /** Baseline origin (PDF user space) for the rebuilt first line. Paragraph edits set
      this to the block's left edge / first baseline — the matched anchor object may be
      an indented or mid-paragraph run. Absent = the anchor object's own position.
      Ignored when the edit resolves to a fragment of a larger run. */
  origin?: [number, number]
  /** Baseline-to-baseline step between '\n' lines in PDF pt (paragraph edits pass the
      block's original leading); absent = fontSize × 1.2. Ignored for fragment matches. */
  lineLeading?: number
  /** Per-'\n'-line horizontal offset from origin.x in PDF pt — centered/right-aligned
      paragraph reflow places each line at its own x. Missing entries mean 0; ignored
      for fragment matches. */
  lineXOffsets?: number[]
  /** Paragraph alignment, renderer-side metadata (preview rendering and draft reopen);
      the engine positions lines purely from origin + lineXOffsets */
  align?: 'left' | 'center' | 'right'
  /** The paragraph editor's logical text as typed (hard line breaks intact),
      renderer-side metadata for reopening the draft — the wrapped newText can't
      tell a soft wrap from a deliberate break. The engine ignores it. */
  blockSource?: string
  /** Bold/italic for the rebuilt run, resolved via font variants: the chosen edit
      font's matching face file, or the original family's matching installed face.
      Degrades silently to the base face when no variant covers the replacement. */
  newBold?: boolean
  newItalic?: boolean
  /** Move the matched run as-is: every matched text object is translated by this
      PDF-user-space delta instead of being rewritten (fonts/kerning/colors survive
      untouched). Requires the match to cover the objects exactly (whole) — moving a
      fragment would drag the surrounding text along, so such edits are skipped.
      newText must be textually equivalent to oldText; nothing is rebuilt. */
  translate?: [number, number]
}

/** A new searchable/selectable text object inserted into a page content stream. */
export interface TextInsertInput {
  pageIndex: number
  /** First-line baseline origin in PDF user space. */
  origin: [number, number]
  /** Text to insert; '\n' creates stacked text objects. */
  text: string
  fontSize: number
  color: [number, number, number]
  font?: string
  bold?: boolean
  italic?: boolean
  lineLeading?: number
  lineXOffsets?: number[]
  align?: 'left' | 'center' | 'right'
  /** Final displayed page rotation; insertion matrix counter-rotates text into screen space. */
  rotate?: number
}

/** Dry-run match result for one pending text edit */
export interface TextEditValidation {
  /** null = the edit would apply; string = reason it would be skipped */
  reason: string | null
  /** Ink bounds [x1,y1,x2,y2] of the matched text objects (PDF user space). The renderer's
      edit rect is a pdf.js layout box (font metrics); glyph ink can poke out of it, so the
      preview cover must use the engine's real bounds or remnants of the old run show through */
  bounds?: [number, number, number, number]
  /** Fill colors the matched objects already draw with (earlier saved selection colors),
      as [start,end) ranges into oldText. Present only when the match spans differently
      colored objects. Editors seed their selection-color state from these so existing
      colors show while editing and survive the rebuild. */
  colorRuns?: { start: number; end: number; color: [number, number, number] }[]
  /** Base fill color of the matched run (its first object in reading order), for
      display while editing — a uniformly colored run has no colorRuns to seed from */
  baseColor?: [number, number, number]
}

/** Curated fonts selectable for rebuilt text runs. Single-face .ttf on every platform we
    ship — the subsetter cannot read .ttc collections, which rules out the macOS CJK faces.
    Availability is machine-dependent: the main process reports the usable subset. */
/** Stroke width of a synthetic-bold run as a fraction of the em. Bold on the document's
    own face is a same-color fill+stroke (advances unchanged, layout survives); only an
    explicit edit font loads a real bold face. Shared by the engine and the preview. */
export const SYNTHETIC_BOLD_STROKE_EM = 0.035

export const EDIT_FONTS = [
  { id: 'arial', label: 'Arial', css: "Arial, 'Helvetica Neue', sans-serif" },
  { id: 'times', label: 'Times New Roman', css: "'Times New Roman', Times, serif" },
  { id: 'courier', label: 'Courier New', css: "'Courier New', monospace" },
] as const

/** Target z-band for a content-stream image: under every text run (above the page
    background) or on top of the page's content */
export type ImageLayer = 'belowText' | 'aboveText'

/**
 * Content-stream image operations (pdfium). Existing images are addressed by their
 * bounds as reported by listPageImages — the main process re-matches the actual object
 * by rect at save time (fail-soft, like text edits), since object indices shift.
 */
export type ImageEditInput =
  | {
      kind: 'insertImage'
      pageIndex: number
      /** base64 PNG, without the data: prefix */
      image: string
      /** PDF user space [x1,y1,x2,y2] footprint */
      rect: [number, number, number, number]
      layer: ImageLayer
      /** Final display rotation of the page (0/90/180/270); the image content is
          counter-rotated so it shows upright on rotated pages */
      rotate?: number
    }
  | {
      kind: 'transformImage'
      pageIndex: number
      /** Bounds of the target image when listed (match key) */
      oldRect: [number, number, number, number]
      /** Final footprint (already width/height-swapped when quarterTurns is odd) */
      rect: [number, number, number, number]
      /** Present = also move the object to this z-band */
      layer?: ImageLayer
      /** Screen-clockwise quarter turns (0-3) applied about the image center.
          2D rotations commute with the page /Rotate mapping, so no adjustment
          for rotated pages is needed */
      quarterTurns?: number
    }
  | {
      kind: 'replaceImage'
      pageIndex: number
      /** Bounds of the target image when listed (match key) */
      oldRect: [number, number, number, number]
      /** Final footprint (drag/resize/rotate after the swap works like a transform) */
      rect: [number, number, number, number]
      /** base64 PNG replacing the image's pixels */
      image: string
      layer?: ImageLayer
      quarterTurns?: number
    }
  | { kind: 'deleteImage'; pageIndex: number; oldRect: [number, number, number, number] }

/** An existing content-stream image on a page */
export interface PageImageRef {
  pageIndex: number
  /** PDF user space [x1,y1,x2,y2] */
  rect: [number, number, number, number]
  /** Painted after the page's first text run (i.e. covers text it overlaps) */
  aboveText: boolean
}

/** Editable metadata for a GenOffice static form fill embedded as a page image. */
export interface StaticFormFillRecord {
  id: string
  kind: 'text' | 'check' | 'cross'
  pageIndex: number
  rect: [number, number, number, number]
  text?: string
  fontSize?: number
  color?: string
  align?: 'left' | 'center' | 'right'
}

/** A pending area selected for permanent native PDF redaction. PDF user space, y up. */
export interface RedactionInput {
  pageIndex: number
  rect: [number, number, number, number]
}

/** One OCR line from the system engine: normalized bottom-left boxes relative to
    the submitted image ([x0,y0,x1,y1], 0..1), with optional word-level char boxes. */
export interface PdfOcrLine {
  text: string
  confidence: number
  box: [number, number, number, number]
  chars?: { text: string; box: [number, number, number, number] }[]
}

/** Live-preview render request: a page region with some images removed */
export interface PagePreviewRequest {
  path: string
  pageIndex: number
  /** Images to erase, addressed by their listed rects (PDF user space) */
  excludeRects: [number, number, number, number][]
  /** Saved annotations to erase. Full identity data is required because object numbers
      may be stale after a save rewrites the PDF. */
  excludeAnnots?: AnnotDeleteInput[]
  /** Text runs being edited, to erase before rendering (same probe shape the open
      validation sends; newText is ignored). The editor then sits transparent over
      the page instead of covering the original run with a paper box. */
  excludeText?: TextEditInput[]
  /** Region to render, in display coords at scale 1 (after total rotation, y down) */
  clip: { x: number; y: number; width: number; height: number }
  /** Output bitmap width in px (height follows the clip aspect) */
  pxWidth: number
  /** Extra unsaved display rotation on top of the page's /Rotate: 0-3 quarter turns cw */
  rotate: number
}

export interface PagePreviewResult {
  /** Base64 PNG of the clip */
  png: string
  /** Per entry of excludeText: whether the run was erased from the render */
  textErased: boolean[]
}

/** An image edit that could not be matched to the document at save time and was skipped */
export interface ImageEditFailure {
  /** Position in the request's imageEdits array */
  editIndex: number
  pageIndex: number
  reason: string
}

export interface FormValueInput {
  name: string
  kind: 'text' | 'checkbox' | 'radio' | 'choice'
  /** For radio: selected exportValue; for choice: selected option; empty string clears selection */
  value?: string
  checked?: boolean
}

export type FormFieldKind = 'text' | 'checkbox' | 'radio' | 'choice' | 'signature'

/** A new AcroForm field authored in Form Design; becomes a real widget on save. PDF user space, y up. */
export interface FormFieldInput {
  name: string
  kind: FormFieldKind
  pageIndex: number
  rect: [number, number, number, number]
  required?: boolean
  /** text only */
  multiLine?: boolean
  /** text only; 0 or absent = no limit */
  maxLen?: number
  /** text only; absent = auto size */
  fontSize?: number
  textAlignment?: 'left' | 'center' | 'right'
  /** text: initial value; choice: selected option; checkbox/radio: initial state */
  value?: string
  checked?: boolean
  /** radio only: this button's export value; buttons sharing a name form one group */
  exportValue?: string
  /** choice only */
  options?: string[]
  /** text only: Acrobat AFDate format (e.g. yyyy-mm-dd) installs date format/keystroke actions */
  dateFormat?: string
}

/** Design-time change to an AcroForm widget already in the file, addressed by its pdf.js annotation id (object ref). */
export interface FormWidgetEditInput {
  widgetId: string
  fieldName: string
  rect?: [number, number, number, number]
  required?: boolean
  remove?: boolean
}

/** A blank page authored in the session. `pageIndex` is its virtual original index: the
    document's page count plus its rank among the session's blank pages, so every other
    pending edit can address it like a real page; the save appends it there first. */
export interface BlankPageInput {
  pageIndex: number
  width: number
  height: number
}

export interface SavePdfRequest {
  path: string
  /**
   * Save As destination. When set, `path` is only read (source bytes) and the edited PDF
   * is written to this path instead — the original file must never be mutated.
   * Must match the target granted to the view by the main process (save dialog pick).
   */
  targetPath?: string
  /** Save As only: copy the source bytes unchanged. Used when the copy has no pending edits. */
  copyOnly?: boolean
  /**
   * Save As only: what the copy does with annotations.
   * `keep` (default) keeps them editable, `flatten` bakes them into page content,
   * `strip` leaves comment annotations out (links and form fields stay).
   */
  annotations?: 'keep' | 'flatten' | 'strip'
  markups: MarkupInput[]
  /** Saved markup annotations to remove (applied before every other stage) */
  annotDeletes?: AnnotDeleteInput[]
  drawings: DrawingInput[]
  /** In-place content edits of saved note comments. Applied after `drawings`, so
      replies in the same request still match their /IRT parent by its old contents. */
  noteEdits?: NoteEditInput[]
  formValues: FormValueInput[]
  stamps: StampInput[]
  /** Applied to the source bytes before all annotation work — these rewrite page content streams */
  textEdits?: TextEditInput[]
  /** New searchable text objects, applied in the same content-stream stage as textEdits. */
  textInserts?: TextInsertInput[]
  /** Content-stream image operations, applied right after textEdits (same pdfium stage) */
  imageEdits?: ImageEditInput[]
  /** Permanent redactions are accepted only for an explicitly authorized Save As copy. */
  redactions?: RedactionInput[]
  /** Complete resulting set; omitted means preserve existing embedded metadata. */
  staticFormFills?: StaticFormFillRecord[]
  /** Moves/flag changes/removals of existing widgets, applied before formFields */
  formWidgetEdits?: FormWidgetEditInput[]
  /** New AcroForm fields, created after formValues (names must not collide with existing fields) */
  formFields?: FormFieldInput[]
  /** Blank pages appended (in pageIndex order) before every page-addressed stage runs */
  blankPages?: BlankPageInput[]
  /** Page rotation deltas (original page index → multiple of 90 clockwise) */
  rotations?: { pageIndex: number; delta: number }[]
  /** Pages to delete (original page indices) */
  deletedPages?: number[]
  /** New page order (array of original page indices, excluding deleted); omitted if unreordered */
  pageOrder?: number[]
  metadata?: MetadataInput
  /**
   * The app's own autosave (30s tick / window blur). On a copy-pair conflict the
   * main process then defers silently instead of raising the overwrite prompt; a
   * direct save omits this and asks.
   */
  auto?: boolean
}

/** Outcome of one recovery copy write ('failed' makes the renderer skip a few rounds) */
export type PdfRecoveryCopyResult = 'written' | 'superseded' | 'skipped' | 'failed'

/** A text edit that could not be matched to the document at save time and was skipped */
export interface TextEditFailure {
  pageIndex: number
  oldText: string
  reason: string
}

export interface TextInsertFailure {
  editIndex: number
  pageIndex: number
  reason: string
}

/** Answer to autoRename; `path`/`name` present when renamed */
export interface PdfAutoRenameResult {
  renamed: boolean
  path?: string
  name?: string
}

export type SavePdfResult =
  | {
      ok: true
      skippedTextEdits?: TextEditFailure[]
      skippedTextInserts?: TextInsertFailure[]
      skippedImageEdits?: ImageEditFailure[]
    }
  | { ok: false; error: string }

/** Dry-run matching for pending text edits against the file on disk (no mutation) */
export interface ValidateTextEditsRequest {
  path: string
  edits: TextEditInput[]
}

/** Extract pages into a new PDF written to the GenOffice save dir and opened in a new tab */
export interface ExtractPagesRequest {
  path: string
  /** Page indices in the file as saved (the renderer flushes first, so visible positions) */
  pages: number[]
  suggestedName: string
}

export type ExtractPagesResult = { ok: true; savedPath: string } | { ok: false; error: string }

/** Insert (merge) another PDF after a page of the current file: main process shows a picker and writes back immediately */
export interface InsertPdfRequest {
  path: string
  /** Insert after this original page index; -1 means front of the document */
  afterPageIndex: number
}

export type InsertPdfResult =
  { ok: true; insertedCount: number } | { ok: true; canceled: true } | { ok: false; error: string }

/** Insert a blank page (sized like the neighboring page) and write back immediately — no dialog */
export interface InsertBlankPageRequest {
  path: string
  /** Insert after this original page index; -1 means front of the document */
  afterPageIndex: number
}

export type InsertBlankPageResult = { ok: true } | { ok: false; error: string }

/** Split the file into chunks of chunkSize pages: main shows a folder picker and writes one PDF per chunk */
export interface SplitPdfRequest {
  path: string
  chunkSize: number
  /** Base for output file names: <baseName>-1.pdf, <baseName>-2.pdf, … */
  baseName: string
}

export type SplitPdfResult =
  | { ok: true; savedDir: string; count: number }
  | { ok: true; canceled: true }
  | { ok: false; error: string }

/** Merge the current file with other PDFs into a new file: main shows a multi-file picker then a save dialog */
export interface MergePdfRequest {
  path: string
  suggestedName: string
}

export type MergePdfResult =
  | { ok: true; savedPath: string; appendedCount: number }
  | { ok: true; canceled: true }
  | { ok: false; error: string }

/** N-up imposition (WPS "merge pages"): every perSheet pages onto one sheet, saved as a new file */
export interface MergePagesRequest {
  path: string
  /** Pages per sheet, 2-16 */
  perSheet: number
  /** Fill order: horizontal = left→right then down, vertical = top→bottom then right */
  direction: 'horizontal' | 'vertical'
  /** Draw hairline separators on the internal cell boundaries */
  separator: boolean
  suggestedName: string
}

export type MergePagesResult =
  { ok: true; savedPath: string } | { ok: true; canceled: true } | { ok: false; error: string }

/** Replace pages with all pages of another PDF (main shows a picker), written back in place */
export interface ReplacePagesRequest {
  path: string
  /** Original page indices to replace */
  pages: number[]
}

export type ReplacePagesResult =
  | { ok: true; removed: number; inserted: number }
  | { ok: true; canceled: true }
  | { ok: false; error: string }

/** Resize all pages to a target paper size (points), content scaled to fit; written back in place */
export interface SetPageSizeRequest {
  path: string
  width: number
  height: number
}

export type SetPageSizeResult = { ok: true } | { ok: false; error: string }

/** Split every page into a grid of pages (inverse of merge pages), written to the
 * GenOffice save dir and opened in a new tab */
export interface SplitPagesRequest {
  path: string
  perPage: 2 | 4 | 9
  suggestedName: string
}

export type SplitPagesResult = { ok: true; savedPath: string } | { ok: false; error: string }

/** Shrink the CropBox of the given pages to a fractional rect of the displayed page; in place */
export interface CropPagesRequest {
  path: string
  /** Original page indices */
  pages: number[]
  /** Fractions of the displayed page (after /Rotate), y down from the top */
  rect: { l: number; t: number; r: number; b: number }
}

export type CropPagesResult = { ok: true } | { ok: false; error: string }

/** Export pages as PNG: renderer rasterizes the bitmaps, main process shows a dialog and writes to disk */
export interface ExportImagesRequest {
  /** base64 PNGs (without the data: prefix), in page order */
  images: string[]
  /** 1-based page numbers, same length as images, used for file names */
  pageNumbers: number[]
  baseName: string
}

export type ExportImagesResult =
  | { ok: true; savedDir: string; count: number }
  | { ok: true; canceled: true }
  | { ok: false; error: string }

// ── document-structure jobs (window.pdfApi.structure) ──
// Every job runs in its own process started by the shell and ends with it.
// Cancelling, closing the tab or quitting the app kills that process.

/**
 * Why a structure job or a store call did not succeed:
 * - not-granted: a path or document hash this view was never given
 * - invalid-request: malformed input
 * - invalid-target: an output path that is the source document itself
 * - busy: the job id is already running, or this view runs too many jobs
 * - cancelled: cancelled, or the tab / app closed
 * - password-required: no password or a wrong one (PdfLoadError)
 * - corrupt / unsupported: the PDF cannot be opened (PdfLoadError)
 * - page-range: pages outside the document; see `validRange`
 * - asset-conflict: `assets/` holds a file of that name the app does not own
 * - not-available: the operation is not built yet
 * - process-exited: the job process ended without an answer (crash, out of memory)
 * - store-write-failed: the result store could not be written (disk full, …)
 * - failed: anything else; `message` is English for logs
 */
export type PdfStructureErrorCode =
  | 'not-granted'
  | 'invalid-request'
  | 'invalid-target'
  | 'busy'
  | 'cancelled'
  | 'password-required'
  | 'corrupt'
  | 'unsupported'
  | 'page-range'
  | 'asset-conflict'
  | 'not-available'
  | 'process-exited'
  | 'store-write-failed'
  | 'failed'

export interface PdfStructureFailure {
  ok: false
  error: PdfStructureErrorCode
  message?: string
  /** page-range only: the pages the document has */
  validRange?: { first: number; last: number }
}

export type PdfStructureOutcome<T> = ({ ok: true } & T) | PdfStructureFailure

/** The document a job reads: always this view's open file */
export interface PdfStructureSource {
  /** the open file (granted to this view) */
  path: string
  password?: string
  /** 1-based page numbers; absent = every page */
  pages?: number[]
}

/** Caller-chosen id (letters, digits, '-', '_'); progress events and cancel use it */
export interface PdfStructureJobRef {
  jobId: string
}

export interface PdfStructureProgress {
  jobId: string
  /** pages (or images) done so far */
  done: number
  total: number
}

export interface PdfStructureTreeRequest extends PdfStructureSource, PdfStructureJobRef {
  /** keep picture bytes in the answer (default false: `data` arrives empty) */
  imageData?: boolean
}

export interface PdfStructureTreeResult {
  /** result-store key of the analyzed file bytes */
  docHash: string
  tree: DocumentTree
  fingerprints: PageFingerprint[]
  /** served from this view's cached tree of the same file bytes and pages */
  cached: boolean
}

export type PdfStructureTextRequest = PdfStructureSource & PdfStructureJobRef

/** one page of the structured text the AI read path uses (spec §2) */
export interface PdfStructuredTextPage {
  /** 1-based original page number */
  page: number
  text: string
}

export interface PdfStructureTextResult {
  docHash: string
  pages: PdfStructuredTextPage[]
}

/** translated or bilingual output */
export interface PdfStructureTranslationInput {
  lang: string
  bilingual: boolean
  /**
   * translated runs by text-unit key (see textUnits); absent = the stored
   * translation of the file's document hash (finished blocks translated, the
   * rest in the source language), with its report in the result
   */
  units?: Array<{ key: string; runs: InlineRun[] }>
}

export interface PdfStructureEpubOptions {
  /** dc:title; prefill from the document info, else the file name */
  title: string
  author?: string
  /** cover from the first page (default true) */
  cover?: boolean
  /** explicit dc:language; absent = guessed from the text */
  language?: string
  /** UI language, used when the guess finds no dominant script */
  uiLanguage?: string
  /** alt text of a page kept as a picture; `{page}` is replaced by the page number */
  pageImageAlt?: string
}

export interface PdfStructureConvertRequest extends PdfStructureSource, PdfStructureJobRef {
  format: 'md' | 'epub'
  /** from structure.pickTarget with the same format; good for one job */
  outPath: string
  translation?: PdfStructureTranslationInput
  /** EPUB only */
  epub?: PdfStructureEpubOptions
}

export interface PdfStructureConvertResult {
  docHash: string
  outPath: string
  /** Markdown only: conversion notes (degraded pages, footnotes, …) */
  warnings: MarkdownWarning[]
  /** Markdown only: pictures written to `assets/` and pictures already there */
  assetsWritten: number
  assetsReused: number
  /** a stored translation was written: what it holds for the written pages */
  translation?: TranslationReport
}

export interface PdfStructureImagesRequest extends PdfStructureSource, PdfStructureJobRef {
  /** from structure.pickTarget('folder'); good for one job */
  outDir: string
  /** file name prefix (default: the PDF's name) */
  baseName?: string
  /** skip images narrower or shorter than this (default 32) */
  minImagePx?: number
}

export interface PdfStructureImagesResult {
  docHash: string
  outDir: string
  /** `file` is the absolute path written */
  images: Array<{ page: number; file: string; width: number; height: number }>
}

/** Translated PDF write-back of the stored translation into `payload.lang` */
export interface PdfStructureWriteBackRequest extends PdfStructureSource, PdfStructureJobRef {
  /** from structure.pickTarget('pdf'); never the source file */
  outPath: string
  payload: PdfTranslatedPdfPayload
}

export interface PdfTranslatedPdfPayload {
  /** target language of the stored translation to write */
  lang: string
}

/** the `report` of a translated PDF: the writer's report and the stored translation's, same pages */
export interface PdfTranslatedPdfReport {
  writer: WritebackReport
  translation: TranslationReport
}

export interface PdfStructureWriteBackResult {
  docHash: string
  outPath: string
  /** the writer's own report (overflowed blocks, pages left as they were, …) */
  report: unknown
}

export type PdfStructureTargetKind = 'md' | 'epub' | 'pdf' | 'folder'

export interface PdfStructurePickTargetRequest {
  kind: PdfStructureTargetKind
  /** the open file; the dialog starts in its folder */
  path: string
  /** suggested file name (files only) */
  defaultName?: string
  /** dialog title, already localized */
  title?: string
}

export interface PdfStructureApi {
  /** main-process save / folder dialog; the picked path is granted to this view for one job. null = cancelled */
  pickTarget(request: PdfStructurePickTargetRequest): Promise<string | null>
  /** document tree of the open file (cached per view while the file bytes stay the same) */
  tree(request: PdfStructureTreeRequest): Promise<PdfStructureOutcome<PdfStructureTreeResult>>
  /** structured text for the AI read path; not-available until the formatter is plugged in */
  text(request: PdfStructureTextRequest): Promise<PdfStructureOutcome<PdfStructureTextResult>>
  /** write Markdown (with `assets/` and the app-owned asset list) or EPUB */
  convert(
    request: PdfStructureConvertRequest,
  ): Promise<PdfStructureOutcome<PdfStructureConvertResult>>
  /** write the images embedded in the pages as PNG files */
  extractImages(
    request: PdfStructureImagesRequest,
  ): Promise<PdfStructureOutcome<PdfStructureImagesResult>>
  /** translated PDF write-back; not-available until the writer is plugged in */
  writeBack(
    request: PdfStructureWriteBackRequest,
  ): Promise<PdfStructureOutcome<PdfStructureWriteBackResult>>
  /** kill the job's process; its call answers 'cancelled'. False when no such job runs */
  cancel(jobId: string): Promise<boolean>
  onProgress(handler: (progress: PdfStructureProgress) => void): () => void
}

// ── result store (window.pdfApi.store) ──
// Document hashes are accepted only after the main process computed them for
// this view (docHash, migrate, or a structure job's answer).

/** a translation as stored, blocks in a plain list */
export interface PdfStoredTranslation {
  lang: string
  provider: string | null
  model: string | null
  blocks: TranslationBlockEntry[]
}

export type PdfStoreWriteRequest =
  | {
      kind: 'aiReadPage'
      docHash: string
      pageFingerprint: string
      payload: AiReadPayload
      provider?: string
      model?: string
    }
  | { kind: 'translationMeta'; docHash: string; lang: string; provider: string; model: string }
  | { kind: 'translationBlocks'; docHash: string; lang: string; blocks: TranslationBlockInput[] }
  | { kind: 'deleteTranslation'; docHash: string; lang: string }
  /** the record is found by (kind, key): `lang`, or `runId` for 'highlight' (JobRecordInput) */
  | { kind: 'job'; docHash: string; job: JobRecordInput }
  /** `lang` for translate / translate-page / summary, `runId` for highlight, neither for ai-read */
  | { kind: 'heartbeat'; docHash: string; job: JobKind; lang?: string; runId?: string }
  /** write (or replace) a passage card; the store stamps savedAt */
  | { kind: 'passage'; docHash: string; card: PassageCardInput }
  | { kind: 'deletePassage'; docHash: string; id: string }
  /** write (or replace) an AI highlight run's record */
  | { kind: 'highlightRun'; docHash: string; run: HighlightRun }
  | { kind: 'highlightBlocks'; docHash: string; runId: string; blocks: HighlightBlockInput[] }
  /** suggestion states of one block by suggestion id; fails when the block is missing */
  | {
      kind: 'highlightSuggestionStates'
      docHash: string
      runId: string
      key: TranslationBlockKey
      states: Record<string, HighlightSuggestionState>
    }
  /** a run's folder and its job record `highlight.<runId>.json` */
  | { kind: 'deleteHighlightRun'; docHash: string; runId: string }
  | { kind: 'insights'; docHash: string; entry: InsightsEntry }
  /** a person's edit of a translated block: plain text, kept on a restart */
  | {
      kind: 'editedTranslationBlock'
      docHash: string
      lang: string
      key: TranslationBlockKey
      text: string
    }
  /** "translate again from the start" keeping the edits; answers `removed` */
  | { kind: 'deleteTranslationExceptEdited'; docHash: string; lang: string }

/** what a store write answers besides `ok` */
export interface PdfStoreWriteResult {
  /** deleteTranslationExceptEdited: the block entries removed */
  removed?: number
}

export interface PdfStoreMigrateRequest {
  /** the open file, as saved */
  path: string
  /** the document hash before the save */
  oldDocHash: string
  password?: string
}

export interface PdfStoreMigrateResult {
  docHash: string
  aiReadPages: number
  translationBlocks: number
  languages: string[]
  /** job records carried to the new hash (finished ones included) */
  jobs: number
  /** passage cards moved; present only when some were */
  passages?: number
  /** highlight blocks moved; present only when some were */
  highlightBlocks?: number
  /** insights entries moved; present only when some were */
  insights?: number
}

/** what deleting the document's stored results also removes (the confirmation names it) */
export interface PdfStoreDeleteCounts {
  /** translation blocks a person edited, in every language */
  editedTranslationBlocks: number
  passages: number
}

/** the open file whose page fingerprints are asked for (granted to this view) */
export interface PdfStorePageFingerprintsRequest {
  path: string
  password?: string
}

/** a stored translation language and the newest savedAt of its blocks */
export interface PdfTranslationRecency {
  lang: string
  /** null when the language has no readable block */
  savedAt: number | null
}

export interface PdfStoreApi {
  /** result-store key of the open file's current bytes */
  docHash(path: string): Promise<PdfStructureOutcome<{ docHash: string }>>
  aiReadPages(docHash: string): Promise<PdfStructureOutcome<{ pages: AiReadPageEntry[] }>>
  translations(docHash: string): Promise<PdfStructureOutcome<{ langs: string[] }>>
  translation(
    docHash: string,
    lang: string,
  ): Promise<PdfStructureOutcome<{ translation: PdfStoredTranslation | null }>>
  /** not complete (stopped, or running elsewhere): the source of the resume offer */
  unfinishedJobs(docHash: string): Promise<PdfStructureOutcome<{ jobs: JobStatus[] }>>
  write(request: PdfStoreWriteRequest): Promise<PdfStructureOutcome<PdfStoreWriteResult>>
  /** after an in-app save: carry results and job records to the new hash */
  migrate(request: PdfStoreMigrateRequest): Promise<PdfStructureOutcome<PdfStoreMigrateResult>>
  /** forget everything stored for the document */
  deleteDocument(docHash: string): Promise<PdfStructureOutcome<object>>
  /** every readable passage card of the document */
  passages(docHash: string): Promise<PdfStructureOutcome<{ cards: PassageCard[] }>>
  /** every readable AI highlight run, newest (createdAt) first */
  highlightRuns(docHash: string): Promise<PdfStructureOutcome<{ runs: HighlightRun[] }>>
  /** every readable block of one run */
  highlightBlocks(
    docHash: string,
    runId: string,
  ): Promise<PdfStructureOutcome<{ blocks: HighlightBlockEntry[] }>>
  /** the newest run and its blocks (the preview and the panel show only this one) */
  latestHighlight(
    docHash: string,
  ): Promise<PdfStructureOutcome<{ run: HighlightRun | null; blocks: HighlightBlockEntry[] }>>
  /** the overview in one language, or null */
  insights(
    docHash: string,
    lang: string,
  ): Promise<PdfStructureOutcome<{ insights: InsightsEntry | null }>>
  /** what the "delete this document's stored results" confirmation names */
  deleteCounts(docHash: string): Promise<PdfStructureOutcome<PdfStoreDeleteCounts>>
  /**
   * The open file's page fingerprints in page order, with its document hash
   * (now usable by this view). Reads the fingerprints only, never the tree.
   */
  pageFingerprints(
    request: PdfStorePageFingerprintsRequest,
  ): Promise<PdfStructureOutcome<{ docHash: string; fingerprints: string[] }>>
  /** stored translation languages, most recently written first */
  translationRecency(
    docHash: string,
  ): Promise<PdfStructureOutcome<{ langs: PdfTranslationRecency[] }>>
}

/** AI channels are app-wide shared ipcMain handlers (shell registers via docs-main registerAiIpc); pass-through only */
export const AI_CHANNELS = {
  getSettings: 'ai:get-settings',
  setSettings: 'ai:set-settings',
  settingsChanged: 'ai:settings-changed',
  openModelSettings: 'ai:open-model-settings',
  stream: 'ai:stream',
  streamChunk: 'ai:stream-chunk',
  streamCancel: 'ai:stream-cancel',
  imageSearch: 'ai:image-search',
  readUrl: 'ai:read-url',
  fetchImage: 'ai:fetch-image',
} as const

export interface ImageSearchResponse {
  images: Array<{
    title: string
    imageUrl: string
    sourceUrl: string
    source: string
    width?: number
    height?: number
  }>
  method: string
  /** failure reason when method === 'error' */
  error?: string
}

/** One page of a web page read for the AI (the shared ai:read-url handler) */
export type ReadUrlResult =
  | {
      ok: true
      /** the final address after redirects */
      url: string
      title?: string
      text: string
      /** where this slice of the text starts */
      offset: number
      totalChars: number
      truncated: boolean
      /** where the next slice starts; only when truncated */
      nextOffset?: number
    }
  | { ok: false; error: string; errorCode: string }

/** API exposed by preload to the renderer (window.pdfApi) */
export interface PdfApi {
  /** Take the pdf path pending for this view (queued at tab creation); null if none */
  consumePending(): Promise<string | null>
  /** open any shell-routed document path (an AI answer's filenav citation) */
  openSourcePath(path: string): Promise<void>
  /** Read pdf bytes. Only paths granted to this view are allowed */
  readFile(path: string): Promise<ArrayBuffer>
  /** Write markups/form values/page ops back to the original file (pdf-lib, content streams untouched); path grants same as readFile. With targetPath set (Save As), the original is only read and the result goes to targetPath */
  save(request: SavePdfRequest): Promise<SavePdfResult>
  /** Creates a redacted working copy on first apply; subsequent applies save that copy in place. */
  requestRedactionCopy(path: string): Promise<boolean>
  /** Content-derived naming (docs/sheets analog): propose a file base name after a save.
      The main process renames only while the file still carries the shell's auto-created
      untitled name, so user-chosen names are never touched. */
  autoRename(path: string, baseName: string): Promise<PdfAutoRenameResult>
  /** Whether the file is a shell-created blank still carrying its untitled name
      (gates the after-AI-run silent save; a PDF the user merely opened must never auto-write) */
  isUntitled(path: string): Promise<boolean>
  /** Whether the file is an untitled copy (a skill template's): its first save asks where */
  isUntitledCopy?(path: string): Promise<boolean>
  /** The document with its pending edits, as bytes, for a skill's template; nothing is written */
  templateBytes?(request: SavePdfRequest): Promise<Uint8Array | null>
  /**
   * An untitled copy's first explicit save, after its edits were saved into the
   * copy: asks where the document goes and makes that file this tab's
   * document. The chosen path, or null when cancelled.
   */
  adoptUntitledCopy?(path: string, defaultName: string): Promise<string | null>
  /** Dry-run match of pending text edits against the file: reason null = would apply */
  validateTextEdits(request: ValidateTextEditsRequest): Promise<TextEditValidation[]>
  /** EDIT_FONTS ids whose font file exists on this machine */
  listEditFonts(): Promise<string[]>
  /** Whether any embeddable font on this machine can draw `text` (insert-time gate:
      the preview renders with browser fallback, which proves nothing about save) */
  canDrawText(text: string, font?: string, bold?: boolean, italic?: boolean): Promise<boolean>
  /** Enumerate the content-stream images of every page (for image edit mode) */
  listPageImages(path: string): Promise<PageImageRef[]>
  /** Read GenOffice static-fill metadata stored inside the PDF. */
  listStaticFormFills(path: string): Promise<StaticFormFillRecord[]>
  /** System-OCR one rendered page image (PNG, base64); null when no engine is
      available on this platform, [] when recognition failed for this image */
  ocrPage(png: string): Promise<PdfOcrLine[] | null>
  /** Render one existing image object to PNG (base64) for move/resize ghost previews; null if it can't be matched */
  pageImagePng(request: {
    path: string
    pageIndex: number
    rect: [number, number, number, number]
    /** Upscale factor over the on-page size (default 1); use >1 when the pixels feed a
        pixel edit (crop/flip/…) so the baked result keeps print-quality resolution */
    scale?: number
  }): Promise<string | null>
  /** Live-preview render of a page region with the given images removed (base64 PNG);
      the renderer patches it over the raster so touched images vanish before save */
  pagePreviewPng(request: PagePreviewRequest): Promise<PagePreviewResult | null>
  extractPages(request: ExtractPagesRequest): Promise<ExtractPagesResult>
  insertPdf(request: InsertPdfRequest): Promise<InsertPdfResult>
  insertBlankPage(request: InsertBlankPageRequest): Promise<InsertBlankPageResult>
  splitPdf(request: SplitPdfRequest): Promise<SplitPdfResult>
  mergePdf(request: MergePdfRequest): Promise<MergePdfResult>
  mergePages(request: MergePagesRequest): Promise<MergePagesResult>
  replacePages(request: ReplacePagesRequest): Promise<ReplacePagesResult>
  setPageSize(request: SetPageSizeRequest): Promise<SetPageSizeResult>
  splitPages(request: SplitPagesRequest): Promise<SplitPagesResult>
  cropPages(request: CropPagesRequest): Promise<CropPagesResult>
  exportImages(request: ExportImagesRequest): Promise<ExportImagesResult>
  /** Convert the current PDF to Word / Excel / PowerPoint via the shell's local conversion flows */
  convertOffice(format: PdfConvertFormat): Promise<void>
  /** Shell File menu → open the Markdown / EPUB conversion dialog */
  onConvertDialogRequest(handler: (format: PdfReflowFormat) => void): () => void
  /** Before a Markdown job writes: close a Markdown tab showing that file (its unsaved-changes guard applies). False = still open */
  releaseConvertTarget(request: PdfConvertOutputRequest): Promise<boolean>
  /** Open a converted Markdown file in a Markdown tab (same routing as File > Open) */
  openConvertResult(request: PdfConvertOutputRequest): Promise<boolean>
  /** Show a converted file (or an export folder's first file) in the system file manager */
  revealConvertResult(request: PdfConvertOutputRequest): Promise<boolean>
  /** AI create_document: build a new standalone file in the default folder and open it in a new tab */
  createDocument(request: CreateDocumentRequest): Promise<CreateDocumentResult>
  /** open the shell's PDF tools window on `tool` with this view's file picked (false: no host) */
  openInPdfTools(path: string, tool: PdfToolsHandoffTool): Promise<boolean>
  /** Web image search for AI tools (app-wide ai:image-search handler) */
  imageSearch(query: string, maxResults?: number): Promise<ImageSearchResponse>
  /** Read one web page as text for AI tools (app-wide ai:read-url handler), paged by offset */
  readUrl(url: string, offset?: number): Promise<ReadUrlResult>
  /** Download an image URL in the main process (SSRF-guarded, avoids CORS); null on failure */
  fetchImage(url: string): Promise<{ base64: string; mime: string } | null>
  /** AI image generation (Codex subscription or a media API key); returns a downloadable URL or an error message */
  generateImage(op: { prompt: string; aspectRatio?: string }): Promise<{
    url?: string
    error?: string
  }>
  /** Read and verify the digital (certificate) signatures embedded in a granted PDF */
  listDigitalSignatures(path: string): Promise<PdfSignatureInfo[]>
  /** Open the OS file picker for a PKCS#12 certificate (.p12/.pfx); the file is referenced by the returned opaque id */
  pickCertificate(): Promise<{ certId: string; fileName: string } | null>
  /** Decrypt the picked certificate with its password and describe the signer (nothing is signed) */
  /** Signing identities in the OS certificate store (NSS on Linux, personal store on Windows, keychain on macOS) */
  listSystemCertificates(storePassword?: string): Promise<ListSystemCertificatesResult>
  /** Forget a certificate id and any key material the main process still holds for it */
  releaseCertificate(certId: string): void
  inspectCertificate(
    certId: string,
    password: string,
    storePassword?: string,
  ): Promise<InspectCertificateResult>
  /** Sign the granted PDF with the picked certificate; asks for a destination, never modifies the source, and re-points this view at the signed copy */
  signWithCertificate(request: SignWithCertificateRequest): Promise<SignWithCertificateResult>
  /** Saved signatures reusable across documents (persisted in userData), newest first */
  listSavedSignatures(): Promise<SavedSignature[]>
  /** Persist a signature for reuse; returns the updated list (capped, deduplicated) */
  addSavedSignature(data: SignatureData): Promise<SavedSignature[]>
  /** Delete one saved signature by id; returns the updated list */
  removeSavedSignature(id: string): Promise<SavedSignature[]>
  /** OS account name, used as the default author of new note comments; '' when unavailable */
  getUsername(): Promise<string>
  /** The /Subj of the markup annotations in a granted file (accepted AI highlights' categories) */
  annotSubjects(path: string): Promise<PdfAnnotSubject[]>
  /** open (or first make) the Markdown note linked to this view's PDF in a Markdown tab */
  noteOpen(request?: PdfNoteOpenRequest): Promise<PdfNoteResult>
  /** put text at the end of that note's open tab (never written to the file directly) */
  noteInsert(request: PdfNoteInsertRequest): Promise<PdfNoteResult>
  /** this view's PDF has no path the person saved yet (a new blank before its first save): the note buttons wait */
  noteUnsaved(): Promise<boolean>
  /** Mirror unsaved-changes state to the main process; drives the save prompt before closing a tab/window */
  setDirty(dirty: boolean): void
  /** Main process asks for a save (close prompt, menu Save, export flows) and waits for sendCloseSaveResult.
   *  flushAll: success must mean everything on screen is in the file, including the form field whose card is open */
  onCloseSaveRequest(handler: (opts: { flushAll: boolean }) => void): () => void
  sendCloseSaveResult(ok: boolean): void
  /** Shell menu Save As → renderer writes pending edits to targetPath only (original untouched) and replies via sendSaveAsResult */
  onSaveAsRequest(handler: (targetPath: string) => void): () => void
  /** true = written, false = failed, 'cancelled' = the person closed the annotation choice */
  sendSaveAsResult(ok: boolean | 'cancelled'): void
  /** True while the shell's Save As flow (dialog included) is open — the renderer pauses autosave, since the dialog's window blur would otherwise trigger a save into the original */
  onSaveAsFlow(handler: (inFlight: boolean) => void): () => void
  /** Shell menu Print → renderer runs its print flow (save, rasterize, system dialog) */
  onPrintRequest(handler: () => void): () => void
  /** The file was renamed or moved from the shell (home Folders / Files pane); the viewer follows the new path */
  onFileRenamed(handler: (newPath: string) => void): () => void
  /** Whether the view shows `path` from a recovery copy not saved since (the tab starts with unsaved changes) */
  recoveryState?(path: string): Promise<{ unsaved: boolean }>
  /** Write the recovery copy: what a save of these edits would write, into the app data folder only */
  writeRecoveryCopy?(request: SavePdfRequest): Promise<PdfRecoveryCopyResult>
  /** Report a document that cannot get a safe copy; answers the one-time notice for this tab, or null */
  reportUnprotectable?(unprotectable: boolean): Promise<string | null>
  /** The OS is ending the session: write the copy now and answer with sendRecoveryFlushDone */
  onRecoveryFlushRequest?(handler: () => void): () => void
  sendRecoveryFlushDone?(): void
  /** "Don't Save" was answered (true) or the shell reports the close was cancelled (false) */
  onRecoveryDropped?(handler: (dropped: boolean) => void): () => void
  /** The user edits again after "Don't Save": the close was cancelled, copies resume */
  resumeRecoveryCopies?(): Promise<void>
  getLanguage(): Promise<Lang>
  onLanguageChanged(handler: (lang: Lang) => void): () => void
  getTheme(): Promise<UiTheme>
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  /** AI panel text size + chat-input spellcheck (Settings → General in the shell) */
  getAiPanelPrefs(): Promise<AiPanelPrefs>
  setAiPanelPrefs(patch: Partial<AiPanelPrefs>): Promise<AiPanelPrefs>
  onAiPanelPrefsChanged(handler: (prefs: AiPanelPrefs) => void): () => void
  /** press on the shell chrome (tab strip is a sibling WebContentsView whose
   *  clicks produce no DOM event here) — dismiss open popovers */
  onChromePressed(handler: () => void): () => void
  getAiSettings(): Promise<AiSettings>
  setAiSettings(settings: AiSettings): Promise<void>
  /** ai-settings.json was rewritten by any renderer; re-read it */
  onAiSettingsChanged(handler: () => void): () => void
  /** shell only: switch to Home and open Settings › AI Model (rejects in standalone) */
  openAiModelSettings(): Promise<void>
  /** subscription providers (Claude, Codex): connection statuses and the connect actions */
  subscription: SubscriptionApi
  /** document-structure jobs: tree, structured text, Markdown / EPUB, embedded images, write-back */
  structure: PdfStructureApi
  /** result store: AI-read pages, translations, job records */
  store: PdfStoreApi
  /** whether generate_image can run right now (false when the app-wide AI host does not answer) */
  imageGenerationAvailable(): Promise<boolean>
  aiStream(request: AiStreamRequest): Promise<void>
  /**
   * End the stream `requestId`. Without a scope this is the AI window's Stop
   * and also ends the tab's image and media calls; scope 'request' (a
   * document job's call) ends that stream only.
   */
  aiStreamCancel(requestId: string, scope?: 'request'): Promise<void>
  onAiStream(handler: (chunk: AiStreamChunk) => void): () => void
}
