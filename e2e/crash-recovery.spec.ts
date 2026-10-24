import { execFile, execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { copyFile, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { createXmindDocumentFromOutline } from '@genoffice/xmind-engine'
import { closeAndSaveVideo, launchShell, waitForPageWithUrl, type LaunchedApp } from './helpers'

/**
 * Crash recovery end to end against the built app (spec 4-7): edits in every
 * kind of editor leave recovery copies in the scratch data folder; the main
 * process is then killed by its PID (never by name, never the user's install),
 * and the next launch over the same data folder brings the tabs back unloaded
 * with the launch list on Home. Restoring opens each document with the edits,
 * unsaved, while the files on disk stay as they were until a save.
 *
 * Copies are written about every 30 s (heavy editors after ~2 s idle), so the
 * tests wait for the copies' metadata to appear rather than for a fixed time.
 */

const REPO_ROOT = resolve(__dirname, '..')
const execFileAsync = promisify(execFile)

/** how long the editors may take to write their first recovery copies */
const COPY_WAIT_MS = 150_000

interface TabSummaryOnWindow {
  id: string
  kind: string
  title: string
  active: boolean
  filePath?: string
}

interface ShellApisOnWindow {
  aiOfficeTabs: { list(): Promise<TabSummaryOnWindow[]> }
  aiOffice: { openPath(path: string): Promise<void> }
}

interface CopyMeta {
  kind: string
  filePath: string | null
  untitledId: string | null
  title: string
  state: string
}

/** a scratch folder for the documents, outside the repository */
async function scratchDir(prefix: string): Promise<string> {
  // the long form: the editors hash the path string, so keep one spelling
  return realpathSync(await mkdtemp(join(tmpdir(), prefix)))
}

/** every recovery copy's metadata under a data folder (file and untitled copies) */
async function copyMetas(userDataDir: string): Promise<CopyMeta[]> {
  const metas: CopyMeta[] = []
  const entries = await readdir(userDataDir).catch(() => [] as string[])
  for (const folder of entries.filter((name) => name.endsWith('-autosave'))) {
    for (const dir of [join(userDataDir, folder), join(userDataDir, folder, 'untitled')]) {
      const names = await readdir(dir).catch(() => [] as string[])
      for (const name of names.filter((n) => n.endsWith('.meta.json'))) {
        try {
          metas.push(JSON.parse(await readFile(join(dir, name), 'utf8')) as CopyMeta)
        } catch {
          // a meta file mid-write: the next poll reads it
        }
      }
    }
  }
  return metas
}

type ExpectedCopy = { kind: string; filePath: string } | { kind: string; untitled: true }

const hasCopy = (metas: CopyMeta[], want: ExpectedCopy): boolean =>
  metas.some((meta) =>
    'untitled' in want
      ? meta.kind === want.kind && meta.filePath === null
      : meta.kind === want.kind && meta.filePath === want.filePath,
  )

/** wait until every expected document has a recovery copy */
async function waitForCopies(userDataDir: string, wanted: ExpectedCopy[]): Promise<CopyMeta[]> {
  let metas: CopyMeta[] = []
  await expect
    .poll(
      async () => {
        metas = await copyMetas(userDataDir)
        return wanted.filter((want) => !hasCopy(metas, want)).map((want) => JSON.stringify(want))
      },
      { timeout: COPY_WAIT_MS, intervals: [2_000] },
    )
    .toEqual([])
  return metas
}

/**
 * End the app the way a power cut or Task Manager would: the main process,
 * by the PID this test started, with its child processes. No quit path runs.
 */
async function hardKill(launched: LaunchedApp): Promise<void> {
  const child = launched.app.process()
  const pid = child.pid
  if (pid === undefined) throw new Error('the app has no process id')
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error(`the app had already ended (exit ${child.exitCode}, ${child.signalCode})`)
  }
  const closed = launched.app.waitForEvent('close', { timeout: 30_000 }).catch(() => undefined)
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'pipe' })
    } catch (error) {
      // a child that ended on its own makes /T report a failure; the main process must be gone
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise((r) => setTimeout(r, 2_000))
        if (child.exitCode === null && child.signalCode === null) throw error
      }
    }
  } else {
    process.kill(pid, 'SIGKILL')
  }
  await closed
  await expect.poll(() => child.exitCode !== null || child.signalCode !== null).toBe(true)
}

const shellPageOf = (app: ElectronApplication): Promise<Page> =>
  waitForPageWithUrl(app, 'shell/out')

const listTabs = (shell: Page): Promise<TabSummaryOnWindow[]> =>
  shell.evaluate(() => (window as unknown as ShellApisOnWindow).aiOfficeTabs.list())

const documentTabs = async (shell: Page): Promise<TabSummaryOnWindow[]> =>
  (await listTabs(shell)).filter((tab) => tab.kind !== 'home')

async function openPath(shell: Page, path: string): Promise<void> {
  await shell.evaluate((p) => (window as unknown as ShellApisOnWindow).aiOffice.openPath(p), path)
}

/** URLs of every live editor webContents, read in the main process */
const editorUrls = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter((wc) => !wc.isDestroyed())
      .map((wc) => wc.getURL())
      .filter((url) => /:\/\/(docs|sheets|slides|pdf|markdown|html|mindmap|hwp)\//.test(url)),
  )

/** the editor page of one kind whose document satisfies `matches` */
async function editorPageWhere(
  app: ElectronApplication,
  urlPart: string,
  matches: (page: Page) => Promise<boolean>,
  timeoutMs = 60_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    for (const candidate of app.windows()) {
      const href =
        candidate.url() || (await candidate.evaluate(() => location.href).catch(() => ''))
      if (!href.includes(urlPart)) continue
      if (await matches(candidate).catch(() => false)) return candidate
    }
    if (Date.now() > deadline) {
      const seen = await Promise.all(
        app.windows().map(async (w) => {
          const href = w.url() || (await w.evaluate(() => location.href).catch(() => '?'))
          const text = await w
            .evaluate(() => document.body?.innerText.slice(0, 200) ?? '')
            .catch(() => '?')
          return `${href} :: ${text.replace(/\s+/g, ' ')}`
        }),
      )
      throw new Error(`no ${urlPart} page matched; pages:\n${seen.join('\n')}`)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
}

const markdownText = (page: Page): Promise<string> =>
  page.locator('.doc-editor').evaluate((el) => el.textContent ?? '')

const topicTitles = (map: Page): Promise<string[]> =>
  map
    .locator('.mm-sheet-host:not([hidden]) me-tpc > .text')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''))

/** a tab in the shell's strip, by its title */
const stripTab = (shell: Page, title: string) =>
  shell.locator('.tab-bar .tab-item:not(.tab-home)', { hasText: title })

/** plain text of an .hwp file, read with the same engine build the editor runs */
async function hwpText(path: string): Promise<string> {
  const core = pathToFileURL(join(REPO_ROOT, 'vendor/rhwp-core/rhwp.js')).href
  const wasm = join(REPO_ROOT, 'vendor/rhwp-core/rhwp_bg.wasm')
  const script = [
    "import { readFileSync } from 'node:fs'",
    `const { default: init, HwpDocument } = await import(${JSON.stringify(core)})`,
    `await init({ module_or_path: readFileSync(${JSON.stringify(wasm)}) })`,
    'const doc = new HwpDocument(new Uint8Array(readFileSync(process.argv[1])))',
    'process.stdout.write(doc.getTextFileText())',
  ].join('\n')
  const { stdout } = await execFileAsync(process.execPath, [
    '--input-type=module',
    '-e',
    script,
    path,
  ])
  return stdout
}

/** answer the per-file recovery prompt (and any other message box) and record it */
async function stubMessageBoxes(app: ElectronApplication, response: number): Promise<void> {
  await app.evaluate(({ dialog }, answer) => {
    const state = globalThis as unknown as {
      __boxes?: Array<{ message: string; detail: string; buttons: string[] }>
    }
    state.__boxes ??= []
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = args[args.length - 1] as {
        message?: string
        detail?: string
        buttons?: string[]
      }
      state.__boxes!.push({
        message: options.message ?? '',
        detail: options.detail ?? '',
        buttons: options.buttons ?? [],
      })
      return { response: answer, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  }, response)
}

const messageBoxes = (
  app: ElectronApplication,
): Promise<Array<{ message: string; detail: string; buttons: string[] }>> =>
  app.evaluate(
    () =>
      (
        globalThis as unknown as {
          __boxes?: Array<{ message: string; detail: string; buttons: string[] }>
        }
      ).__boxes ?? [],
  )

// ---- editing one document per editor ----

async function editMarkdown(page: Page, text: string): Promise<void> {
  const editor = page.locator('.doc-editor')
  await editor.waitFor()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type(text, { delay: 10 })
  await expect.poll(() => markdownText(page)).toContain(text)
  await expect(page.locator('.status-save')).toHaveText('Unsaved')
}

async function addBranch(map: Page, title: string): Promise<void> {
  await map.locator('.mm-sheet-host:not([hidden]) me-root me-tpc').click()
  await map.keyboard.press('Tab')
  await map.waitForSelector('#input-box')
  await map.keyboard.type(title)
  await map.keyboard.press('Enter')
  await map.waitForSelector('#input-box', { state: 'detached' })
  await expect.poll(() => topicTitles(map)).toContain(title)
  await expect(map.locator('.mm-save-status')).toHaveAttribute('data-dirty', 'true')
}

async function insertBlankPdfPage(pdf: Page): Promise<void> {
  const thumbs = pdf.locator('.pdf-thumb')
  await expect(thumbs).toHaveCount(2)
  await thumbs.first().locator('.pdf-thumb-box').click({ button: 'right' })
  await pdf.getByRole('button', { name: 'Insert blank page', exact: true }).click()
  await expect(thumbs).toHaveCount(3)
}

async function typeInDocs(docs: Page, text: string): Promise<void> {
  const body = docs.locator('.doc-page[contenteditable="true"]').first()
  await body.waitFor()
  await body.click()
  await docs.keyboard.press('ControlOrMeta+End')
  await docs.keyboard.type(text, { delay: 10 })
  await expect.poll(() => body.evaluate((el) => el.textContent ?? '')).toContain(text)
}

async function typeInHwp(hwp: Page, text: string): Promise<void> {
  const studio = hwp.frameLocator('.hwp-editor-host iframe')
  const canvas = studio.locator('#scroll-content canvas').first()
  await canvas.waitFor({ timeout: 60_000 })
  // the first body line of an A4 page at the studio's starting zoom
  await canvas.click({ position: { x: 160, y: 140 } })
  await hwp.keyboard.type(text, { delay: 20 })
}

// ---- fixtures ----

interface Fixtures {
  dir: string
  markdown: string
  mindmap: string
  pdf: string
  docx: string
  hwp: string
  originals: Map<string, Buffer>
}

async function makeFixtures(): Promise<Fixtures> {
  const dir = await scratchDir('genoffice-recovery-docs-')
  const markdown = join(dir, 'note.md')
  await writeFile(markdown, '# Recovery note\n\nSeed line for recovery.\n')

  const mindmap = join(dir, 'trip.xmind')
  const map = await createXmindDocumentFromOutline('# Trip\n\n- Trip plan\n  - Places\n', {
    untitled: 'Untitled',
  })
  await writeFile(mindmap, await map.save())

  const pdf = join(dir, 'two.pdf')
  const doc = await PDFDocument.create()
  doc.addPage([400, 600])
  doc.addPage([612, 792])
  await writeFile(pdf, await doc.save({ useObjectStreams: false }))

  const docx = join(dir, 'simple.docx')
  await copyFile(join(REPO_ROOT, 'fixtures/generated/simple.docx'), docx)

  const hwp = join(dir, 'form.hwp')
  await copyFile(join(REPO_ROOT, 'apps/hwp/src/renderer/assets/blank.hwp'), hwp)

  const originals = new Map<string, Buffer>()
  for (const path of [markdown, mindmap, pdf, docx, hwp]) {
    originals.set(path, await readFile(path))
  }
  return { dir, markdown, mindmap, pdf, docx, hwp, originals }
}

async function expectOriginalsUnchanged(fixtures: Fixtures): Promise<void> {
  for (const [path, bytes] of fixtures.originals) {
    const now = await readFile(path)
    expect(now.equals(bytes), `${path} must not change before a save`).toBe(true)
  }
}

test.describe('crash recovery', () => {
  test('a hard kill brings every editor back: tabs unloaded, the launch list, restored edits', async () => {
    test.setTimeout(600_000)
    const fx = await makeFixtures()
    const MD_MARK = 'MdRecoveredEdit'
    const UNTITLED_MARK = 'UntitledRecoveredEdit'
    const MAP_MARK = 'MapRecoveredBranch'
    const DOCS_MARK = 'DocsRecoveredEdit'
    const HWP_MARK = 'HwpRecoveredEdit'

    // ---- first run: edit one document in each editor, then the power goes ----
    const first = await launchShell({
      onboardingSeen: true,
      recordVideo: false,
      videoDir: 'crash-recovery-first',
    })
    const userDataDir = first.userDataDir
    let untitledTitle = ''
    try {
      const { app } = first
      const shell = await shellPageOf(app)

      // an untitled document: the Home card's new Markdown tab
      await shell.locator('.quick-card', { hasText: 'AI Markdown' }).click()
      const untitled = await waitForPageWithUrl(app, '://markdown/')
      await editMarkdown(untitled, UNTITLED_MARK)
      const untitledTab = (await documentTabs(shell)).find((tab) => tab.kind === 'markdown')
      expect(untitledTab?.filePath).toBeUndefined()
      untitledTitle = untitledTab!.title

      await openPath(shell, fx.markdown)
      const note = await editorPageWhere(app, '://markdown/', async (p) =>
        (await markdownText(p)).includes('Seed line for recovery.'),
      )
      await editMarkdown(note, MD_MARK)

      await openPath(shell, fx.mindmap)
      const map = await waitForPageWithUrl(app, '://mindmap/')
      await expect.poll(() => topicTitles(map)).toContain('Trip plan')
      await addBranch(map, MAP_MARK)

      await openPath(shell, fx.pdf)
      const pdf = await waitForPageWithUrl(app, '://pdf/')
      await insertBlankPdfPage(pdf)

      await openPath(shell, fx.docx)
      const docs = await waitForPageWithUrl(app, '://docs/')
      await typeInDocs(docs, DOCS_MARK)

      await openPath(shell, fx.hwp)
      const hwp = await waitForPageWithUrl(app, '://hwp/')
      await typeInHwp(hwp, HWP_MARK)

      expect((await documentTabs(shell)).map((tab) => tab.kind)).toEqual([
        'markdown',
        'markdown',
        'mindmap',
        'pdf',
        'docs',
        'hwp',
      ])

      const metas = await waitForCopies(userDataDir, [
        { kind: 'markdown', untitled: true },
        { kind: 'markdown', filePath: fx.markdown },
        { kind: 'mindmap', filePath: fx.mindmap },
        { kind: 'pdf', filePath: fx.pdf },
        { kind: 'docs', filePath: fx.docx },
        { kind: 'hwp', filePath: fx.hwp },
      ])
      // a copy is a copy: nothing written next to the user's files
      await expectOriginalsUnchanged(fx)
      expect((await readdir(fx.dir)).sort()).toEqual(
        ['form.hwp', 'note.md', 'simple.docx', 'trip.xmind', 'two.pdf'].sort(),
      )
      // copies of a running app are undecided until someone chooses
      for (const meta of metas) expect(meta.state).toBe('undecided')
      // the HWP copy is an .hwp file that holds the edit
      const hwpDir = join(userDataDir, 'hwp-autosave')
      const hwpCopy = (await readdir(hwpDir)).find((name) => /^[0-9a-f]{16}\.hwp$/.test(name))
      expect(hwpCopy).toBeTruthy()
      expect(await hwpText(join(hwpDir, hwpCopy!))).toContain(HWP_MARK)
    } finally {
      await hardKill(first)
    }
    await expectOriginalsUnchanged(fx)

    // ---- second run: same data folder ----
    const second = await launchShell({
      userDataDir,
      recordVideo: false,
      videoDir: 'crash-recovery-second',
    })
    try {
      const { app } = second
      const shell = await shellPageOf(app)
      const list = shell.locator('.recovery-list')
      await expect(list).toBeVisible({ timeout: 30_000 })
      const rows = list.locator('.recovery-row')
      await expect(rows).toHaveCount(6)
      const names = await list.locator('.recovery-row-name').allTextContents()
      expect(names.sort()).toEqual(
        ['form.hwp', 'note.md', 'simple.docx', 'trip.xmind', 'two.pdf', untitledTitle].sort(),
      )
      // every row starts at "restore"
      for (const choice of await rows.evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-choice')),
      )) {
        expect(choice).toBe('restore')
      }

      // the previous tabs are back in the strip, in order, Home in front, none loaded
      const tabs = await listTabs(shell)
      expect(tabs.find((tab) => tab.kind === 'home')?.active).toBe(true)
      const docTabs = tabs.filter((tab) => tab.kind !== 'home')
      expect(docTabs.map((tab) => tab.kind)).toEqual([
        'markdown',
        'markdown',
        'mindmap',
        'pdf',
        'docs',
        'hwp',
      ])
      expect(docTabs.map((tab) => tab.filePath ?? null)).toEqual([
        null,
        fx.markdown,
        fx.mindmap,
        fx.pdf,
        fx.docx,
        fx.hwp,
      ])
      expect(await editorUrls(app)).toEqual([])
      await expectOriginalsUnchanged(fx)

      // restore everything
      await list.locator('.recovery-confirm').click()
      await expect(list).toBeHidden()
      // the tab that was in front comes back in front, with the edit
      const hwp = await waitForPageWithUrl(app, '://hwp/', 60_000)
      await expect
        .poll(async () => (await listTabs(shell)).find((tab) => tab.active)?.kind)
        .toBe('hwp')
      // only the front tab loaded
      expect((await editorUrls(app)).length).toBe(1)

      // each other tab loads when clicked, with its edits, unsaved
      await stripTab(shell, 'note.md').click()
      const note = await editorPageWhere(app, '://markdown/', async (p) =>
        (await markdownText(p)).includes(MD_MARK),
      )
      expect(await markdownText(note)).toContain('Seed line for recovery.')
      await expect(note.locator('.status-save')).toHaveText('Unsaved')

      // note.md first: it gives the markdown editor a view before the untitled copy opens
      // (the untitled-first test below covers a restored untitled tab with no such view)
      await stripTab(shell, untitledTitle).click()
      const untitled = await editorPageWhere(app, '://markdown/', async (p) =>
        (await markdownText(p)).includes(UNTITLED_MARK),
      )
      await expect(untitled.locator('.status-save')).toHaveText('Unsaved')
      const restoredUntitled = (await documentTabs(shell)).find(
        (tab) => tab.kind === 'markdown' && tab.title === untitledTitle,
      )
      expect(restoredUntitled?.filePath).toBeUndefined()

      await stripTab(shell, 'trip.xmind').click()
      const map = await waitForPageWithUrl(app, '://mindmap/', 60_000)
      await expect.poll(() => topicTitles(map), { timeout: 30_000 }).toContain(MAP_MARK)
      await expect(map.locator('.mm-save-status')).toHaveAttribute('data-dirty', 'true')

      await stripTab(shell, 'two.pdf').click()
      const pdf = await waitForPageWithUrl(app, '://pdf/', 60_000)
      await expect(pdf.locator('.pdf-thumb')).toHaveCount(3, { timeout: 30_000 })

      await stripTab(shell, 'simple.docx').click()
      const docs = await waitForPageWithUrl(app, '://docs/', 60_000)
      await expect
        .poll(
          () =>
            docs
              .locator('.doc-page[contenteditable="true"]')
              .first()
              .evaluate((el) => el.textContent ?? '')
              .catch(() => ''),
          { timeout: 30_000 },
        )
        .toContain(DOCS_MARK)

      // restoring wrote nothing to the files
      await expectOriginalsUnchanged(fx)

      // the restored HWP saves to its own file, edit included
      await stripTab(shell, 'form.hwp').click()
      await stubMessageBoxes(app, 0)
      // the editor's File > Save item: the same save request as Ctrl+S
      await hwp.evaluate(() =>
        (
          window as unknown as { hwpApi: { requestFileCommand(c: string): void } }
        ).hwpApi.requestFileCommand('save'),
      )
      await expect
        .poll(async () => !(await readFile(fx.hwp)).equals(fx.originals.get(fx.hwp)!), {
          timeout: 30_000,
        })
        .toBe(true)
      expect(await hwpText(fx.hwp)).toContain(HWP_MARK)
      // a plain save to the original path: no question on the way
      expect(await messageBoxes(app)).toEqual([])
      // saving removed that document's copy, and only that one
      await expect
        .poll(async () => (await copyMetas(userDataDir)).some((m) => m.kind === 'hwp'))
        .toBe(false)
      expect(existsSync(fx.hwp)).toBe(true)
    } finally {
      await closeAndSaveVideo(second, 'crash-recovery-second')
    }
  })

  test('a dismissed list asks per file on first click; a quick second crash loads nothing; a clean quit restores no tabs', async () => {
    test.setTimeout(480_000)
    const dir = await scratchDir('genoffice-recovery-later-')
    const note = join(dir, 'later.md')
    const other = join(dir, 'other.md')
    await writeFile(note, '# Later\n\nOriginal later text.\n')
    await writeFile(other, '# Other\n\nOther text.\n')
    const noteBytes = await readFile(note)
    const MARK = 'LaterRecoveredEdit'

    // ---- first run: edit later.md, leave other.md in front, crash ----
    const first = await launchShell({
      onboardingSeen: true,
      recordVideo: false,
      videoDir: 'crash-recovery-later-first',
      openFiles: [note, other],
    })
    const userDataDir = first.userDataDir
    try {
      const { app } = first
      const shell = await shellPageOf(app)
      await expect.poll(async () => (await documentTabs(shell)).length).toBe(2)
      await stripTab(shell, 'later.md').click()
      const notePage = await editorPageWhere(app, '://markdown/', async (p) =>
        (await markdownText(p)).includes('Original later text.'),
      )
      await editMarkdown(notePage, MARK)
      await stripTab(shell, 'other.md').click()
      await expect
        .poll(async () => (await listTabs(shell)).find((tab) => tab.active)?.title)
        .toBe('other.md')
      await waitForCopies(userDataDir, [{ kind: 'markdown', filePath: note }])
    } finally {
      await hardKill(first)
    }

    // ---- second run: close the list without choosing ----
    const second = await launchShell({
      userDataDir,
      recordVideo: false,
      videoDir: 'crash-recovery-later-second',
    })
    try {
      const { app } = second
      const shell = await shellPageOf(app)
      const list = shell.locator('.recovery-list')
      await expect(list).toBeVisible({ timeout: 30_000 })
      await expect(list.locator('.recovery-row-name')).toHaveText(['later.md'])
      await stubMessageBoxes(app, 0)
      await list.locator('.recovery-list-close').click()
      await expect(list).toBeHidden()

      // every row is "later": nothing deleted
      await expect
        .poll(async () => (await copyMetas(userDataDir)).map((m) => m.state))
        .toEqual(['later'])
      // the front tab (other.md, no copy) loads without a question
      await editorPageWhere(app, '://markdown/', async (p) =>
        (await markdownText(p)).includes('Other text.'),
      )
      expect(await messageBoxes(app)).toEqual([])
      expect((await editorUrls(app)).length).toBe(1)

      // the first click on later.md asks about that document, by name
      await stripTab(shell, 'later.md').click()
      await expect.poll(async () => (await messageBoxes(app)).length).toBe(1)
      const [box] = await messageBoxes(app)
      expect(`${box.message}\n${box.detail}`).toContain('later.md')
      expect(box.buttons).toHaveLength(2)
      // restore (button 0) opens the copy, unsaved; the file is untouched
      const notePage = await editorPageWhere(app, '://markdown/', async (p) =>
        (await markdownText(p)).includes(MARK),
      )
      await expect(notePage.locator('.status-save')).toHaveText('Unsaved')
      expect((await readFile(note)).equals(noteBytes)).toBe(true)
    } finally {
      // within the crash-loop window of a restore run
      await hardKill(second)
    }

    // ---- third run: the restore run died at once, so nothing loads up front ----
    const third = await launchShell({
      userDataDir,
      recordVideo: false,
      videoDir: 'crash-recovery-later-third',
    })
    try {
      const { app } = third
      const shell = await shellPageOf(app)
      const list = shell.locator('.recovery-list')
      await expect(list).toBeVisible({ timeout: 30_000 })
      await expect(list.locator('.recovery-row-name')).toHaveText(['later.md'])
      expect((await documentTabs(shell)).map((tab) => tab.title)).toEqual(['later.md', 'other.md'])
      await stubMessageBoxes(app, 0)
      await list.locator('.recovery-confirm').click()
      await expect(list).toBeHidden()
      // Home stays in front and no tab loads by itself
      await shell.waitForTimeout(3_000)
      expect((await listTabs(shell)).find((tab) => tab.active)?.kind).toBe('home')
      expect(await editorUrls(app)).toEqual([])

      // the restore-chosen copy opens on click without a question
      await stripTab(shell, 'later.md').click()
      const notePage = await editorPageWhere(app, '://markdown/', async (p) =>
        (await markdownText(p)).includes(MARK),
      )
      await expect(notePage.locator('.status-save')).toHaveText('Unsaved')
      expect(await messageBoxes(app)).toEqual([])
    } finally {
      // a clean quit: the close prompt is answered "Don't Save"
      await closeAndSaveVideo(third, 'crash-recovery-later-third')
    }
    expect((await readFile(note)).equals(noteBytes)).toBe(true)
    // "Don't Save" removed the copy
    expect(await copyMetas(userDataDir)).toEqual([])

    // ---- fourth run: after a clean quit, Home only ----
    const fourth = await launchShell({
      userDataDir,
      recordVideo: false,
      videoDir: 'crash-recovery-later-fourth',
    })
    try {
      const shell = await shellPageOf(fourth.app)
      await shell.waitForTimeout(3_000)
      await expect(shell.locator('.recovery-list')).toHaveCount(0)
      expect(await documentTabs(shell)).toEqual([])
      expect(await editorUrls(fourth.app)).toEqual([])
    } finally {
      await closeAndSaveVideo(fourth, 'crash-recovery-later-fourth')
    }
  })
  test('untitled Markdown and HTML documents come back as untitled tabs, the first one in front', async () => {
    test.setTimeout(480_000)
    const MD_MARK = 'UntitledFrontEdit'
    const HTML_MARK = 'UntitledHtmlEdit'

    // ---- first run: two untitled documents, the Markdown one in front, then a crash ----
    const first = await launchShell({
      onboardingSeen: true,
      recordVideo: false,
      videoDir: 'crash-recovery-untitled-first',
    })
    const userDataDir = first.userDataDir
    let mdTitle: string | undefined
    let htmlTitle: string | undefined
    try {
      const { app } = first
      const shell = await shellPageOf(app)
      await shell.locator('.quick-card', { hasText: 'AI HTML' }).click()
      const html = await waitForPageWithUrl(app, '://html/')
      await expect(html.locator('.ribbon-body')).toBeVisible()
      await html.locator('.rb-view', { hasText: /Source/ }).click()
      const source = html.locator('.source-editor .cm-content')
      await source.click()
      await html.keyboard.press('ControlOrMeta+End')
      await html.keyboard.type(HTML_MARK, { delay: 10 })
      await expect(source).toContainText(HTML_MARK)

      await shell.locator('.tab-bar .tab-home').click()
      await shell.locator('.quick-card', { hasText: 'AI Markdown' }).click()
      const md = await waitForPageWithUrl(app, '://markdown/')
      await editMarkdown(md, MD_MARK)

      const tabs = await documentTabs(shell)
      expect(tabs.map((tab) => [tab.kind, tab.filePath ?? null])).toEqual([
        ['html', null],
        ['markdown', null],
      ])
      htmlTitle = tabs[0].title
      mdTitle = tabs[1].title
      await waitForCopies(userDataDir, [
        { kind: 'html', untitled: true },
        { kind: 'markdown', untitled: true },
      ])
    } finally {
      await hardKill(first)
    }

    // ---- second run: both come back; the front one loads right after the list ----
    const second = await launchShell({
      userDataDir,
      recordVideo: false,
      videoDir: 'crash-recovery-untitled-second',
    })
    try {
      const { app } = second
      const shell = await shellPageOf(app)
      const list = shell.locator('.recovery-list')
      await expect(list).toBeVisible({ timeout: 30_000 })
      expect((await list.locator('.recovery-row-name').allTextContents()).sort()).toEqual(
        [htmlTitle, mdTitle].sort(),
      )
      expect((await documentTabs(shell)).map((tab) => [tab.kind, tab.filePath ?? null])).toEqual([
        ['html', null],
        ['markdown', null],
      ])
      await list.locator('.recovery-confirm').click()
      await expect(list).toBeHidden()

      // the untitled Markdown tab was in front: it loads from its copy, still untitled
      const md = await editorPageWhere(app, '://markdown/', async (p) =>
        (await markdownText(p)).includes(MD_MARK),
      )
      await expect(md.locator('.status-save')).toHaveText('Unsaved')
      await expect
        .poll(async () => (await listTabs(shell)).find((tab) => tab.active)?.title)
        .toBe(mdTitle)

      await stripTab(shell, htmlTitle).click()
      const html = await waitForPageWithUrl(app, '://html/', 60_000)
      await html.locator('.rb-view', { hasText: /Source/ }).click()
      await expect(html.locator('.source-editor .cm-content')).toContainText(HTML_MARK)
      expect((await documentTabs(shell)).every((tab) => tab.filePath === undefined)).toBe(true)
    } finally {
      await closeAndSaveVideo(second, 'crash-recovery-untitled-second')
    }
  })
})
