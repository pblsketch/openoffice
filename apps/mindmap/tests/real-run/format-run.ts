/**
 * Real-run check of the text format in the built standalone editor.
 *
 * Opens a map built here with the engine, formats topics with the shortcuts,
 * the toolbar and the format panel, formats part of a title while it is typed
 * (real keys in the library's plain text edit box, typing inside a formatted
 * part), saves, and reads the saved file with the engine.
 *
 * Not part of `npm test`: it needs a build and opens a window.
 *
 *   npm run build -w @genoffice/mindmap
 *   npx tsx apps/mindmap/tests/real-run/format-run.ts
 *
 * Screenshots and the file it wrote go to MINDMAP_REAL_RUN_OUT (a folder in the
 * system temp directory when not set).
 */
import { _electron as electron, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createXmindDocumentFromSheets,
  openXmind,
  type XmindSheet,
  type XmindTopic,
} from '@genoffice/xmind-engine'

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = process.env.MINDMAP_REAL_RUN_OUT ?? mkdtempSync(join(tmpdir(), 'mindmap-format-run-'))
mkdirSync(OUT, { recursive: true })

const ID = {
  root: '20000000-0000-4000-8000-000000000001',
  main: '20000000-0000-4000-8000-000000000002',
  hello: '20000000-0000-4000-8000-000000000003',
  rich: '20000000-0000-4000-8000-000000000004',
  other: '20000000-0000-4000-8000-000000000005',
}

function check(condition: unknown, what: string): void {
  if (!condition) throw new Error(`CHECK FAILED: ${what}`)
  console.log(`  ok  ${what}`)
}

function sheet(): XmindSheet {
  const t = (
    id: string,
    title: string,
    extra: Partial<XmindTopic> = {},
    attached: XmindTopic[] = [],
  ) =>
    ({ id, title, ...extra, ...(attached.length ? { children: { attached } } : {}) }) as XmindTopic
  return {
    id: '20000000-0000-4000-8000-0000000000ff',
    title: '서식',
    rootTopic: t(ID.root, '글자 서식', {}, [
      t(ID.main, '큰 가지', {}, [
        t(ID.hello, 'Hello world'),
        t(ID.rich, '빨강 and plain', {
          attributedTitle: [{ text: '빨강', 'fo:color': '#ff0000' }, { text: ' and plain' }],
        }),
        t(ID.other, 'Other topic'),
      ]),
    ]),
  }
}

const topic = (id: string): string => `.mm-sheet-host:not([hidden]) me-tpc[data-nodeid="me${id}"]`

const runsOf = (page: Page, id: string) =>
  page.locator(`${topic(id)} > .text`).evaluate((text) =>
    [...text.querySelectorAll<HTMLElement>('.mm-run')].map((run) => ({
      text: run.textContent,
      weight: run.style.fontWeight,
      color: run.style.color,
      italic: run.style.fontStyle,
    })),
  )

async function main(): Promise<void> {
  const file = join(OUT, 'format.xmind')
  const doc = await createXmindDocumentFromSheets([sheet()])
  writeFileSync(file, await doc.save())

  const require = createRequire(join(APP_DIR, 'package.json'))
  const executablePath = require('electron') as unknown as string
  const { ELECTRON_RUN_AS_NODE: _ignored, ...hostEnv } = process.env
  const app = await electron.launch({
    executablePath,
    args: [APP_DIR, file],
    env: {
      ...hostEnv,
      GENOFFICE_USER_DATA: mkdtempSync(join(tmpdir(), 'mindmap-format-run-profile-')),
      GENOFFICE_LANG: 'ko',
    },
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector(topic(ID.hello))
    await page.waitForTimeout(500)

    // the file's own parts are drawn
    const rich = await runsOf(page, ID.rich)
    check(
      rich.length === 2 && rich[0]!.color === 'rgb(255, 0, 0)',
      'the parts of the file are drawn',
    )

    // whole topic with the shortcut
    await page.locator(topic(ID.other)).click()
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)
    const weight = await page
      .locator(topic(ID.other))
      .evaluate((el) => (el as HTMLElement).style.fontWeight)
    check(weight === '700', 'Ctrl+B makes the selected topic bold')
    check(
      (await page.locator('[data-action="bold"]').getAttribute('aria-pressed')) === 'true',
      'the toolbar shows it bold',
    )

    // part of a title: select "Hello" with the keyboard, Ctrl+B, then type at the end
    await page.locator(topic(ID.hello)).click()
    await page.keyboard.press('F2')
    await page.waitForSelector('#input-box')
    await page.keyboard.press('Home')
    for (let n = 0; n < 5; n++) await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Control+b')
    await page.keyboard.press('End')
    await page.keyboard.type(' again')
    await shot(page, '1-typing')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    const hello = await runsOf(page, ID.hello)
    check(
      JSON.stringify(hello.map((run) => [run.text, run.weight])) ===
        JSON.stringify([
          ['Hello', '700'],
          [' world again', ''],
        ]),
      `the selected characters are bold and the typed text joins the plain part (${JSON.stringify(hello)})`,
    )

    // typing inside a formatted part keeps it formatted, Korean included
    await page.locator(topic(ID.rich)).click()
    await page.keyboard.press('F2')
    await page.waitForSelector('#input-box')
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.insertText('간')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    const richAfter = await runsOf(page, ID.rich)
    check(
      richAfter[0]?.text === '빨간강' && richAfter[0]?.color === 'rgb(255, 0, 0)',
      `text typed inside a coloured part takes its colour (${JSON.stringify(richAfter)})`,
    )

    // the panel: italic on the selection, colour from the palette, size typed
    await page.locator(topic(ID.other)).click()
    await page.locator('[data-action="text-format"]').click()
    await page.waitForSelector('.mm-format-panel')
    // the text side of the switch, whichever side was chosen last
    await page.locator('[data-action="format-tab-text"]').click()
    await page.locator('[data-action="format-italic"]').click()
    await page.locator('.mm-format-colors button[title]').nth(14).click()
    await page.locator('[data-action="format-size"]').fill('20')
    await page.locator('[data-action="format-size"]').press('Enter')
    await page.locator('[data-action="format-align-left"]').click()
    await page.waitForTimeout(300)
    await shot(page, '2-panel')

    // a colour on part of a title from the panel while typing
    await page.locator(topic(ID.hello)).click()
    await page.keyboard.press('F2')
    await page.waitForSelector('#input-box')
    await page.keyboard.press('End')
    for (let n = 0; n < 5; n++) await page.keyboard.press('Shift+ArrowLeft')
    await page.locator('.mm-format-colors button[title]').nth(20).click()
    check(
      (await page.locator('#input-box').count()) === 1,
      'a swatch keeps the title being typed open',
    )
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    const coloured = await runsOf(page, ID.hello)
    check(
      coloured.length === 3 && coloured[2]!.text === 'again' && coloured[2]!.color !== '',
      `the swatch colours the selected characters (${JSON.stringify(coloured)})`,
    )

    // save and read the file
    await page.keyboard.press('Control+s')
    await page.waitForFunction(
      () => document.querySelector('.mm-save-status')?.textContent === '저장됨',
      undefined,
      { timeout: 20_000 },
    )
    const opened = await openXmind(new Uint8Array(readFileSync(file)))
    if (opened.status !== 'ok') throw new Error(`the saved file does not open: ${opened.status}`)
    const saved = opened.document.sheets[0]!.rootTopic.children!.attached![0]!.children!.attached!
    const [savedHello, savedRich, savedOther] = saved
    console.log(JSON.stringify(saved, null, 2))
    check(savedHello!.title === 'Hello world again', 'the title is saved')
    check(
      Array.isArray(savedHello!.attributedTitle) &&
        (savedHello!.attributedTitle as Record<string, string>[])[0]!['fo:font-weight'] === '700',
      'the bold part is saved',
    )
    check(
      (savedRich!.attributedTitle as Record<string, string>[])[0]!.text === '빨간강',
      'the typed part is saved',
    )
    const props = (savedOther!.style as { properties: Record<string, string> }).properties
    check(
      props['fo:font-weight'] === '700' &&
        props['fo:font-style'] === 'italic' &&
        props['fo:font-size'] === '20pt' &&
        props['fo:text-align'] === 'left' &&
        /^#[0-9a-f]{6}$/.test(props['fo:color'] ?? ''),
      'the whole-topic format is saved',
    )
    console.log(`done; pictures and the file are in ${OUT}`)
  } finally {
    await app.close()
  }
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`) })

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
