/**
 * Exploratory QA (outside tester): the AI window side of user MCP servers —
 * the "connected servers" button and list, the approval card, and Settings →
 * Skills marks. No real AI: `ai:stream` is replaced in the main process (the
 * same hook `stubAiReady` uses) by a script that asks for one tool call when
 * the typed prompt says `TOOL:<name>:<json>` and answers plain text otherwise.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { closeAndSaveVideo, freeMcpPort, waitForPageWithUrl } from './helpers'
import { launchKo, openIntegrations, scratchDir, shot, startServers } from './user-mcp-lib'

test.describe.configure({ mode: 'serial' })

/** stubAiReady's pattern, with a scripted tool call and a record of what the AI was given */
async function stubScriptedAi(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain, webContents }) => {
    const g = globalThis as unknown as { __mcpAiLog: unknown[] }
    g.__mcpAiLog = []
    const proto = Object.getPrototypeOf(webContents.getAllWebContents()[0]) as {
      send: (channel: string, ...args: unknown[]) => void
    }
    const realSend = proto.send
    proto.send = function (this: unknown, channel: string, ...args: unknown[]) {
      if (channel === 'ai:subscription-changed') return
      return realSend.call(this, channel, ...args)
    }
    const statuses = {
      'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
      codex: { provider: 'codex', state: 'not-installed', meteredAccepted: false },
    }
    for (const channel of ['ai:subscription-statuses', 'ai:subscription-recheck']) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, () => statuses)
    }
    ipcMain.removeHandler('ai:stream')
    let n = 0
    const seen = new Set<string>()
    ipcMain.handle(
      'ai:stream',
      (
        event,
        request: {
          requestId: string
          system: string
          messages: Array<{ role: string; content: unknown }>
          tools?: Array<{ name: string; description?: string }>
        },
      ) => {
        const send = (chunk: Record<string, unknown>) =>
          realSend.call(event.sender, 'ai:stream-chunk', { requestId: request.requestId, ...chunk })
        const last = request.messages[request.messages.length - 1]
        const all = JSON.stringify(request.messages).replace(/\\"/g, '"')
        const lastText = JSON.stringify(last?.content ?? '')
        const mcpTools = (request.tools ?? []).filter((t) => t.name.startsWith('mcp__'))
        g.__mcpAiLog.push({
          keys: Object.keys(request.messages[0] ?? {}),
          shape: request.messages.map(
            (m) =>
              `${m.role}:${typeof m.content === 'string' ? 'str' + (m.content as string).length : String(JSON.stringify(m.content ?? null)).slice(0, 60)}`,
          ),
          last: lastText.slice(0, 200),
          toolCount: (request.tools ?? []).length,
          mcpTools: mcpTools.map((t) => `${t.name}: ${(t.description ?? '').slice(0, 80)}`),
          systemHasInstructions: String(request.system ?? '').includes('test server'),
          systemMcpExcerpt: (
            String(request.system ?? '').match(/[^\n]*test server[^\n]*/g) ?? []
          ).slice(0, 3),
        })
        const marks = [...all.matchAll(/TOOL:([A-Za-z0-9_-]+):(\{[^}]*\})/g)]
        const m = marks[marks.length - 1]
        if (m && !seen.has(m[0])) {
          seen.add(m[0])
          n += 1
          send({
            type: 'tool-call',
            toolCall: { id: `call_${n}`, name: m[1], input: JSON.parse(m[2]!) },
          })
          send({ type: 'done', stopReason: 'tool_use' })
          return
        }
        send({ type: 'delta', text: `스크립트 답: 받은 마지막 내용 = ${lastText.slice(0, 120)}` })
        send({ type: 'done' })
      },
    )
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) realSend.call(wc, 'ai:subscription-changed', statuses)
    }
  })
}

async function aiLog(app: ElectronApplication): Promise<unknown[]> {
  return app.evaluate(() => (globalThis as unknown as { __mcpAiLog: unknown[] }).__mcpAiLog ?? [])
}

async function send(editor: Page, text: string): Promise<void> {
  const box = editor.locator('.copilot textarea').first()
  await box.fill(text)
  await box.press('Enter')
}

test('AI window: server button, list, approval card, skills marks, narrow window', async () => {
  test.setTimeout(300_000)
  const dir = await scratchDir('aiwin')
  const servers = await startServers(dir)
  const userDataDir = join(dir, 'userdata')
  // a skill in the (scratch) home that expects two servers, one never registered
  const skillDir = join(dir, 'home', '.claude', 'skills', 'word-helper')
  await mkdir(skillDir, { recursive: true })
  await writeFile(
    join(skillDir, 'SKILL.md'),
    `---\nname: word-helper\ndescription: 낱말 뜻을 찾아 문서에 적는다\n---\n\n1. mcp__dict__lookup_word 로 낱말 뜻을 찾는다.\n2. mcp__lawfinder__search_law 로 관련 법령을 찾는다.\n3. 문서에 적는다.\n`,
  )

  // first launch: register the address server and a second one that stays off
  let launched = await launchKo(dir, 'user-mcp-aiwin-setup', { userDataDir })
  try {
    const { page } = launched
    await openIntegrations(page)
    const card = page.getByTestId('mcp-servers')
    for (const name of ['dict', 'spare']) {
      await card.getByRole('button', { name: '서버 더하기' }).click()
      const form = card.getByTestId('mcp-form')
      await form.locator('input[name="name"]').fill(name)
      await form.locator('input[name="url"]').fill(servers.url)
      await form.locator('input[name="allow-plain-http"]').check()
      await form.getByRole('button', { name: '등록', exact: true }).click()
      await expect(card.locator('.mcp-server-name', { hasText: name })).toBeVisible()
    }
    // B1: the first run had to press "check" here, or the AI got no mcp__ tools although
    // the list said "connected"; registering now checks by itself
    const dictRow = card.locator('li.mcp-server', {
      has: page.locator('.mcp-server-name', { hasText: /^dict$/ }),
    })
    if ((await dictRow.getAttribute('data-open')) !== 'true')
      await dictRow.getByRole('button', { name: '열기' }).click()
    await expect(dictRow.locator('li.mcp-tool')).toHaveCount(2, { timeout: 30_000 })
    await expect(dictRow).toHaveAttribute('data-status', 'connected')
    const spare = card.locator('li.mcp-server', {
      has: page.locator('.mcp-server-name', { hasText: /^spare$/ }),
    })
    await spare.locator('input[name="enabled"]').click()
    await expect(spare).toHaveAttribute('data-status', 'disabled')

    // Settings → Skills: is word-helper marked as needing a server?
    await page.locator('.set-nav-item').filter({ hasText: '스킬' }).click()
    await page.waitForTimeout(1500)
    await page.getByPlaceholder('제목, 이름, 설명으로 찾기').fill('word')
    await page.waitForTimeout(800)
    const row = page.locator('li', { hasText: 'word-helper' }).last()
    console.log('skill row found:', await row.count())
    if (await row.count()) {
      await row.scrollIntoViewIfNeeded()
      console.log('skill row text:', (await row.innerText()).replace(/\n/g, ' | '))
    }
    await shot(page, '40-skills-mcp-mark')
  } finally {
    await closeAndSaveVideo(launched, 'user-mcp-aiwin-setup')
  }

  // second launch: open a Markdown file and use the AI window
  const md = join(dir, 'note.md')
  await writeFile(md, '# 낱말 노트\n\n사과\n')
  launched = await launchKo(dir, 'user-mcp-aiwin', { userDataDir, openFile: md })
  const { app, page } = launched
  try {
    const editor = await waitForPageWithUrl(app, '://markdown/')
    await expect(editor.locator('.doc-editor h1')).toHaveText('낱말 노트')
    await stubScriptedAi(app)
    if (!(await editor.locator('.copilot').isVisible())) await editor.locator('.ai-rail').click()
    await expect(editor.locator('.copilot')).toBeVisible()

    const btn = editor.locator('.ai-mcp-server-btn')
    await expect(btn).toBeVisible({ timeout: 15_000 })
    await shot(editor, '41-ai-window-button')
    await btn.hover()
    await editor.waitForTimeout(600)
    await shot(editor, '41b-ai-window-button-tip')

    // the list, by keyboard
    await btn.focus()
    await editor.keyboard.press('Enter')
    const pop = editor.locator('.ai-mcp-pop')
    await expect(pop).toBeVisible()
    console.log(
      'focused in list:',
      await editor.evaluate(() => document.activeElement?.outerHTML.slice(0, 160)),
    )
    console.log('list text:', (await pop.innerText()).replace(/\n/g, ' | '))
    // B1: approved before, not reached yet in this run: ready, not "connected"
    const dictItem = pop.locator('li.ai-mcp-row', { hasText: 'dict' })
    await expect(dictItem.locator('.ai-mcp-row-status')).toHaveText('준비됨')
    await shot(editor, '42-ai-window-server-list')
    await editor.keyboard.press('Escape')
    await expect(pop).toBeHidden()
    console.log(
      'focus after Escape on button?',
      await btn.evaluate((el) => el === document.activeElement),
    )

    // 1) a tool that asks first
    await send(editor, '메모를 저장해 줘 TOOL:mcp__dict__save_note:{"text":"hello"}')
    const cardEl = editor.locator('.ai-mcp-card')
    const appeared = await cardEl.waitFor({ timeout: 20_000 }).then(
      () => true,
      () => false,
    )
    console.log('approval card appeared:', appeared)
    await shot(editor, '43-approval-card')
    if (appeared) {
      console.log('card text:', (await cardEl.innerText()).replace(/\n/g, ' | '))
      console.log(
        'focus in card?',
        await cardEl.evaluate((el) => el.contains(document.activeElement)),
      )
      const logBefore = await readFile(servers.log, 'utf8').catch(() => '')
      console.log('server got save_note before answer?', logBefore.includes('tools/call save_note'))
      await cardEl.getByRole('button', { name: '이번만 허용' }).click()
      await editor.waitForTimeout(2500)
      console.log(
        'server got save_note after allow once?',
        (await readFile(servers.log, 'utf8').catch(() => '')).includes('tools/call save_note'),
      )
      await shot(editor, '44-after-allow-once')

      // again: "once" must ask again; this time block
      await send(editor, '하나 더 TOOL:mcp__dict__save_note:{"text":"second"}')
      const again = await cardEl.waitFor({ timeout: 20_000 }).then(
        () => true,
        () => false,
      )
      console.log('card asked again after "once":', again)
      if (again) {
        await cardEl.getByRole('button', { name: '막기' }).click()
        await editor.waitForTimeout(2500)
        console.log(
          'server got "second"?',
          (await readFile(servers.log, 'utf8').catch(() => '')).includes('second'),
        )
        // P9: how the steps read now
        for (const summary of await editor.locator('.ai-work-group-summary').all()) {
          await summary.click().catch(() => {})
        }
        await editor.waitForTimeout(300)
        console.log(
          'step rows:',
          (await editor.locator('.ai-work-group').allInnerTexts()).map((t) =>
            t.replace(/\n/g, ' | '),
          ),
        )
        await shot(editor, '45-after-deny')
      }
    }

    // 2) a read-only tool: no card expected
    await send(editor, '사과 뜻 TOOL:mcp__dict__lookup_word:{"word":"apple"}')
    await editor.waitForTimeout(4000)
    console.log('card for always-allowed tool?', await cardEl.isVisible())
    console.log('AI requests so far:', JSON.stringify(await aiLog(app), null, 1).slice(0, 5000))
    console.log(
      'server got lookup apple?',
      (await readFile(servers.log, 'utf8').catch(() => '')).includes('"word":"apple"'),
    )
    await shot(editor, '46-always-allowed-call')

    // 3) turn dict off for this conversation, then ask for it again
    await btn.click()
    await pop.getByRole('checkbox', { name: /dict/ }).uncheck()
    console.log(
      'list after turning dict off here (P8):',
      (await pop.innerText()).replace(/\n/g, ' | '),
    )
    await shot(editor, '47-dict-off-in-chat')
    await editor.keyboard.press('Escape')
    await send(editor, '배 뜻 TOOL:mcp__dict__lookup_word:{"word":"pear"}')
    await editor.waitForTimeout(4000)
    console.log(
      'server got pear while off in chat?',
      (await readFile(servers.log, 'utf8').catch(() => '')).includes('"word":"pear"'),
    )
    await shot(editor, '48-call-while-off')

    // 4) narrow window
    const win = await app.browserWindow(page)
    await win.evaluate((w) => w.setSize(760, 640))
    await editor.waitForTimeout(1200)
    await btn.click().catch(() => {})
    await editor.waitForTimeout(500)
    await shot(editor, '49-narrow-window-list')
    await editor.keyboard.press('Escape')

    const log = await aiLog(app)
    console.log('AI requests:', JSON.stringify(log, null, 1).slice(0, 6000))
  } finally {
    await closeAndSaveVideo(launched, 'user-mcp-aiwin')
    await servers.stop()
    console.log('server log:\n' + (await readFile(servers.log, 'utf8').catch(() => '')))
  }
})

test('registered but never checked: what the lists say and what the AI gets; live server changes', async () => {
  test.setTimeout(240_000)
  const dir = await scratchDir('fresh')
  const servers = await startServers(dir)
  const userDataDir = join(dir, 'userdata')
  let launched = await launchKo(dir, 'user-mcp-fresh-setup', { userDataDir })
  try {
    const { page } = launched
    await openIntegrations(page)
    const card = page.getByTestId('mcp-servers')
    await card.getByRole('button', { name: '서버 더하기' }).click()
    const form = card.getByTestId('mcp-form')
    await form.locator('input[name="name"]').fill('dict')
    await form.locator('input[name="url"]').fill(servers.url)
    await form.locator('input[name="allow-plain-http"]').check()
    await form.getByRole('button', { name: '등록', exact: true }).click()
    const item = card.locator('li.mcp-server').first()
    // B1: registering checks the server; "connected" only after the app reached it
    await expect(item).toHaveAttribute('data-status', 'connected', { timeout: 30_000 })
    await expect(item.locator('li.mcp-tool')).toHaveCount(2)
    console.log(
      'fresh: status',
      await item.getAttribute('data-status'),
      '| meta:',
      (await item.locator('.mcp-server-meta').innerText()).replace(/\n/g, ' '),
    )
    await shot(page, '50-fresh-registered-no-check')
    const afterRegister = await readFile(servers.log, 'utf8').catch(() => '')
    expect(afterRegister).toContain('tools/list')

    // a server at an address where nothing answers: never "connected"
    await card.getByRole('button', { name: '서버 더하기' }).click()
    const second = card.getByTestId('mcp-form')
    await second.locator('input[name="name"]').fill('wrong')
    await second.locator('input[name="url"]').fill(`http://127.0.0.1:${await freeMcpPort()}/mcp`)
    await second.locator('input[name="allow-plain-http"]').check()
    await second.getByRole('button', { name: '등록', exact: true }).click()
    const wrong = card.locator('li.mcp-server', {
      has: page.locator('.mcp-server-name', { hasText: /^wrong$/ }),
    })
    await expect(wrong).toHaveAttribute('data-status', 'failed', { timeout: 30_000 })
  } finally {
    await closeAndSaveVideo(launched, 'user-mcp-fresh-setup')
  }

  const md = join(dir, 'note.md')
  await writeFile(md, '# 노트\n')
  launched = await launchKo(dir, 'user-mcp-fresh', { userDataDir, openFile: md })
  const { app } = launched
  try {
    const editor = await waitForPageWithUrl(app, '://markdown/')
    await expect(editor.locator('.doc-editor h1')).toHaveText('노트')
    await stubScriptedAi(app)
    if (!(await editor.locator('.copilot').isVisible())) await editor.locator('.ai-rail').click()
    const btn = editor.locator('.ai-mcp-server-btn')
    await expect(btn).toBeVisible({ timeout: 15_000 })
    await btn.click()
    const freshPop = editor.locator('.ai-mcp-pop')
    console.log('fresh AI list:', (await freshPop.innerText()).replace(/\n/g, ' | '))
    // B1: the checked server is ready (not reached yet in this run); the one never
    // listed is "not checked yet" and sends the person to Settings
    await expect(
      freshPop.locator('li.ai-mcp-row', { hasText: 'dict' }).locator('.ai-mcp-row-status'),
    ).toHaveText('준비됨')
    const wrongRow = freshPop.locator('li.ai-mcp-row', { hasText: 'wrong' })
    await expect(wrongRow.locator('.ai-mcp-row-status')).toHaveText('확인 전')
    await expect(wrongRow.getByRole('button', { name: '설정에서 연결 확인' })).toBeVisible()
    await shot(editor, '51-fresh-ai-list')
    await editor.keyboard.press('Escape')
    await send(editor, '사과 뜻 TOOL:mcp__dict__lookup_word:{"word":"apple"}')
    await editor.waitForTimeout(5000)
    const log = (await aiLog(app)) as Array<{ mcpTools: string[] }>
    console.log(
      'fresh: mcp tools given to AI per request:',
      JSON.stringify(log.map((r) => r.mcpTools)),
    )
    // B1: the AI gets the server's tools from the first request
    expect(log[0]?.mcpTools.some((t) => t.startsWith('mcp__dict__lookup_word'))).toBe(true)
    console.log(
      'fresh: server got the call?',
      (await readFile(servers.log, 'utf8').catch(() => '')).includes('apple'),
    )
    await shot(editor, '52-fresh-ai-call')

    // a server-side change while this AI window is open: does the button show "new tools"?
    await servers.setHttpState({ extraTool: true })
    await editor.waitForTimeout(5000)
    await btn.click()
    console.log(
      'after server added a tool, AI list:',
      (await editor.locator('.ai-mcp-pop').innerText()).replace(/\n/g, ' | '),
    )
    await shot(editor, '53-ai-list-after-new-tool')
    await editor.keyboard.press('Escape')
    console.log('server log:\n' + (await readFile(servers.log, 'utf8').catch(() => '')))
  } finally {
    await closeAndSaveVideo(launched, 'user-mcp-fresh')
    await servers.stop()
  }
})
