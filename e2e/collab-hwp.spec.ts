/**
 * LAN co-editing of a Hangul document between two app instances (decision 0073).
 * The Hangul editor shares in watch mode: the person sharing edits, and a guest
 * sees the document live, read-only, with the host's name and page.
 *
 * Runs against the production build; the document is read through the app's
 * `ieum-agent` plugin in each studio frame.
 */
import { test, expect, type ElectronApplication, type Frame, type Page } from '@playwright/test'
import { copyFile, mkdtemp, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, closeAndSaveVideo, screenshotPath, waitForPageWithUrl } from './helpers'

/** The blank document a new HWP tab starts from: one empty paragraph. */
const BLANK = join(__dirname, '..', 'apps', 'hwp', 'src', 'renderer', 'assets', 'blank.hwp')

interface StudioLike {
  plugins: {
    load(id: string): Promise<unknown>
    invoke(id: string, method: string, args: unknown[]): Promise<unknown>
  }
}

/** every Hangul editor page of an app, in creation order */
async function hwpPages(app: ElectronApplication): Promise<Page[]> {
  const pages: Page[] = []
  for (const candidate of app.windows()) {
    const href = await candidate.evaluate(() => window.location.href).catch(() => '')
    if (href.includes('://hwp/')) pages.push(candidate)
  }
  return pages
}

async function newHwpPage(app: ElectronApplication, known: Page[]): Promise<Page> {
  for (let i = 0; i < 200; i++) {
    const fresh = (await hwpPages(app)).find((page) => !known.includes(page))
    if (fresh) return fresh
    await app.waitForEvent('window', { timeout: 300 }).catch(() => {})
  }
  throw new Error('the guest tab never opened')
}

/** the tab with its document open and the app's plugin up (its File menu items are in) */
async function ready(page: Page): Promise<Page> {
  await page.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
  await expect(
    page.frameLocator('.hwp-editor-host iframe').locator('[data-cmd="ext:ieum-save"]'),
  ).toHaveCount(1, { timeout: 60_000 })
  return page
}

async function studioFrame(page: Page): Promise<Frame> {
  const deadline = Date.now() + 60_000
  for (;;) {
    const frame = page.frames().find((f) => f.url().includes('/studio/'))
    if (frame) return frame
    if (Date.now() > deadline) throw new Error('studio frame never loaded')
    await page.waitForTimeout(100)
  }
}

/** how often `needle` occurs in the document the tab holds now */
async function occurrences(page: Page, needle: string): Promise<number> {
  const frame = await studioFrame(page)
  return frame.evaluate(async (find) => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    await studio.plugins.load('ieum-agent')
    const found = (await studio.plugins.invoke('ieum-agent', 'findText', [find])) as {
      count: number
    }
    return found.count
  }, needle)
}

/** a click in the body of the first page, so keys go to the editor's input */
async function clickIntoPage(page: Page): Promise<void> {
  const box = (await page.locator('.hwp-editor-host iframe').boundingBox())!
  await page.mouse.click(box.x + box.width * 0.4, box.y + 300)
}

/** the editor's File menu → Save, which goes the way Ctrl+S goes (main → this tab) */
async function fileSave(page: Page): Promise<void> {
  await page.evaluate(() =>
    (
      window as unknown as { hwpApi: { requestFileCommand(command: string): void } }
    ).hwpApi.requestFileCommand('save'),
  )
}

async function blankCopy(dir: string, name: string): Promise<string> {
  const file = join(dir, name)
  await copyFile(BLANK, file)
  return file
}

test('a Hangul document is shared over the LAN with a PIN and watched live', async () => {
  test.setTimeout(240_000)
  const dir = await mkdtemp(join(tmpdir(), 'collab-hwp-'))
  const shared = await blankCopy(dir, 'plan.hwp')
  const other = await blankCopy(dir, 'other.hwp')

  const host = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-hwp-host',
    openFile: shared,
    settings: { collabProfile: { name: 'Host Mina', color: 1 } },
  })
  const guest = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-hwp-guest',
    openFile: other,
    settings: { collabProfile: { name: 'Guest Jun', color: 3 } },
  })
  try {
    const hostPage = await ready(await waitForPageWithUrl(host.app, '://hwp/', 60_000))

    // unsaved edits go out with the shared copy
    await clickIntoPage(hostPage)
    await hostPage.keyboard.type('First line from the host.')
    await expect.poll(() => occurrences(hostPage, 'First line from the host.')).toBe(1)

    // host: share, read the PIN
    await hostPage.locator('.hwp-collab').click()
    await hostPage.getByRole('button', { name: 'Start sharing' }).click()
    const pinText = (await hostPage.locator('.collab-pin').innerText()).replace(/\D/g, '')
    expect(pinText).toMatch(/^\d{6}$/)
    await hostPage.screenshot({ path: screenshotPath('collab-hwp-host-sharing') })
    await hostPage.locator('.collab-dialog').getByRole('button', { name: 'Close' }).click()

    // guest: a wrong PIN is refused, the right one opens the shared document in a new tab
    const guestFirst = await ready(await waitForPageWithUrl(guest.app, '://hwp/', 60_000))
    const before = await hwpPages(guest.app)
    await guestFirst.locator('.hwp-collab').click()
    await guestFirst.getByRole('tab', { name: 'Join' }).click()
    await guestFirst.getByLabel('Address').fill('127.0.0.1')
    const wrong = pinText === '000000' ? '111111' : '000000'
    await guestFirst.getByLabel('PIN (6 digits)').fill(wrong)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(guestFirst.locator('.collab-error')).toHaveText('That PIN is not right.')
    await guestFirst.getByLabel('PIN (6 digits)').fill(pinText)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()

    const guestPage = await ready(await newHwpPage(guest.app, before))
    await expect.poll(() => occurrences(guestPage, 'First line from the host.')).toBe(1)

    // the guest is told it watches, and sees who shares and on which page
    await expect(guestPage.locator('.hwp-collab-viewonly')).toHaveText(
      'In this format only the person sharing edits; people who join watch it live.',
    )
    await expect(guestPage.locator('.hwp-collab-name')).toHaveText('Host Mina')
    await expect(guestPage.locator('.hwp-collab-page')).toHaveText('1')
    // nothing to ask the AI to change in someone else's document
    await expect(guestPage.locator('.ai-dock')).toHaveCount(0)

    // the guest's keys do not reach the document, and it says why
    await clickIntoPage(guestPage)
    await guestPage.keyboard.type('Guest was here')
    await expect(guestPage.locator('.collab-notice')).toContainText('only the person sharing edits')
    await guestPage.waitForTimeout(2_500)
    expect(await occurrences(guestPage, 'Guest was here')).toBe(0)
    expect(await occurrences(hostPage, 'Guest was here')).toBe(0)

    // the host types: the guest sees it once the host pauses
    await clickIntoPage(hostPage)
    await hostPage.keyboard.press('End')
    await hostPage.keyboard.type(' Version two.')
    await expect
      .poll(() => occurrences(guestPage, 'host. Version two.'), { timeout: 20_000 })
      .toBe(1)
    await hostPage.screenshot({ path: screenshotPath('collab-hwp-host') })
    await guestPage.screenshot({ path: screenshotPath('collab-hwp-guest') })

    // a guest cannot save; the host saves to its file
    await fileSave(guestPage)
    await expect(guestPage.locator('.hwp-notice')).toContainText(
      'During a session, the person sharing saves the file.',
    )
    await fileSave(hostPage)
    // the first overwrite keeps the original beside it
    await expect.poll(() => existsSync(`${shared}.bak`), { timeout: 30_000 }).toBe(true)
    // the backup is copied before the new bytes land
    const blank = await readFile(BLANK)
    await expect
      .poll(async () => (await readFile(shared)).equals(blank), { timeout: 30_000 })
      .toBe(false)

    // the host stops sharing: the guest is told, keeps an unsaved copy, and can edit it
    await hostPage.locator('.hwp-collab').click()
    await hostPage.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(guestPage.locator('.collab-notice')).toContainText('ended the session')
    await expect(guestPage.locator('.hwp-collab-viewonly')).toHaveCount(0)
    expect(await occurrences(guestPage, 'host. Version two.')).toBe(1)
    await clickIntoPage(guestPage)
    await guestPage.keyboard.type('Mine now')
    await expect.poll(() => occurrences(guestPage, 'Mine now')).toBe(1)
    expect(await occurrences(hostPage, 'Mine now')).toBe(0)
  } finally {
    await closeAndSaveVideo(guest, 'collab-hwp-guest')
    await closeAndSaveVideo(host, 'collab-hwp-host')
  }
})
