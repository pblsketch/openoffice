import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createDrawing, openDrawing } from '@genoffice/excalidraw-engine'
import type { DrawingElement } from '@genoffice/excalidraw-engine'
import { closeAndSaveVideo, launchShell, screenshotPath, waitForPageWithUrl } from './helpers'

/**
 * The drawing editor in the built app: an Obsidian drawing note opens in its
 * own tab with the picture it points at, an edit saves back into the note
 * without touching what the user wrote, and a plain `.md` marked as a drawing
 * goes to the same editor. Nothing on the page reaches the network.
 *
 * The note is built here with the engine; the picture is a 1x1 PNG.
 */

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

interface TabSummaryOnWindow {
  id: string
  kind: string
  title: string
  filePath?: string
}

interface ShellApisOnWindow {
  aiOfficeTabs: { list(): Promise<TabSummaryOnWindow[]> }
  aiOffice: { openPath(path: string): Promise<void> }
}

/** the shell window: the one carrying the tab API, which is not always the first window */
async function shellWindow(app: ElectronApplication): Promise<Page> {
  for (const candidate of app.windows()) {
    const isShell = await candidate
      .evaluate(() => (window as unknown as Partial<ShellApisOnWindow>).aiOfficeTabs !== undefined)
      .catch(() => false)
    if (isShell) return candidate
  }
  throw new Error('no shell window')
}

const listTabs = async (app: ElectronApplication): Promise<TabSummaryOnWindow[]> =>
  (await shellWindow(app)).evaluate(() =>
    (window as unknown as ShellApisOnWindow).aiOfficeTabs.list(),
  )

function element(id: string, type: string, extra: Record<string, unknown> = {}): DrawingElement {
  return {
    id,
    type,
    x: 100,
    y: 100,
    width: 160,
    height: 80,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...extra,
  }
}

/** A note laid out as the plugin writes it: the user's text, the text list, the picture list, the scene. */
function noteText(): string {
  const base = new TextDecoder().decode(createDrawing('markdown').save(null))
  const opened = openDrawing(new TextEncoder().encode(base), 'markdown')
  if (opened.status !== 'ok') throw new Error('the engine did not open its own note')
  const scene = opened.document.scene()
  const elements = [
    element('rect0001', 'rectangle'),
    element('text0001', 'text', {
      x: 120,
      y: 220,
      width: 60,
      height: 25,
      text: 'Hello',
      originalText: 'Hello',
      rawText: 'Hello',
      fontSize: 20,
      fontFamily: 5,
      textAlign: 'left',
      verticalAlign: 'top',
      containerId: null,
      autoResize: true,
      lineHeight: 1.25,
    }),
    element('img00001', 'image', {
      x: 320,
      fileId: 'f1',
      status: 'saved',
      scale: [1, 1],
    }),
  ]
  const saved = new TextDecoder().decode(opened.document.save({ ...scene, elements }))
  return saved
    .replace('# Excalidraw Data', 'My notes stay exactly as written.\n\n# Excalidraw Data')
    .replace('## Text Elements\n', '## Embedded Files\nf1: [[cat.png]]\n\n## Text Elements\n')
}

test.describe('drawing editor', () => {
  let vault: string

  test.beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'excalidraw-e2e-'))
    mkdirSync(join(vault, '.obsidian'))
    mkdirSync(join(vault, 'pics'))
    writeFileSync(join(vault, 'pics', 'cat.png'), PNG_1X1)
  })

  test.afterEach(() => rmSync(vault, { recursive: true, force: true }))

  test('opens a note with its picture, saves an edit into it, keeps the user text', async () => {
    const notePath = join(vault, 'Board.excalidraw.md')
    writeFileSync(notePath, noteText())
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'excalidraw-open-save',
      openFile: notePath,
    })
    const { app } = launched
    try {
      const drawing = await waitForPageWithUrl(app, '://excalidraw/')
      const outside: string[] = []
      drawing.on('request', (request) => {
        const url = request.url()
        if (/^https?:/.test(url) && !/^https?:\/\/localhost[:/]/.test(url)) outside.push(url)
      })
      await drawing.waitForSelector('canvas.interactive', { timeout: 30_000 })
      await expect
        .poll(async () => (await listTabs(app)).map((tab) => tab.kind))
        .toContain('excalidraw')
      // the picture was found in the vault: no "not found" notice
      await drawing.waitForTimeout(1_500)
      await expect(drawing.locator('.xd-toast')).toHaveCount(0)
      // opening is not an edit, also once the fonts have loaded and texts were measured again
      await expect(drawing.locator('.xd-dirty')).toHaveCount(0)
      const before = await readFile(notePath)
      await drawing.screenshot({ path: screenshotPath('excalidraw-opened') })

      // a save without an edit writes the original bytes
      await drawing.keyboard.press('Control+s')
      await drawing.waitForTimeout(500)
      expect(Buffer.compare(await readFile(notePath), before)).toBe(0)

      // draw a rectangle with the keyboard tool and the mouse, then save
      const canvas = drawing.locator('canvas.interactive')
      const box = (await canvas.boundingBox())!
      await canvas.click({ position: { x: box.width - 200, y: box.height - 200 } })
      await drawing.keyboard.press('r')
      await drawing.mouse.move(box.x + box.width - 300, box.y + box.height - 300)
      await drawing.mouse.down()
      await drawing.mouse.move(box.x + box.width - 180, box.y + box.height - 200, { steps: 8 })
      await drawing.mouse.up()
      await expect(drawing.locator('.xd-dirty')).toHaveCount(1)
      await drawing.keyboard.press('Control+s')
      await expect(drawing.locator('.xd-dirty')).toHaveCount(0)

      const saved = await readFile(notePath, 'utf8')
      expect(saved).toContain('My notes stay exactly as written.')
      expect(saved).toContain('## Embedded Files\nf1: [[cat.png]]\n')
      expect(saved).toContain('Hello ^text0001')
      const reopened = openDrawing(new TextEncoder().encode(saved), 'markdown')
      if (reopened.status !== 'ok') throw new Error(`saved note did not open: ${reopened.status}`)
      const elements = reopened.document.scene().elements
      expect(elements.filter((e) => e.type === 'rectangle')).toHaveLength(2)
      expect(elements.find((e) => e.id === 'text0001')?.rawText).toBe('Hello')
      // the vault picture is shown, never copied into the note
      expect(saved).not.toContain('data:image/png')
      await drawing.screenshot({ path: screenshotPath('excalidraw-saved') })
      expect(outside).toEqual([])
    } finally {
      await closeAndSaveVideo(launched, 'excalidraw-open-save')
    }
  })

  test('a plain .md marked as a drawing opens in the drawing editor', async () => {
    const notePath = join(vault, 'Sketch.md')
    writeFileSync(notePath, noteText())
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'excalidraw-plain-md' })
    const { app } = launched
    try {
      await (
        await shellWindow(app)
      ).evaluate(
        (path) => (window as unknown as ShellApisOnWindow).aiOffice.openPath(path),
        notePath,
      )
      await waitForPageWithUrl(app, '://excalidraw/')
      await expect
        .poll(async () => (await listTabs(app)).find((tab) => tab.filePath === notePath)?.kind)
        .toBe('excalidraw')
    } finally {
      await closeAndSaveVideo(launched, 'excalidraw-plain-md')
    }
  })
})
