/**
 * Hangul's Ctrl+PageUp/PageDown (start and end of the document, with Shift the block grows
 * there) and the status bar's character count (issue #295) in the built app: the count is the
 * Document Information dialog's, a block is counted as it grows, an emoji or a Han character
 * outside the basic plane is one character, and the AI's selection read hands such text back as
 * it is written.
 *
 * The documents are written with the engine the editor runs (vendor/rhwp-core), so the test
 * does not lean on a font, a window size or a committed fixture.
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Frame, Page } from '@playwright/test'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { ARTIFACTS_DIR, closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'

const execFileAsync = promisify(execFile)
const REPO_ROOT = join(__dirname, '..')
const STUDIO_IFRAME = '.hwp-editor-host iframe'

/** The paragraph with an emoji and a Han character outside the basic plane (𠀀, U+20000). */
const ASTRAL = '😀𠀀 emoji and astral Han 한글'
/** A document long enough to scroll: the astral paragraph second, filler around it. */
const PARAGRAPHS = Array.from({ length: 120 }, (_, i) =>
  i === 1 ? ASTRAL : `Paragraph ${i}: plain filler text so the document runs past one page.`,
)

/** Characters as Hangul counts them: code points, spaces in, line breaks out. */
const chars = (text: string) => [...text].length
const charsNoSpace = (text: string) => [...text.replace(/[ \t]/g, '')].length
const number = (n: number) => new Intl.NumberFormat('en').format(n)

/** Non-ASCII written as \u escapes, so the script survives any command line. */
const asciiJson = (value: unknown) =>
  JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )

/**
 * Writes an .hwp of these paragraphs with the engine build the editor runs. A long document is
 * pasted in one go (splitting paragraph by paragraph lays the whole document out each time).
 */
async function writeDocument(path: string, paragraphs: string[]): Promise<void> {
  const bulk = paragraphs.length > 200
  const core = pathToFileURL(join(REPO_ROOT, 'vendor/rhwp-core/rhwp.js')).href
  const wasm = join(REPO_ROOT, 'vendor/rhwp-core/rhwp_bg.wasm')
  const script = [
    "import { readFileSync, writeFileSync } from 'node:fs'",
    `const { default: init, HwpDocument } = await import(${JSON.stringify(core)})`,
    `await init({ module_or_path: readFileSync(${JSON.stringify(wasm)}) })`,
    `const paragraphs = ${asciiJson(paragraphs)}`,
    'const doc = HwpDocument.createEmpty()',
    'doc.createBlankDocument()',
    ...(bulk
      ? ["doc.pasteHtml(0, 0, 0, paragraphs.map((p) => '<p>' + p + '</p>').join(''))"]
      : [
          'doc.insertText(0, 0, 0, paragraphs[0])',
          'for (let i = 1; i < paragraphs.length; i += 1) {',
          '  doc.splitParagraph(0, i - 1, doc.getParagraphLength(0, i - 1))',
          '  doc.insertText(0, i, 0, paragraphs[i])',
          '}',
        ]),
    'writeFileSync(process.argv[2], doc.exportHwp())',
  ].join('\n')
  const dir = await mkdtemp(join(tmpdir(), 'ieum-char-count-script-'))
  const file = join(dir, 'write.mjs')
  await writeFile(file, script)
  await execFileAsync(process.execPath, [file, path], { timeout: 120_000 })
}

async function documentFile(name: string, paragraphs: string[]): Promise<string> {
  const file = join(await mkdtemp(join(tmpdir(), 'ieum-char-count-')), name)
  await writeDocument(file, paragraphs)
  return file
}

/** The HWP tab with the document open and the app's plugin up. */
async function hwpPage(app: ElectronApplication): Promise<Page> {
  const hwp = await waitForPageWithUrl(app, '://hwp/')
  await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
  await expect(hwp.frameLocator(STUDIO_IFRAME).locator('[data-cmd="ext:ieum-save"]')).toHaveCount(1)
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

interface Position {
  sectionIndex: number
  paragraphIndex: number
  charOffset: number
}

interface Caret {
  position: Position
  selection: { start: Position; end: Position } | null
  scrollTop: number
}

/** Test commands on the automation surface: put the caret somewhere, and read where it is. */
async function installCaretProbe(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const scope = window as unknown as {
      rhwpStudio: StudioLike
      __e2eCaretProbe?: boolean
      __e2eCaretTarget?: Position
      __e2eCaret?: unknown
    }
    if (scope.__e2eCaretProbe) return
    scope.rhwpStudio.automation.registerCommand({
      id: 'ext:e2e-caret-to',
      label: 'E2E caret to',
      execute(services) {
        services.getInputHandler().moveCursorTo(scope.__e2eCaretTarget!)
      },
    })
    scope.rhwpStudio.automation.registerCommand({
      id: 'ext:e2e-caret-read',
      label: 'E2E caret read',
      execute(services) {
        const ih = services.getInputHandler()
        scope.__e2eCaret = {
          position: ih.getCursorPosition(),
          selection: ih.cursor.getSelectionOrdered(),
          scrollTop: document.getElementById('scroll-container')?.scrollTop ?? 0,
        }
      },
    })
    scope.__e2eCaretProbe = true
  })
}

async function caretTo(frame: Frame, paragraphIndex: number, charOffset: number): Promise<void> {
  await frame.evaluate(
    ([paragraph, offset]) => {
      const scope = window as unknown as { rhwpStudio: StudioLike; __e2eCaretTarget?: Position }
      scope.__e2eCaretTarget = { sectionIndex: 0, paragraphIndex: paragraph, charOffset: offset }
      scope.rhwpStudio.automation.execute('ext:e2e-caret-to')
    },
    [paragraphIndex, charOffset],
  )
}

async function caret(frame: Frame): Promise<Caret> {
  return frame.evaluate(() => {
    const scope = window as unknown as { rhwpStudio: StudioLike; __e2eCaret?: Caret }
    scope.rhwpStudio.automation.execute('ext:e2e-caret-read')
    return scope.__e2eCaret!
  })
}

const at = (paragraphIndex: number, charOffset: number) => ({
  sectionIndex: 0,
  paragraphIndex,
  charOffset,
})

/** The AI panel's selection read: the plugin call, no AI request. */
async function aiSelection(frame: Frame): Promise<SelectionRead> {
  return frame.evaluate(async () => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    await studio.plugins.load('ieum-agent')
    return studio.plugins.invoke('ieum-agent', 'selection', []) as SelectionRead
  })
}

/** How many edits the document has had that the AI did not make. */
async function edits(frame: Frame): Promise<number> {
  return frame.evaluate(async () => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    await studio.plugins.load('ieum-agent')
    return studio.plugins.invoke('ieum-agent', 'foreignChanges', []) as number
  })
}

/** The status bar's count, as shown. */
const countText = (frame: Frame) =>
  frame.evaluate(() => document.getElementById('ieum-sb-char-count')?.textContent ?? '')
const countTitle = (frame: Frame) =>
  frame.evaluate(() => document.getElementById('ieum-sb-char-count')?.title ?? '')

/** Opens Document Information with Hangul's Ctrl+Q,I and reads its two character counts. */
async function dialogCounts(hwp: Page, frame: Frame): Promise<{ chars: string; noSpace: string }> {
  await hwp.keyboard.press('Control+q')
  await hwp.keyboard.press('i')
  const value = (key: string) => frame.locator(`.modal-overlay [data-key="${key}"]`)
  await expect(value('chars')).not.toHaveText('—')
  const counts = {
    chars: (await value('chars').textContent()) ?? '',
    noSpace: (await value('charsNoSpace').textContent()) ?? '',
  }
  await hwp.keyboard.press('Escape')
  await expect(frame.locator('.modal-overlay')).toHaveCount(0)
  return counts
}

/** Keyboard focus back on the editor's hidden input without moving the caret. */
async function focusInput(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const input = document.querySelector('textarea') as HTMLTextAreaElement | null
    input?.focus()
  })
}

/** A real OS-style key on the HWP page, so the main process sees it (Playwright keys do not). */
async function sendKey(
  app: ElectronApplication,
  keyCode: string,
  modifiers: 'control'[] = [],
): Promise<void> {
  await app.evaluate(
    ({ webContents }, { key, mods }) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('://hwp/'))
      if (!wc) throw new Error('no hwp webContents')
      wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: mods })
      wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: mods })
    },
    { key: keyCode, mods: modifiers },
  )
}

async function screenshot(hwp: Page, name: string): Promise<void> {
  const dir = join(ARTIFACTS_DIR, 'hwp-char-count-keys')
  await mkdir(dir, { recursive: true })
  await hwp.screenshot({ path: join(dir, `${name}.png`) })
}

interface SelectionRead {
  ok: boolean
  reason?: string
  segments?: { offset: number; length: number; text: string }[]
}

interface StudioLike {
  plugins: {
    load(id: string): Promise<unknown>
    invoke(id: string, method: string, args: unknown[]): unknown
  }
  automation: {
    execute(id: string): unknown
    registerCommand(def: { id: string; label: string; execute(services: Services): void }): void
  }
}

interface Services {
  getInputHandler(): {
    moveCursorTo(pos: Position): boolean
    getCursorPosition(): Position
    cursor: { getSelectionOrdered(): { start: Position; end: Position } | null }
  }
}

const LAST = PARAGRAPHS.length - 1
const TOTAL = PARAGRAPHS.reduce((sum, p) => sum + chars(p), 0)
const TOTAL_NO_SPACE = PARAGRAPHS.reduce((sum, p) => sum + charsNoSpace(p), 0)

test.describe('HWP Ctrl+PageUp/PageDown and the status bar character count', () => {
  test.setTimeout(180_000)

  test('Ctrl+PageDown/PageUp go to the end and the start, and with Shift the block grows there', async () => {
    const file = await documentFile('edge-keys.hwp', PARAGRAPHS)
    const launched = await launchShell({
      onboardingSeen: true,
      openFile: file,
      videoDir: 'hwp-char-count-keys',
      recordVideo: false,
    })
    try {
      const hwp = await hwpPage(launched.app)
      const frame = await studioFrame(hwp)
      await installCaretProbe(frame)
      const end = at(LAST, chars(PARAGRAPHS[LAST]))
      const middle = at(60, 5)
      const editsBefore = await edits(frame)

      // from the middle: Ctrl+PageDown to the end of the last paragraph, the view there
      await caretTo(frame, middle.paragraphIndex, middle.charOffset)
      await focusInput(frame)
      expect((await caret(frame)).position).toMatchObject(middle)
      await hwp.keyboard.press('Control+PageDown')
      await expect.poll(async () => (await caret(frame)).position).toMatchObject(end)
      const atEnd = await caret(frame)
      expect(atEnd.selection).toBeNull()
      expect(atEnd.scrollTop).toBeGreaterThan(0)
      await screenshot(hwp, '01-ctrl-pagedown-end')

      // Ctrl+PageUp to the start, the view at the top
      await hwp.keyboard.press('Control+PageUp')
      await expect.poll(async () => (await caret(frame)).position).toMatchObject(at(0, 0))
      const atStart = await caret(frame)
      expect(atStart.selection).toBeNull()
      expect(atStart.scrollTop).toBe(0)

      // the same key as the OS hands it, through the main process: the shell does not take it
      // for a tab switch
      await sendKey(launched.app, 'PageDown', ['control'])
      await expect.poll(async () => (await caret(frame)).position).toMatchObject(end)
      await sendKey(launched.app, 'PageUp', ['control'])
      await expect.poll(async () => (await caret(frame)).position).toMatchObject(at(0, 0))

      // Ctrl+Shift+PageDown from the middle: the block runs from there to the end
      await caretTo(frame, middle.paragraphIndex, middle.charOffset)
      await focusInput(frame)
      await hwp.keyboard.press('Control+Shift+PageDown')
      await expect
        .poll(async () => (await caret(frame)).selection)
        .toMatchObject({ start: middle, end })
      // and the status bar counts that block
      const tail =
        chars(PARAGRAPHS[middle.paragraphIndex]) -
        middle.charOffset +
        PARAGRAPHS.slice(middle.paragraphIndex + 1).reduce((sum, p) => sum + chars(p), 0)
      await expect
        .poll(() => countText(frame))
        .toBe(`Characters ${number(tail)} / ${number(TOTAL)}`)
      await screenshot(hwp, '02-ctrl-shift-pagedown-block')

      // Ctrl+Shift+PageUp from the middle: the block runs from the start to there
      await caretTo(frame, middle.paragraphIndex, middle.charOffset)
      await focusInput(frame)
      await hwp.keyboard.press('Control+Shift+PageUp')
      await expect
        .poll(async () => (await caret(frame)).selection)
        .toMatchObject({ start: at(0, 0), end: middle })
      await expect
        .poll(() => countText(frame))
        .toBe(`Characters ${number(TOTAL - tail)} / ${number(TOTAL)}`)
      // none of the keys changed the document (no letter, no page break)
      expect(await edits(frame)).toBe(editsBefore)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-char-count-keys')
    }
  })

  test('the status bar counts as Document Information does, a block, emoji once, and the AI reads it as written', async () => {
    const file = await documentFile('char-count.hwp', PARAGRAPHS)
    const launched = await launchShell({
      onboardingSeen: true,
      openFile: file,
      videoDir: 'hwp-char-count',
      recordVideo: false,
    })
    try {
      const hwp = await hwpPage(launched.app)
      const frame = await studioFrame(hwp)
      await installCaretProbe(frame)

      // the whole document, as counted from the text it was written with
      await expect.poll(() => countText(frame)).toBe(`Characters ${number(TOTAL)}`)
      expect(await countTitle(frame)).toContain(number(TOTAL_NO_SPACE))
      // the same numbers as Document Information (Ctrl+Q,I)
      await caretTo(frame, 0, 0)
      await focusInput(frame)
      expect(await dialogCounts(hwp, frame)).toEqual({
        chars: number(TOTAL),
        noSpace: number(TOTAL_NO_SPACE),
      })

      // the whole paragraph with the emoji and 𠀀 selected: each is one character
      await caretTo(frame, 1, 0)
      await focusInput(frame)
      await hwp.keyboard.press('Shift+End')
      await expect
        .poll(() => countText(frame))
        .toBe(`Characters ${number(chars(ASTRAL))} / ${number(TOTAL)}`)
      expect(await countTitle(frame)).toContain(number(charsNoSpace(ASTRAL)))
      // the AI's selection read gives the paragraph back as it is written
      let read = await aiSelection(frame)
      expect(read.ok).toBe(true)
      expect(read.segments?.map((s) => s.text)).toEqual([ASTRAL])
      await screenshot(hwp, '03-astral-paragraph-selected')

      // two characters from the start: the emoji and 𠀀, four units in a JavaScript string
      await caretTo(frame, 1, 0)
      await focusInput(frame)
      await hwp.keyboard.press('Shift+ArrowRight')
      await hwp.keyboard.press('Shift+ArrowRight')
      await expect.poll(() => countText(frame)).toBe(`Characters 2 / ${number(TOTAL)}`)
      read = await aiSelection(frame)
      expect(read.ok).toBe(true)
      expect(read.segments?.map((s) => s.text)).toEqual(['😀𠀀'])
      // past them: the space and the next word, cut by characters too
      for (let i = 0; i < 6; i += 1) await hwp.keyboard.press('Shift+ArrowRight')
      await expect.poll(() => countText(frame)).toBe(`Characters 8 / ${number(TOTAL)}`)
      read = await aiSelection(frame)
      expect(read.segments?.map((s) => s.text)).toEqual([[...ASTRAL].slice(0, 8).join('')])

      // the whole document selected
      await hwp.keyboard.press('Control+a')
      await expect
        .poll(() => countText(frame))
        .toBe(`Characters ${number(TOTAL)} / ${number(TOTAL)}`)

      // typing changes the document's count once it rests, and the dialog agrees
      await caretTo(frame, LAST, chars(PARAGRAPHS[LAST]))
      await focusInput(frame)
      await hwp.keyboard.type(' abc')
      await expect.poll(() => countText(frame)).toBe(`Characters ${number(TOTAL + 4)}`)
      expect((await dialogCounts(hwp, frame)).chars).toBe(number(TOTAL + 4))
      await screenshot(hwp, '04-after-typing')
    } finally {
      await closeAndSaveVideo(launched, 'hwp-char-count')
    }
  })

  test('a cell block grown with F5 and the arrow keys is counted as it grows', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-char-count-cells',
      recordVideo: false,
    })
    const { app, page } = launched
    try {
      await page.locator('.quick-card', { hasText: 'AI HWP' }).click()
      const hwp = await hwpPage(app)
      const frame = await studioFrame(hwp)
      const canvas = hwp.frameLocator(STUDIO_IFRAME).locator('#scroll-content canvas').first()
      await canvas.waitFor({ timeout: 60_000 })
      await focusInput(frame)

      // a 3×3 table through the editor's Table menu, as a person would
      await frame.locator('#menu-bar .menu-item[data-menu="table"] .menu-title').click()
      await frame.locator('.md-item[data-cmd="table:create"]').click()
      const grid = frame.locator('div[data-row="2"][data-col="2"]')
      await grid.hover()
      await grid.click()
      await expect
        .poll(() =>
          frame.evaluate(async () => {
            const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
            await studio.plugins.load('ieum-agent')
            return (studio.plugins.invoke('ieum-agent', 'listTables', []) as { count: number })
              .count
          }),
        )
        .toBe(1)

      // A1 ab, B1 cde, C1 f, A2 😀, B2 gh: nine characters, the emoji one of them
      const cells = ['ab', 'cde', 'f', '😀', 'gh']
      for (const [i, text] of cells.entries()) {
        if (i > 0) await hwp.keyboard.press('Tab')
        await hwp.keyboard.type(text)
      }
      const total = cells.reduce((sum, text) => sum + chars(text), 0)
      await expect.poll(() => countText(frame)).toBe(`Characters ${number(total)}`)
      for (let i = 0; i < cells.length - 1; i += 1) await hwp.keyboard.press('Shift+Tab')

      // F5: A1 alone
      await hwp.keyboard.press('F5')
      await expect.poll(() => countText(frame)).toBe(`Characters 2 / ${number(total)}`)
      // F5 again, then the arrows grow the block: A1:B1, then A1:B2
      await hwp.keyboard.press('F5')
      await hwp.keyboard.press('ArrowRight')
      await expect.poll(() => countText(frame)).toBe(`Characters 5 / ${number(total)}`)
      await hwp.keyboard.press('ArrowDown')
      await expect.poll(() => countText(frame)).toBe(`Characters 8 / ${number(total)}`)
      await screenshot(hwp, '05-cell-block-grown')
      // Esc leaves the block: the document's count alone
      await hwp.keyboard.press('Escape')
      await expect.poll(() => countText(frame)).toBe(`Characters ${number(total)}`)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-char-count-cells')
    }
  })

  test('typing in a document over 30 pages: the count follows once typing rests', async () => {
    // over 30 pages the studio repaints a typed character page by page and fires no
    // 'document-changed' (input-handler.ts afterPageLocalEdit; the idle pagination flush is off
    // above DOCUMENT_PAGINATION_IDLE_FLUSH_PAGE_LIMIT), only 'document-mutated', which the count
    // also takes
    // about 400,000 characters over some 150 pages, the last paragraph short so typing there
    // never wraps a line
    const line = 'The quick brown fox jumps over the lazy dog 한글 문장입니다. '
    const text = line.repeat(Math.ceil(200 / line.length)).slice(0, 200)
    const paragraphs = [...Array.from({ length: 1999 }, () => text), 'end']
    const file = await documentFile('long.hwp', paragraphs)
    const total = paragraphs.reduce((sum, p) => sum + chars(p), 0)
    const launched = await launchShell({
      onboardingSeen: true,
      openFile: file,
      videoDir: 'hwp-char-count-long',
      recordVideo: false,
    })
    try {
      const hwp = await hwpPage(launched.app)
      const frame = await studioFrame(hwp)
      await installCaretProbe(frame)
      await expect
        .poll(() => countText(frame), { timeout: 60_000 })
        .toBe(`Characters ${number(total)}`)
      expect(
        Number(
          (await frame.evaluate(() => document.getElementById('sb-page')?.textContent ?? '')).match(
            /\/\s*(\d+)/,
          )?.[1],
        ),
      ).toBeGreaterThan(30)

      // one key, a rest, then three more: every key reaches the document
      await caretTo(frame, paragraphs.length - 1, 3)
      await focusInput(frame)
      await hwp.keyboard.type('a')
      await hwp.waitForTimeout(3000)
      await hwp.keyboard.type('bcd', { delay: 50 })
      await expect.poll(async () => (await caret(frame)).position.charOffset).toBe(7)
      // the count follows once typing rests
      await expect
        .poll(() => countText(frame), { timeout: 20_000 })
        .toBe(`Characters ${number(total + 4)}`)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-char-count-long')
    }
  })
})
