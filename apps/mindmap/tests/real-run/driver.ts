/**
 * Real-run check of the built standalone editor.
 *
 * Launches `apps/mindmap` (its build in `out/`) in Electron, drives it the way
 * a person would (keyboard, mouse, an input method composing Korean), saves,
 * and then opens the saved file with the engine to see what is in it.
 *
 * Not part of `npm test`: it needs a build and opens a window.
 *
 *   npm run build -w @genoffice/mindmap
 *   npx tsx apps/mindmap/tests/real-run/driver.ts
 *
 * Screenshots, the files it wrote and `result.json` go to the folder named by
 * MINDMAP_REAL_RUN_OUT (a folder in the system temp directory when not set).
 * Every map it opens is built here with the engine. The pictures of the look
 * of the map (`look-run.ts`) go to `look/` in that folder.
 *
 * MINDMAP_REAL_RUN_ONLY=look runs the look part alone, MINDMAP_REAL_RUN_ONLY=export
 * the export part (`export-run.ts`: export, print, the preview picture). MINDMAP_REAL_RUN_SAMPLE
 * names a map file from another program to draw in the default look; it is
 * opened from a copy in the system temp directory and only a screenshot of it
 * is kept.
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  countPreservedInDocument,
  createXmindDocumentFromSheets,
  openXmind,
  sheetToView,
  type ViewTopic,
  type XmindDocument,
  type XmindSheet,
  type XmindTopic,
} from '@genoffice/xmind-engine'
import { exportRun } from './export-run'
import { lookRun } from './look-run'

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = process.env.MINDMAP_REAL_RUN_OUT ?? mkdtempSync(join(tmpdir(), 'mindmap-real-run-'))
mkdirSync(OUT, { recursive: true })

const results: Record<string, unknown> = {}
const checks: string[] = []

function check(condition: unknown, what: string): void {
  if (!condition) throw new Error(`CHECK FAILED: ${what}`)
  checks.push(what)
  console.log(`  ok  ${what}`)
}

// ---- the maps this run opens: built here, nothing copied from anywhere ----

const ID = {
  root: '10000000-0000-4000-8000-000000000001',
  alpha: '10000000-0000-4000-8000-00000000000a',
  alphaOne: '10000000-0000-4000-8000-0000000000a1',
  alphaTwo: '10000000-0000-4000-8000-0000000000a2',
  beta: '10000000-0000-4000-8000-00000000000b',
  betaOne: '10000000-0000-4000-8000-0000000000b1',
  gamma: '10000000-0000-4000-8000-00000000000c',
  delta: '10000000-0000-4000-8000-00000000000d',
  summaryRecord: '10000000-0000-4000-8000-0000000000e1',
  summaryTopic: '10000000-0000-4000-8000-0000000000e2',
  underSummary: '10000000-0000-4000-8000-0000000000e3',
  callout: '10000000-0000-4000-8000-0000000000e4',
  floating: '10000000-0000-4000-8000-0000000000e5',
  boundary: '10000000-0000-4000-8000-0000000000e6',
  secondRoot: '20000000-0000-4000-8000-000000000001',
} as const

const topic = (
  id: string,
  title: string,
  extra: Record<string, unknown> = {},
  attached: XmindTopic[] = [],
): XmindTopic => {
  const out: XmindTopic = { id, class: 'topic', title, ...extra }
  if (attached.length > 0) out.children = { ...((extra.children as object) ?? {}), attached }
  return out
}

/** A stand-in layout, a theme this app did not write, and four elements the editor does not show. */
const STAND_IN_LAYOUT = 'org.xmind.ui.fishbone.rightHeaded'

function testSheets(): XmindSheet[] {
  const alpha = topic(
    ID.alpha,
    '알파',
    {
      labels: ['기존 라벨'],
      unknownTopicKey: { kept: true },
      summaries: [{ id: ID.summaryRecord, range: '(0,1)', topicId: ID.summaryTopic }],
      boundaries: [{ id: ID.boundary, range: '(0,1)', title: '묶음' }],
      children: {
        summary: [
          topic(ID.summaryTopic, '알파 요약', {}, [topic(ID.underSummary, '요약 아래 가지')]),
        ],
        callout: [topic(ID.callout, '말풍선')],
      },
    },
    [topic(ID.alphaOne, '알파 하나'), topic(ID.alphaTwo, '알파 둘')],
  )
  const first: XmindSheet = {
    id: '30000000-0000-4000-8000-000000000001',
    class: 'sheet',
    rootTopic: topic(
      ID.root,
      '실기 확인',
      {
        structureClass: STAND_IN_LAYOUT,
        children: { detached: [topic(ID.floating, '떠 있는 토픽')] },
      },
      [
        alpha,
        topic(ID.beta, '베타 <b>굵게</b>', {}, [topic(ID.betaOne, '베타 하나')]),
        topic(ID.gamma, '감마'),
        topic(ID.delta, '델타'),
      ],
    ),
    title: '첫 시트',
    theme: { map: { id: 'made-up', properties: { 'svg:fill': '#f4f1ea' } } },
  }
  const second: XmindSheet = {
    id: '30000000-0000-4000-8000-000000000002',
    class: 'sheet',
    rootTopic: topic(ID.secondRoot, '둘째 지도', {}, [
      topic('20000000-0000-4000-8000-000000000002', '가지'),
    ]),
    title: '둘째 시트',
  }
  return [first, second]
}

function largeSheet(topics: number): XmindSheet {
  let made = 0
  const next = (title: string, attached: XmindTopic[] = []): XmindTopic => {
    made++
    const hex = made.toString(16).padStart(12, '0')
    return topic(`40000000-0000-4000-8000-${hex}`, title, {}, attached)
  }
  const mains: XmindTopic[] = []
  const perMain = Math.ceil(topics / 12)
  for (let main = 0; main < 12; main++) {
    const subs: XmindTopic[] = []
    for (let sub = 0; made < topics && sub < Math.ceil(perMain / 10); sub++) {
      const leaves: XmindTopic[] = []
      for (let leaf = 0; leaf < 9 && made < topics; leaf++) {
        leaves.push(next(`항목 ${main + 1}.${sub + 1}.${leaf + 1}`))
      }
      subs.push(next(`묶음 ${main + 1}.${sub + 1}`, leaves))
    }
    mains.push(next(`큰 가지 ${main + 1}`, subs))
  }
  return {
    id: '50000000-0000-4000-8000-000000000001',
    class: 'sheet',
    rootTopic: topic('50000000-0000-4000-8000-000000000002', '큰 지도', {
      structureClass: 'org.xmind.ui.logic.right',
      children: { attached: mains },
    }),
    title: '큰 지도',
  }
}

// ---- launching ----

interface Launched {
  app: ElectronApplication
  page: Page
}

interface LaunchOptions {
  /** how many device pixels one CSS pixel is drawn with; the system's own when left out */
  scale?: number
  /** the size of the window's content */
  size?: { width: number; height: number }
}

async function launch(openFile?: string, options: LaunchOptions = {}): Promise<Launched> {
  const require = createRequire(join(APP_DIR, 'package.json'))
  const executablePath = require('electron') as unknown as string
  const { ELECTRON_RUN_AS_NODE: _ignored, ...hostEnv } = process.env
  const args = [APP_DIR]
  if (options.scale) args.unshift(`--force-device-scale-factor=${options.scale}`)
  if (openFile) args.push(openFile)
  const app = await electron.launch({
    executablePath,
    args,
    env: {
      ...hostEnv,
      GENOFFICE_USER_DATA: mkdtempSync(join(tmpdir(), 'mindmap-real-run-profile-')),
      GENOFFICE_LANG: 'ko',
    },
  })
  // A link is opened by the main process. The run records what it would open instead of starting a browser.
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as unknown as { __opened: string[] }).__opened = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // The script runner wraps a named function inside a page function in a helper
  // the page does not have. Passed as text, this stand-in is not wrapped itself.
  await page.evaluate('globalThis.__name = (fn) => fn')
  if (options.size) {
    await app.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height)
    }, options.size)
  }
  return { app, page }
}

const openedLinks = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened)

const shot = (page: Page, name: string): Promise<Buffer> =>
  page.screenshot({ path: join(OUT, `${name}.png`) })

const topicSelector = (id: string): string =>
  `.mm-sheet-host:not([hidden]) me-tpc[data-nodeid="me${id}"]`

async function selectTopic(page: Page, id: string): Promise<void> {
  await page.locator(topicSelector(id)).click()
}

const topicTitles = (page: Page): Promise<string[]> =>
  page
    .locator('.mm-sheet-host:not([hidden]) me-tpc > .text')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''))

async function waitForSaved(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector('.mm-save-status')?.textContent === '저장됨',
    undefined,
    { timeout: 20_000 },
  )
}

async function reopen(path: string): Promise<XmindDocument> {
  const opened = await openXmind(new Uint8Array(readFileSync(path)))
  if (opened.status !== 'ok') throw new Error(`the saved file does not open: ${opened.status}`)
  return opened.document
}

function findTopic(root: ViewTopic, predicate: (topic: ViewTopic) => boolean): ViewTopic | null {
  if (predicate(root)) return root
  for (const child of root.children) {
    const hit = findTopic(child, predicate)
    if (hit) return hit
  }
  return null
}

// ---- 1. open, edit, save, reopen ----

async function editingRun(): Promise<void> {
  console.log('\n[1] open, edit with the keyboard, the mouse and an input method, save, reopen')
  const path = join(OUT, 'edited.xmind')
  const source = await createXmindDocumentFromSheets(testSheets())
  const original = await source.save()
  writeFileSync(path, original)
  const preserved = countPreservedInDocument(source).total

  const { app, page } = await launch(path)
  try {
    await page.waitForSelector(topicSelector(ID.root))
    const cdp = await page.context().newCDPSession(page)
    await shot(page, '01-opened')

    // the two notices, each once
    const notices = await page.locator('.mm-notice').allTextContents()
    check(
      notices.some((text) => text.includes(`보이지 않는 요소가 ${preserved}개`)),
      `the notice names the ${preserved} elements the editor does not show`,
    )
    check(
      notices.some((text) => text.includes('기본 모양으로 보입니다')),
      'the notice says the map is drawn with the default look',
    )
    check(
      (await page.locator(topicSelector(ID.beta)).locator('.text').textContent()) ===
        '베타 <b>굵게</b>',
      'a title with angle brackets shows its characters',
    )
    check((await page.locator('.mm-card b').count()) === 0, 'and makes no element')

    // saving without a change writes the bytes the file was opened from
    await page.keyboard.press('Control+S')
    await waitForSaved(page)
    check(
      readFileSync(path).equals(Buffer.from(original)),
      'a save with no changes is byte-identical',
    )

    // Tab: a child under Gamma, named by composing Korean
    await selectTopic(page, ID.gamma)
    await page.keyboard.press('Tab')
    await page.waitForSelector('#input-box')
    await page.evaluate(() => {
      const seen: { key: string; composing: boolean }[] = []
      ;(window as unknown as { __keys: typeof seen }).__keys = seen
      document.addEventListener(
        'keydown',
        (event) => seen.push({ key: event.key, composing: event.isComposing }),
        true,
      )
    })
    for (const text of ['ㅎ', '하', '한']) {
      await cdp.send('Input.imeSetComposition', { text, selectionStart: 1, selectionEnd: 1 })
    }
    const topicsBefore = (await topicTitles(page)).length
    // Enter while the syllable is still being composed
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    })
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    })
    await page.waitForTimeout(200)
    const keys = await page.evaluate(
      () => (window as unknown as { __keys: { key: string; composing: boolean }[] }).__keys,
    )
    results.enterWhileComposing = keys.filter((key) => key.key === 'Enter')
    check(
      keys.some((key) => key.key === 'Enter' && key.composing),
      'the page saw Enter with a composition open',
    )
    check((await page.locator('#input-box').count()) === 1, 'the edit box stays open on that Enter')
    check(
      (await page.locator('#input-box').textContent())?.includes('한'),
      'the composed syllable is still there',
    )
    check((await topicTitles(page)).length === topicsBefore, 'no topic was added by that Enter')
    await shot(page, '02-composing-korean')
    await cdp.send('Input.insertText', { text: '한' })
    for (const text of ['ㄱ', '그', '글']) {
      await cdp.send('Input.imeSetComposition', { text, selectionStart: 1, selectionEnd: 1 })
    }
    await cdp.send('Input.insertText', { text: '글' })
    await page.keyboard.type(' 토픽')
    await page.keyboard.press('Enter')
    await page.waitForSelector('#input-box', { state: 'detached' })
    check((await topicTitles(page)).includes('한글 토픽'), 'the composed title is on the map')

    // Enter: a sibling after the new child
    await page.keyboard.press('Enter')
    await page.waitForSelector('#input-box')
    await page.keyboard.type('형제')
    await page.keyboard.press('Enter')
    await page.waitForSelector('#input-box', { state: 'detached' })
    check((await topicTitles(page)).includes('형제'), 'Enter added a sibling topic')
    await shot(page, '03-child-and-sibling')

    // F2 and Space both start editing
    await selectTopic(page, ID.delta)
    await page.keyboard.press('F2')
    await page.waitForSelector('#input-box')
    await page.keyboard.press('Escape')
    await page.waitForSelector('#input-box', { state: 'detached' })
    await page.keyboard.press('Space')
    await page.waitForSelector('#input-box')
    await page.keyboard.type('델타 고침')
    await page.keyboard.press('Enter')
    await page.waitForSelector('#input-box', { state: 'detached' })
    check((await topicTitles(page)).includes('델타 고침'), 'Space starts editing like F2')

    // drag "베타 하나" onto "델타"
    const from = (await page.locator(topicSelector(ID.betaOne)).boundingBox())!
    const to = (await page.locator(topicSelector(ID.delta)).boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 })
    await page.waitForTimeout(150)
    await page.mouse.up()
    await page.waitForTimeout(300)
    const draggedUnderDelta = await page.evaluate(
      ([moved, target]) => {
        const element = document.querySelector<
          HTMLElement & { nodeObj: { parent?: { id: string } } }
        >(`me-tpc[data-nodeid="me${moved}"]`)
        return element?.nodeObj.parent?.id === target
      },
      [ID.betaOne, ID.delta] as const,
    )
    results.dragMovedTopic = draggedUnderDelta
    check(draggedUnderDelta, 'dragging a topic onto another moves it there')
    await shot(page, '04-dragged')

    // label, note, link through the toolbar
    await selectTopic(page, ID.gamma)
    await page.locator('[data-action="label"]').click()
    await page.locator('[data-dialog="topic-label"] .mm-field').fill('중요, <i>기울임</i>')
    await page.locator('[data-action="field-ok"]').click()
    await page.locator('[data-action="note"]').click()
    await page.locator('[data-note-panel] textarea').fill('메모 첫 줄\n<script>alert(1)</script>')
    await shot(page, '05-note-panel')
    // leaving the field (the next toolbar button) puts the note into the map
    await page.locator('[data-action="link"]').click()
    // an address nothing will open: kept and shown as text, said so beforehand, never opened
    await page.locator('[data-dialog="topic-link"] .mm-field').fill('javascript:alert(1)')
    check(
      (await page.locator('.mm-modal-hint').getAttribute('data-link-kind')) === 'kept',
      'the dialog says beforehand that a javascript: address will not be opened',
    )
    await shot(page, '06-link-will-not-open')
    await page.locator('[data-action="field-ok"]').click()
    await page.waitForSelector('[data-dialog="topic-link"]', { state: 'detached' })
    const kept = page.locator(`${topicSelector(ID.gamma)} .mm-chip-link`)
    check((await kept.textContent()) === 'javascript:alert(1)', 'the address is shown as text')
    check(
      (await kept.evaluate((node) => node.tagName)) === 'SPAN' &&
        (await page.locator('.mm-card a').count()) === 0,
      'as a plain span, not an anchor',
    )
    await kept.click()
    await page.waitForTimeout(300)
    check((await openedLinks(app)).length === 0, 'pressing it opens nothing')
    // a reference into the file is turned down
    await page.locator('[data-action="link"]').click()
    check(
      (await page.locator('[data-dialog="topic-link"] .mm-field').inputValue()) ===
        'javascript:alert(1)',
      'the link dialog opens with the address the topic has',
    )
    await page.locator('[data-dialog="topic-link"] .mm-field').fill('xmind:#some-topic')
    await page.locator('[data-action="field-ok"]').click()
    check(
      (await page.locator('.mm-modal-hint.error').count()) === 1,
      'an address in the form of a reference into the file is turned down',
    )
    await page.locator('[data-dialog="topic-link"] .mm-field').fill('example.com/page')
    await page.locator('[data-action="field-ok"]').click()
    await page.waitForSelector('[data-dialog="topic-link"]', { state: 'detached' })
    const chips = await page.locator(`${topicSelector(ID.gamma)} .tags span`).allTextContents()
    check(chips.includes('<i>기울임</i>'), 'a label with angle brackets shows its characters')
    check(chips.includes('https://example.com/page'), 'the link is shown as text')
    check(
      (await page.locator('.mm-card i, .mm-card script').count()) === 0,
      'no element came from that text',
    )
    await shot(page, '07-label-note-link')

    // the link: only the main process opens it, and only a web address
    await page.locator(`${topicSelector(ID.gamma)} .mm-chip-link`).click()
    await page.waitForTimeout(300)
    check(
      JSON.stringify(await openedLinks(app)) === JSON.stringify(['https://example.com/page']),
      'a click on the link asks the main process once, for exactly that address',
    )
    const refused = await page.evaluate(async () => {
      const api = (window as unknown as { mindmapApi: { openLink(url: string): Promise<boolean> } })
        .mindmapApi
      return Promise.all(
        ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'xmind:#topic'].map((url) =>
          api.openLink(url),
        ),
      )
    })
    check(
      refused.every((opened) => opened === false),
      'javascript: and file: addresses are not opened',
    )
    check((await openedLinks(app)).length === 1, 'and nothing else reached the system')

    // sheets: add, rename, delete with the question
    await page.locator('[data-action="sheet-add"]').click()
    await page.waitForFunction(() => document.querySelectorAll('.mm-sheet').length === 3)
    check((await page.locator('.mm-sheet').count()) === 3, 'a sheet was added')
    await page.locator('.mm-sheet.on .mm-sheet-name').dblclick()
    await page.locator('.mm-sheet-rename').fill('<u>새 시트</u>')
    await page.keyboard.press('Enter')
    check(
      (await page.locator('.mm-sheet.on .mm-sheet-name').textContent()) === '<u>새 시트</u>',
      'the renamed sheet shows its name as text',
    )
    check((await page.locator('.mm-foot u').count()) === 0, 'and the name made no element')
    await page.locator('[data-action="sheet-delete"]').click()
    await page.waitForSelector('[data-dialog="delete-sheet"]')
    const question = (await page.locator('[data-dialog="delete-sheet"]').textContent()) ?? ''
    check(
      question.includes('되돌릴 수 없습니다'),
      'deleting a sheet asks first and says it cannot be undone',
    )
    await shot(page, '08-sheet-delete-question')
    await page.locator('[data-action="confirm-cancel"]').click()
    check((await page.locator('.mm-sheet').count()) === 3, 'declining keeps the sheet')
    // keep this sheet; delete the second one of the file instead
    await page.locator('.mm-sheet-name', { hasText: '둘째 시트' }).click()
    await page.locator('[data-action="sheet-delete"]').click()
    await page.locator('[data-action="confirm-ok"]').click()
    await page.waitForFunction(() => document.querySelectorAll('.mm-sheet').length === 2)
    check((await page.locator('.mm-sheet').count()) === 2, 'confirming deletes the sheet')

    // back on the first sheet: delete a topic with hidden elements
    await page.locator('.mm-sheet-name', { hasText: '첫 시트' }).click()
    await selectTopic(page, ID.alpha)
    await page.keyboard.press('Delete')
    await page.waitForSelector('[data-dialog="delete-hidden"]')
    const warning = (await page.locator('[data-dialog="delete-hidden"]').textContent()) ?? ''
    check(
      warning.includes('보이지 않는 요소 3개'),
      'deleting Alpha names the 3 hidden elements under it',
    )
    await shot(page, '09-delete-hidden-question')
    await page.locator('[data-action="confirm-ok"]').click()
    await page.waitForSelector(topicSelector(ID.alpha), { state: 'detached' })
    check(!(await topicTitles(page)).includes('알파'), 'Alpha is gone')

    // undo brings it back whole; redo and undo again
    await page.locator('.mm-sheet-host:not([hidden]) .map-container').focus()
    await page.keyboard.press('Control+Z')
    await page.waitForSelector(topicSelector(ID.alpha))
    check((await topicTitles(page)).includes('알파'), 'Ctrl+Z brings Alpha back')
    await page.keyboard.press('Control+Y')
    await page.waitForSelector(topicSelector(ID.alpha), { state: 'detached' })
    await page.locator('[data-action="undo"]').click()
    await page.waitForSelector(topicSelector(ID.alpha))
    check(
      (await topicTitles(page)).includes('알파'),
      'redo and the toolbar undo reach the same history',
    )
    await shot(page, '10-after-undo')

    // a plain topic is deleted without a question
    await selectTopic(page, ID.beta)
    await page.keyboard.press('Delete')
    await page.waitForSelector(topicSelector(ID.beta), { state: 'detached' })
    check(
      (await page.locator('.mm-modal').count()) === 0,
      'a topic with nothing hidden is deleted without a question',
    )

    // cut and paste is a move: the topic arrives with everything it carried
    await selectTopic(page, ID.alpha)
    await page.keyboard.press('Control+x')
    await page.waitForSelector('[data-dialog="delete-hidden"]')
    await page.locator('[data-action="confirm-ok"]').click()
    await page.waitForSelector(topicSelector(ID.alpha), { state: 'detached' })
    await selectTopic(page, ID.delta)
    await page.keyboard.press('Control+v')
    await page.waitForSelector(topicSelector(ID.alpha))
    check(
      await page.evaluate(
        ([moved, target]) =>
          document.querySelector<HTMLElement & { nodeObj: { parent?: { id: string } } }>(
            `me-tpc[data-nodeid="me${moved}"]`,
          )?.nodeObj.parent?.id === target,
        [ID.alpha, ID.delta] as const,
      ),
      'a cut topic pasted elsewhere arrives under its own id',
    )
    await shot(page, '11-cut-and-pasted')

    // a title still being typed when the save comes is saved with it
    await selectTopic(page, ID.gamma)
    await page.keyboard.press('F2')
    await page.waitForSelector('#input-box')
    await page.keyboard.type('감마, 치는 중에 저장')
    await page.keyboard.press('Control+S')
    await waitForSaved(page)
    check((await page.locator('#input-box').count()) === 0, 'saving takes the title being typed')

    // and so is a syllable an input method is still composing
    await selectTopic(page, ID.alphaOne)
    await page.keyboard.press('F2')
    await page.waitForSelector('#input-box')
    await cdp.send('Input.insertText', { text: '조합 중 ' })
    for (const text of ['ㄲ', '끄', '끝']) {
      await cdp.send('Input.imeSetComposition', { text, selectionStart: 1, selectionEnd: 1 })
    }
    await page.keyboard.press('Control+S')
    await waitForSaved(page)
    await shot(page, '11-saved')
  } finally {
    await app.close()
  }

  // what the file holds now
  const saved = await reopen(path)
  const view = sheetToView(saved.sheets[0]!, 0)
  const raw = JSON.stringify(saved.sheets[0])
  const gamma = findTopic(view.root, (candidate) => candidate.id === ID.gamma)!
  check(saved.sheets.length === 2, 'the file has two sheets: the first and the added one')
  check(
    saved.sheets[1]!.title === '<u>새 시트</u>',
    'the added sheet has its name, character for character',
  )
  check(
    JSON.stringify(gamma.children.map((child) => child.title)) ===
      JSON.stringify(['한글 토픽', '형제']),
    'Gamma has the composed child and its sibling, in order',
  )
  check(
    JSON.stringify(gamma.labels) === JSON.stringify(['중요', '<i>기울임</i>']),
    'Gamma has both labels as text',
  )
  check(gamma.note === '메모 첫 줄\n<script>alert(1)</script>', 'Gamma has the note as text')
  check(gamma.link === 'https://example.com/page', 'Gamma has the web link')
  const delta = findTopic(view.root, (candidate) => candidate.id === ID.delta)!
  check(delta.title === '델타 고침', 'Delta has its new title')
  check(
    delta.children.some((child) => child.id === ID.betaOne),
    'the dragged topic is under Delta in the file',
  )
  check(findTopic(view.root, (candidate) => candidate.id === ID.beta) === null, 'Beta is deleted')
  check(
    findTopic(view.root, (candidate) => candidate.id === ID.alpha) !== null,
    'Alpha is in the file',
  )
  check(
    gamma.title === '감마, 치는 중에 저장',
    'the title typed right before the save is in the file',
  )
  const composed = findTopic(view.root, (candidate) => candidate.id === ID.alphaOne)?.title
  results.titleSavedWhileComposing = composed
  check(composed === '조합 중 끝', 'the syllable still being composed at the save is in the file')
  const movedAlpha = delta.children.find((child) => child.id === ID.alpha)
  check(movedAlpha !== undefined, 'Alpha, cut and pasted, is under Delta in the file')
  check(
    JSON.stringify(movedAlpha?.children.map((child) => child.id)) ===
      JSON.stringify([ID.alphaOne, ID.alphaTwo]) && movedAlpha?.summaries.length === 1,
    'with its branches and its summary',
  )
  for (const [name, id] of [
    ['the callout', ID.callout],
    ['the branch under the summary', ID.underSummary],
    ['the boundary', ID.boundary],
    ['the floating topic', ID.floating],
  ] as const) {
    check(raw.includes(id), `${name} is still in the file`)
  }
  check(
    raw.includes('"unknownTopicKey":{"kept":true}'),
    'a key the engine does not know is still on Alpha',
  )
  check(
    saved.sheets[0]!.rootTopic.structureClass === STAND_IN_LAYOUT,
    "the file's own layout value is unchanged",
  )
  check(JSON.stringify(saved.sheets[0]!.theme).includes('made-up'), "the file's theme is unchanged")
}

// ---- 2. a file that does not open ----

async function brokenFileRun(): Promise<void> {
  console.log('\n[2] a file that does not open is shown as a message and never written')
  const path = join(OUT, 'broken.xmind')
  const original = Buffer.from('this is not a map file')
  writeFileSync(path, original)
  const { app, page } = await launch(path)
  try {
    await page.waitForSelector('[data-open-failure]')
    check(
      (await page.locator('[data-open-failure]').textContent()) === '읽을 수 없는 파일입니다',
      'the screen says the file cannot be read',
    )
    check(
      (await page.locator('[data-action="save"]').count()) === 0,
      'there is nothing to save with',
    )
    await page.keyboard.press('Control+S')
    await page.waitForTimeout(500)
    const refused = await page.evaluate(async () => {
      const api = (
        window as unknown as {
          mindmapApi: { save(request: unknown): Promise<{ ok: boolean }> }
        }
      ).mindmapApi
      return api.save({ bytes: new Uint8Array([80, 75, 5, 6]), mode: 'save' })
    })
    check(refused.ok === false, 'the main process refuses a save for that view')
    await shot(page, '12-file-does-not-open')
  } finally {
    await app.close()
  }
  check(readFileSync(path).equals(original), 'the file is exactly as it was')
}

// ---- 3. a new map is saved as .xmind ----

async function newMapRun(): Promise<void> {
  console.log('\n[3] a new map is saved as .xmind')
  const target = join(OUT, 'new-map')
  const { app, page } = await launch()
  try {
    await page.waitForSelector('.mm-sheet-host:not([hidden]) me-root me-tpc')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath,
      })) as typeof dialog.showSaveDialog
    }, target)
    await page.locator('.mm-sheet-host:not([hidden]) me-root me-tpc').click()
    await page.keyboard.press('Tab')
    await page.waitForSelector('#input-box')
    await page.keyboard.type('첫 가지')
    await page.keyboard.press('Enter')
    await page.waitForSelector('#input-box', { state: 'detached' })
    await page.keyboard.press('Control+S')
    await waitForSaved(page)
    await shot(page, '13-new-map-saved')

    // the app's dark setting recolours the chrome and leaves the map's own colours alone
    const colours = (): Promise<{ map: string; chrome: string }> =>
      page.evaluate(() => ({
        map: getComputedStyle(document.querySelector('.map-container')!).backgroundColor,
        chrome: getComputedStyle(document.querySelector('.ribbon')!).backgroundColor,
      }))
    const light = await colours()
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    const dark = await colours()
    check(dark.chrome !== light.chrome, 'the chrome follows the app going dark')
    check(dark.map === light.map, 'the map keeps its colours when the app goes dark')
    await shot(page, '14-dark-app-light-map')
  } finally {
    await app.close()
  }
  const saved = await reopen(`${target}.xmind`)
  const view = sheetToView(saved.sheets[0]!, 0)
  check(
    view.root.children[0]?.title === '첫 가지',
    'the new map was saved with the .xmind extension and opens',
  )
  check(
    view.title === '시트 1' && view.root.title === '중심 주제',
    'its sheet and central topic are named in the user’s language',
  )
}

// ---- 4. a large map ----

async function largeMapRun(): Promise<void> {
  console.log('\n[4] a large map: open, first draw, one edit')
  const topics = 3000
  const path = join(OUT, 'large.xmind')
  const source = await createXmindDocumentFromSheets([largeSheet(topics)])
  writeFileSync(path, await source.save())
  const started = Date.now()
  const { app, page } = await launch(path)
  try {
    await page.waitForSelector('.mm-sheet-host:not([hidden]) me-root me-tpc', { timeout: 120_000 })
    const windowToMap = Date.now() - started
    const drawn = await page.locator('.mm-sheet-host:not([hidden]) me-tpc').count()
    const first = page.locator('.mm-sheet-host:not([hidden]) me-root me-tpc')
    await first.click()
    const edit = await page.evaluate(async () => {
      const container = document.querySelector<HTMLElement>(
        '.mm-sheet-host:not([hidden]) .map-container',
      )!
      const before = performance.now()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
      )
      for (let turn = 0; turn < 200 && !document.querySelector('#input-box'); turn++) {
        await new Promise((done) => setTimeout(done, 5))
      }
      // one frame so the layout the edit caused is counted
      await new Promise((done) => requestAnimationFrame(() => done(null)))
      return performance.now() - before
    })
    // no named helper inside the page function: the script runner would wrap it in a helper the page lacks
    const measures = await page.evaluate(() =>
      performance
        .getEntriesByType('measure')
        .map((entry) => ({ name: entry.name, ms: Math.round(entry.duration) })),
    )
    const timings = {
      open: measures.filter((entry) => entry.name === 'mindmap:open').map((entry) => entry.ms),
      draw: measures.filter((entry) => entry.name === 'mindmap:draw').map((entry) => entry.ms),
      reconcile: measures
        .filter((entry) => entry.name === 'mindmap:reconcile')
        .map((entry) => entry.ms),
    }
    await page.keyboard.press('Escape')
    results.largeMap = {
      topics,
      topicsDrawn: drawn,
      launchToMapMs: windowToMap,
      engineOpenMs: timings.open,
      firstDrawMs: timings.draw,
      reconcileMs: timings.reconcile,
      addChildKeyToEditBoxMs: Math.round(edit),
    }
    console.log('  timings', JSON.stringify(results.largeMap))
    check(drawn > topics * 0.9, `the map of ${topics} topics is drawn (${drawn} topic elements)`)
    await shot(page, '15-large-map')
  } finally {
    await app.close()
  }
}

async function main(): Promise<void> {
  console.log(`real run of ${APP_DIR}\nevidence in ${OUT}`)
  let failure: unknown = null
  try {
    const only = process.env.MINDMAP_REAL_RUN_ONLY
    if (only !== 'look' && only !== 'export') {
      await editingRun()
      await brokenFileRun()
      await newMapRun()
      await largeMapRun()
    }
    if (only !== 'export') await lookRun({ out: OUT, launch, check, results })
    if (only !== 'look') await exportRun({ out: OUT, launch, check, results })
  } catch (error) {
    failure = error
    console.error(error)
  }
  results.checks = checks
  results.passed = failure === null
  if (failure) results.failure = failure instanceof Error ? failure.message : String(failure)
  writeFileSync(join(OUT, 'result.json'), `${JSON.stringify(results, null, 2)}\n`)
  console.log(failure ? '\nFAILED' : `\nPASSED (${checks.length} checks)`)
  process.exitCode = failure ? 1 : 0
}

void main()
