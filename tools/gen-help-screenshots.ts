/**
 * Regenerate the manual's screenshots: `npx tsx tools/gen-help-screenshots.ts`
 *
 * ## Which figures
 *
 * Only the ones a topic body references: `file-ops` (Home's file list with a
 * file's menu open) and `tabs` (the tab strip). The registry bundles every PNG
 * in the img folder, so a figure no topic shows still ships; this script does
 * not write any. The other referenced figures are ribbon strips and editor
 * popups captured elsewhere, and `word-shortcuts` comes from
 * gen-help-shortcut-figure.ts.
 *
 * ## Why a script and not a hand capture
 *
 * The figures were first shot from a developer's own session, which put their
 * account name in the greeting and their e-mail address in Settings → Account.
 * A committed screenshot is forever, so the fix is not "remember to crop" but a
 * capture that *cannot* pick up the developer's account: a scratch HOME, a
 * scratch userData, and a scratch samples folder, all discarded afterwards.
 *
 * ## Why HOME and not just GENOFFICE_USER_DATA
 *
 * userData holds the app's own settings, but the command-line launcher record
 * lives under the home directory (`~/.ieumoffice`), and GENOFFICE_USER_DATA says
 * nothing about that. HOME and `GENOFFICE_AUTH_DIR` keep it inside the scratch
 * profile too, so nothing of the developer's own session is read or written.
 *
 * ## Why the AI programs are hidden from the capture
 *
 * The account row shows where the Claude and Codex subscriptions stand, read
 * from the programs installed on the capturing machine: a connected machine
 * puts the provider and the developer's own plan into the figure. So the app is
 * launched where it cannot find either program — the Windows profile folders
 * point into the scratch HOME, and PATH loses every directory that holds one.
 * The row then reads "Connect AI" on every machine, and neither program is
 * started at all, not even for a status check. macOS and Linux also search
 * fixed bin directories the script cannot hide; capture there on a machine
 * where neither program is signed in. The first-connection notice is marked as
 * seen below, so its dialog never covers the window.
 */
import {
  _electron as electron,
  type CDPSession,
  type ElectronApplication,
  type Page,
  type Rect,
} from '@playwright/test'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

import { HOME_DIR_NAME } from '../packages/cli/src/names'
import { PRODUCT_NAME } from '../packages/i18n/src/product'
import { buildBlankDocx } from '../packages/docx-engine/src/blank'
import { createBlankPptx } from '../packages/pptx-engine/src/blank'
import { buildSheetsFixture } from '../apps/sheets/tests/fixture-builder'

/** A fixed moment for the sample files' mtime: see makeScratch. */
const SAMPLE_MTIME = new Date('2024-03-14T10:24:00')

const REPO = resolve(__dirname, '..')
const SHELL_DIR = join(REPO, 'apps/shell')
const OUT_DIR = join(REPO, 'apps/shell/src/renderer/src/i18n/help/topics/img')

/**
 * The UI languages to capture. The manual ships English figures only, and the
 * registry falls back to `<name>.en.png` for every other language, so English
 * is the default; pass languages to write `<name>.<lang>.png` as well.
 */
const LANGS = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const TARGET_LANGS = LANGS.length ? LANGS : ['en']

/** A one-page PDF, written by hand so the capture needs no PDF library. */
function minimalPdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null, // stream, filled below
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const stream = `BT /F1 18 Tf 72 700 Td (${PRODUCT_NAME} Manual Sample) Tj ET\nBT /F1 11 Tf 72 660 Td (This paragraph is here so you can try text selection.) Tj ET\nBT /F1 11 Tf 72 620 Td (SECRET ONE needs redaction.) Tj ET\nBT /F1 11 Tf 72 580 Td (More filler text on the sample page.) Tj ET`
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

/** The scratch profile: never the developer's own HOME or userData. */
interface Scratch {
  home: string
  userData: string
  samples: string
  dispose: () => void
}

async function makeScratch(): Promise<Scratch> {
  const root = mkdtempSync(join(tmpdir(), 'genoffice-help-shots-'))
  const home = join(root, 'home')
  const userData = join(root, 'userdata')
  const samples = join(root, 'help-samples')
  // Fixed and platform-shaped, not a per-run temp path: a value that changes
  // per run or per machine makes the committed figure churn, and a path
  // carrying the developer's home directory puts their macOS username in a PNG
  // forever. os.tmpdir() is not enough — on macOS it is
  // /var/folders/<xx>/<per-user-hash>/T, so it differs per machine. This has to
  // be absolute and creatable, which is all resolveDefaultSaveDir asks of a
  // configured dir.
  const saveDir = process.platform === 'win32' ? `C:\\${PRODUCT_NAME}` : `/tmp/${PRODUCT_NAME}`
  for (const dir of [home, userData, samples, saveDir]) mkdirSync(dir, { recursive: true })

  // the file list the Home figure shows; types only — the figures are about
  // the surface around them, not the documents
  writeFileSync(join(samples, 'doc.docx'), await buildBlankDocx())
  writeFileSync(join(samples, 'deck.pptx'), await createBlankPptx())
  writeFileSync(join(samples, 'book.xlsx'), await buildSheetsFixture())
  writeFileSync(join(samples, 'sample.pdf'), minimalPdf())
  writeFileSync(join(samples, 'notes.md'), '# Sample\n\nA markdown note.\n')

  // Pin the samples' modification time. The file list shows a Modified column,
  // so without this the committed Home and file-ops figures carry the wall
  // clock of the moment they were captured — "Today · 07:49 PM" in a figure
  // that is supposed to be forever — and every regeneration churns the bytes
  // for a difference no reader should ever see.
  for (const name of ['doc.docx', 'deck.pptx', 'book.xlsx', 'sample.pdf', 'notes.md']) {
    utimesSync(join(samples, name), SAMPLE_MTIME, SAMPLE_MTIME)
  }

  // folderRoots is a plain list of absolute paths, so the sidebar tree can be
  // seeded without driving the native folder picker.
  //
  // defaultSaveDir needs seeding too, and for a different reason: the Settings
  // figure shows it, and the fallback is the real user's ~/Documents — so a
  // capture without this line puts the developer's home directory and macOS
  // username into a committed PNG. The path has to be absolute and writable
  // (resolveDefaultSaveDir ignores a configured one that is not).
  writeFileSync(
    join(userData, 'app-settings.json'),
    JSON.stringify(
      {
        onboardingSeen: true,
        folderRoots: [samples],
        defaultSaveDir: saveDir,
      },
      null,
      2,
    ),
  )
  // The first-connection notice is a dialog that closes only by being
  // acknowledged, and it comes up on a machine with a connected subscription.
  // An empty providers table is what makes the file read as a current one.
  writeFileSync(
    join(userData, 'ai-settings.json'),
    JSON.stringify(
      {
        providers: {},
        subscriptionNoticeSeen: true,
        subscriptionNoticeVersion: 2,
        pdfSendNoticeSeen: 1,
      },
      null,
      2,
    ),
  )

  return { home, userData, samples, dispose: () => rmSync(root, { recursive: true, force: true }) }
}

/** Executable names of the two subscription programs, as the app looks for them. */
const AI_PROGRAMS = ['claude', 'codex'].flatMap((n) => [n, `${n}.exe`, `${n}.cmd`, `${n}.ps1`])

/**
 * The host environment with the subscription programs out of reach: see "Why
 * the AI programs are hidden" above.
 */
function withoutAiPrograms(env: NodeJS.ProcessEnv, home: string): NodeJS.ProcessEnv {
  const out = { ...env }
  const pathKey = Object.keys(out).find((k) => k.toLowerCase() === 'path') ?? 'PATH'
  out[pathKey] = (out[pathKey] ?? '')
    .split(delimiter)
    .filter((dir) => dir && !AI_PROGRAMS.some((name) => existsSync(join(dir, name))))
    .join(delimiter)
  if (process.platform === 'win32') {
    out.USERPROFILE = home
    out.APPDATA = join(home, 'AppData', 'Roaming')
    out.LOCALAPPDATA = join(home, 'AppData', 'Local')
    delete out.LocalAppData
  }
  return out
}

async function launch(scratch: Scratch, lang: string): Promise<ElectronApplication> {
  const require = createRequire(join(SHELL_DIR, 'package.json'))
  // ELECTRON_RUN_AS_NODE (set by CI hosts) would boot Electron as plain Node
  const { ELECTRON_RUN_AS_NODE: _drop, ...hostEnv } = process.env
  const args: string[] = []
  if (process.platform === 'linux') args.push('--no-sandbox', '--disable-gpu')
  args.push(SHELL_DIR)
  return electron.launch({
    executablePath: require('electron') as unknown as string,
    args,
    env: {
      ...withoutAiPrograms(hostEnv, scratch.home),
      HOME: scratch.home,
      GENOFFICE_USER_DATA: scratch.userData,
      GENOFFICE_AUTH_DIR: join(scratch.home, HOME_DIR_NAME),
      GENOFFICE_NO_SPARE_VIEW: '1',
      GENOFFICE_LANG: lang,
    },
  })
}

/**
 * Size the capture to match the committed figures: a 1360x850 CSS viewport at
 * 2x, so the PNG is 2720x1700. The device scale has to be set through CDP —
 * setViewportSize alone is CSS pixels, and a half-resolution figure goes soft
 * on every retina display the manual is read on.
 */
async function frame(page: Page, width = 1360): Promise<CDPSession> {
  await page.setViewportSize({ width, height: 850 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 850,
    deviceScaleFactor: 2,
    mobile: false,
  })
  await page.waitForTimeout(600)
  return cdp
}

/**
 * Capture through CDP rather than `page.screenshot()`.
 *
 * Playwright's Electron screenshot ignores the device-scale override set above:
 * inside the page `devicePixelRatio` reports 2 and the PNG is still 1360x850, so
 * every figure this script produced was half resolution while its own comment
 * claimed 2720x1700. Measured on this build — plain, `scale: 'css'` and
 * `scale: 'device'` all returned the identical byte count, and a raw
 * `Page.captureScreenshot` returned more than twice it. So the scale factor is
 * set by the override and honoured only on the raw path.
 */
async function capture(page: Page, cdp: CDPSession, clip?: Rect): Promise<Buffer> {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
  })
  return Buffer.from(data, 'base64')
}

async function shoot(page: Page, cdp: CDPSession, name: string, lang: string): Promise<void> {
  await writeFileSync(join(OUT_DIR, `${name}.${lang}.png`), await capture(page, cdp))
  process.stdout.write(`wrote ${name}.${lang}.png\n`)
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const lang of TARGET_LANGS) {
    const scratch = await makeScratch()
    let app: ElectronApplication | null = null
    try {
      app = await launch(scratch, lang)
      const page = app.windows()[0] ?? (await app.firstWindow())
      const cdp = await frame(page)

      // The folder view is the figure: it carries everything the landing view
      // has (the quick-start cards) plus the folders, the file table and the
      // search box, and it needs no recents — which a fresh profile has none
      // of, since a file has to be opened for one to be recorded.
      //
      // `.tree-item` is the sidebar, `.recent-row` the table: both render a
      // "more actions" trigger, so an unscoped match opens the folder's menu
      // instead of a file's.
      // click the name, not the row: the <li> also carries the expand chevron
      // and the row actions, and its centre can land on either
      const treeFolder = page
        .locator('.tree-item')
        .filter({ hasText: 'help-samples' })
        .locator('.tree-name')
      await treeFolder.first().click()
      const rows = page.locator('.recent-row')
      try {
        await rows.first().waitFor({ state: 'visible', timeout: 15_000 })
      } catch {
        const seen = await page.evaluate(() =>
          [...document.querySelectorAll('[class*="row"],[class*="item"]')]
            .map((e) => `${(e.className || '').toString().slice(0, 40)}`)
            .filter((c, i, a) => a.indexOf(c) === i)
            .slice(0, 25)
            .join(' | '),
        )
        throw new Error(`folder view did not list files; rows on screen: ${seen}`)
      }

      // 1. the file list with a file's own menu open — the surface the
      //    file-operations topic is about
      // the row's own trigger, by class: its aria-label is localized, and the
      // sidebar tree carries a trigger with the same wording
      // a file row specifically: the first row is the sub-folder, and its menu
      // is a folder menu (rename/move/delete *folder*)
      const fileRow = rows.filter({ hasText: 'doc.docx' }).first()
      await fileRow.locator('.recent-actions .more-btn').click()
      const rowMenu = page.locator('.ctx-menu, .row-menu, [role="menu"]').first()
      await rowMenu.waitFor({ timeout: 10_000 })
      // The menu fades in. Waiting only for it to exist catches it mid-fade, so
      // the figure shows the rows behind it through a translucent panel and
      // the bytes move with the animation rather than with the content.
      await rowMenu.evaluate((el) => {
        const done = getComputedStyle(el).opacity
        if (done === '1') return
        return new Promise<void>((resolve) => {
          el.addEventListener('transitionend', () => resolve(), { once: true })
          setTimeout(resolve, 2000)
        })
      })
      await page.waitForTimeout(200)
      await shoot(page, cdp, 'file-ops', lang)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      // 2. the tab strip with Home and two documents, the second one active —
      //    the tabs topic's figure. Each double-click opens a tab and makes it
      //    the active one, so the Home tab is clicked in between to get the
      //    file list back. Only the strip is captured, so the editors behind
      //    it need not have finished loading.
      const strip = page.locator('.tab-strip')
      for (const name of ['doc.docx', 'book.xlsx']) {
        await page.locator('.tab-item.tab-home').click()
        // the name cell, not the row: see gen-help-shortcut-figure.ts on why
        // a click elsewhere in the row can miss
        await page
          .locator('.recent-row')
          .filter({ hasText: name })
          .first()
          .locator('.recent-name')
          .dblclick()
        await strip.locator('.tab-item').filter({ hasText: name }).waitFor({ timeout: 30_000 })
      }
      await page.waitForTimeout(800)
      const box = await strip.boundingBox()
      if (!box || box.width < 200)
        throw new Error(`tab strip not measurable: ${JSON.stringify(box)}`)
      await writeFileSync(
        join(OUT_DIR, `tabs.${lang}.png`),
        await capture(page, cdp, { x: box.x, y: box.y, width: box.width, height: box.height }),
      )
      process.stdout.write(`wrote tabs.${lang}.png
`)
    } finally {
      await app?.close().catch(() => {})
      scratch.dispose()
    }
  }
}

void main()
