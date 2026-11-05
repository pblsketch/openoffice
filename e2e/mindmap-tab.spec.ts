import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { createXmindDocumentFromOutline, openXmind } from '@genoffice/xmind-engine'
import {
  SHELL_DIR,
  closeAndSaveVideo,
  launchShell,
  screenshotPath,
  waitForPageWithUrl,
} from './helpers'

/**
 * The mind map editor as one more document kind of the shell: every way a
 * `.xmind` file reaches a tab (launch argument, recent files, the folder
 * tree, file search, the open dialog, a drop), the two ways a new map is made
 * (the Home card, the "+" menu), and what a tab of any kind has to do (icon
 * and title, its own menu, the unsaved-changes prompt, Open in New Window).
 *
 * Every map opened here is built in this file with the engine.
 */

/** the colour of the mind map icon's spine, as drawn in file-mindmap.svg (the tab shows that SVG) */
const TILE_FILL = '#B04E83'

/** the tab shows the same bundled icon as the Home card, and that icon is the mind map's */
async function expectMindMapTabIcon(tab: Locator, cardIconSrc: string | null): Promise<void> {
  expect(cardIconSrc).toBeTruthy()
  // the renderer cannot fetch a packaged file:// asset, so compare where the two images point
  expect(await tab.locator('.tab-icon img').getAttribute('src')).toBe(cardIconSrc)
  const svg = await readFile(join(SHELL_DIR, 'src/renderer/src/assets/file-mindmap.svg'), 'utf8')
  expect(svg).toContain(TILE_FILL)
}

interface TabSummaryOnWindow {
  id: string
  kind: string
  title: string
  active: boolean
  filePath?: string
}

interface ShellApisOnWindow {
  aiOfficeTabs: {
    list(): Promise<TabSummaryOnWindow[]>
    close(id: string): Promise<void>
    detach(id: string): Promise<void>
  }
  aiOffice: { openPath(path: string): Promise<void> }
}

async function writeMap(path: string, outline: string): Promise<void> {
  const document = await createXmindDocumentFromOutline(outline, { untitled: 'Untitled' })
  await writeFile(path, await document.save())
}

const TRIP_OUTLINE = '# Trip\n\n- Trip plan\n  - Places\n  - Packing list\n'

const listTabs = (page: Page): Promise<TabSummaryOnWindow[]> =>
  page.evaluate(() => (window as unknown as ShellApisOnWindow).aiOfficeTabs.list())

const mindmapTabs = async (page: Page): Promise<TabSummaryOnWindow[]> =>
  (await listTabs(page)).filter((tab) => tab.kind === 'mindmap')

const topicTitles = (map: Page): Promise<string[]> =>
  map
    .locator('.mm-sheet-host:not([hidden]) me-tpc > .text')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''))

/** Tab on the central topic adds a branch; the title is typed into the edit box. */
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

const windowTitles = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((win) => !win.isDestroyed())
      .map((win) => win.getTitle()),
  )

/**
 * The save prompt is a native message box: answer it from the main process and
 * count the questions. 0 = Save, 1 = Don't Save, 2 = Cancel.
 */
async function answerClosePrompts(app: ElectronApplication, response: number): Promise<void> {
  await app.evaluate(({ dialog }, answer) => {
    const state = globalThis as unknown as { __prompts?: Array<{ buttons: number }> }
    state.__prompts ??= []
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = args[args.length - 1] as { buttons?: string[] }
      state.__prompts!.push({ buttons: options.buttons?.length ?? 0 })
      return { response: answer, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  }, response)
}

const closePrompts = (app: ElectronApplication): Promise<Array<{ buttons: number }>> =>
  app.evaluate(
    () => (globalThis as unknown as { __prompts?: Array<{ buttons: number }> }).__prompts ?? [],
  )

/** Labels of one top-level application menu, separators as "-". */
const menuLabels = (app: ElectronApplication, top: string): Promise<string[]> =>
  app.evaluate(({ Menu }, label) => {
    const menu = Menu.getApplicationMenu()?.items.find((item) => item.label === label)
    return (menu?.submenu?.items ?? []).map((item) =>
      item.type === 'separator' ? '-' : item.label,
    )
  }, top)

const clickMenuItem = (app: ElectronApplication, top: string, label: string): Promise<boolean> =>
  app.evaluate(
    ({ Menu }, [topLabel, itemLabel]) => {
      const menu = Menu.getApplicationMenu()?.items.find((item) => item.label === topLabel)
      const item = menu?.submenu?.items.find((candidate) => candidate.label === itemLabel)
      if (!item) return false
      item.click()
      return true
    },
    [top, label] as const,
  )

test.describe('mind map editor in the shell', () => {
  test('a new map from the Home card: tab, menu, undo from the menu, save, unsaved-changes prompt', async () => {
    test.setTimeout(240_000)
    const saveDir = await mkdtemp(join(tmpdir(), 'genoffice-mindmap-new-'))
    const savedPath = join(saveDir, 'first-map.xmind')
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'mindmap-new' })
    const { app, page } = launched
    try {
      // ── the Home card
      const card = page.locator('.quick-card', { hasText: 'Mind Map' })
      await expect(card).toHaveCount(1)
      await expect(card.locator('.quick-sub')).toHaveText('.xmind')
      // the card is named for the editor, never after another product
      await expect(card.locator('.quick-title')).toHaveText('Mind Map')
      await expect(card.locator('img')).toBeVisible()
      const cardIconSrc = await card.locator('img').getAttribute('src')
      await page.screenshot({ path: screenshotPath('mindmap-home-card') })
      await card.click()

      // ── the tab: icon and title
      const tab = page.locator('.tab-bar .tab-item:not(.tab-home)')
      await expect(tab).toHaveCount(1)
      await expect(tab).toHaveClass(/active/)
      await expect(tab.locator('.tab-title')).toHaveText('Untitled Mind Map')
      await expectMindMapTabIcon(tab, cardIconSrc)
      const map = await waitForPageWithUrl(app, '://mindmap/')
      await expect(map.locator('.mm-sheet-host:not([hidden]) me-root me-tpc')).toBeVisible()
      await page.screenshot({ path: screenshotPath('mindmap-tab-strip') })
      await map.screenshot({ path: screenshotPath('mindmap-new-editor') })

      // ── its own menu: File with the four exports and Print, Edit with undo / redo
      const file = await menuLabels(app, 'File')
      expect(file).toEqual([
        'New',
        'Open…',
        '-',
        'Back to Home',
        '-',
        'Save',
        'Save As…',
        '-',
        // spec 8.2: the make-window entry every editor's File menu has (T18)
        'Make Another Document from This',
        '-',
        'Export as Image (PNG)…',
        'Export as Image (SVG)…',
        'Export as PDF…',
        'Export as Markdown Outline…',
        '-',
        'Print…',
        '-',
        'Close',
      ])
      const edit = await menuLabels(app, 'Edit')
      expect(edit.slice(0, 2)).toEqual(['Undo', 'Redo'])
      for (const labels of [file, edit]) expect(labels.join(' ')).not.toMatch(/xmind/i)

      // ── an edit, then undo and redo from the menu
      await addBranch(map, 'Branch from the menu test')
      for (
        let i = 0;
        i < 4 && (await topicTitles(map)).includes('Branch from the menu test');
        i++
      ) {
        expect(await clickMenuItem(app, 'Edit', 'Undo')).toBe(true)
        await map.waitForTimeout(150)
      }
      expect(await topicTitles(map)).not.toContain('Branch from the menu test')
      for (
        let i = 0;
        i < 4 && !(await topicTitles(map)).includes('Branch from the menu test');
        i++
      ) {
        expect(await clickMenuItem(app, 'Edit', 'Redo')).toBe(true)
        await map.waitForTimeout(150)
      }
      expect(await topicTitles(map)).toContain('Branch from the menu test')

      // ── the export and print items send the editor's own requests. They are
      // recorded and held back here: what the editor does with them (a save
      // dialog, the system print dialog) is not this spec's subject.
      await app.evaluate(({ webContents }) => {
        const state = globalThis as unknown as { __sent: unknown[][] }
        state.__sent = []
        const held = new Set(['mindmap:export-request', 'mindmap:print-request'])
        for (const contents of webContents.getAllWebContents()) {
          if (!contents.getURL().includes('://mindmap/')) continue
          const send = contents.send.bind(contents)
          contents.send = ((channel: string, ...args: unknown[]) => {
            if (!held.has(channel)) return send(channel, ...args)
            state.__sent.push([channel, ...args])
          }) as typeof contents.send
        }
      })
      for (const label of [
        'Export as Image (PNG)…',
        'Export as Image (SVG)…',
        'Export as PDF…',
        'Export as Markdown Outline…',
        'Print…',
      ]) {
        expect(await clickMenuItem(app, 'File', label)).toBe(true)
      }
      expect(
        await app.evaluate(() => (globalThis as unknown as { __sent: unknown[][] }).__sent),
      ).toEqual([
        ['mindmap:export-request', 'png'],
        ['mindmap:export-request', 'svg'],
        ['mindmap:export-request', 'pdf'],
        ['mindmap:export-request', 'markdown'],
        ['mindmap:print-request'],
      ])

      // ── closing with unsaved changes asks; Cancel keeps the tab
      const [untitled] = await mindmapTabs(page)
      await answerClosePrompts(app, 2)
      await page.evaluate(
        (id) => (window as unknown as ShellApisOnWindow).aiOfficeTabs.close(id),
        untitled!.id,
      )
      await expect.poll(() => closePrompts(app)).toEqual([{ buttons: 3 }])
      await expect(tab).toHaveCount(1)

      // ── Save from the menu: the first save of an untitled map asks where
      await app.evaluate(({ dialog }, target) => {
        const state = globalThis as unknown as { __saveDialogs: unknown[] }
        state.__saveDialogs = []
        dialog.showSaveDialog = (async (...args: unknown[]) => {
          state.__saveDialogs.push(args[args.length - 1])
          return { canceled: false, filePath: target }
        }) as typeof dialog.showSaveDialog
      }, savedPath)
      expect(await clickMenuItem(app, 'File', 'Save')).toBe(true)
      await expect.poll(() => existsSync(savedPath), { timeout: 30_000 }).toBe(true)
      // saved: the tab takes the file's name and the file is a map that opens
      await expect(tab.locator('.tab-title')).toHaveText('first-map.xmind')
      await expect(map.locator('.mm-save-status')).toHaveAttribute('data-dirty', 'false')
      const reopened = await openXmind(new Uint8Array(await readFile(savedPath)))
      expect(reopened.status).toBe('ok')
      const saveDialog = (
        await app.evaluate(
          () => (globalThis as unknown as { __saveDialogs: unknown[] }).__saveDialogs,
        )
      )[0] as { filters: Array<{ extensions: string[] }> }
      expect(saveDialog.filters[0]!.extensions).toEqual(['xmind'])
      expect((await mindmapTabs(page))[0]!.filePath).toBe(savedPath)

      // a saved, clean map closes without a question
      await page.evaluate(
        (id) => (window as unknown as ShellApisOnWindow).aiOfficeTabs.close(id),
        (await mindmapTabs(page))[0]!.id,
      )
      await expect(tab).toHaveCount(0)
      expect(await closePrompts(app)).toHaveLength(1)

      // and it is now a recent file. Home re-reads its list when the window
      // gets the focus back, which an unattended run has to say itself.
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      const recentRow = page.locator('.recent-row', { hasText: 'first-map.xmind' })
      await expect(recentRow).toBeVisible()
    } finally {
      await closeAndSaveVideo(launched, 'mindmap-new')
      rmSync(saveDir, { recursive: true, force: true })
    }
  })

  test('the "+" menu lists the mind map between its neighbours and creates one', async () => {
    test.setTimeout(180_000)
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'mindmap-plus-menu' })
    const { app, page } = launched
    try {
      // a native menu is invisible to the DOM: keep the menu the shell pops up
      await app.evaluate(({ Menu }) => {
        const state = globalThis as unknown as { __popup?: Electron.Menu }
        const proto = Menu.prototype as unknown as { popup: (...args: unknown[]) => void }
        proto.popup = function (this: Electron.Menu) {
          state.__popup = this
        }
      })
      await page.locator('.tab-new-btn').click()
      const items = await app.evaluate(() => {
        const menu = (globalThis as unknown as { __popup?: Electron.Menu }).__popup
        return (menu?.items ?? []).map((item) => ({
          label: item.type === 'separator' ? '-' : item.label,
          hasIcon: Boolean(item.icon && typeof item.icon !== 'string' && !item.icon.isEmpty()),
        }))
      })
      const labels = items.map((item) => item.label)
      expect(labels).toContain('Mind Map')
      expect(labels.indexOf('Mind Map')).toBe(labels.indexOf('AI HTML') + 1)
      expect(items.find((item) => item.label === 'Mind Map')!.hasIcon).toBe(true)
      expect(labels.join(' ')).not.toMatch(/xmind/i)

      await app.evaluate(() => {
        const menu = (globalThis as unknown as { __popup?: Electron.Menu }).__popup
        menu?.items.find((item) => item.label === 'Mind Map')?.click()
      })
      const tab = page.locator('.tab-bar .tab-item:not(.tab-home)')
      await expect(tab).toHaveCount(1)
      await expect(tab.locator('.tab-title')).toHaveText('Untitled Mind Map')
      const map = await waitForPageWithUrl(app, '://mindmap/')
      await expect(map.locator('.mm-sheet-host:not([hidden]) me-root me-tpc')).toBeVisible()

      // File > New in the map's own menu makes another one
      expect(await clickMenuItem(app, 'File', 'New')).toBe(true)
      await expect(tab).toHaveCount(2)
      expect((await mindmapTabs(page)).map((entry) => entry.title)).toEqual([
        'Untitled Mind Map',
        'Untitled Mind Map',
      ])
    } finally {
      await closeAndSaveVideo(launched, 'mindmap-plus-menu')
    }
  })

  test('a .xmind on the command line opens; recents, filter, Open in New Window and its close prompt', async () => {
    test.setTimeout(240_000)
    const dir = await mkdtemp(join(tmpdir(), 'genoffice-mindmap-argv-'))
    const mapPath = join(dir, 'trip.xmind')
    await writeMap(mapPath, TRIP_OUTLINE)
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'mindmap-argv',
      openFile: mapPath,
    })
    const { app } = launched
    try {
      // with a file on argv the first window may be the editor view
      const page = await waitForPageWithUrl(app, 'shell/out')
      const tab = page.locator('.tab-bar .tab-item:not(.tab-home)')
      await expect(tab).toHaveCount(1)
      await expect(tab.locator('.tab-title')).toHaveText('trip.xmind')
      const map = await waitForPageWithUrl(app, '://mindmap/')
      await expect
        .poll(() => topicTitles(map))
        .toEqual(expect.arrayContaining(['Trip plan', 'Places', 'Packing list']))
      await map.screenshot({ path: screenshotPath('mindmap-open-file') })

      // ── recent files: the row carries the mind map tile and opens the file
      await page.locator('.tab-bar .tab-item.tab-home').click()
      const row = page.locator('.recent-row', { hasText: 'trip.xmind' })
      await expect(row).toBeVisible()
      const tile = await page
        .locator('.quick-card', { hasText: 'Mind Map' })
        .locator('img')
        .getAttribute('src')
      expect(await row.locator('.recent-icon img').getAttribute('src')).toBe(tile)
      await expectMindMapTabIcon(tab, tile)
      await page.screenshot({ path: screenshotPath('mindmap-home-recent-row') })

      // ── the sidebar filter keeps it under "Mind Map" and hides it under "HTML"
      const pills = page.locator('.filter-pills')
      await pills.locator('.filter-pill', { hasText: /^HTML$/ }).click()
      await expect(row).toHaveCount(0)
      await pills.locator('.filter-pill', { hasText: /^Mind Map$/ }).click()
      await expect(row).toBeVisible()

      // a clean map closes without a question; the recent row opens it again
      await answerClosePrompts(app, 2)
      await page.evaluate(
        (id) => (window as unknown as ShellApisOnWindow).aiOfficeTabs.close(id),
        (await mindmapTabs(page))[0]!.id,
      )
      await expect(tab).toHaveCount(0)
      expect(await closePrompts(app)).toEqual([])
      await row.locator('.recent-name').click()
      await expect(tab).toHaveCount(1)
      await expect(tab.locator('.tab-title')).toHaveText('trip.xmind')
      const reopened = await waitForPageWithUrl(app, '://mindmap/')
      await expect.poll(() => topicTitles(reopened)).toContain('Places')

      // opening the same file again focuses its tab instead of adding one
      await page.evaluate(
        (path) => (window as unknown as ShellApisOnWindow).aiOffice.openPath(path),
        mapPath,
      )
      await expect(tab).toHaveCount(1)

      // ── Open in New Window: the live map moves, edits included
      await addBranch(reopened, 'Added before detaching')
      await page.evaluate(
        (id) => (window as unknown as ShellApisOnWindow).aiOfficeTabs.detach(id),
        (await mindmapTabs(page))[0]!.id,
      )
      await expect(tab).toHaveCount(0)
      await expect.poll(() => windowTitles(app)).toContain('trip.xmind')
      expect(await windowTitles(app)).toHaveLength(2)
      expect(await topicTitles(reopened)).toContain('Added before detaching')
      // the file is still found: a second open focuses the window, no new tab
      await page.evaluate(
        (path) => (window as unknown as ShellApisOnWindow).aiOffice.openPath(path),
        mapPath,
      )
      await expect(tab).toHaveCount(0)
      expect(await windowTitles(app)).toHaveLength(2)

      // ── closing that window with unsaved changes asks; Cancel keeps it
      const closeDetached = (): Promise<void> =>
        app.evaluate(({ BrowserWindow }) => {
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.getTitle() === 'trip.xmind') win.close()
          }
        })
      await closeDetached()
      await expect.poll(() => closePrompts(app)).toEqual([{ buttons: 3 }])
      expect(await windowTitles(app)).toHaveLength(2)
      // Don't Save lets it go, and the file on disk is the one that was opened
      await answerClosePrompts(app, 1)
      await closeDetached()
      await expect.poll(() => windowTitles(app)).toHaveLength(1)
      const onDisk = await openXmind(new Uint8Array(await readFile(mapPath)))
      expect(onDisk.status).toBe('ok')
    } finally {
      await closeAndSaveVideo(launched, 'mindmap-argv')
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('the folder tree, file search, the open dialog and a drop all reach the editor', async () => {
    test.setTimeout(240_000)
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'genoffice-mindmap-root-')))
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'genoffice-mindmap-out-')))
    mkdirSync(join(root, 'Maps'))
    await writeMap(join(root, 'Maps', 'budget.xmind'), '# Money\n\n- Quarterly budget\n  - Rent\n')
    await writeMap(join(outside, 'picked.xmind'), '# Picked\n\n- Picked in the dialog\n  - One\n')
    await writeMap(
      join(outside, 'dropped.xmind'),
      '# Dropped\n\n- Dropped on the window\n  - Two\n',
    )
    const launched = await launchShell({
      onboardingSeen: true,
      settings: { defaultSaveDir: root },
      videoDir: 'mindmap-open-routes',
    })
    const { app, page } = launched
    const tab = page.locator('.tab-bar .tab-item:not(.tab-home)')
    const closeAllMaps = async (): Promise<void> => {
      for (const entry of await mindmapTabs(page)) {
        await page.evaluate(
          (id) => (window as unknown as ShellApisOnWindow).aiOfficeTabs.close(id),
          entry.id,
        )
      }
      await expect(tab).toHaveCount(0)
    }
    try {
      // ── folder tree: the folder lists the map, with its tile, and opens it
      const tree = page.locator('.folder-panel .tree')
      await tree.locator('.tree-name', { hasText: 'Maps' }).click()
      const row = page.locator('.recent-list .recent-row', { hasText: 'budget.xmind' })
      await expect(row).toBeVisible()
      await expect(row.locator('.recent-icon img')).toBeVisible()
      await page.screenshot({ path: screenshotPath('mindmap-home-folder-row') })
      await row.locator('.recent-name').click()
      await expect(tab.locator('.tab-title')).toHaveText('budget.xmind')
      await closeAllMaps()

      // ── file search: the index reads the topics of a map
      const box = page.locator('.file-search input')
      await box.fill('Quarterly')
      const hits = page.locator('.search-row')
      await expect(hits).toHaveCount(1, { timeout: 60_000 })
      await expect(page.locator('.search-name')).toHaveText('budget.xmind')
      await box.fill('')

      // ── the open dialog: its answer goes through the same route as any pick.
      // The native dialog cannot be driven, so its answer is given in the main
      // process; the options the shell asked with are checked too.
      await app.evaluate(
        ({ dialog }, picked) => {
          const state = globalThis as unknown as { __openDialogs: unknown[] }
          state.__openDialogs = []
          dialog.showOpenDialog = (async (...args: unknown[]) => {
            state.__openDialogs.push(args[args.length - 1])
            return { canceled: false, filePaths: [picked] }
          }) as typeof dialog.showOpenDialog
        },
        join(outside, 'picked.xmind'),
      )
      // the browse card (the only one with a tip); the PDF tools card comes after it
      await page.locator('.quick-card[data-tip]').click()
      await expect(tab.locator('.tab-title')).toHaveText('picked.xmind')
      const asked = (
        await app.evaluate(
          () => (globalThis as unknown as { __openDialogs: unknown[] }).__openDialogs,
        )
      )[0] as { filters: Array<{ name: string; extensions: string[] }> }
      expect(asked.filters[0]!.extensions).toContain('xmind')
      const own = asked.filters.find((filter) => filter.extensions.join() === 'xmind')
      // the file format is named only here, as the kind of file that is opened
      expect(own?.name).toBe('Mind Maps (XMind files)')
      // File > Open asks the same way
      expect(await clickMenuItem(app, 'File', 'Open…')).toBe(true)
      await expect
        .poll(() =>
          app.evaluate(
            () => (globalThis as unknown as { __openDialogs: unknown[] }).__openDialogs.length,
          ),
        )
        .toBe(2)
      await closeAllMaps()

      // ── a drop: Electron resolves paths only for a real OS drag, so the
      // message the drop bridge sends from the preload is sent here instead
      await app.evaluate(
        ({ ipcMain }, dropped) => {
          ipcMain.emit('app:open-dropped-files', {}, [dropped, 'C:\\not-a-document.png'])
        },
        join(outside, 'dropped.xmind'),
      )
      await expect(tab).toHaveCount(1)
      await expect(tab.locator('.tab-title')).toHaveText('dropped.xmind')
      const map = await waitForPageWithUrl(app, '://mindmap/')
      await expect.poll(() => topicTitles(map)).toContain('Dropped on the window')
    } finally {
      await closeAndSaveVideo(launched, 'mindmap-open-routes')
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  test('a headless export of a .xmind is refused with the input-file exit code', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'genoffice-mindmap-headless-'))
    const mapPath = join(dir, 'trip.xmind')
    const outPath = join(dir, 'trip.pdf')
    await writeMap(mapPath, TRIP_OUTLINE)
    const require = createRequire(join(SHELL_DIR, 'package.json'))
    const electronPath = require('electron') as unknown as string
    const { ELECTRON_RUN_AS_NODE: _runAsNode, ...env } = process.env
    try {
      const result = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
        execFile(
          electronPath,
          [
            ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []),
            SHELL_DIR,
            '--headless-export',
            mapPath,
            '--to',
            'pdf',
            '--out',
            outPath,
            '--json',
          ],
          { env: { ...env, GENOFFICE_USER_DATA: join(dir, 'profile') }, timeout: 60_000 },
          (error, stdout) => {
            const code = error ? ((error as { code?: number | null }).code ?? null) : 0
            resolve({ code: typeof code === 'number' ? code : null, stdout: String(stdout) })
          },
        )
      })
      // 2 = the input cannot be exported: reported, not crashed
      expect(result.code).toBe(2)
      const envelope = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as {
        status: string
        error?: string
      }
      expect(envelope.status).toBe('error')
      expect(envelope.error).toMatch(/cannot export/)
      expect(existsSync(outPath)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
