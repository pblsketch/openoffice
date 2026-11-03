import { existsSync, rmSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeAndSaveVideo, launchShell, screenshotPath } from './helpers'
import {
  answerMessageBoxes,
  answerSaveDialogs,
  applyOps,
  clickMenu,
  contentsIdOf,
  copyAsset,
  darkViewOn,
  exportFromMenu,
  fileText,
  openDiagramPage,
  openPath,
  scratchDir,
  setAppTheme,
  statusText,
} from './diagram-lib'

/**
 * The app's theme shows only on screen (spec 13, decision 0103): a diagram
 * saved and exported while the app is dark gives the same files as while it
 * is light. The PDF is compared without the dates Chromium writes into it,
 * and SVG files without the ids draw.io makes up anew for every picture.
 */

/** draw.io's per-picture random ids (`ge-svg-…`, `drawio-svg-…`) */
const normalizeSvg = (text: string): string =>
  text.replace(/\b(drawio-svg-|ge-svg-)[A-Za-z0-9_-]+/g, '$1X')

/** the creation and modification dates of a PDF (info dictionary and XMP) */
const normalizePdf = (bytes: Buffer): string =>
  bytes
    .toString('latin1')
    .replace(/\/(CreationDate|ModDate) ?\(D:[^)]*\)/g, '/$1 ()')
    .replace(/<xmp:(CreateDate|ModifyDate|MetadataDate)>[^<]*</g, '<xmp:$1><')

/** the export of every page writes a file per page, a one-page diagram too: `<name>-p1` */
const OUTPUTS = [
  'diagram.drawio',
  'diagram.drawio.svg',
  'picture-p1.png',
  'picture-p1.svg',
  'sheet.pdf',
]

async function writeOutputs(app: ElectronApplication, page: Page, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const name of ['diagram.drawio', 'diagram.drawio.svg']) {
    const target = join(dir, name)
    await answerSaveDialogs(app, [target])
    await clickMenu(app, 'File', '^Save As')
    await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true)
    await expect.poll(() => statusText(page)).toBe('Saved')
  }
  await exportFromMenu(app, page, 'png', join(dir, 'picture.png'))
  await exportFromMenu(app, page, 'svg', join(dir, 'picture.svg'))
  await exportFromMenu(app, page, 'pdf', join(dir, 'sheet.pdf'))
}

test.describe('diagram output and the app theme', () => {
  test('saved files, PNG, SVG and PDF are the same with the app dark and light', async () => {
    test.setTimeout(240_000)
    const dir = await scratchDir('theme')
    const path = await copyAsset('sample.drawio', dir)
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'diagram-theme',
      settings: { theme: 'dark' },
    })
    const { app, page: shell } = launched
    try {
      await answerMessageBoxes(app, 0)
      const page = await openDiagramPage(app, () => openPath(shell, path))
      // the app started dark: draw.io starts in its dark view
      await expect.poll(() => darkViewOn(page)).toBe(true)
      const contents = await contentsIdOf(app, page)
      const edited = await applyOps(app, contents, [
        {
          op: 'add_shape',
          id: 'theme-1',
          label: 'Colours stay',
          style: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;',
          x: 40,
          y: 160,
        },
        { op: 'add_edge', source: 'a', target: 'theme-1', label: '흐름' },
      ])
      expect(edited.result?.status, edited.error).toBe('ok')
      await page.screenshot({ path: screenshotPath('diagram-theme-dark') })
      await writeOutputs(app, page, join(dir, 'dark'))

      await setAppTheme(shell, 'light')
      await expect.poll(() => darkViewOn(page)).toBe(false)
      await page.screenshot({ path: screenshotPath('diagram-theme-light') })
      await writeOutputs(app, page, join(dir, 'light'))

      for (const name of OUTPUTS) {
        const dark = await readFile(join(dir, 'dark', name))
        const light = await readFile(join(dir, 'light', name))
        expect(dark.length, `${name} is not empty`).toBeGreaterThan(100)
        if (name.endsWith('.pdf')) {
          expect(normalizePdf(dark) === normalizePdf(light), `${name} matches`).toBe(true)
        } else if (name.endsWith('.svg')) {
          expect(normalizeSvg(dark.toString('utf8'))).toBe(normalizeSvg(light.toString('utf8')))
        } else {
          expect(dark.equals(light), `${name} is byte for byte the same`).toBe(true)
        }
      }
      // and the saved diagram is the one on screen
      expect(await fileText(join(dir, 'light', 'diagram.drawio'))).toContain('Colours stay')
      expect(await fileText(join(dir, 'dark', 'diagram.drawio.svg'))).toBe(
        await fileText(join(dir, 'light', 'diagram.drawio')),
      )
    } finally {
      await closeAndSaveVideo(launched, 'diagram-theme')
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
