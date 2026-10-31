import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath, waitForPageWithUrl } from './helpers'

test.describe('home screen', () => {
  test('shows hero, quick-create cards and tab bar', async () => {
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'home-basics' })
    const { page } = launched
    try {
      await expect(page.locator('.home-hero')).toBeVisible()
      // the quick-create cards, the "Open file" browse card and the PDF tools card
      await expect(page.locator('.quick-card')).toHaveCount(10)
      await expect(page.locator('.quick-card').first()).toContainText('AI Docs')
      await expect(page.locator('.quick-card').nth(1)).toContainText('AI Sheets')
      await expect(page.locator('.quick-card').nth(2)).toContainText('AI Slides')
      await expect(page.locator('.quick-card').nth(3)).toContainText('AI Markdown')
      await expect(page.locator('.quick-card').nth(4)).toContainText('AI HTML')
      await expect(page.locator('.quick-card').nth(5)).toContainText('Mind Map')
      await expect(page.locator('.quick-card').nth(6)).toContainText('AI HWP')
      await expect(page.locator('.quick-card').nth(7)).toContainText('AI PDF')
      await expect(page.locator('.quick-card').nth(8)).toContainText('Open Local File')
      await expect(page.locator('.quick-card').nth(9)).toContainText('PDF tools')
      // the agent is not a document to make: it sits in the sidebar, under Ask AI
      // and the project folders (decision 0088)
      const nav = page.locator('.sidebar-nav .nav-label')
      await expect(nav).toHaveText(['Recent', 'Starred', 'Ask AI', 'Projects', 'Agent'])
      await expect(page.locator('.sidebar-nav .nav-item').nth(4)).toHaveAttribute(
        'title',
        'Work in a folder with Claude Code or Codex',
      )
      await expect(page.locator('.tab-bar .tab-item.tab-home')).toBeVisible()
      await page.screenshot({ path: screenshotPath('home-overview') })
      // clicking it opens the agent window
      await page.locator('.sidebar-nav .nav-item').nth(4).click()
      const agent = await waitForPageWithUrl(launched.app, 'agent.html', 30_000)
      await expect(agent.locator('.agent')).toBeVisible()
    } finally {
      await closeAndSaveVideo(launched, 'home-basics')
    }
  })

  test('renders localized UI when GENOFFICE_LANG=zh-CN', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      lang: 'zh-CN',
      videoDir: 'home-zh-cn',
    })
    const { page } = launched
    try {
      await expect(page.locator('.nav-item .nav-label').first()).toHaveText('最近')
      await page.screenshot({ path: screenshotPath('home-zh-cn') })
    } finally {
      await closeAndSaveVideo(launched, 'home-zh-cn')
    }
  })
})
