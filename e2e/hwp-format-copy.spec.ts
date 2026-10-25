import { test, expect } from '@playwright/test'
import { copyFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'

test('the HWP tab opens the Hancom-style format copy dialog', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'ieum-format-copy-')), 'blank.hwp')
  await copyFile(
    join(__dirname, '..', 'apps', 'hwp', 'src', 'renderer', 'assets', 'blank.hwp'),
    file,
  )
  const launched = await launchShell({
    onboardingSeen: true,
    lang: 'ko',
    openFile: file,
    videoDir: 'hwp-format-copy',
    recordVideo: false,
  })
  try {
    const hwp = await waitForPageWithUrl(launched.app, '://hwp/')
    await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
    const frame = hwp.frameLocator('.hwp-editor-host iframe')
    await expect(frame.locator('[data-cmd="ext:ieum-save"]')).toHaveCount(1)
    const box = (await hwp.locator('.hwp-editor-host iframe').boundingBox())!
    await hwp.mouse.click(box.x + box.width * 0.4, box.y + 300)
    await hwp.keyboard.type('source')
    await hwp.keyboard.press('Alt+c')
    const dialog = frame.locator('.modal-overlay')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.dialog-title')).toContainText('모양 복사')
    await expect(dialog.locator('.dialog-btn-primary')).toHaveText('복사')
    await expect(dialog.locator('.dialog-section-title').first()).toHaveText('본문 모양 복사')
    await dialog.locator('.dialog-btn-primary').click()
    await expect(dialog).toHaveCount(0)
    await expect(frame.locator('#rhwp-toast-container')).toContainText('모양을 복사했습니다.')
    // A block applies the copied look directly, without opening the dialog again.
    await hwp.keyboard.press('Control+a')
    await hwp.keyboard.press('Alt+c')
    await hwp.waitForTimeout(600)
    await expect(dialog).toHaveCount(0)
  } finally {
    await closeAndSaveVideo(launched, 'hwp-format-copy')
  }
})
