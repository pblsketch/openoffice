import { test, expect, type Locator } from '@playwright/test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBlankPptx, openPptx, savePptx, setSlideNotes } from '@genoffice/pptx-engine'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

/**
 * Presenter view: the splitter between the current slide and the notes column
 * widens the column by mouse and by keyboard, the slide frame gives up that
 * room, and the width is still there the next time the presenter view opens.
 * A plain press saves nothing, and Esc in the middle of a drag leaves no drag behind.
 */
async function deckWithNotes(): Promise<string> {
  const opened = await openPptx(await createBlankPptx())
  if (!setSlideNotes(opened, 0, 'Speaker notes for the first slide.')) {
    throw new Error('setSlideNotes failed')
  }
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-presenter-notes-'))
  const file = join(dir, 'notes.pptx')
  await writeFile(file, await savePptx(opened))
  return file
}

const widthOf = async (locator: Locator): Promise<number> =>
  Math.round((await locator.boundingBox())!.width)

test('the presenter view notes column is resized from its splitter and remembered', async () => {
  const deck = await deckWithNotes()
  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'slides-presenter-notes-width',
    openFile: deck,
  })
  try {
    const page = await waitForPageWithUrl(launched.app, '://slides/')
    await page.waitForSelector('.stage-wrap canvas', { timeout: 30_000 })
    const openPresenter = async () => {
      const presenterButton = page.getByRole('button', { name: 'Presenter View', exact: true })
      // the Slide Show tab stays selected after the first visit
      if (!(await presenterButton.isVisible())) {
        await page.getByRole('button', { name: 'Slide Show', exact: true }).click()
      }
      await presenterButton.click()
      await expect(page.locator('.presenter:not(.pv-uncovered)')).toBeVisible({
        timeout: 20_000,
      })
    }
    await openPresenter()
    const side = page.locator('.presenter .pv-side')
    const stagebox = page.locator('.presenter .pv-stagebox')
    const splitter = page.getByRole('separator', {
      name: 'Drag to change the width of the notes column',
    })
    await expect(page.locator('.presenter .pv-notes')).toHaveText(
      'Speaker notes for the first slide.',
    )
    expect(await widthOf(side)).toBe(340)
    const frameBefore = await widthOf(stagebox)

    // drag the splitter 200px toward the slide
    const handle = (await splitter.boundingBox())!
    const y = handle.y + handle.height / 2
    await page.mouse.move(handle.x + handle.width / 2, y)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2 - 200, y, { steps: 8 })
    await page.mouse.up()
    await expect.poll(() => widthOf(side)).toBe(540)
    await expect(splitter).toHaveAttribute('aria-valuenow', '540')
    // the slide frame fits the narrower main area (or stays if the height was the limit)
    expect(await widthOf(stagebox)).toBeLessThanOrEqual(frameBefore)
    // a mouse drag leaves the arrow keys to the show
    await expect(splitter).not.toBeFocused()

    // keyboard: focus the splitter, arrows step it, Home goes to the narrowest
    await splitter.focus()
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => widthOf(side)).toBe(560)
    await page.keyboard.press('Home')
    await expect.poll(() => widthOf(side)).toBe(240)
    await page.keyboard.press('Shift+ArrowLeft')
    await expect.poll(() => widthOf(side)).toBe(320)
    // the arrows resized the column instead of turning pages: still on the one slide, not ended
    await expect(page.locator('.presenter .pv-end')).toHaveCount(0)

    // leave the presenter view and come back: the width is remembered
    await page.locator('.presenter .pv-top-exit').click()
    await expect(page.locator('.presenter')).toHaveCount(0)
    await openPresenter()
    await expect.poll(() => widthOf(page.locator('.presenter .pv-side'))).toBe(320)
    // a double click puts the default back
    await page
      .getByRole('separator', { name: 'Drag to change the width of the notes column' })
      .dblclick()
    await expect.poll(() => widthOf(page.locator('.presenter .pv-side'))).toBe(340)
    await page.keyboard.press('Escape')
    await expect(page.locator('.presenter')).toHaveCount(0)

    // a width wider than this window is drawn narrower; a plain press on the splitter keeps it
    const stored = () => page.evaluate(() => localStorage.getItem('ai-slides-presenter-side-width'))
    await page.evaluate(() => localStorage.setItem('ai-slides-presenter-side-width', '5000'))
    await openPresenter()
    const innerWidth = await page.evaluate(() => window.innerWidth)
    await expect.poll(() => widthOf(page.locator('.presenter .pv-side'))).toBe(innerWidth - 600)
    const again = page.getByRole('separator', {
      name: 'Drag to change the width of the notes column',
    })
    await again.click()
    expect(await stored()).toBe('5000')

    // Esc in the middle of a drag closes the view and leaves no drag behind
    const grip = (await again.boundingBox())!
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2 + 60, grip.y + grip.height / 2, { steps: 3 })
    await page.keyboard.press('Escape')
    await expect(page.locator('.presenter')).toHaveCount(0)
    expect(await page.evaluate(() => document.body.style.cursor)).toBe('')
    await page.mouse.move(grip.x - 100, grip.y + grip.height / 2, { steps: 3 })
    await page.mouse.up()
    expect(await stored()).toBe('5000')
  } finally {
    await closeAndSaveVideo(launched, 'slides-presenter-notes-width')
  }
})
