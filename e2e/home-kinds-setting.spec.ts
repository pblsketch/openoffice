import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchShell, closeAndSaveVideo } from './helpers'

/**
 * Settings → General → "New documents on Home": turning a kind off takes its
 * card off Home at once, moving one changes the card order, and both survive
 * a second launch.
 */
test.describe('home lists the new-document kinds Settings keeps', () => {
  test('hide and move cards, then launch again', async () => {
    test.setTimeout(300_000)
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'home-kinds' })
    const cardTitles = () => launched.page.locator('.quick-cards .quick-title').allTextContents()
    try {
      const page = launched.page
      await expect(page.locator('.quick-card', { hasText: 'AI Sheets' }).first()).toBeVisible()
      expect((await cardTitles()).slice(0, 3)).toEqual(['AI Docs', 'AI Sheets', 'AI Slides'])

      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await page.locator('.set-nav-item').filter({ hasText: 'General' }).click()
      const field = page.getByTestId('home-kinds')
      await field.getByRole('switch', { name: 'AI Sheets' }).click()
      await expect(field.getByRole('switch', { name: 'AI Sheets' })).toHaveAttribute(
        'aria-checked',
        'false',
      )
      // twice: past AI Sheets, then past AI Docs
      const up = field.getByRole('button', { name: 'Move AI Slides up' })
      await up.click()
      await expect(field.locator('.set-home-kind').nth(1)).toHaveAttribute('data-kind', 'pptx')
      await up.click()
      await expect(field.locator('.set-home-kind').first()).toHaveAttribute('data-kind', 'pptx')
      await page.locator('.set-close').click()

      await expect(page.locator('.quick-card', { hasText: 'AI Sheets' })).toHaveCount(0)
      expect((await cardTitles()).slice(0, 2)).toEqual(['AI Slides', 'AI Docs'])

      const saved = JSON.parse(
        await readFile(join(launched.userDataDir, 'app-settings.json'), 'utf8'),
      )
      expect(saved.homeKinds.hidden).toEqual(['xlsx'])
      expect(saved.homeKinds.order.slice(0, 3)).toEqual(['pptx', 'docx', 'xlsx'])
    } finally {
      await closeAndSaveVideo(launched, 'home-kinds')
    }

    const again = await launchShell({
      userDataDir: launched.userDataDir,
      videoDir: 'home-kinds-again',
    })
    try {
      await expect(
        again.page.locator('.quick-card', { hasText: 'AI Slides' }).first(),
      ).toBeVisible()
      await expect(again.page.locator('.quick-card', { hasText: 'AI Sheets' })).toHaveCount(0)
      const titles = await again.page.locator('.quick-cards .quick-title').allTextContents()
      expect(titles.slice(0, 2)).toEqual(['AI Slides', 'AI Docs'])
    } finally {
      await closeAndSaveVideo(again, 'home-kinds-again')
    }
  })
})
