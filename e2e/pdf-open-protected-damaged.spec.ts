import { test, expect } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { Page } from 'playwright-core'
import { encryptPdfBytes } from '../apps/pdf/src/main/qpdf'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

/**
 * Two kinds of PDF from a 2026-11 report that Acrobat opened and the app did not:
 * one restricted by an owner password only (no password to open), and one whose
 * page object was lost to a zeroed block on disk.
 */

// wasm-path.ts reads import.meta, which this CommonJS spec cannot load
const qpdfWasmPath = () =>
  join(dirname(createRequire(__filename).resolve('@neslinesli93/qpdf-wasm')), 'qpdf.wasm')

async function sixPages(): Promise<{ bytes: Uint8Array; lostObjNum: number }> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 6; i++) {
    doc.addPage([595.276, 841.89]).drawText(`Page ${i}`, { x: 50, y: 700, size: 24, font })
  }
  const lostObjNum = doc.getPages()[2]!.ref.objectNumber
  return { bytes: await doc.save({ useObjectStreams: false }), lostObjNum }
}

async function openInApp(
  file: string,
  videoDir: string,
  check: (pdf: Page) => Promise<void>,
): Promise<void> {
  const original = await readFile(file)
  const launched = await launchShell({ videoDir, onboardingSeen: true, openFile: file })
  try {
    const pdf = await waitForPageWithUrl(launched.app, '://pdf/', 60_000)
    await check(pdf)
    expect(await readFile(file)).toEqual(original)
  } finally {
    await closeAndSaveVideo(launched, videoDir)
  }
}

test('a PDF restricted by an owner password opens view-only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-e2e-pdf-owner-'))
  const file = join(dir, 'restricted.pdf')
  const { bytes } = await sixPages()
  await writeFile(
    file,
    await encryptPdfBytes(qpdfWasmPath(), bytes, { userPassword: '', ownerPassword: 'owner' }),
  )
  await openInApp(file, 'pdf-open-owner-restricted', async (pdf) => {
    await expect(pdf.locator('.pdf-thumb')).toHaveCount(6, { timeout: 30_000 })
    await expect(pdf.locator('.tb-readonly')).toHaveText('Encrypted document is view-only')
  })
})

test('a PDF with a lost page object opens with that page blank', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-e2e-pdf-damaged-'))
  const file = join(dir, 'damaged.pdf')
  const { bytes, lostObjNum } = await sixPages()
  const text = Buffer.from(bytes).toString('latin1')
  const start = text.search(new RegExp(`[\\r\\n]${lostObjNum} 0 obj`)) + 1
  bytes.fill(0, start, text.indexOf('endobj', start) + 'endobj'.length)
  await writeFile(file, bytes)
  await openInApp(file, 'pdf-open-damaged-page', async (pdf) => {
    await expect(pdf.locator('.pdf-thumb')).toHaveCount(6, { timeout: 30_000 })
    await expect(pdf.locator('.tb-readonly')).toHaveText(
      'Damaged file: unreadable pages show blank, view-only',
    )
    // the pages past the lost one render their text
    await pdf.locator('.pdf-thumb').nth(5).click()
    await expect(pdf.getByText('Page 6', { exact: true })).toBeAttached({ timeout: 30_000 })
  })
})
