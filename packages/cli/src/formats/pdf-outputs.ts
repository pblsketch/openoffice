/**
 * Files made from a PDF's document tree: Markdown (with `assets/`), EPUB, the
 * pictures of its pages, and a translated copy of the PDF. Markdown, EPUB and
 * pictures go through the app's own structure-job code
 * (apps/shell/src/main/pdf-structure/jobs.ts), so the command line writes
 * exactly what the PDF editor writes: the same `assets/` ownership list, the
 * same picture names, the same EPUB cover.
 */
import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import {
  AssetConflictError,
  runStructureJob,
  type JobDeps,
} from '../../../../apps/shell/src/main/pdf-structure/jobs'
import type {
  ImagesJobValue,
  JobSource,
  MarkdownJobValue,
} from '../../../../apps/shell/src/main/pdf-structure/protocol'
import {
  writeTranslatedPdf,
  WritebackEncryptedError,
  type DocumentTree,
  type WritebackReport,
} from '../../../pdf-structure/src'
import { hbSubsetWasmPath } from '../resources'
import { CliError, EXIT } from '../result'
import { writeOutput } from '../fs'
import { loadPdfium, ocr } from './pdf'

const deps: JobDeps = { pdfium: loadPdfium, ocr }

const noProgress = () => undefined

function assetConflict(err: unknown): unknown {
  if (!(err instanceof AssetConflictError)) return err
  return new CliError(EXIT.file, err.message, undefined, {
    reason: 'output_exists',
    suggestion:
      'the assets/ folder beside the Markdown file holds a file of the same name that this program did not write; choose another --out folder',
  })
}

export interface MarkdownOutcome {
  warnings: MarkdownJobValue['warnings']
  assets_written: number
  assets_reused: number
}

/** `<out>.md` plus its pictures under `assets/` beside it (an `assets/` file it does not own is never replaced). */
export async function writeMarkdownFile(
  source: JobSource,
  tree: DocumentTree,
  outPath: string,
): Promise<MarkdownOutcome> {
  try {
    const value = (await runStructureJob(
      { op: 'markdown', source, tree, outPath },
      deps,
      noProgress,
    )) as MarkdownJobValue
    return {
      warnings: value.warnings,
      assets_written: value.assetsWritten,
      assets_reused: value.assetsReused,
    }
  } catch (err) {
    throw assetConflict(err)
  }
}

export interface EpubOptions {
  title: string
  author?: string
  cover: boolean
}

/** An EPUB 3 book; the cover is the document's first page. */
export async function writeEpubFile(
  source: JobSource,
  tree: DocumentTree,
  outPath: string,
  options: EpubOptions,
): Promise<void> {
  await runStructureJob(
    {
      op: 'epub',
      source,
      tree,
      outPath,
      epub: {
        title: options.title,
        ...(options.author ? { author: options.author } : {}),
        cover: options.cover,
      },
    },
    deps,
    noProgress,
  )
}

/** The pictures drawn on `pages` at their own resolution, as `<name>-p<page>-<n>.png` in `outDir`. */
export async function writePageImages(
  source: JobSource,
  outDir: string,
  onProgress: (done: number, total: number) => void,
): Promise<ImagesJobValue['images']> {
  const value = (await runStructureJob(
    {
      op: 'images',
      source,
      outDir,
      baseName: basename(source.pdfPath, extname(source.pdfPath)),
    },
    deps,
    onProgress,
  )) as ImagesJobValue
  return value.images
}

/** The translation written into a copy of the PDF (never the source); returns the writer's report. */
export async function writeTranslatedPdfFile(
  bytes: Uint8Array,
  tree: DocumentTree,
  translated: DocumentTree,
  outPath: string,
  /** each source page beside its translated page (decision 0057) */
  bilingual: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<WritebackReport> {
  const engine = ocr()
  try {
    const result = await writeTranslatedPdf(bytes, {
      pdfium: await loadPdfium(),
      hbSubsetWasm: new Uint8Array(readFileSync(hbSubsetWasmPath())),
      tree,
      translated,
      ...(engine ? { ocr: engine } : {}),
      ...(bilingual ? { bilingual } : {}),
      ...(onProgress ? { onProgress } : {}),
    })
    writeOutput(outPath, result.pdf)
    return result.report
  } catch (err) {
    if (err instanceof WritebackEncryptedError) {
      throw new CliError(EXIT.usage, err.message, undefined, {
        reason: 'unsupported',
        suggestion: 'choose --format md or epub for an encrypted PDF',
      })
    }
    throw err
  }
}
