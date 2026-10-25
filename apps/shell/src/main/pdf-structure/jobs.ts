/**
 * What a structure-job process does with its one job. Node-only and
 * Electron-free (pdf-structure-process.ts wires it to the parent port; the tests call
 * it directly with a real PDFium).
 *
 * The source PDF is only read. Results go to the target the user picked:
 * Markdown writes `<name>.md`, its pictures under `assets/` and the editor's
 * app-owned list `assets/.genoffice-assets.json` (merged, never replaced);
 * an `assets/` file the list does not own is never overwritten.
 *
 * Pages the user had read by AI (spec §7) replace their pages in Markdown,
 * EPUB, the structured text and the translated PDF: the stored readings of
 * the file's document hash are merged into the tree before it is written. The
 * tree job itself, and the tree handed back for the main process's cache,
 * stay the PDF's own.
 *
 * A translated output (spec §8) takes the stored translation of the file's
 * document hash, unless the request carries its own translated runs: the
 * finished blocks translated, the rest in the source language.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { OcrEngine, PdfiumModule } from '../../../../../packages/pdf2docx/src'
import { withPdfDocument } from '../../../../../packages/pdf2docx/src/extract/pdfium'
import { renderPageByIndexPng } from '../../../../../packages/pdf2docx/src/extract'
import { findBlankPages } from '../../../../pdf/src/main/blank-pages'
import { decryptPdfBytes, encryptPdfBytes } from '../../../../pdf/src/main/qpdf'
import {
  RepairFailedError,
  pdfiumOpens,
  repairPdfBytes,
  salvagePdfBytes,
  type RepairPdfium,
} from '../../../../pdf/src/main/repair'
import {
  applyStoredAiReadings,
  ASSET_MANIFEST_FILENAME,
  buildBilingualTree,
  buildTranslatedTree,
  ASSETS_DIR,
  deriveBilingualTree,
  deriveTranslatedTree,
  extractDocumentTree,
  extractEmbeddedImages,
  mergeAssetManifest,
  PageRangeError,
  parseAssetManifest,
  translationReport,
  treeToMarkdown,
  writeEpub,
  type DocumentTree,
  type InlineRun,
  type MarkdownConversion,
  type OwnedAssetRecord,
  type TranslationReport,
} from '../../../../../packages/pdf-structure/src'
import { pageFingerprint } from '../../../../../packages/pdf-structure/src/tree/pdfium-doc'
import { documentHash, ResultStore } from '../../../../../packages/pdf-structure/src/store'
import type { StoredTranslation } from '../../../../../packages/pdf-structure/src/store/store'
import type {
  HbSubsetWasm,
  WritebackFontLocator,
} from '../../../../../packages/pdf-structure/src/writeback'
import { atomicWriteFile } from '../atomic-write'
import * as plugins from './plugins'
import { NotAvailableError } from './plugins'
import type { StructuredTextFormatter, TranslatedPdfWriter } from './plugins'
import type {
  EpubJobValue,
  FingerprintsJobValue,
  ImagesJobValue,
  JobSource,
  MarkdownJobValue,
  StructuredTextJobValue,
  StructureJob,
  TranslationInput,
  TreeJobValue,
  WriteBackJobValue,
} from './protocol'

export interface JobDeps {
  pdfium: () => Promise<PdfiumModule>
  ocr: () => OcrEngine | null
  /** EPUB modified date (tests pin it) */
  now?: () => Date
  /** overrides plugins.structuredTextFormatter (tests) */
  structuredTextFormatter?: StructuredTextFormatter | null
  /** overrides plugins.translatedPdfWriter (tests) */
  translatedPdfWriter?: TranslatedPdfWriter | null
  /**
   * The result store's AI-read pages of a document, keyed by page
   * fingerprint (aiReadingsFromStore); absent or null = no readings
   */
  aiReadings?: StoredAiReadings | null
  /**
   * The result store's translation of a document into a language
   * (translationsFromStore); absent or null = translated outputs that rely
   * on the store are not available
   */
  translations?: StoredTranslations | null
  /** the font subsetter wasm the translated PDF embeds fonts with; absent or null = not available */
  hbSubsetWasm?: (() => Promise<HbSubsetWasm>) | null
  /** fonts for the translated PDF (tests); default the fonts installed on this PC */
  writebackFontLocator?: WritebackFontLocator
  /** qpdf's wasm on disk; absent or null = adding and removing a password is not available */
  qpdfWasmPath?: string | null
}

/** the stored translation of a document hash into a language, or null */
export type StoredTranslations = (
  docHash: string,
  lang: string,
) => Promise<StoredTranslation | null>

/** AI-read pages of a document hash, keyed by page fingerprint */
export type StoredAiReadings = (
  docHash: string,
) => Promise<ReadonlyMap<string, { payload: unknown }>>

/** the readings the app's result store holds under `<userDataDir>/pdf-store` */
export function aiReadingsFromStore(userDataDir: string): StoredAiReadings {
  let store: ResultStore | null = null
  return (docHash) => (store ??= new ResultStore(userDataDir)).readAiReadPages(docHash)
}

/** the translations the app's result store holds under `<userDataDir>/pdf-store` */
export function translationsFromStore(userDataDir: string): StoredTranslations {
  let store: ResultStore | null = null
  return (docHash, lang) => (store ??= new ResultStore(userDataDir)).readTranslation(docHash, lang)
}

/**
 * The tree with the document's stored AI readings in place. A store that
 * cannot be read leaves the tree as it is: a conversion never fails for it.
 */
async function withAiReadings(
  tree: DocumentTree,
  docHash: string,
  deps: JobDeps,
): Promise<DocumentTree> {
  if (!deps.aiReadings || tree.variant !== 'original') return tree
  let readings: ReadonlyMap<string, { payload: unknown }>
  try {
    readings = await deps.aiReadings(docHash)
  } catch {
    return tree
  }
  return readings.size > 0 ? applyStoredAiReadings(tree, readings) : tree
}

export type ProgressSink = (done: number, total: number) => void

/** `assets/` holds a file of that name the app does not own, or an unreadable list */
export class AssetConflictError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AssetConflictError'
  }
}

export { NotAvailableError }

/** cover render scale: pixels per point (about 108 dpi) */
const COVER_SCALE = 1.5

const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')

const isNotFound = (err: unknown): boolean =>
  (err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
const isExists = (err: unknown): boolean =>
  (err as NodeJS.ErrnoException | undefined)?.code === 'EEXIST'

async function readSource(source: JobSource): Promise<{ bytes: Uint8Array; docHash: string }> {
  const buf = await readFile(source.pdfPath)
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  return { bytes, docHash: documentHash(bytes) }
}

async function extract(
  bytes: Uint8Array,
  source: JobSource,
  deps: JobDeps,
  onProgress: ProgressSink,
): Promise<{ tree: DocumentTree; fingerprints: TreeJobValue['fingerprints'] }> {
  const ocr = deps.ocr()
  return extractDocumentTree(bytes, {
    pdfium: await deps.pdfium(),
    ...(source.password !== undefined ? { password: source.password } : {}),
    ...(source.pages !== undefined ? { pages: source.pages } : {}),
    ...(ocr ? { ocr } : {}),
    onProgress,
  })
}

/**
 * The tree to write for `translation`: the request's translated runs, or the
 * stored translation (with its report). The tree must already have the AI
 * readings merged: translations are keyed by the merged tree's blocks.
 */
async function applyTranslation(
  tree: DocumentTree,
  docHash: string,
  translation: TranslationInput | undefined,
  deps: JobDeps,
): Promise<{ tree: DocumentTree; report?: TranslationReport }> {
  if (!translation) return { tree }
  const { lang, bilingual } = translation
  if (translation.units) {
    const tr = new Map<string, InlineRun[]>(translation.units.map((u) => [u.key, u.runs]))
    return {
      tree: bilingual ? deriveBilingualTree(tree, lang, tr) : deriveTranslatedTree(tree, lang, tr),
    }
  }
  if (!deps.translations) throw new NotAvailableError('the stored translation cannot be read here')
  const stored = await deps.translations(docHash, lang)
  return {
    tree: bilingual
      ? buildBilingualTree(tree, lang, stored)
      : buildTranslatedTree(tree, lang, stored),
    report: translationReport(tree, lang, stored),
  }
}

/** 1-based page numbers to read: the source's, checked, or every page */
function pagesOf(m: PdfiumModule, bytes: Uint8Array, source: JobSource): number[] {
  const count = withPdfDocument(m, bytes, (doc) => m._FPDF_GetPageCount(doc), source.password)
  if (source.pages === undefined) return Array.from({ length: count }, (_, i) => i + 1)
  const bad = source.pages.filter((p) => !Number.isInteger(p) || p < 1 || p > count)
  if (source.pages.length === 0 || bad.length > 0) {
    throw new PageRangeError(count, bad.length > 0 ? `page ${bad.join(', ')}` : 'empty range')
  }
  return [...new Set(source.pages)]
}

/** write `data` only when nothing is at `path`; false when something is */
async function writeNew(path: string, data: Uint8Array): Promise<boolean> {
  try {
    await writeFile(path, data, { flag: 'wx' })
    return true
  } catch (err) {
    if (isExists(err)) return false
    // a partial file of ours must not stay behind as an unowned name
    await unlink(path).catch(() => {})
    throw err
  }
}

async function readOptional(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path)
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

/**
 * Write a Markdown conversion next to `outPath`. Order: pictures, then the
 * asset list, then the .md text, so the text never points at a picture that
 * is not there. Every conflict is found before anything is written.
 */
export async function writeMarkdownOutput(
  outPath: string,
  conversion: MarkdownConversion,
): Promise<{ assetsWritten: number; assetsReused: number }> {
  const assetsDir = join(dirname(outPath), ASSETS_DIR)
  const manifestPath = join(assetsDir, ASSET_MANIFEST_FILENAME)
  const existingBuf = await readOptional(manifestPath)
  const existing = existingBuf === null ? null : existingBuf.toString('utf8')
  let owned: Map<string, string>
  try {
    owned = new Map(parseAssetManifest(existing).files.map((r) => [r.name, r.sha256]))
  } catch (err) {
    throw new AssetConflictError(`${ASSETS_DIR}/${ASSET_MANIFEST_FILENAME} is unreadable`, {
      cause: err,
    })
  }

  const entries = new Map(conversion.manifestEntries.map((r) => [r.name, r]))
  const toWrite: MarkdownConversion['assets'] = []
  const records: OwnedAssetRecord[] = []
  let reused = 0
  for (const asset of conversion.assets) {
    const record = entries.get(asset.name) ?? { name: asset.name, sha256: asset.sha256 }
    const onDisk = await readOptional(join(assetsDir, asset.name))
    if (onDisk === null) {
      toWrite.push(asset)
      records.push(record)
      continue
    }
    if (sha256(onDisk) !== asset.sha256) {
      throw new AssetConflictError(`${ASSETS_DIR}/${asset.name} already holds another file`)
    }
    reused++
    // an identical file the user put there stays theirs: referenced, not owned
    if (owned.get(asset.name) === asset.sha256) records.push(record)
  }

  let manifestText: string | null = null
  if (records.length > 0 || existing !== null) {
    try {
      manifestText = mergeAssetManifest(existing, basename(outPath), records)
    } catch (err) {
      throw new AssetConflictError(
        `${ASSETS_DIR}/${ASSET_MANIFEST_FILENAME} cannot take these pictures`,
        { cause: err },
      )
    }
  }

  if (toWrite.length > 0) await mkdir(assetsDir, { recursive: true })
  for (const asset of toWrite) {
    if (await writeNew(join(assetsDir, asset.name), asset.data)) continue
    // appeared since the check: only the same content may stand in
    const now = await readOptional(join(assetsDir, asset.name))
    if (now === null || sha256(now) !== asset.sha256) {
      throw new AssetConflictError(`${ASSETS_DIR}/${asset.name} already holds another file`)
    }
  }
  if (manifestText !== null && manifestText !== existing) {
    await atomicWriteFile(manifestPath, new TextEncoder().encode(manifestText))
  }
  await atomicWriteFile(outPath, new TextEncoder().encode(conversion.markdown))
  return { assetsWritten: toWrite.length, assetsReused: reused }
}

const safeBaseName = (name: string): string =>
  // eslint-disable-next-line no-control-regex -- stripping control chars is the point here
  name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'image'

/** write PNGs without replacing anything: `<base>-p<page>-<n>.png`, then ` (2)` … */
async function writeImages(
  outDir: string,
  baseName: string,
  images: ReadonlyArray<{ page: number; width: number; height: number; png: Uint8Array }>,
  onProgress: ProgressSink,
): Promise<ImagesJobValue['images']> {
  const base = safeBaseName(baseName)
  const perPage = new Map<number, number>()
  const out: ImagesJobValue['images'] = []
  for (const [i, image] of images.entries()) {
    const n = (perPage.get(image.page) ?? 0) + 1
    perPage.set(image.page, n)
    const stem = `${base}-p${image.page}-${n}`
    let file = join(outDir, `${stem}.png`)
    for (let k = 2; !(await writeNew(file, image.png)); k++) {
      file = join(outDir, `${stem} (${k}).png`)
    }
    out.push({ page: image.page, file, width: image.width, height: image.height })
    onProgress(i + 1, images.length)
  }
  return out
}

/** run one job; resolves with the op's value, throws for the error message */
export async function runStructureJob(
  job: StructureJob,
  deps: JobDeps,
  onProgress: ProgressSink,
): Promise<unknown> {
  const { bytes, docHash } = await readSource(job.source)
  switch (job.op) {
    case 'tree': {
      const { tree, fingerprints } = await extract(bytes, job.source, deps, onProgress)
      return { docHash, tree, fingerprints } satisfies TreeJobValue
    }
    case 'structuredText': {
      const format =
        deps.structuredTextFormatter !== undefined
          ? deps.structuredTextFormatter
          : plugins.structuredTextFormatter
      if (!format) throw new NotAvailableError('structured text is not available yet')
      if (job.tree) {
        const pages = format(await withAiReadings(job.tree, docHash, deps))
        return { docHash, pages } satisfies StructuredTextJobValue
      }
      const extracted = await extract(bytes, job.source, deps, onProgress)
      const pages = format(await withAiReadings(extracted.tree, docHash, deps))
      return { docHash, pages, extracted } satisfies StructuredTextJobValue
    }
    case 'markdown': {
      const tree = await withAiReadings(
        job.tree ?? (await extract(bytes, job.source, deps, onProgress)).tree,
        docHash,
        deps,
      )
      const translated = await applyTranslation(tree, docHash, job.translation, deps)
      const conversion = treeToMarkdown(translated.tree)
      const counts = await writeMarkdownOutput(job.outPath, conversion)
      return {
        docHash,
        outPath: job.outPath,
        warnings: conversion.warnings,
        assetsWritten: counts.assetsWritten,
        assetsReused: counts.assetsReused,
        ...(translated.report ? { translation: translated.report } : {}),
      } satisfies MarkdownJobValue
    }
    case 'epub': {
      const tree = await withAiReadings(
        job.tree ?? (await extract(bytes, job.source, deps, onProgress)).tree,
        docHash,
        deps,
      )
      const options = job.epub
      let coverPng: Uint8Array | undefined
      if (options.cover !== false) {
        const m = await deps.pdfium()
        coverPng = withPdfDocument(
          m,
          bytes,
          (doc) => renderPageByIndexPng(m, doc, 0, COVER_SCALE)?.data,
          job.source.password,
        )
      }
      const alt = options.pageImageAlt
      const translated = await applyTranslation(tree, docHash, job.translation, deps)
      const epub = await writeEpub(translated.tree, {
        title: options.title,
        ...(options.author !== undefined ? { author: options.author } : {}),
        cover: options.cover !== false && coverPng !== undefined,
        ...(coverPng ? { coverPng } : {}),
        ...(options.language !== undefined ? { language: options.language } : {}),
        ...(options.uiLanguage !== undefined ? { uiLanguage: options.uiLanguage } : {}),
        ...(options.pageBreaks ? { pageBreaks: true } : {}),
        ...(alt !== undefined
          ? { pageImageAlt: (page: number) => alt.split('{page}').join(String(page)) }
          : {}),
        ...(deps.now ? { modified: deps.now() } : {}),
      })
      await atomicWriteFile(job.outPath, epub)
      return {
        docHash,
        outPath: job.outPath,
        ...(translated.report ? { translation: translated.report } : {}),
      } satisfies EpubJobValue
    }
    case 'images': {
      const m = await deps.pdfium()
      const pages = pagesOf(m, bytes, job.source)
      onProgress(0, pages.length)
      const images = extractEmbeddedImages(m, bytes, pages, {
        ...(job.source.password !== undefined ? { password: job.source.password } : {}),
        ...(job.minImagePx !== undefined ? { minImagePx: job.minImagePx } : {}),
      })
      const written = await writeImages(job.outDir, job.baseName, images, onProgress)
      return { docHash, outDir: job.outDir, images: written } satisfies ImagesJobValue
    }
    case 'encrypt': {
      if (!deps.qpdfWasmPath) throw new NotAvailableError('qpdf is not available')
      const locked = await encryptPdfBytes(deps.qpdfWasmPath, bytes, {
        userPassword: job.userPassword,
        ...(job.ownerPassword !== undefined ? { ownerPassword: job.ownerPassword } : {}),
      })
      return { bytes: locked }
    }
    case 'decrypt': {
      if (!deps.qpdfWasmPath) throw new NotAvailableError('qpdf is not available')
      const m = (await deps.pdfium()) as unknown as RepairPdfium
      const open = await decryptPdfBytes(deps.qpdfWasmPath, bytes, job.password, (b, p) =>
        pdfiumOpens(m, b, p),
      )
      return { bytes: open }
    }
    case 'repair': {
      const m = (await deps.pdfium()) as unknown as RepairPdfium
      try {
        return { bytes: repairPdfBytes(m, bytes).bytes }
      } catch (err) {
        // PDFium gave up on the file: keep the whole pages pdf-lib can still read
        if (!(err instanceof RepairFailedError) || err.reason !== 'unreadable') throw err
        const salvaged = await salvagePdfBytes(bytes)
        if (!salvaged) throw err
        return { bytes: salvaged.bytes }
      }
    }
    case 'blankPages': {
      const m = await deps.pdfium()
      return withPdfDocument(
        m,
        bytes,
        (doc) => findBlankPages(m, doc, onProgress),
        job.source.password,
      )
    }
    case 'fingerprints': {
      const m = await deps.pdfium()
      const fingerprints = withPdfDocument(
        m,
        bytes,
        (doc) => {
          const count = m._FPDF_GetPageCount(doc)
          const out: string[] = []
          for (let i = 0; i < count; i++) {
            out.push(pageFingerprint(m, doc, i))
            onProgress(i + 1, count)
          }
          return out
        },
        job.source.password,
      )
      return { docHash, fingerprints } satisfies FingerprintsJobValue
    }
    case 'writeBack': {
      const write =
        deps.translatedPdfWriter !== undefined
          ? deps.translatedPdfWriter
          : plugins.translatedPdfWriter
      if (!write) throw new NotAvailableError('translated PDF write-back is not available yet')
      const tree = await withAiReadings(
        job.tree ?? (await extract(bytes, job.source, deps, onProgress)).tree,
        docHash,
        deps,
      )
      const ocr = deps.ocr()
      const result = await write({
        pdfium: await deps.pdfium(),
        pdf: bytes,
        ...(job.source.password !== undefined ? { password: job.source.password } : {}),
        docHash,
        tree,
        payload: job.payload,
        translations: deps.translations ?? null,
        hbSubsetWasm: deps.hbSubsetWasm ?? null,
        ...(ocr ? { ocr } : {}),
        ...(deps.writebackFontLocator ? { fontLocator: deps.writebackFontLocator } : {}),
        onProgress,
      })
      await atomicWriteFile(job.outPath, result.pdf)
      return { docHash, outPath: job.outPath, report: result.report } satisfies WriteBackJobValue
    }
  }
}
