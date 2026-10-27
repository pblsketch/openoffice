import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildEditFixture } from '../apps/sheets/tests/fixture-builder'
import { launchShell, closeAndSaveVideo, screenshotPath, waitForPageWithUrl } from './helpers'

// the preload exposes window.__genofficeDebug only under this env var: cells are
// read through Univer's Facade, and the painted peer names through a debug list
process.env.GENOFFICE_DEBUG_HOOKS = '1'

/** every sheets editor page of an app, in creation order */
async function sheetsPages(app: ElectronApplication): Promise<Page[]> {
  const pages: Page[] = []
  for (const candidate of app.windows()) {
    const href = await candidate.evaluate(() => window.location.href).catch(() => '')
    if (href.includes('://sheets/')) pages.push(candidate)
  }
  return pages
}

async function newSheetsPage(app: ElectronApplication, known: Page[]): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const fresh = (await sheetsPages(app)).find((page) => !known.includes(page))
    if (fresh) return fresh
    await app.waitForEvent('window', { timeout: 300 }).catch(() => {})
  }
  throw new Error('the guest tab never opened')
}

/** the fixture's only sheet is "Data"; its tab is DOM, the cells are canvas */
async function waitForWorkbook(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.body.textContent?.includes('Data') &&
      !document.querySelector('.workbook-opening-screen') &&
      Boolean((window as unknown as { __genofficeDebug?: unknown }).__genofficeDebug),
    null,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(1_000)
}

interface FacadeRange {
  getValue(): unknown
  activate(): unknown
  getCellRect(): { x: number; y: number; width: number; height: number }
}

function cell(page: Page, row: number, column: number) {
  return page.evaluateHandle(
    ([r, c]) => {
      const debug = (window as unknown as Record<string, unknown>).__genofficeDebug as {
        univerAPI: {
          getActiveWorkbook(): {
            getActiveSheet(): {
              getRange(row: number, column: number, rows: number, columns: number): FacadeRange
            }
          }
        }
      }
      return debug.univerAPI.getActiveWorkbook().getActiveSheet().getRange(r, c, 1, 1)
    },
    [row, column] as const,
  )
}

/** the Univer unit on screen: a reopened workbook gets a new one */
const unitOf = (page: Page) =>
  page.evaluate(() =>
    (
      (window as unknown as Record<string, unknown>).__genofficeDebug as {
        univerAPI: { getActiveWorkbook(): { getId(): string } }
      }
    ).univerAPI
      .getActiveWorkbook()
      .getId(),
  )

const valueAt = async (page: Page, row: number, column: number): Promise<unknown> =>
  (await cell(page, row, column)).evaluate((range) => range.getValue())

/** click the cell on the canvas and type into it, as a person does */
async function typeInto(page: Page, row: number, column: number, text: string): Promise<void> {
  const rect = await (await cell(page, row, column)).evaluate((range) => range.getCellRect())
  const grid = await page.evaluate(() => {
    for (const canvas of document.querySelectorAll('canvas')) {
      const box = canvas.getBoundingClientRect()
      if (box.width > 500 && box.height > 300) return { x: box.x, y: box.y }
    }
    return null
  })
  if (!grid) throw new Error('worksheet canvas not found')
  await page.mouse.click(grid.x + rect.x + rect.width / 2, grid.y + rect.y + rect.height / 2)
  await page.keyboard.type(text, { delay: 30 })
  await page.keyboard.press('Enter')
}

/**
 * File > Save as the app menu sends it, to this page's tab. Both of the
 * guest's tabs are sheets pages, so the page is told apart by a title mark.
 */
async function sendMenuAction(app: ElectronApplication, page: Page, action: string) {
  const mark = `menu-target-${Math.random().toString(36).slice(2)}`
  await page.evaluate((title) => {
    document.title = title
  }, mark)
  await app.evaluate(
    ({ webContents }, [title, menuAction]) => {
      webContents
        .getAllWebContents()
        .find((contents) => contents.getTitle() === title)
        ?.send('menu:action', menuAction)
    },
    [mark, action] as const,
  )
}

const paintedPeers = (page: Page) =>
  page.evaluate(
    () =>
      ((window as unknown as Record<string, unknown>).__genofficeCollabPresence as
        string[] | undefined) ?? [],
  )

/** every string the saved workbook holds, shared or inline */
async function savedStrings(path: string): Promise<string> {
  const zip = await JSZip.loadAsync(await readFile(path))
  const parts = await Promise.all(
    ['xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml'].map(
      async (name) => (await zip.file(name)?.async('string')) ?? '',
    ),
  )
  return parts.join('\n')
}

test('two apps edit one workbook together over the LAN with a PIN', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'collab-sheets-'))
  const shared = join(dir, 'budget.xlsx')
  const other = join(dir, 'other.xlsx')
  await writeFile(shared, await buildEditFixture())
  await writeFile(other, await buildEditFixture())

  const host = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-sheets-host',
    openFile: shared,
    settings: { collabProfile: { name: 'Host Mina', color: 1 } },
  })
  const guest = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-sheets-guest',
    openFile: other,
    settings: { collabProfile: { name: 'Guest Jun', color: 3 } },
  })
  try {
    const hostPage = await waitForPageWithUrl(host.app, '://sheets/')
    await waitForWorkbook(hostPage)
    expect(await valueAt(hostPage, 0, 0)).toBe('Hello')

    // host: share, read the PIN
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Start sharing' }).click()
    const pinText = (await hostPage.locator('.collab-pin').innerText()).replace(/\D/g, '')
    expect(pinText).toMatch(/^\d{6}$/)
    await hostPage.screenshot({ path: screenshotPath('collab-sheets-host-sharing') })
    await hostPage.locator('.collab-dialog').getByRole('button', { name: 'Close' }).click()

    // guest: a wrong PIN is refused, the right one opens the shared workbook in a new tab
    const guestFirst = await waitForPageWithUrl(guest.app, '://sheets/')
    await waitForWorkbook(guestFirst)
    const before = await sheetsPages(guest.app)
    await guestFirst.locator('.qa-collab').click()
    await guestFirst.getByRole('tab', { name: 'Join' }).click()
    await guestFirst.getByLabel('Address').fill('127.0.0.1')
    const wrong = pinText === '000000' ? '111111' : '000000'
    await guestFirst.getByLabel('PIN (6 digits)').fill(wrong)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(guestFirst.locator('.collab-error')).toHaveText('That PIN is not right.')
    await guestFirst.getByLabel('PIN (6 digits)').fill(pinText)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()

    const guestPage = await newSheetsPage(guest.app, before)
    await waitForWorkbook(guestPage)
    expect(await valueAt(guestPage, 0, 0)).toBe('Hello')
    expect(await valueAt(guestPage, 0, 2)).toBe(5)

    // guest types: the host sees it, and the guest's place with its name
    await typeInto(guestPage, 1, 0, 'Guest was here')
    await expect.poll(() => valueAt(hostPage, 1, 0)).toBe('Guest was here')
    await expect.poll(() => paintedPeers(hostPage)).toEqual(['Guest Jun'])

    // host types: the guest sees it
    await typeInto(hostPage, 3, 3, 'Host typed')
    await expect.poll(() => valueAt(guestPage, 3, 3)).toBe('Host typed')
    await expect.poll(() => paintedPeers(guestPage)).toEqual(['Host Mina'])
    await hostPage.screenshot({ path: screenshotPath('collab-sheets-host') })
    await guestPage.screenshot({ path: screenshotPath('collab-sheets-guest') })

    // a guest cannot save: the person sharing saves the file
    await sendMenuAction(guest.app, guestPage, 'save')
    await expect(guestPage.locator('.app-toast')).toContainText(
      'During a session, the person sharing saves the file.',
    )

    // the host saves everyone's work to its file
    const guestUnit = await unitOf(guestPage)
    await sendMenuAction(host.app, hostPage, 'save')
    await expect.poll(() => savedStrings(shared), { timeout: 20_000 }).toContain('Guest was here')
    expect(await savedStrings(shared)).toContain('Host typed')

    // after the save the guest reloads the host's new bytes; then editing flows again
    await expect.poll(() => unitOf(guestPage), { timeout: 20_000 }).not.toBe(guestUnit)
    await waitForWorkbook(guestPage)
    await typeInto(guestPage, 4, 1, 'After the save')
    await expect.poll(() => valueAt(hostPage, 4, 1)).toBe('After the save')

    // the host stops sharing: the guest is told and keeps an unsaved copy
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(guestPage.locator('.collab-notice')).toContainText('ended the session')
    expect(await valueAt(guestPage, 1, 0)).toBe('Guest was here')
  } finally {
    await closeAndSaveVideo(guest, 'collab-sheets-guest')
    await closeAndSaveVideo(host, 'collab-sheets-host')
  }
})
