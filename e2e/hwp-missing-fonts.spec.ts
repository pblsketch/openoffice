/**
 * A font that is not on this PC is drawn with another one while the file keeps its name. The
 * HWP tab says which of an opened document's fonts are drawn that way, and the editor's font
 * box and font menu mark such a font. The document here is written in a font no PC has.
 */
import { test, expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { closeAndSaveVideo, launchShell, screenshotPath, waitForPageWithUrl } from './helpers'

const execFileAsync = promisify(execFile)
const REPO_ROOT = join(__dirname, '..')
const ABSENT = '이음 시험용 없는 글꼴'

/** writes an .hwp whose one line is in ABSENT, with the same engine build the editor runs */
async function writeDocument(path: string): Promise<void> {
  const core = pathToFileURL(join(REPO_ROOT, 'vendor/rhwp-core/rhwp.js')).href
  const wasm = join(REPO_ROOT, 'vendor/rhwp-core/rhwp_bg.wasm')
  const script = [
    "import { readFileSync, writeFileSync } from 'node:fs'",
    `const { default: init, HwpDocument } = await import(${JSON.stringify(core)})`,
    `await init({ module_or_path: readFileSync(${JSON.stringify(wasm)}) })`,
    'const doc = HwpDocument.createEmpty()',
    'doc.createBlankDocument()',
    "doc.insertText(0, 0, 0, '이 줄은 PC에 없는 글꼴로 썼습니다.')",
    `const ids = Array.from({ length: 7 }, (_, lang) => doc.findOrCreateFontIdForLang(lang, ${JSON.stringify(ABSENT)}))`,
    'doc.applyCharFormat(0, 0, 0, doc.getParagraphLength(0, 0), JSON.stringify({ fontIds: ids }))',
    'writeFileSync(process.argv[1], doc.exportHwp())',
  ].join('\n')
  await execFileAsync(process.execPath, ['--input-type=module', '-e', script, path])
}

test('says which fonts of a document are not on this PC, and marks them in the font box and menu', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'ieum-missing-fonts-')), 'absent-font.hwp')
  await writeDocument(file)
  const launched = await launchShell({
    onboardingSeen: true,
    lang: 'ko',
    openFile: file,
    videoDir: 'hwp-missing-fonts',
    recordVideo: false,
  })
  try {
    const hwp = await waitForPageWithUrl(launched.app, '://hwp/')
    await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })

    // the notice names the font once the editor has looked at the PC's fonts
    const notice = hwp.locator('.hwp-notice')
    await expect(notice).toContainText('이 PC에 없는 글꼴이 있어', { timeout: 60_000 })
    await expect(notice).toContainText(ABSENT)

    // the caret is in that line: the font box shows the font's name, underlined, and says why
    const frame = hwp.frameLocator('.hwp-editor-host iframe')
    const fontBox = frame.locator('#font-name')
    await expect(fontBox).toHaveValue(ABSENT)
    await expect(fontBox).toHaveCSS('text-decoration-style', 'dotted')
    await expect(fontBox).toHaveAttribute('title', new RegExp(`^${ABSENT}: `))

    // the font menu's entry for it carries the tag; a font the PC has does not
    await fontBox.dispatchEvent('pointerdown')
    const options = frame.locator('.font-picker-option')
    await expect(options.filter({ hasText: ABSENT })).toContainText('PC에 없음')
    await frame.locator('.font-picker-category[data-category="system"]').click()
    await expect(options.first()).toBeVisible()
    await expect(options.filter({ hasText: 'PC에 없음' })).toHaveCount(0)
    await frame.locator('.font-picker-category[data-category="document"]').click()
    await hwp.screenshot({ path: screenshotPath('hwp-missing-fonts') })
  } finally {
    await closeAndSaveVideo(launched, 'hwp-missing-fonts')
  }
})
