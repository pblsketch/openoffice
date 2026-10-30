import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { closeAndSaveVideo, launchShell, waitForPageWithUrl, type LaunchedApp } from './helpers'
import {
  queueTurns,
  recorded,
  removeRun,
  scratch,
  shot,
  stubEverything,
} from './project-folder-user-lib'

/**
 * Problems a first-time user ran into with the project folder (decision 0088),
 * kept as regression tests now that they are fixed: each test asserts the
 * fixed behavior.
 *
 * AI and native dialogs are stubs (project-folder-user-lib.ts).
 */

interface Setup {
  launched: LaunchedApp
  app: ElectronApplication
  page: Page
  proj: string
  /** this test's scratch folder name under PF_ROOT */
  run: string
}

/** a running app with one project "P" holding a.md and b.html, on the project screen */
async function setup(name: string): Promise<Setup> {
  const run = `${name}-${Date.now()}`
  const ud = await scratch(run, 'userdata')
  const docs = await scratch(run, '문서')
  const launched = await launchShell({
    userDataDir: ud,
    lang: 'ko',
    onboardingSeen: true,
    settings: { defaultSaveDir: docs },
    videoDir: `pf-bugs-${name}`,
    recordVideo: false,
  })
  const { app, page } = launched
  await stubEverything(app)
  await page.reload()
  await page.locator('.nav-item', { hasText: '프로젝트' }).first().click()
  await page.getByRole('button', { name: '새 프로젝트' }).click()
  await page.locator('.projects-create input').fill('P')
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(page.locator('.projects-name-field input')).toHaveValue('P')
  const proj = join(docs, 'P')
  await writeFile(join(proj, 'a.md'), '# A\n')
  await writeFile(join(proj, 'b.html'), '<h1>B</h1>')
  return { launched, app, page, proj, run }
}

async function send(page: Page, text: string): Promise<void> {
  await page.locator('.ai-composer textarea').first().fill(text)
  await page.locator('.ai-composer .ai-send-btn').first().click()
}

async function openDoc(s: Setup, file: string, urlPart: string): Promise<Page> {
  await s.page.evaluate((p) => window.aiOffice.openPath(p), join(s.proj, file))
  return waitForPageWithUrl(s.app, urlPart)
}

test.describe('project folder problems a first-time user hit', () => {
  // Was: the home project screen read memory once; what the AI remembered
  // meanwhile only showed after leaving the project and opening it again.
  test('home project screen shows memory the AI just wrote', async () => {
    const s = await setup('stale-memory')
    try {
      const md = await openDoc(s, 'a.md', '://markdown/')
      await queueTurns(s.app, [
        {
          toolCalls: [
            {
              id: 'm',
              name: 'project_remember',
              input: { op: 'add', text: '결재는 화요일 (2026-10-30)' },
            },
          ],
        },
        { text: '기억했습니다.' },
      ])
      await send(md, '결재는 화요일이야. 기억해 줘')
      await expect(md.locator('.ai-project-event-text', { hasText: '기억함' })).toBeVisible()
      expect(await readFile(join(s.proj, '.ieumoffice', 'memory.md'), 'utf8')).toContain(
        '결재는 화요일',
      )
      await s.page.locator('.tab-bar .tab-home').click()
      await s.page.locator('.projects-tabs [role=tab]', { hasText: '기억' }).click()
      await shot(s.page, 'b01-home-memory-stale')
      await expect(s.page.locator('.projects-pane')).toContainText('결재는 화요일', {
        timeout: 5_000,
      })
    } finally {
      await closeAndSaveVideo(s.launched, 'pf-bugs-stale-memory')
      await removeRun(s.run)
    }
  })

  // Was: "지침이 바뀌었습니다 [보기]" opened the project screen with the OLD
  // instructions; editing and saving there silently threw away the change
  // made outside the app.
  test('[보기] after an outside change shows the new instructions and saving keeps them', async () => {
    const s = await setup('stale-instructions')
    try {
      await s.page.locator('.projects-textarea').fill('개조식으로 쓴다.')
      await s.page.getByRole('button', { name: '저장', exact: true }).click()
      await expect(s.page.getByText('저장했습니다.')).toBeVisible()
      const md = await openDoc(s, 'a.md', '://markdown/')
      await send(md, '첫 요청')
      await expect.poll(async () => (await recorded(s.app)).streams.length).toBe(1)
      // a colleague (or Notepad) adds a rule
      const file = join(s.proj, '.ieumoffice', 'instructions.md')
      await writeFile(file, '개조식으로 쓴다.\n날짜는 2026. 10. 30. 꼴로 적는다.\n')
      await send(md, '둘째 요청')
      await expect.poll(async () => (await recorded(s.app)).streams.length).toBe(2)
      expect((await recorded(s.app)).streams[1]).toContain('날짜는 2026. 10. 30.')
      const notice = md.locator('.ai-project-notice', { hasText: '지침이 바뀌었습니다' })
      await notice.getByRole('button', { name: '보기' }).click()
      // the screen reads the folder again for the request
      await expect(s.page.locator('.projects-textarea')).toHaveValue(/날짜는 2026\. 10\. 30\./)
      await shot(s.page, 'b02-view-shows-new-instructions')
      const shown = await s.page.locator('.projects-textarea').inputValue()
      // the person adds one more rule on the screen [보기] opened and saves
      await s.page.locator('.projects-textarea').fill(`${shown}\n표는 쓰지 않는다.`)
      await s.page.getByRole('button', { name: '저장', exact: true }).click()
      await expect(s.page.getByText('저장했습니다.')).toBeVisible()
      const after = await readFile(file, 'utf8')
      expect(shown).toContain('날짜는 2026. 10. 30.')
      expect(after).toContain('날짜는 2026. 10. 30.')
    } finally {
      await closeAndSaveVideo(s.launched, 'pf-bugs-stale-instructions')
      await removeRun(s.run)
    }
  })

  // Was: a memory removed in one window still showed "기억함: … [지우기]" in
  // the same chat opened in another editor; pressing it did nothing visible.
  test('a memory removed in one editor is not offered for removal again in another', async () => {
    const s = await setup('stale-memory-line')
    try {
      const md = await openDoc(s, 'a.md', '://markdown/')
      await queueTurns(s.app, [
        {
          toolCalls: [
            {
              id: 'm',
              name: 'project_remember',
              input: { op: 'add', text: '회비는 2만 원 (2026-10-30)' },
            },
          ],
        },
        { text: '첫 답' },
      ])
      await send(md, '첫 질문')
      // the run is over and its reply recorded: the chat is in the project's list from now on
      await expect(md.getByText('첫 답')).toBeVisible()
      const line = md.locator('.ai-project-event', { hasText: '회비는 2만 원' })
      await line.getByRole('button', { name: '지우기' }).click()
      await expect
        .poll(async () => readFile(join(s.proj, '.ieumoffice', 'memory.md'), 'utf8'))
        .not.toContain('회비는')
      // the same window: the line now says it was removed
      await expect(line).toContainText('기억 지움: 회비는 2만 원')
      await expect(line.getByRole('button', { name: '지우기' })).toHaveCount(0)
      const html = await openDoc(s, 'b.html', '://html/')
      // the panel knows its project and has opened its own new chat (the chip is enabled once it has)
      const chip = html.locator('.ai-project-chip')
      await expect(chip).toContainText('P')
      await expect(chip).toBeEnabled()
      const chatButton = html.locator('.ai-project-chat-menu .ai-project-chat-button')
      await chatButton.click()
      await html
        .locator('.ai-project-chat-menu .ai-project-list > *', { hasText: '첫 질문' })
        .first()
        .click()
      // the pick took: the header names the chat (a failure here is the pick, not the messages)
      await expect(chatButton).toContainText('첫 질문')
      await expect(html.getByText('첫 답')).toBeVisible()
      const other = html.locator('.ai-project-event', { hasText: '회비는 2만 원' })
      await shot(html, 'b03-removed-memory-line')
      // the other editor's line says it was removed and has nothing to press
      await expect(other).toContainText('기억 지움: 회비는 2만 원')
      await expect(other.getByRole('button', { name: '지우기' })).toHaveCount(0, { timeout: 3_000 })
    } finally {
      await closeAndSaveVideo(s.launched, 'pf-bugs-stale-memory-line')
      await removeRun(s.run)
    }
  })

  // Was: with a long chat title the markdown AI panel header grew wider than
  // the panel and pushed the panel buttons at the right end out of view.
  test('a long chat title keeps the AI panel header buttons inside the panel', async () => {
    const s = await setup('long-title')
    try {
      const md = await openDoc(s, 'a.md', '://markdown/')
      await send(md, '학부모 안내문을 읽고 상담 주간이 언제인지 알려 주고 일정표도 같이 만들어 줘')
      await expect(md.getByText('네, 알겠습니다.')).toBeVisible()
      await md.waitForTimeout(500)
      await shot(md, 'b04-long-title-header')
      const geo = await md.evaluate(() => {
        const panel = document.querySelector('.copilot') as HTMLElement
        const p = panel.getBoundingClientRect()
        const chip = document.querySelector('.ai-project-chat-menu') as HTMLElement | null
        const header = (chip?.parentElement ?? panel) as HTMLElement
        const buttons = Array.from(header.querySelectorAll('button')).map((b) => {
          const r = b.getBoundingClientRect()
          return {
            label: b.getAttribute('aria-label') ?? b.textContent?.trim().slice(0, 20),
            left: Math.round(r.left),
            right: Math.round(r.right),
          }
        })
        const scrolled = Array.from(panel.querySelectorAll('*'))
          .filter((e) => (e as HTMLElement).scrollLeft > 0)
          .map((e) => (e as HTMLElement).className)
        return { panelLeft: Math.round(p.left), panelRight: Math.round(p.right), buttons, scrolled }
      })
      for (const b of geo.buttons) {
        expect(b.right, `${b.label} inside the panel`).toBeLessThanOrEqual(geo.panelRight)
        expect(b.left, `${b.label} inside the panel`).toBeGreaterThanOrEqual(geo.panelLeft)
      }
      expect(geo.scrolled, 'nothing in the panel scrolled sideways').toEqual([])
    } finally {
      await closeAndSaveVideo(s.launched, 'pf-bugs-long-title')
      await removeRun(s.run)
    }
  })
})
