import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'
import {
  queueTurns,
  recorded,
  removeRun,
  scratch,
  shot,
  stubEverything,
} from './project-folder-user-lib'

/**
 * A first-time, non-technical user walks through the project folder feature
 * (decision 0088) on the built app, in Korean: make a project on the home
 * screen, write its instructions, drop documents into the folder, use it from
 * two editors, let the (fake) AI remember something, hide a file, continue a
 * chat in another editor, drop the project mid-chat, and delete a chat.
 *
 * The AI is a stub that plays scripted turns (see project-folder-user-lib.ts);
 * nothing reaches Claude or Codex. Folders live under PF_ROOT (F:\ieum-scratch).
 */

const INSTRUCTIONS = '보고서는 개조식으로 쓰고, 기관명은 ○○교육지원청으로 줄이지 않는다.'
const MEMORY_A = '교장 결재는 매월 둘째 주 화요일에 받는다 (2026-10-30)'
const MEMORY_B = '보고서 글꼴은 맑은 고딕 11pt를 좋아한다 (2026-10-30)'

async function send(page: Page, text: string): Promise<void> {
  const box = page.locator('.ai-composer textarea').first()
  await box.click()
  await box.fill(text)
  await page.locator('.ai-composer .ai-send-btn').first().click()
}

/** wait until the stub has seen `count` requests in total */
async function waitStreams(app: Parameters<typeof recorded>[0], count: number): Promise<string[]> {
  await expect
    .poll(async () => (await recorded(app)).streams.length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(count)
  return (await recorded(app)).streams
}

test.describe('project folder, as a first-time user', () => {
  test('make a project, use it from two editors, memory, hidden file, chats', async () => {
    test.setTimeout(300_000)
    const run = `main-${Date.now()}`
    const ud = await scratch(run, 'userdata')
    const docs = await scratch(run, '문서')
    const launched = await launchShell({
      userDataDir: ud,
      lang: 'ko',
      onboardingSeen: true,
      settings: { defaultSaveDir: docs },
      videoDir: 'pf-user',
      recordVideo: false,
    })
    const { app, page } = launched
    const proj = join(docs, '2학기 운영 보고서')
    try {
      await stubEverything(app)
      await page.reload()

      await test.step('1-3. 홈 > 프로젝트 > 새 프로젝트, 지침 저장', async () => {
        await page.locator('.nav-item', { hasText: '프로젝트' }).first().click()
        await page.getByRole('button', { name: '새 프로젝트' }).click()
        await page.locator('.projects-create input').fill('2학기 운영 보고서')
        await expect(page.locator('.projects-location')).toContainText(proj)
        await page.getByRole('button', { name: '만들기', exact: true }).click()
        await page.locator('.projects-textarea').fill(INSTRUCTIONS)
        await page.getByRole('button', { name: '저장', exact: true }).click()
        await expect(page.getByText('저장했습니다.')).toBeVisible()
        expect(await readFile(join(proj, '.ieumoffice', 'instructions.md'), 'utf8')).toContain(
          '개조식',
        )
        await shot(page, 'u01-instructions-saved')
      })

      await writeFile(
        join(proj, '운영 보고서 초안.md'),
        '# 2학기 운영 보고서\n\n- 방과후 프로그램 12개 운영\n',
      )
      await writeFile(
        join(proj, '학부모 안내문.html'),
        '<html><body><h1>학부모 안내문</h1><p>2학기 상담 주간은 10월 셋째 주입니다.</p></body></html>',
      )
      await writeFile(join(proj, '예산 메모.txt'), '예산 잔액 3,200,000원 (비공개)\n')

      let md!: Page
      await test.step('4. 문서를 열면 AI 창에 프로젝트가 골라져 있고, 요청에 지침과 파일 목록이 간다', async () => {
        await page.evaluate((p) => window.aiOffice.openPath(p), join(proj, '운영 보고서 초안.md'))
        md = await waitForPageWithUrl(app, '://markdown/')
        await expect(md.locator('.ai-project-chip')).toContainText('2학기 운영 보고서')
        await queueTurns(app, [
          {
            toolCalls: [
              { id: 'l1', name: 'project_list_files', input: {} },
              { id: 'r1', name: 'project_read', input: { path: '학부모 안내문.html' } },
              { id: 'm1', name: 'project_remember', input: { op: 'add', text: MEMORY_A } },
              { id: 'm2', name: 'project_remember', input: { op: 'add', text: MEMORY_B } },
            ],
          },
          { text: '안내문을 읽었습니다. 상담 주간은 10월 셋째 주입니다.' },
        ])
        await send(md, '학부모 안내문을 읽고 상담 주간이 언제인지 알려 줘')
        const streams = await waitStreams(app, 2)
        const first = streams[0]!
        expect(first).toContain('개조식')
        expect(first).toContain('운영 보고서 초안.md')
        expect(first).toContain('학부모 안내문.html')
        expect(first).toContain('예산 메모.txt')
        // the second turn carries the read file's text back to the model
        expect(streams[1]).toContain('상담 주간은 10월 셋째 주')
        await expect(md.locator('.ai-msg-assistant, .ai-msg').last()).toContainText('셋째 주', {
          timeout: 15_000,
        })
        await expect(
          md.locator('.ai-project-event-text', { hasText: `기억함: ${MEMORY_A}` }),
        ).toBeVisible()
        await shot(md, 'u02-md-first-reply-memory')
      })

      await test.step('5. 기억함 줄의 [지우기]와 홈 프로젝트 화면의 기억', async () => {
        const lineB = md.locator('.ai-project-event', { hasText: MEMORY_B })
        await lineB.getByRole('button', { name: '지우기' }).click()
        await expect
          .poll(async () => readFile(join(proj, '.ieumoffice', 'memory.md'), 'utf8'))
          .not.toContain('맑은 고딕')
        await shot(md, 'u03-md-memory-removed')
        // the home tab
        await page.locator('.tab-bar .tab-home').click()
        await page
          .locator('.projects-tabs button, .projects-tabs [role=tab]', { hasText: '기억' })
          .click()
        await page.waitForTimeout(2000)
        await shot(page, 'u04a-home-memory-before-reopen')
        // leave the project and come back: the screen reads the folder again
        await page.getByRole('button', { name: '모든 프로젝트' }).click()
        await page.locator('.projects-row', { hasText: '2학기 운영 보고서' }).first().click()
        await page.locator('.projects-tabs [role=tab]', { hasText: '기억' }).click()
        await expect(page.locator('.projects-memory-list')).toContainText('교장 결재')
        await expect(page.locator('.projects-memory-list')).not.toContainText('맑은 고딕')
        await shot(page, 'u04-home-memory')
      })

      let html!: Page
      await test.step('6. 다른 편집기에서 같은 대화를 이어 가기', async () => {
        await page.evaluate((p) => window.aiOffice.openPath(p), join(proj, '학부모 안내문.html'))
        html = await waitForPageWithUrl(app, '://html/')
        await expect(html.locator('.ai-project-chip')).toContainText('2학기 운영 보고서')
        await shot(html, 'u05-html-opened')
        await html.locator('.ai-project-chat-menu button').first().click()
        await shot(html, 'u06-html-chat-menu')
        await html
          .locator(
            '.ai-project-chat-menu .ai-project-list [role=option], .ai-project-chat-menu .ai-project-list button',
            {
              hasText: '상담 주간',
            },
          )
          .first()
          .click()
        await expect(html.getByText('상담 주간은 10월 셋째 주입니다.').first()).toBeVisible()
        await shot(html, 'u07-html-chat-continued')
        const before = (await recorded(app)).streams.length
        await queueTurns(app, [{ text: '안내문에 맞춰 개조식으로 정리하겠습니다.' }])
        await send(html, '안내문도 개조식으로 바꿔 줘')
        const streams = await waitStreams(app, before + 1)
        // the earlier turn of the chat goes along as history
        expect(streams[before]).toContain('상담 주간이 언제인지')
        await expect(html.getByText('안내문에 맞춰 개조식으로 정리하겠습니다.')).toBeVisible()
        // the markdown tab shows the same chat: the message sent from the html tab appears there too
        await expect(md.getByText('안내문에 맞춰 개조식으로 정리하겠습니다.')).toBeVisible({
          timeout: 10_000,
        })
        await shot(md, 'u08-md-sees-other-tab-message')
      })

      await test.step('7. 파일 하나를 AI가 보지 않게', async () => {
        await page.locator('.tab-bar .tab-home').click()
        await page
          .locator('.projects-tabs button, .projects-tabs [role=tab]', { hasText: '파일' })
          .click()
        await page.getByRole('button', { name: 'AI가 보지 않게: 예산 메모.txt' }).click()
        await expect(page.locator('.projects-ignored-list')).toContainText('예산 메모.txt')
        await shot(page, 'u09-home-file-hidden')
        await page
          .locator('.tab-bar .tab-item:not(.tab-home)', { hasText: '학부모 안내문' })
          .click()
        const before = (await recorded(app)).streams.length
        await queueTurns(app, [
          { toolCalls: [{ id: 'r2', name: 'project_read', input: { path: '예산 메모.txt' } }] },
          { text: '그 파일은 읽을 수 없습니다.' },
        ])
        await send(html, '예산 메모도 읽어 줘')
        const streams = await waitStreams(app, before + 2)
        const projectPart = (s: string) => s.slice(s.indexOf('Files in the project'))
        expect(projectPart(streams[before]!)).not.toContain('예산 메모.txt')
        expect(streams[before + 1]).not.toContain('3,200,000')
        await shot(html, 'u10-html-hidden-file-refused')
      })

      await test.step('10a. 대화 도중 프로젝트 없이', async () => {
        await html.locator('.ai-project-chip').click()
        await html.locator('.ai-project-pop').getByText('프로젝트 없이').click()
        await shot(html, 'u11-html-no-project')
        const before = (await recorded(app)).streams.length
        await send(html, '아무 프로젝트 없이 물어봐요')
        const streams = await waitStreams(app, before + 1)
        expect(streams[before]).not.toContain('개조식')
        expect(streams[before]).not.toContain('Files in the project')
        await shot(html, 'u12-html-no-project-sent')
      })

      await test.step('10b. 대화 지우기', async () => {
        await md.bringToFront()
        await page
          .locator('.tab-bar .tab-item:not(.tab-home)', { hasText: '운영 보고서 초안' })
          .click()
        await md.locator('.ai-project-chat-menu button').first().click()
        const row = md
          .locator('.ai-project-chat-menu .ai-project-list > *', { hasText: '상담 주간' })
          .first()
        await row.hover()
        await row.getByRole('button', { name: '지우기' }).click()
        await shot(md, 'u13-md-delete-confirm')
        await md.locator('.ai-project-confirm-delete').click()
        await shot(md, 'u14-md-after-delete')
        await expect(
          md.locator('.ai-project-chat-menu .ai-project-list > *', { hasText: '상담 주간' }),
        ).toHaveCount(0)
      })
    } finally {
      await closeAndSaveVideo(launched, 'pf-user')
      await removeRun(run)
    }
  })
})
