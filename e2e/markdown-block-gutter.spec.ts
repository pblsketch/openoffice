import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl, screenshotPath } from './helpers'

// The + and grip gutter used to be measured against an element TipTap's React
// EditorContent had already thrown away, which put it in the middle of the
// page instead of beside the block. Hover real blocks in the built app and
// check the gutter sits to their left, on their first line.
async function gutterBeside(page: Page, block: Locator): Promise<void> {
  const box = await block.boundingBox()
  if (!box) throw new Error('block has no box')
  await page.mouse.move(box.x + 20, box.y + 5)
  const gutter = page.locator('.md-block-gutter')
  await expect(gutter).toBeVisible()
  const g = await gutter.boundingBox()
  if (!g) throw new Error('gutter has no box')
  expect(g.x + g.width).toBeLessThanOrEqual(box.x)
  expect(box.x - (g.x + g.width)).toBeLessThan(60)
  expect(Math.abs(g.y - box.y)).toBeLessThan(20)
}

test('the block gutter sits left of the hovered block, like Notion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-md-gutter-'))
  const mdPath = join(dir, 'gutter.md')
  const long = 'A paragraph long enough to wrap onto more than one line in the editor. '.repeat(6)
  await writeFile(mdPath, `# Gutter\n\n${long}\n\n- first item\n- second item\n`)

  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'markdown-block-gutter',
    openFile: mdPath,
  })
  try {
    const page = await waitForPageWithUrl(launched.app, '://markdown/')
    const editor = page.locator('.doc-editor')
    await expect(editor.locator('h1')).toHaveText('Gutter')

    await gutterBeside(page, editor.locator('p').first())
    await gutterBeside(page, editor.locator('li').nth(1))
    await page.screenshot({ path: screenshotPath('markdown-block-gutter') })

    // the grip's menu acts on that one item: it moves inside the list
    await gutterBeside(page, editor.locator('li').first())
    await page.locator('.md-gutter-grip').click()
    await page.locator('.md-block-menu-item', { hasText: 'Move down' }).click()
    await expect(editor.locator('li')).toHaveText(['second item', 'first item'])
  } finally {
    await closeAndSaveVideo(launched, 'markdown-block-gutter')
  }
})
