import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { launchShell, closeAndSaveVideo, screenshotPath, waitForPageWithUrl } from './helpers'

/** every PDF editor page of an app, in creation order */
async function pdfPages(app: ElectronApplication): Promise<Page[]> {
  const pages: Page[] = []
  for (const candidate of app.windows()) {
    const href = await candidate.evaluate(() => window.location.href).catch(() => '')
    if (href.includes('://pdf/')) pages.push(candidate)
  }
  return pages
}

async function newPdfPage(app: ElectronApplication, known: Page[]): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const fresh = (await pdfPages(app)).find((page) => !known.includes(page))
    if (fresh) return fresh
    await app.waitForEvent('window', { timeout: 300 }).catch(() => {})
  }
  throw new Error('the guest tab never opened')
}

async function writePdf(path: string, pages: Array<[number, number]>): Promise<void> {
  const doc = await PDFDocument.create()
  for (const size of pages) doc.addPage(size)
  await writeFile(path, await doc.save({ useObjectStreams: false }))
}

/** the thumbnail menu of page `n` (1-based), then one of its entries */
async function thumbAction(page: Page, n: number, action: string): Promise<void> {
  await page
    .locator('.pdf-thumb')
    .nth(n - 1)
    .locator('.pdf-thumb-box')
    .click({ button: 'right' })
  await page.locator('.thumb-menu').getByRole('button', { name: action, exact: true }).click()
}

/** the first page on screen is wider than tall (the portrait page was turned) */
const firstPageLandscape = async (page: Page): Promise<boolean> => {
  const box = await page.locator('.pdf-page').first().boundingBox()
  return !!box && box.width > box.height
}

const savedRotation = async (path: string): Promise<number> =>
  (await PDFDocument.load(await readFile(path))).getPage(0).getRotation().angle

test('two apps edit one PDF together over the LAN with a PIN', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'collab-pdf-'))
  const shared = join(dir, 'plan.pdf')
  const other = join(dir, 'other.pdf')
  await writePdf(shared, [
    [400, 600],
    [400, 600],
  ])
  await writePdf(other, [[300, 300]])

  const host = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-pdf-host',
    openFile: shared,
    settings: { collabProfile: { name: 'Host Mina', color: 1 } },
  })
  const guest = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-pdf-guest',
    openFile: other,
    settings: { collabProfile: { name: 'Guest Jun', color: 3 } },
  })
  try {
    const hostPage = await waitForPageWithUrl(host.app, '://pdf/')
    await expect(hostPage.locator('.pdf-thumb')).toHaveCount(2)

    // host: share, read the PIN
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Start sharing' }).click()
    const pinText = (await hostPage.locator('.collab-pin').innerText()).replace(/\D/g, '')
    expect(pinText).toMatch(/^\d{6}$/)
    await hostPage.screenshot({ path: screenshotPath('collab-pdf-host-sharing') })
    await hostPage.locator('.collab-dialog').getByRole('button', { name: 'Close' }).click()

    // guest: a wrong PIN is refused, the right one opens the shared PDF in a new tab
    const guestFirst = await waitForPageWithUrl(guest.app, '://pdf/')
    const before = await pdfPages(guest.app)
    await guestFirst.locator('.qa-collab').click()
    await guestFirst.getByRole('tab', { name: 'Join' }).click()
    await guestFirst.getByLabel('Address').fill('127.0.0.1')
    const wrong = pinText === '000000' ? '111111' : '000000'
    await guestFirst.getByLabel('PIN (6 digits)').fill(wrong)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(guestFirst.locator('.collab-error')).toHaveText('That PIN is not right.')
    await guestFirst.getByLabel('PIN (6 digits)').fill(pinText)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()

    const guestPage = await newPdfPage(guest.app, before)
    await expect(guestPage.locator('.pdf-thumb')).toHaveCount(2)

    // guest inserts a blank page: the host sees it
    await thumbAction(guestPage, 1, 'Insert blank page')
    await expect(guestPage.locator('.pdf-thumb')).toHaveCount(3)
    await expect(hostPage.locator('.pdf-thumb')).toHaveCount(3)

    // host turns its first page: the guest sees it
    await thumbAction(hostPage, 1, 'Rotate right')
    await expect.poll(() => firstPageLandscape(guestPage)).toBe(true)

    // each sees where the other is, with the name
    await expect(
      hostPage.locator('.pdf-collab-tag', { hasText: 'Guest Jun' }).first(),
    ).toBeVisible()
    await expect(
      guestPage.locator('.pdf-collab-tag', { hasText: 'Host Mina' }).first(),
    ).toBeVisible()
    // the host has unsaved changes, the guest's copy never does
    await expect(hostPage.locator('.tb-save-pending')).toBeVisible()
    await expect(guestPage.locator('.tb-save-pending')).toHaveCount(0)
    await hostPage.screenshot({ path: screenshotPath('collab-pdf-host') })
    await guestPage.screenshot({ path: screenshotPath('collab-pdf-guest') })

    // undo on the guest takes back only the guest's blank page
    await guestPage.keyboard.press('ControlOrMeta+z')
    await expect(hostPage.locator('.pdf-thumb')).toHaveCount(2)
    expect(await firstPageLandscape(hostPage)).toBe(true)

    // a guest cannot save; the host saves everyone's work to its file
    await guestPage.keyboard.press('ControlOrMeta+s')
    await expect(guestPage.locator('.pdf-toast-notice')).toContainText(
      'During a session, the person sharing saves the file.',
    )
    await hostPage.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => savedRotation(shared)).toBe(90)
    await expect(hostPage.locator('.tb-save-pending')).toHaveCount(0)

    // the guest follows the saved file and keeps editing with the host
    await expect.poll(() => firstPageLandscape(guestPage)).toBe(true)
    await expect(guestPage.locator('.pdf-thumb')).toHaveCount(2)
    await thumbAction(guestPage, 2, 'Insert blank page')
    await expect(hostPage.locator('.pdf-thumb')).toHaveCount(3)

    // the host stops sharing: the guest is told and keeps an unsaved copy
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(guestPage.locator('.collab-notice')).toContainText('ended the session')
    await expect(guestPage.locator('.pdf-thumb')).toHaveCount(3)
    await expect(guestPage.locator('.tb-save-pending')).toBeVisible()
  } finally {
    await closeAndSaveVideo(guest, 'collab-pdf-guest')
    await closeAndSaveVideo(host, 'collab-pdf-host')
  }
})
