import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { launchShell, closeAndSaveVideo, screenshotPath, waitForPageWithUrl } from './helpers'

const CHAPTER = 'OEBPS/text/one.xhtml'

const xhtml = (title: string, body: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' +
  '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n' +
  `<head><title>${title}</title></head>\n<body>\n${body}\n</body>\n</html>\n`

/** A small two-chapter EPUB 3 book. */
async function book(id: number, title: string, first: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
      '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n' +
      '</container>\n',
  )
  zip.file(
    'OEBPS/content.opf',
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">\n' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
      `<dc:identifier id="uid">urn:uuid:${id}0000000-0000-4000-8000-000000000000</dc:identifier>\n` +
      `<dc:title>${title}</dc:title>\n<dc:language>en</dc:language>\n` +
      '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>\n' +
      '</metadata>\n<manifest>\n' +
      '<item id="one" href="text/one.xhtml" media-type="application/xhtml+xml"/>\n' +
      '<item id="two" href="text/two.xhtml" media-type="application/xhtml+xml"/>\n' +
      '</manifest>\n<spine>\n<itemref idref="one"/>\n<itemref idref="two"/>\n</spine>\n</package>\n',
  )
  zip.file(CHAPTER, xhtml('One', first))
  zip.file('OEBPS/text/two.xhtml', xhtml('Two', '<h1>Chapter Two</h1>\n<p>Third paragraph.</p>'))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

async function chapterText(path: string): Promise<string> {
  const zip = await JSZip.loadAsync(await readFile(path))
  return zip.file(CHAPTER)!.async('string')
}

/** every EPUB editor page of an app, in creation order */
async function epubPages(app: ElectronApplication): Promise<Page[]> {
  const pages: Page[] = []
  for (const candidate of app.windows()) {
    const href = await candidate.evaluate(() => window.location.href).catch(() => '')
    if (href.includes('://epub/')) pages.push(candidate)
  }
  return pages
}

async function newEpubPage(app: ElectronApplication, known: Page[]): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const fresh = (await epubPages(app)).find((page) => !known.includes(page))
    if (fresh) return fresh
    await app.waitForEvent('window', { timeout: 300 }).catch(() => {})
  }
  throw new Error('the guest tab never opened')
}

const chapterFrame = (page: Page) => page.frameLocator('iframe.epub-frame')

test('two apps edit one EPUB book together over the LAN with a PIN', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'collab-epub-'))
  const shared = join(dir, 'novel.epub')
  const other = join(dir, 'other.epub')
  await writeFile(
    shared,
    await book(
      1,
      'Shared Book',
      '<h1>Chapter One</h1>\n<p>First paragraph from the host.</p>\n<p>Second paragraph.</p>',
    ),
  )
  await writeFile(other, await book(2, 'Other Book', '<h1>Something else</h1>\n<p>Other.</p>'))

  const host = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-epub-host',
    openFile: shared,
    settings: { collabProfile: { name: 'Host Mina', color: 1 } },
  })
  const guest = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-epub-guest',
    openFile: other,
    settings: { collabProfile: { name: 'Guest Jun', color: 3 } },
  })
  try {
    const hostPage = await waitForPageWithUrl(host.app, '://epub/')
    const hostFrame = chapterFrame(hostPage)
    await expect(hostFrame.locator('h1')).toHaveText('Chapter One')

    // host: share, read the PIN
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Start sharing' }).click()
    const pin = (await hostPage.locator('.collab-pin').innerText()).replace(/\D/g, '')
    expect(pin).toMatch(/^\d{6}$/)
    await hostPage.screenshot({ path: screenshotPath('collab-epub-host-sharing') })
    await hostPage.locator('.collab-dialog').getByRole('button', { name: 'Close' }).click()

    // guest: a wrong PIN is refused, the right one opens the shared book in a new tab
    const guestFirst = await waitForPageWithUrl(guest.app, '://epub/')
    await expect(chapterFrame(guestFirst).locator('h1')).toHaveText('Something else')
    const before = await epubPages(guest.app)
    await guestFirst.locator('.qa-collab').click()
    await guestFirst.getByRole('tab', { name: 'Join' }).click()
    await guestFirst.getByLabel('Address').fill('127.0.0.1')
    await guestFirst.getByLabel('PIN (6 digits)').fill(pin === '000000' ? '111111' : '000000')
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(guestFirst.locator('.collab-error')).toHaveText('That PIN is not right.')
    await guestFirst.getByLabel('PIN (6 digits)').fill(pin)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()

    const guestPage = await newEpubPage(guest.app, before)
    const guestFrame = chapterFrame(guestPage)
    await expect(guestFrame.locator('h1')).toHaveText('Chapter One')
    await expect(guestFrame.locator('body')).toContainText('First paragraph from the host.')

    // host types in the heading: the guest sees it, with the host's caret and name
    await hostFrame.locator('h1').click()
    await hostPage.keyboard.press('End')
    await hostPage.keyboard.type(' v2')
    await expect(guestFrame.locator('h1')).toHaveText('Chapter One v2')
    await expect(guestFrame.locator('.collab-caret-label')).toHaveText('Host Mina')

    // guest types: the host sees it, with the guest's caret and name
    await guestFrame.locator('p', { hasText: 'First paragraph' }).click()
    await guestPage.keyboard.press('End')
    await guestPage.keyboard.type(' Guest was here.')
    await expect(hostFrame.locator('body')).toContainText('from the host. Guest was here.')
    await expect(hostFrame.locator('.collab-caret-label')).toHaveText('Guest Jun')
    await hostPage.screenshot({ path: screenshotPath('collab-epub-host') })
    await guestPage.screenshot({ path: screenshotPath('collab-epub-guest') })

    // undo on the guest takes back only the guest's own typing
    await guestPage.keyboard.press('Control+z')
    await expect(hostFrame.locator('body')).not.toContainText('Guest was here.')
    await expect(hostFrame.locator('h1')).toHaveText('Chapter One v2')

    // the guest edits again; it cannot save, the host saves everyone's work to its file
    await guestFrame.locator('p', { hasText: 'Second paragraph' }).click()
    await guestPage.keyboard.press('End')
    await guestPage.keyboard.type(' Second visit.')
    await expect(hostFrame.locator('body')).toContainText('Second paragraph. Second visit.')
    await guestPage.keyboard.press('Control+s')
    await expect(guestPage.locator('.collab-notice')).toContainText(
      'the person sharing saves the file',
    )
    await hostFrame.locator('h1').click()
    await hostPage.keyboard.press('Control+s')
    await expect.poll(() => chapterText(shared)).toContain('<h1>Chapter One v2</h1>')
    const saved = await chapterText(shared)
    expect(saved).toContain('<p>Second paragraph. Second visit.</p>')
    expect(saved).not.toContain('Guest was here.')

    // the host stops sharing: the guest is told and keeps the book as an unsaved copy
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(guestPage.locator('.collab-notice')).toContainText('ended the session')
    await expect(guestFrame.locator('h1')).toHaveText('Chapter One v2')
    await expect(guestFrame.locator('body')).toContainText('Second paragraph. Second visit.')
    await expect(guestPage.locator('.epub-status-dirty')).toBeVisible()
  } finally {
    await closeAndSaveVideo(guest, 'collab-epub-guest')
    await closeAndSaveVideo(host, 'collab-epub-host')
  }
})
