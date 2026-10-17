/**
 * Type shim: @genoffice/file-parse ships as TS source, and its dependency
 * @genoffice/docx-engine fails under sheets' stricter compiler options
 * (exactOptionalPropertyTypes/noUncheckedIndexedAccess). tsconfig paths point
 * type resolution here; runtime bundling (electron-vite) still uses the real
 * source. Keep the export signatures in sync with packages/file-parse/src/parse.ts
 * and packages/file-parse/src/attachable.ts.
 */
export type ParsedFileKind = 'text' | 'image' | 'unsupported'

export interface ParsedFile {
  ok: boolean
  text?: string
  kind: ParsedFileKind
  mime?: string
  error?: string
}

/** parse an attachment into plain text (or flag it as image / unsupported) */
export function parseFileToText(filePath: string): Promise<ParsedFile>

/** the one shared list of extensions an attachment may have */
export const ATTACHABLE_EXTS: ReadonlySet<string>
export const ATTACHABLE_IMAGE_EXTS: ReadonlySet<string>
export const ATTACHABLE_MAX_BYTES: number
export const ATTACHABLE_IMAGE_MAX_BYTES: number
export function isAttachableExt(ext: string): boolean
