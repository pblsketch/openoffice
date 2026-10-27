import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, closeAndSaveVideo, screenshotPath, waitForPageWithUrl } from './helpers'

async function htmlPages(app: ElectronApplication): Promise<Page[]> {
  const pages: Page[] = []
  for (const candidate of app.windows()) {
    const href = await candidate.evaluate(() => window.location.href).catch(() => '')
    if (href.includes('://html/')) pages.push(candidate)
  }
  return pages
}

async function newHtmlPage(app: ElectronApplication, known: Page[]): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const fresh = (await htmlPages(app)).find((page) => !known.includes(page))
    if (fresh) return fresh
    await app.waitForEvent('window', { timeout: 300 }).catch(() => {})
  }
  throw new Error('the guest tab never opened')
}

/** the source text without other people's caret widgets */
const sourceOf = (page: Page) =>
  page
    .locator('.cm-content')
    .first()
    .evaluate((element) => {
      const copy = element.cloneNode(true) as HTMLElement
      copy.querySelectorAll('.cm-ySelectionCaret').forEach((caret) => caret.remove())
      return [...copy.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n')
    })

test('two apps edit one HTML page together over the LAN with a PIN', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'collab-html-'))
  const shared = join(dir, 'page.html')
  const other = join(dir, 'other.html')
  await writeFile(shared, '<!doctype html>\n<html><body>\n<h1>Hello</h1>\n</body></html>\n')
  await writeFile(other, '<!doctype html>\n<html><body><p>other</p></body></html>\n')

  const host = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-html-host',
    openFile: shared,
    settings: { collabProfile: { name: 'Host Mina', color: 1 } },
  })
  const guest = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-html-guest',
    openFile: other,
    settings: { collabProfile: { name: 'Guest Jun', color: 3 } },
  })
  try {
    const hostPage = await waitForPageWithUrl(host.app, '://html/')
    await expect(hostPage.locator('.cm-content')).toContainText('<h1>Hello</h1>')
    // the page opens on its preview; the source pane is where these edits are typed
    await hostPage.evaluate(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', ctrlKey: true })),
    )
    await expect(hostPage.locator('.cm-content')).toBeVisible()

    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Start sharing' }).click()
    const pin = (await hostPage.locator('.collab-pin').innerText()).replace(/\D/g, '')
    await hostPage.locator('.collab-dialog').getByRole('button', { name: 'Close' }).click()

    const guestFirst = await waitForPageWithUrl(guest.app, '://html/')
    await guestFirst.evaluate(() => localStorage.setItem('htmlapp.viewMode', 'split'))
    const before = await htmlPages(guest.app)
    await guestFirst.locator('.qa-collab').click()
    await guestFirst.getByRole('tab', { name: 'Join' }).click()
    await guestFirst.getByLabel('Address').fill('127.0.0.1')
    await guestFirst.getByLabel('PIN (6 digits)').fill(pin)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()

    const guestPage = await newHtmlPage(guest.app, before)
    await expect.poll(() => sourceOf(guestPage)).toContain('<h1>Hello</h1>')

    // guest types inside the heading; the host's source follows
    await guestPage.locator('.cm-line', { hasText: '<h1>Hello</h1>' }).click()
    await guestPage.keyboard.press('End')
    await guestPage.keyboard.type('<p>from guest</p>')
    await expect.poll(() => sourceOf(hostPage)).toContain('<p>from guest</p>')
    await expect(hostPage.locator('.cm-ySelectionInfo')).toHaveText('Guest Jun')
    // the host's preview follows the shared source as well
    await expect(hostPage.frameLocator('iframe.preview-frame').locator('body')).toContainText(
      'from guest',
    )

    // host types; the guest's source follows
    await hostPage.locator('.cm-line', { hasText: '<body>' }).first().click()
    await hostPage.keyboard.press('End')
    await hostPage.keyboard.type('<!-- host -->')
    await expect.poll(() => sourceOf(guestPage)).toContain('<!-- host -->')
    await hostPage.screenshot({ path: screenshotPath('collab-html-host') })
    await guestPage.screenshot({ path: screenshotPath('collab-html-guest') })

    // undo on the guest takes back only the guest's own typing
    await guestPage.locator('.cm-content').click()
    await guestPage.keyboard.press('Control+z')
    await expect.poll(() => sourceOf(hostPage)).not.toContain('<p>from guest</p>')
    expect(await sourceOf(hostPage)).toContain('<!-- host -->')

    // the host saves everyone's work
    await hostPage.keyboard.press('Control+s')
    await expect.poll(() => readFile(shared, 'utf8')).toContain('<!-- host -->')

    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(guestPage.locator('.collab-notice')).toContainText('ended the session')
  } finally {
    await closeAndSaveVideo(guest, 'collab-html-guest')
    await closeAndSaveVideo(host, 'collab-html-host')
  }
})
