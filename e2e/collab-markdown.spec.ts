import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, closeAndSaveVideo, screenshotPath, waitForPageWithUrl } from './helpers'

/** every markdown editor page of an app, in creation order */
async function markdownPages(app: ElectronApplication): Promise<Page[]> {
  const pages: Page[] = []
  for (const candidate of app.windows()) {
    const href = await candidate.evaluate(() => window.location.href).catch(() => '')
    if (href.includes('://markdown/')) pages.push(candidate)
  }
  return pages
}

async function newMarkdownPage(app: ElectronApplication, known: Page[]): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const fresh = (await markdownPages(app)).find((page) => !known.includes(page))
    if (fresh) return fresh
    await app.waitForEvent('window', { timeout: 300 }).catch(() => {})
  }
  throw new Error('the guest tab never opened')
}

/** the document's text without other people's caret labels */
const textOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const copy = element.cloneNode(true) as HTMLElement
      copy.querySelectorAll('.collab-caret').forEach((caret) => caret.remove())
      return (copy.textContent ?? '').replace(/⁠/g, '')
    })

test('two apps edit one Markdown file together over the LAN with a PIN', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'collab-md-'))
  const shared = join(dir, 'plan.md')
  const other = join(dir, 'other.md')
  await writeFile(shared, '# Plan\n\nFirst line from the host.\n')
  await writeFile(other, '# Something else\n')

  const host = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-markdown-host',
    openFile: shared,
    settings: { collabProfile: { name: 'Host Mina', color: 1 } },
  })
  const guest = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-markdown-guest',
    openFile: other,
    settings: { collabProfile: { name: 'Guest Jun', color: 3 } },
  })
  try {
    const hostPage = await waitForPageWithUrl(host.app, '://markdown/')
    await expect(hostPage.locator('.doc-editor h1')).toHaveText('Plan')

    // host: share, read the PIN
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Start sharing' }).click()
    const pinText = (await hostPage.locator('.collab-pin').innerText()).replace(/\D/g, '')
    expect(pinText).toMatch(/^\d{6}$/)
    await hostPage.screenshot({ path: screenshotPath('collab-markdown-host-sharing') })
    await hostPage.locator('.collab-dialog').getByRole('button', { name: 'Close' }).click()

    // guest: a wrong PIN is refused, the right one opens the shared document in a new tab
    const guestFirst = await waitForPageWithUrl(guest.app, '://markdown/')
    const before = await markdownPages(guest.app)
    await guestFirst.locator('.qa-collab').click()
    await guestFirst.getByRole('tab', { name: 'Join' }).click()
    await guestFirst.getByLabel('Address').fill('127.0.0.1')
    const wrong = pinText === '000000' ? '111111' : '000000'
    await guestFirst.getByLabel('PIN (6 digits)').fill(wrong)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(guestFirst.locator('.collab-error')).toHaveText('That PIN is not right.')
    await guestFirst.getByLabel('PIN (6 digits)').fill(pinText)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()

    const guestPage = await newMarkdownPage(guest.app, before)
    await expect.poll(() => textOf(guestPage, '.doc-editor h1')).toBe('Plan')
    await expect(guestPage.locator('.doc-editor')).toContainText('First line from the host.')

    // guest types: the host sees it, with the guest's caret and name
    await guestPage.locator('.doc-editor p').last().click()
    await guestPage.keyboard.press('End')
    await guestPage.keyboard.type(' Guest was here.')
    await expect(hostPage.locator('.doc-editor')).toContainText('Guest was here.')
    await expect(hostPage.locator('.collab-caret-label')).toHaveText('Guest Jun')

    // host types: the guest sees it
    await hostPage.locator('.doc-editor h1').click()
    await hostPage.keyboard.press('End')
    await hostPage.keyboard.type(' v2')
    await expect.poll(() => textOf(guestPage, '.doc-editor h1')).toBe('Plan v2')
    await expect(guestPage.locator('.collab-caret-label')).toHaveText('Host Mina')
    await hostPage.screenshot({ path: screenshotPath('collab-markdown-host') })
    await guestPage.screenshot({ path: screenshotPath('collab-markdown-guest') })

    // undo on the guest takes back only the guest's own typing
    await guestPage.keyboard.press('Control+z')
    await expect.poll(() => textOf(hostPage, '.doc-editor')).not.toContain('Guest was here.')
    expect(await textOf(hostPage, '.doc-editor h1')).toBe('Plan v2')

    // a guest cannot save; the host saves everyone's work to its file
    await guestPage.keyboard.press('Control+s')
    await hostPage.keyboard.press('Control+s')
    await expect.poll(async () => readFile(shared, 'utf8')).toContain('# Plan v2')

    // the host stops sharing: the guest is told and keeps an unsaved copy
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(guestPage.locator('.collab-notice')).toContainText('ended the session')
    expect(await textOf(guestPage, '.doc-editor')).toContain('Plan v2')
  } finally {
    await closeAndSaveVideo(guest, 'collab-markdown-guest')
    await closeAndSaveVideo(host, 'collab-markdown-host')
  }
})
