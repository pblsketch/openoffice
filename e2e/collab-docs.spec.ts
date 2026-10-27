import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { launchShell, closeAndSaveVideo, screenshotPath, waitForPageWithUrl } from './helpers'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

/** a plain two-paragraph .docx */
async function docxOf(paragraphs: string[]): Promise<Buffer> {
  const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${paragraphs.map(para).join('')}` +
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>',
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}

/** the body text of a saved .docx, one line per paragraph */
async function savedText(path: string): Promise<string> {
  const zip = await JSZip.loadAsync(await readFile(path))
  const xml = (await zip.file('word/document.xml')?.async('string')) ?? ''
  return xml
    .split('</w:p>')
    .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''))
    .join('\n')
}

/** every Word editor page of an app, in creation order */
async function docsPages(app: ElectronApplication): Promise<Page[]> {
  const pages: Page[] = []
  for (const candidate of app.windows()) {
    const href = await candidate.evaluate(() => window.location.href).catch(() => '')
    if (href.includes('://docs/')) pages.push(candidate)
  }
  return pages
}

async function newDocsPage(app: ElectronApplication, known: Page[]): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const fresh = (await docsPages(app)).find((page) => !known.includes(page))
    if (fresh) return fresh
    await app.waitForEvent('window', { timeout: 300 }).catch(() => {})
  }
  throw new Error('the guest tab never opened')
}

/** a paragraph's text without other people's carets or the page widgets */
const textOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const copy = element.cloneNode(true) as HTMLElement
      copy.querySelectorAll('.collab-caret, .ProseMirror-widget').forEach((node) => node.remove())
      return (copy.textContent ?? '').replace(/⁠/g, '')
    })

const BODY = '.doc-page[contenteditable="true"]'

test('two apps edit one Word document together over the LAN with a PIN', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'collab-docs-'))
  const shared = join(dir, 'plan.docx')
  const other = join(dir, 'other.docx')
  await writeFile(shared, await docxOf(['Plan', 'First line from the host.']))
  await writeFile(other, await docxOf(['Something else']))

  const host = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-docs-host',
    openFile: shared,
    settings: { collabProfile: { name: 'Host Mina', color: 1 } },
  })
  const guest = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-docs-guest',
    openFile: other,
    settings: { collabProfile: { name: 'Guest Jun', color: 3 } },
  })
  try {
    const hostPage = await waitForPageWithUrl(host.app, '://docs/')
    await expect(hostPage.locator(BODY)).toContainText('First line from the host.')

    // host: share, read the PIN
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Start sharing' }).click()
    const pinText = (await hostPage.locator('.collab-pin').innerText()).replace(/\D/g, '')
    expect(pinText).toMatch(/^\d{6}$/)
    await hostPage.screenshot({ path: screenshotPath('collab-docs-host-sharing') })
    await hostPage.locator('.collab-dialog').getByRole('button', { name: 'Close' }).click()

    // guest: a wrong PIN is refused, the right one opens the shared document in a new tab
    const guestFirst = await waitForPageWithUrl(guest.app, '://docs/')
    await expect(guestFirst.locator(BODY)).toContainText('Something else')
    const before = await docsPages(guest.app)
    await guestFirst.locator('.qa-collab').click()
    await guestFirst.getByRole('tab', { name: 'Join' }).click()
    await guestFirst.getByLabel('Address').fill('127.0.0.1')
    const wrong = pinText === '000000' ? '111111' : '000000'
    await guestFirst.getByLabel('PIN (6 digits)').fill(wrong)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(guestFirst.locator('.collab-error')).toHaveText('That PIN is not right.')
    await guestFirst.getByLabel('PIN (6 digits)').fill(pinText)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()

    const guestPage = await newDocsPage(guest.app, before)
    await expect(guestPage.locator(BODY)).toContainText('First line from the host.')
    await expect.poll(() => textOf(guestPage, `${BODY} p`)).toBe('Plan')

    // guest types: the host sees it, with the guest's caret and name
    await guestPage.locator(`${BODY} p`).last().click()
    await guestPage.keyboard.press('End')
    await guestPage.keyboard.type(' Guest was here.')
    await expect(hostPage.locator(BODY)).toContainText('Guest was here.')
    await expect(hostPage.locator('.collab-caret-label')).toHaveText('Guest Jun')

    // host types: the guest sees it
    await hostPage.locator(`${BODY} p`).first().click()
    await hostPage.keyboard.press('End')
    await hostPage.keyboard.type(' v2')
    await expect.poll(() => textOf(guestPage, `${BODY} p`)).toBe('Plan v2')
    await expect(guestPage.locator('.collab-caret-label')).toHaveText('Host Mina')
    await hostPage.screenshot({ path: screenshotPath('collab-docs-host') })
    await guestPage.screenshot({ path: screenshotPath('collab-docs-guest') })

    // undo on the guest takes back only the guest's own typing
    await guestPage.keyboard.press('Control+z')
    await expect.poll(() => textOf(hostPage, BODY)).not.toContain('Guest was here.')
    expect(await textOf(hostPage, `${BODY} p`)).toBe('Plan v2')

    // a guest cannot save; the host saves everyone's work to its file
    await guestPage.keyboard.press('Control+s')
    await expect(guestPage.locator('.app-toast')).toContainText(
      'During a session, the person sharing saves the file.',
    )
    await hostPage.keyboard.press('Control+s')
    await expect.poll(() => savedText(shared)).toContain('Plan v2')
    expect(await savedText(shared)).not.toContain('Guest was here.')

    // after the host's save both still edit the same document
    await guestPage.locator(`${BODY} p`).last().click()
    await guestPage.keyboard.press('End')
    await guestPage.keyboard.type(' Again.')
    await expect(hostPage.locator(BODY)).toContainText('Again.')

    // the host stops sharing: the guest is told and keeps an unsaved copy
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(guestPage.locator('.collab-notice')).toContainText('ended the session')
    expect(await textOf(guestPage, BODY)).toContain('Plan v2')
  } finally {
    await closeAndSaveVideo(guest, 'collab-docs-guest')
    await closeAndSaveVideo(host, 'collab-docs-host')
  }
})
