import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeAndSaveVideo, launchShell, screenshotPath, waitForPageWithUrl } from './helpers'

/**
 * Internal links in the Markdown editor, on the built app: wiki links are
 * decorated, an embedded vault picture is served and shown, Ctrl+click on a
 * same-note heading link scrolls to it, Ctrl+click on a wiki link opens the
 * other note in its own tab at the linked heading, and `[[` completes a note
 * name that then saves as plain `[[…]]` text while every other byte stays.
 *
 * Nothing here sends to an AI: the test never types into the AI panel.
 */

/** a 2x2 opaque PNG, built here so its checksums are right */
function tinyPng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(2, 0)
  header.writeUInt32BE(2, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // truecolor
  // each row: filter byte 0 and two RGB pixels
  const rows = Buffer.from([0, 200, 40, 40, 200, 40, 40, 0, 40, 40, 200, 40, 40, 200])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
const PNG = tinyPng()

const PLAN = [
  '# Plan',
  '',
  'Next: [[Tasks#Due]] and [[#Second]].',
  '',
  '![[pic.png|120]]',
  '',
  'Type here',
  '',
  ...Array.from({ length: 40 }, (_, i) => `Filler line ${i + 1} keeps the second heading low.\n`),
  '## Second',
  '',
  ...Array.from({ length: 40 }, (_, i) => `After line ${i + 1} gives room to scroll.\n`),
].join('\n')

const TASKS = [
  '# Tasks',
  '',
  ...Array.from({ length: 40 }, (_, i) => `Task ${i + 1}\n`),
  '## Due',
  '',
  ...Array.from({ length: 40 }, (_, i) => `Due item ${i + 1}\n`),
].join('\n')

/** the Markdown editor page whose first heading reads `title` */
async function markdownPageTitled(app: ElectronApplication, title: string): Promise<Page> {
  await expect
    .poll(
      async () => {
        for (const candidate of app.windows()) {
          const h1 = await candidate
            .evaluate(() =>
              location.href.includes('://markdown/')
                ? (document.querySelector('.doc-editor h1')?.textContent ?? null)
                : null,
            )
            .catch(() => null)
          if (h1 === title) return true
        }
        return false
      },
      { timeout: 30_000 },
    )
    .toBe(true)
  for (const candidate of app.windows()) {
    const h1 = await candidate
      .evaluate(() => document.querySelector('.doc-editor h1')?.textContent ?? null)
      .catch(() => null)
    if (h1 === title) return candidate
  }
  throw new Error(`no Markdown page titled ${title}`)
}

/** the shell window: the one with the tab strip */
async function shellPage(app: ElectronApplication): Promise<Page> {
  for (const candidate of app.windows()) {
    const hasTabs = await candidate
      .evaluate(() => document.querySelector('.tab-bar') !== null)
      .catch(() => false)
    if (hasTabs) return candidate
  }
  throw new Error('no shell window')
}

/** the heading reading `text` lies inside the editor's scroll area */
const headingInView = (page: Page, text: string) =>
  page.evaluate((wanted) => {
    const scroller = document.querySelector('.editor-scroll')
    const heading = [...document.querySelectorAll('.doc-editor h2')].find(
      (h) => h.textContent === wanted,
    )
    if (!scroller || !heading) return false
    const box = scroller.getBoundingClientRect()
    const rect = heading.getBoundingClientRect()
    return rect.top >= box.top && rect.bottom <= box.top + box.height / 2
  }, text)

/** text of the block holding the caret */
const caretBlock = (page: Page) =>
  page.evaluate(() => {
    const node = window.getSelection()?.anchorNode
    const element = node instanceof Element ? node : node?.parentElement
    return element?.closest('h1, h2, h3, p, li')?.textContent ?? null
  })

test('markdown internal links: decorate, embed, follow, complete', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-md-links-'))
  const vault = join(dir, 'vault')
  await mkdir(join(vault, '.obsidian'), { recursive: true })
  await mkdir(join(vault, 'notes'), { recursive: true })
  await mkdir(join(vault, 'files'), { recursive: true })
  const planPath = join(vault, 'notes', 'Plan.md')
  await writeFile(planPath, PLAN)
  await writeFile(join(vault, 'Tasks.md'), TASKS)
  await writeFile(join(vault, 'notes', 'Other.md'), '# Other\n')
  await writeFile(join(vault, 'files', 'pic.png'), PNG)

  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'markdown-internal-links',
    openFile: planPath,
  })
  const { app } = launched
  try {
    const plan = await waitForPageWithUrl(app, '://markdown/')
    await expect(plan.locator('.doc-editor h1')).toHaveText('Plan')
    const shell = await shellPage(app)
    const editorTabs = shell.locator('.tab-bar .tab-item:not(.tab-home)')
    await expect(editorTabs).toHaveCount(1)

    // decorations and the embedded picture from another vault folder
    await expect(plan.locator('.doc-editor .wiki-link')).toHaveCount(3)
    const picture = plan.locator('.doc-editor .wiki-embed-image img')
    await expect(picture).toHaveCount(1)
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2)
    await expect(picture).toHaveAttribute('width', '120')

    // Ctrl+click a same-note heading link
    await plan.locator('.doc-editor .wiki-link', { hasText: '[[#Second]]' }).click({
      modifiers: ['Control'],
    })
    await expect.poll(() => caretBlock(plan)).toBe('Second')
    await expect.poll(() => headingInView(plan, 'Second')).toBe(true)
    await plan.screenshot({ path: screenshotPath('markdown-internal-links-heading') })

    // a plain click edits instead of following
    await plan.locator('.doc-editor .wiki-link', { hasText: '[[Tasks#Due]]' }).click()
    await expect(editorTabs).toHaveCount(1)

    // Ctrl+click a wiki link to another note: its tab opens at the heading
    await plan.locator('.doc-editor .wiki-link', { hasText: '[[Tasks#Due]]' }).click({
      modifiers: ['Control'],
    })
    await expect(editorTabs).toHaveCount(2)
    const tasks = await markdownPageTitled(app, 'Tasks')
    await expect.poll(() => caretBlock(tasks)).toBe('Due')
    await expect.poll(() => headingInView(tasks, 'Due')).toBe(true)
    await tasks.screenshot({ path: screenshotPath('markdown-internal-links-other-note') })

    // back to Plan: `[[` completes a note name
    await shell.locator('.tab-bar .tab-item', { hasText: 'Plan' }).click()
    await plan.locator('.doc-editor p', { hasText: 'Type here' }).click()
    await plan.keyboard.press('End')
    await plan.keyboard.type(' [[Oth')
    const menu = plan.locator('.note-link-menu')
    await expect(menu.locator('.slash-item')).toHaveCount(1)
    await expect(menu.locator('.note-link-name')).toHaveText('Other')
    await plan.screenshot({ path: screenshotPath('markdown-internal-links-complete') })
    await plan.keyboard.press('Enter')
    await expect(menu).toHaveCount(0)
    await expect(plan.locator('.doc-editor .wiki-link')).toHaveCount(4)

    await plan.keyboard.press('Control+s')
    await expect
      .poll(() => readFile(planPath, 'utf8'))
      .toBe(PLAN.replace('Type here\n', 'Type here [[Other]]\n'))
  } finally {
    await closeAndSaveVideo(launched, 'markdown-internal-links')
  }
})
