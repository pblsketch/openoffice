/**
 * Copying and pasting pictures and tables in the HWP editor (2026-10-28 feedback: pictures and
 * forms would not copy and paste).
 *
 * Keys go through `webContents.sendInputEvent`, as a person's keys do: the main process takes
 * Ctrl+C/X before the page (hwp-main.ts installFileShortcuts), Playwright's keys would skip that.
 * `assets/hwp-picture-table.hwp` was written by the engine: "앞", a picture, a 3×2 table with
 * "칸" in its first cell, a text box holding "상자 글", "뒤".
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Frame, Page } from '@playwright/test'
import { copyFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'

const STUDIO_IFRAME = '.hwp-editor-host iframe'
const OBJECTS_ASSET = join(__dirname, 'assets', 'hwp-picture-table.hwp')
const BLANK_ASSET = join(__dirname, '..', 'apps', 'hwp', 'src', 'renderer', 'assets', 'blank.hwp')

interface Box {
  type: string
  x: number
  y: number
  w: number
  h: number
}

interface Objects {
  controls: Box[]
  pageWidth: number
  picture: boolean
  table: boolean
}

interface Editor {
  hwp: Page
  frame: Frame
  tag: string
}

async function openHwp(app: ElectronApplication, page: Page): Promise<Page> {
  await page.locator('.quick-card').nth(6).click()
  const hwp = await waitForPageWithUrl(app, '://hwp/')
  await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
  return hwp
}

async function studioFrame(hwp: Page): Promise<Frame> {
  const deadline = Date.now() + 60_000
  for (;;) {
    const frame = hwp.frames().find((f) => f.url().includes('/studio/'))
    if (frame) return frame
    if (Date.now() > deadline) throw new Error('studio frame never loaded')
    await hwp.waitForTimeout(100)
  }
}

async function focusEditor(hwp: Page): Promise<void> {
  const canvas = hwp.frameLocator(STUDIO_IFRAME).locator('#scroll-content canvas').first()
  await canvas.waitFor({ timeout: 60_000 })
  await canvas.click({ position: { x: 160, y: 145 } })
}

/**
 * A key as the OS delivers it, so the main process sees it first. With `tag`, the HWP view whose
 * page carries that `__e2eTag`; otherwise the first HWP view.
 */
async function sendKey(
  app: ElectronApplication,
  keyCode: string,
  modifiers: string[] = [],
  tag = '',
): Promise<void> {
  await app.evaluate(
    async ({ webContents }, [key, mods, want]) => {
      let wc = null
      for (const w of webContents.getAllWebContents()) {
        if (!w.getURL().includes('://hwp/')) continue
        if (!want || (await w.executeJavaScript('window.__e2eTag ?? ""')) === want) {
          wc = w
          break
        }
      }
      if (!wc) throw new Error(`no hwp view ${want}`)
      wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: mods as never })
      wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: mods as never })
    },
    [keyCode, modifiers, tag] as const,
  )
}

/** The pictures and tables drawn on the first page, and what is selected. */
async function objects(frame: Frame): Promise<Objects> {
  return frame.evaluate(() => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    if (!studio.__objectsProbe) {
      studio.automation.registerCommand({
        id: 'ext:e2e-objects',
        label: 'E2E objects',
        execute(services) {
          const ih = services.getInputHandler()
          ;(window as unknown as { __e2eObjects: Objects }).__e2eObjects = {
            controls: services.wasm
              .getPageControlLayout(0)
              .controls.filter((c) => c.type === 'image' || c.type === 'table'),
            pageWidth: services.wasm.getPageInfo(0).width,
            picture: ih.cursor.isInPictureObjectSelection() === true,
            table: ih.cursor.isInTableObjectSelection() === true,
          }
        },
      })
      studio.__objectsProbe = true
    }
    studio.automation.execute('ext:e2e-objects')
    return (window as unknown as { __e2eObjects: Objects }).__e2eObjects
  })
}

function count(state: Objects, type: string): number {
  return state.controls.filter((c) => c.type === type).length
}

/** Click the middle of the first drawn object of a type. */
async function clickObject(hwp: Page, frame: Frame, type: string): Promise<void> {
  const state = await objects(frame)
  const target = state.controls.find((c) => c.type === type)
  if (!target) throw new Error(`no ${type} on the page`)
  const canvas = hwp.frameLocator(STUDIO_IFRAME).locator('#scroll-content canvas').first()
  const box = (await canvas.boundingBox())!
  const scale = box.width / state.pageWidth
  await hwp.mouse.click(
    box.x + (target.x + target.w / 2) * scale,
    box.y + (target.y + target.h / 2) * scale,
  )
}

/** A 64×48 opaque picture alone on the system clipboard. */
async function putPictureOnClipboard(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ clipboard, nativeImage }) => {
    const width = 64
    const height = 48
    const bgra = Buffer.alloc(width * height * 4)
    for (let i = 0; i < width * height; i += 1) bgra.writeUInt32LE(0xff2060d0, i * 4)
    clipboard.writeImage(nativeImage.createFromBitmap(bgra, { width, height }))
  })
}

async function clipboardHtml(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ clipboard }) => clipboard.readHTML())
}

async function clearClipboard(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ clipboard }) => clipboard.clear())
}

/** The engine-written document with a picture and a table, and a blank one, each in a tab. */
async function launchTwoDocuments() {
  const dir = await mkdtemp(join(tmpdir(), 'hwp-object-clipboard-'))
  const objectsPath = join(dir, 'objects.hwp')
  const blankPath = join(dir, 'blank.hwp')
  await copyFile(OBJECTS_ASSET, objectsPath)
  await copyFile(BLANK_ASSET, blankPath)
  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'hwp-object-clipboard',
    openFiles: [objectsPath, blankPath],
  })
  const { app } = launched
  const shell = await waitForPageWithUrl(app, 'shell/out')
  const deadline = Date.now() + 90_000
  let pages: Page[] = []
  while (pages.length < 2) {
    if (Date.now() > deadline) throw new Error(`only ${pages.length} HWP pages`)
    pages = []
    for (const candidate of app.windows()) {
      const href = await candidate.evaluate(() => window.location.href).catch(() => '')
      if (href.includes('://hwp/')) pages.push(candidate)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  let source: Editor | null = null
  let target: Editor | null = null
  for (const hwp of pages) {
    await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
    const frame = await studioFrame(hwp)
    await frame.locator('#scroll-content canvas').first().waitFor({ timeout: 60_000 })
    const tag = (await objects(frame)).controls.length > 0 ? 'source' : 'target'
    await hwp.evaluate((t) => ((window as unknown as { __e2eTag: string }).__e2eTag = t), tag)
    if (tag === 'source') source = { hwp, frame, tag }
    else target = { hwp, frame, tag }
  }
  if (!source || !target) throw new Error('could not tell the two documents apart')
  const show = async (editor: Editor) => {
    const title = editor === source ? 'objects.hwp' : 'blank.hwp'
    await shell.locator('.tab-bar .tab-item:not(.tab-home)', { hasText: title }).click()
  }
  return { launched, app, source, target, show }
}

test.describe('HWP picture and table clipboard', () => {
  test.setTimeout(180_000)

  test('a picture copies and pastes with the keys a person presses', async () => {
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'hwp-object-clipboard' })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)

      // a picture from outside: the system clipboard holds only an image
      await putPictureOnClipboard(app)
      await sendKey(app, 'V', ['control'])
      await expect.poll(async () => count(await objects(frame), 'image')).toBe(1)
      // at the caret inside the page's margins, not floating at the paper's top left corner
      const pasted = (await objects(frame)).controls.find((c) => c.type === 'image')!
      expect(pasted.x).toBeGreaterThan(50)
      expect(pasted.y).toBeGreaterThan(50)
      expect([Math.round(pasted.w), Math.round(pasted.h)]).toEqual([64, 48])

      // select it, copy it, paste it after it
      await clickObject(hwp, frame, 'image')
      await expect.poll(async () => (await objects(frame)).picture).toBe(true)
      await clearClipboard(app)
      await sendKey(app, 'C', ['control'])
      await expect.poll(() => clipboardHtml(app)).toContain('rhwp-studio-clipboard')
      await sendKey(app, 'Escape')
      await sendKey(app, 'End', ['control'])
      await sendKey(app, 'Return')
      await sendKey(app, 'V', ['control'])
      await expect.poll(async () => count(await objects(frame), 'image')).toBe(2)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-object-clipboard')
    }
  })

  test('a table copies and pastes with the keys a person presses', async () => {
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'hwp-object-clipboard' })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)

      await frame.locator('#menu-bar .menu-item[data-menu="table"] .menu-title').click()
      await frame.locator('.md-item[data-cmd="table:create"]').click()
      const grid = frame.locator('div[data-row="1"][data-col="1"]')
      await grid.hover()
      await grid.click()
      await expect.poll(async () => count(await objects(frame), 'table')).toBe(1)

      await hwp.keyboard.type('A')
      // Esc in a cell selects the table object
      await sendKey(app, 'Escape')
      await expect.poll(async () => (await objects(frame)).table).toBe(true)
      await clearClipboard(app)
      await sendKey(app, 'C', ['control'])
      await expect.poll(() => clipboardHtml(app)).toContain('rhwp-studio-clipboard')
      await sendKey(app, 'Escape')
      await sendKey(app, 'End', ['control'])
      await sendKey(app, 'Return')
      await sendKey(app, 'V', ['control'])
      await expect.poll(async () => count(await objects(frame), 'table')).toBe(2)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-object-clipboard')
    }
  })

  test('a block with a picture, a table and a text box pastes whole into another document', async () => {
    const { launched, app, source, target, show } = await launchTwoDocuments()
    try {
      expect(count(await objects(source.frame), 'image')).toBe(1)
      expect(count(await objects(source.frame), 'table')).toBe(1)

      await show(source)
      await focusEditor(source.hwp)
      await clearClipboard(app)
      await sendKey(app, 'A', ['control'], source.tag)
      await sendKey(app, 'C', ['control'], source.tag)
      // the other document reads this HTML: the engine alone wrote only "앞" and "뒤"
      await expect.poll(() => clipboardHtml(app)).toContain('rhwp-studio-clipboard')
      const html = await clipboardHtml(app)
      const order = ['앞', '<img', '<table', '칸', '상자 글', '뒤'].map((needle) =>
        html.indexOf(needle),
      )
      expect(
        order.every((at) => at >= 0),
        html,
      ).toBe(true)
      expect([...order].sort((a, b) => a - b)).toEqual(order)

      await show(target)
      await focusEditor(target.hwp)
      await sendKey(app, 'V', ['control'], target.tag)
      // the table, and the text box as its text in a framed cell
      await expect.poll(async () => count(await objects(target.frame), 'table')).toBe(2)
      await expect.poll(async () => count(await objects(target.frame), 'image')).toBe(1)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-object-clipboard')
    }
  })

  test('a picture copied in another document is the one pasted, not this one’s last copy', async () => {
    const { launched, app, source, target, show } = await launchTwoDocuments()
    try {
      // the blank document copies a picture of its own first: 64×48
      await show(target)
      await focusEditor(target.hwp)
      await putPictureOnClipboard(app)
      await sendKey(app, 'V', ['control'], target.tag)
      await expect.poll(async () => count(await objects(target.frame), 'image')).toBe(1)
      await clickObject(target.hwp, target.frame, 'image')
      await expect.poll(async () => (await objects(target.frame)).picture).toBe(true)
      await clearClipboard(app)
      await sendKey(app, 'C', ['control'], target.tag)
      await expect.poll(() => clipboardHtml(app)).toContain('rhwp-studio-clipboard')
      const own = (await objects(target.frame)).controls.find((c) => c.type === 'image')!

      // then the other document's picture, 96×72, is copied
      await show(source)
      await clickObject(source.hwp, source.frame, 'image')
      await expect.poll(async () => (await objects(source.frame)).picture).toBe(true)
      const before = await clipboardHtml(app)
      await sendKey(app, 'C', ['control'], source.tag)
      await expect.poll(() => clipboardHtml(app)).not.toBe(before)
      const theirs = (await objects(source.frame)).controls.find((c) => c.type === 'image')!

      await show(target)
      await focusEditor(target.hwp)
      await sendKey(app, 'End', ['control'], target.tag)
      await sendKey(app, 'Return', [], target.tag)
      await sendKey(app, 'V', ['control'], target.tag)
      await expect.poll(async () => count(await objects(target.frame), 'image')).toBe(2)
      // the new one is the other document's picture at the size it has there (its pixels are
      // 1×1), not a second copy of the 64×48 one this document copied before
      const pictures = (await objects(target.frame)).controls.filter((c) => c.type === 'image')
      const sized = (box: Box) => (p: Box) => Math.abs(p.w - box.w) < 2 && Math.abs(p.h - box.h) < 2
      expect(pictures.filter(sized(own))).toHaveLength(1)
      expect(pictures.filter(sized(theirs))).toHaveLength(1)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-object-clipboard')
    }
  })

  test('a picture copied in another document pastes into a table cell', async () => {
    const { launched, app, source, target, show } = await launchTwoDocuments()
    try {
      // a table in the blank document; the caret stays in its first cell
      await show(target)
      await focusEditor(target.hwp)
      await target.frame.locator('#menu-bar .menu-item[data-menu="table"] .menu-title').click()
      await target.frame.locator('.md-item[data-cmd="table:create"]').click()
      const grid = target.frame.locator('div[data-row="1"][data-col="1"]')
      await grid.hover()
      await grid.click()
      await expect.poll(async () => count(await objects(target.frame), 'table')).toBe(1)

      await show(source)
      await clickObject(source.hwp, source.frame, 'image')
      await expect.poll(async () => (await objects(source.frame)).picture).toBe(true)
      await clearClipboard(app)
      await sendKey(app, 'C', ['control'], source.tag)
      await expect.poll(() => clipboardHtml(app)).toContain('rhwp-studio-clipboard')
      const theirs = (await objects(source.frame)).controls.find((c) => c.type === 'image')!

      // back in the cell: its HTML, not the picture file, is pasted, and the engine's HTML paste
      // into a cell would drop the picture
      await show(target)
      await target.frame.evaluate(() => document.querySelector('textarea')?.focus())
      await sendKey(app, 'V', ['control'], target.tag)
      await expect.poll(async () => count(await objects(target.frame), 'image')).toBe(1)
      const state = await objects(target.frame)
      const table = state.controls.find((c) => c.type === 'table')!
      const picture = state.controls.find((c) => c.type === 'image')!
      expect(Math.abs(picture.w - theirs.w)).toBeLessThan(2)
      // inside the cell's text: the table grew around it
      expect(picture.x).toBeGreaterThanOrEqual(table.x)
      expect(picture.y).toBeGreaterThanOrEqual(table.y)
      expect(picture.y + picture.h).toBeLessThanOrEqual(table.y + table.h + 1)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-object-clipboard')
    }
  })
})

interface StudioLike {
  automation: {
    execute(id: string): unknown
    registerCommand(def: {
      id: string
      label: string
      execute(services: StudioServices): void
    }): void
  }
  __objectsProbe?: boolean
}

interface StudioServices {
  wasm: {
    getPageControlLayout(page: number): { controls: Box[] }
    getPageInfo(page: number): { width: number }
  }
  getInputHandler(): {
    cursor: {
      isInPictureObjectSelection(): boolean
      isInTableObjectSelection(): boolean
    }
  }
}
