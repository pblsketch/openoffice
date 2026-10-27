import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createXmindDocumentFromOutline, openXmind, sheetsToOutline } from '@genoffice/xmind-engine'
import { launchShell, closeAndSaveVideo, screenshotPath, waitForPageWithUrl } from './helpers'

/** every mind map editor page of an app, in creation order */
async function mindmapPages(app: ElectronApplication): Promise<Page[]> {
  const pages: Page[] = []
  for (const candidate of app.windows()) {
    const href = await candidate.evaluate(() => window.location.href).catch(() => '')
    if (href.includes('://mindmap/')) pages.push(candidate)
  }
  return pages
}

async function newMindmapPage(app: ElectronApplication, known: Page[]): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const fresh = (await mindmapPages(app)).find((page) => !known.includes(page))
    if (fresh) return fresh
    await app.waitForEvent('window', { timeout: 300 }).catch(() => {})
  }
  throw new Error('the guest tab never opened')
}

async function writeMap(path: string, outline: string): Promise<void> {
  const document = await createXmindDocumentFromOutline(outline, { untitled: 'Untitled' })
  await writeFile(path, await document.save())
}

const topicTitles = (map: Page): Promise<string[]> =>
  map
    .locator('.mm-sheet-host:not([hidden]) me-tpc > .text')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''))

const topic = (map: Page, title: string) =>
  map.locator('.mm-sheet-host:not([hidden]) me-tpc', { hasText: title }).first()

/** Tab on a topic adds a branch under it; the title is typed into the edit box. */
async function addBranch(map: Page, under: string, title: string): Promise<void> {
  await topic(map, under).click()
  await map.keyboard.press('Tab')
  await map.waitForSelector('#input-box')
  await map.keyboard.type(title)
  await map.keyboard.press('Enter')
  await map.waitForSelector('#input-box', { state: 'detached' })
  await expect.poll(() => topicTitles(map)).toContain(title)
}

async function outlineOf(path: string): Promise<string> {
  const opened = await openXmind(new Uint8Array(await readFile(path)))
  return opened.status === 'ok' ? sheetsToOutline(opened.document.sheets) : ''
}

test('two apps edit one mind map together over the LAN with a PIN', async () => {
  test.setTimeout(240_000)
  const dir = await mkdtemp(join(tmpdir(), 'collab-mindmap-'))
  const shared = join(dir, 'plan.xmind')
  const other = join(dir, 'other.xmind')
  await writeMap(shared, '# Plan\n\n- Plan\n  - First idea\n  - Second idea\n')
  await writeMap(other, '# Something else\n\n- Something else\n')

  const host = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-mindmap-host',
    openFile: shared,
    settings: { collabProfile: { name: 'Host Mina', color: 1 } },
  })
  const guest = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-mindmap-guest',
    openFile: other,
    settings: { collabProfile: { name: 'Guest Jun', color: 3 } },
  })
  try {
    const hostPage = await waitForPageWithUrl(host.app, '://mindmap/')
    await expect.poll(() => topicTitles(hostPage)).toContain('First idea')

    // host: share, read the PIN
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Start sharing' }).click()
    const pinText = (await hostPage.locator('.collab-pin').innerText()).replace(/\D/g, '')
    expect(pinText).toMatch(/^\d{6}$/)
    await hostPage.screenshot({ path: screenshotPath('collab-mindmap-host-sharing') })
    await hostPage.locator('.collab-dialog').getByRole('button', { name: 'Close' }).click()

    // guest: a wrong PIN is refused, the right one opens the shared map in a new tab
    const guestFirst = await waitForPageWithUrl(guest.app, '://mindmap/')
    const before = await mindmapPages(guest.app)
    await guestFirst.locator('.qa-collab').click()
    await guestFirst.getByRole('tab', { name: 'Join' }).click()
    await guestFirst.getByLabel('Address').fill('127.0.0.1')
    const wrong = pinText === '000000' ? '111111' : '000000'
    await guestFirst.getByLabel('PIN (6 digits)').fill(wrong)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(guestFirst.locator('.collab-error')).toHaveText('That PIN is not right.')
    await guestFirst.getByLabel('PIN (6 digits)').fill(pinText)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()

    const guestPage = await newMindmapPage(guest.app, before)
    await expect.poll(() => topicTitles(guestPage)).toEqual(await topicTitles(hostPage))
    // the copy is the host's map, not an unsaved document of this PC
    await expect(guestPage.locator('.mm-save-status')).toHaveAttribute('data-dirty', 'false')

    // guest adds a branch: the host sees it, and where the guest is, with the name
    await addBranch(guestPage, 'First idea', 'Guest idea')
    await expect.poll(() => topicTitles(hostPage)).toContain('Guest idea')
    await expect(hostPage.locator('.mm-collab-name')).toHaveText('Guest Jun')

    // host adds a branch: the guest sees it
    await addBranch(hostPage, 'Second idea', 'Host idea')
    await expect.poll(() => topicTitles(guestPage)).toContain('Host idea')
    await expect(guestPage.locator('.mm-collab-name')).toHaveText('Host Mina')
    await hostPage.screenshot({ path: screenshotPath('collab-mindmap-host') })
    await guestPage.screenshot({ path: screenshotPath('collab-mindmap-guest') })

    // undo on the guest never takes back the host's branch
    await topic(guestPage, 'Guest idea').click()
    await guestPage.keyboard.press('Control+z')
    await guestPage.waitForTimeout(500)
    expect(await topicTitles(hostPage)).toContain('Host idea')
    expect(await topicTitles(guestPage)).toContain('Host idea')

    // a guest cannot save; the host saves everyone's work to its file
    await guestPage.keyboard.press('Control+s')
    await expect(guestPage.locator('.collab-notice')).toContainText(
      'During a session, the person sharing saves the file.',
    )
    await expect(hostPage.locator('.mm-save-status')).toHaveAttribute('data-dirty', 'true')
    await hostPage.keyboard.press('Control+s')
    await expect.poll(() => outlineOf(shared)).toContain('Guest idea')
    expect(await outlineOf(shared)).toContain('Host idea')

    // the host stops sharing: the guest is told and keeps an unsaved copy
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(guestPage.locator('.collab-notice')).toContainText('ended the session')
    expect(await topicTitles(guestPage)).toContain('Host idea')
    await expect(guestPage.locator('.mm-save-status')).toHaveAttribute('data-dirty', 'true')
  } finally {
    await closeAndSaveVideo(guest, 'collab-mindmap-guest')
    await closeAndSaveVideo(host, 'collab-mindmap-host')
  }
})
