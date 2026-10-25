import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'

/** A small document with a 2×2 table, so the dialog has a cell to copy from. */
const TABLE = join(__dirname, '..', 'apps', 'hwp', 'tests', 'fixtures', 'format-copy-table.hwp')

test('the format copy dialog shows the cell parts, with borders on', async () => {
  const launched = await launchShell({
    onboardingSeen: true,
    lang: 'ko',
    openFile: TABLE,
    videoDir: 'hwp-format-copy-cell',
    recordVideo: false,
  })
  try {
    const hwp = await waitForPageWithUrl(launched.app, '://hwp/')
    await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
    const frame = hwp.frameLocator('.hwp-editor-host iframe')
    await expect(frame.locator('[data-cmd="ext:ieum-save"]')).toHaveCount(1)
    const box = (await hwp.locator('.hwp-editor-host iframe').boundingBox())!
    const dialog = frame.locator('.modal-overlay')
    let inCell = false
    let cellY = 0
    for (const y of [180, 220, 260, 300, 340]) {
      await hwp.mouse.click(box.x + box.width * 0.4, box.y + y)
      await hwp.keyboard.press('Alt+c')
      await hwp.waitForTimeout(400)
      if ((await dialog.count()) === 0) continue
      const cellHeading = dialog.locator('.dialog-section-title', { hasText: '셀 모양 복사' })
      if ((await cellHeading.count()) > 0) {
        inCell = true
        cellY = y
        break
      }
      await hwp.keyboard.press('Escape')
      await hwp.waitForTimeout(200)
    }
    expect(inCell, 'clicked into a table cell').toBe(true)
    await expect(dialog.locator('.dialog-section-title')).toContainText([
      '본문 모양 복사',
      '셀 모양 복사',
      '표에서 적용 대상',
    ])
    const checks = dialog.locator('input[type="checkbox"]')
    await expect(checks).toHaveCount(3)
    for (let i = 0; i < 3; i += 1) await expect(checks.nth(i)).toBeChecked()
    await expect(dialog.locator('label', { hasText: '셀 테두리' })).toHaveCount(1)
    await expect(dialog.locator('.dialog-btn-primary')).toHaveText('복사')
    await hwp.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    // Copy the plain right cell, then paste its cell look onto the named left cell.
    // The field is not part of the look, so it must survive.
    const fieldsBefore = await hwp.evaluate(async () => {
      const frame = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement
      return await (frame.contentWindow as any).rhwpStudio.plugins.invoke(
        'ieum-agent',
        'listFields',
        [],
      )
    })
    expect(fieldsBefore).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '이름1' })]),
    )
    expect(fieldsBefore).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '이름2' })]),
    )
    await hwp.mouse.click(box.x + box.width * 0.65, box.y + cellY)
    await hwp.keyboard.press('Alt+c')
    await expect(dialog).toBeVisible()
    await dialog.locator('.dialog-btn-primary').click()
    await expect(dialog).toHaveCount(0)
    await hwp.mouse.click(box.x + box.width * 0.35, box.y + cellY)
    await hwp.keyboard.press('Home')
    await hwp.keyboard.press('Shift+End')
    await hwp.keyboard.press('Alt+c')
    await hwp.waitForTimeout(600)
    await expect(dialog).toHaveCount(0)
    const fieldsAfter = await hwp.evaluate(async () => {
      const frame = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement
      return await (frame.contentWindow as any).rhwpStudio.plugins.invoke(
        'ieum-agent',
        'listFields',
        [],
      )
    })
    expect(fieldsAfter).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '이름1' })]),
    )
    expect(fieldsAfter).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '이름2' })]),
    )
  } finally {
    await closeAndSaveVideo(launched, 'hwp-format-copy-cell')
  }
})
