/**
 * The document check over a real government form: the app's plugin reads the document,
 * `@genoffice/doc-rules` judges it, and the panel lists what it found. Nothing here calls
 * a model, so the check must work on a PC with no AI connection at all.
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { closeAndSaveVideo, launchShell, screenshotPath, waitForPageWithUrl } from './helpers'

/** A school council form (교과협의록): a table whose cells hold tables. */
const FORM = join(__dirname, '../apps/hwp/tests/fixtures/nested-form.hwp')

test('lists the findings of a form with tables inside tables', async () => {
  const launched = await launchShell({ onboardingSeen: true, videoDir: 'hwp-doc-check' })
  const { page } = launched
  try {
    await page.evaluate((path) => window.aiOffice.openPath(path), FORM)
    const hwp = await waitForPageWithUrl(launched.app, '://hwp/')
    await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })

    await hwp.getByRole('button', { name: 'Document check', exact: true }).click()
    const panel = hwp.locator('.doc-check')
    await expect(panel).toBeVisible()

    // the nested tables are the one thing the rules can call wrong without a person
    await expect(panel.locator('.doc-check-badge.violation').first()).toContainText('Violation')
    // rule titles stay Korean: the rule set targets Korean documents
    await expect(
      panel.locator('.doc-check-finding-title').filter({ hasText: '표 안의 표' }),
    ).toBeVisible()

    // each finding lists the places it found, and a place moves the caret there
    const places = panel.locator('.doc-check-place')
    await expect(places.first()).toBeVisible()
    await hwp.screenshot({ path: screenshotPath('hwp-doc-check') })
    await places.first().click()
    await expect(panel).toBeVisible()

    // the switch shows the checks that are off by default, without reading the document again
    await panel.locator('.doc-check-extra input').check()
    await expect(panel.locator('.doc-check-finding').first()).toBeVisible()

    // the findings can be handed to the AI: the request waits in the input box, unsent
    await panel.getByRole('button', { name: 'Hand the fixing to the AI', exact: true }).click()
    await expect(hwp.locator('.ai-dock textarea')).toHaveValue(/문서 점검에서 걸린 항목/)
  } finally {
    await closeAndSaveVideo(launched, 'hwp-doc-check')
  }
})

test('says so when a document has nothing to fix', async () => {
  const launched = await launchShell({ onboardingSeen: true, videoDir: 'hwp-doc-check-clean' })
  const { page } = launched
  try {
    await page.locator('.quick-card').nth(6).click()
    const hwp = await waitForPageWithUrl(launched.app, '://hwp/')
    await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })

    await hwp.getByRole('button', { name: 'Document check', exact: true }).click()
    await expect(hwp.locator('.doc-check')).toContainText('Nothing to fix.')
  } finally {
    await closeAndSaveVideo(launched, 'hwp-doc-check-clean')
  }
})
