/**
 * Exploratory QA (outside tester): Settings → Integrations → MCP servers,
 * driven as a person would, in Korean. Local test servers only (127.0.0.1
 * and a stdio Node script); screenshots go under the scratch folder of
 * user-mcp-lib.ts. What the first exploratory run found (B1-B6) is asserted;
 * the rest is still logged for a person to read.
 */
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { closeAndSaveVideo, freeMcpPort } from './helpers'
import {
  STDIO_SERVER,
  launchKo,
  openIntegrations,
  scratchDir,
  shot,
  startServers,
} from './user-mcp-lib'

test.describe.configure({ mode: 'serial' })

test('address server: name problems, plain-http warning, check, tools, permissions, on/off, delete', async () => {
  test.setTimeout(240_000)
  const dir = await scratchDir('addr')
  const servers = await startServers(dir)
  const launched = await launchKo(dir, 'user-mcp-addr')
  const { page } = launched
  try {
    await openIntegrations(page)
    const card = page.getByTestId('mcp-servers')
    await card.scrollIntoViewIfNeeded()
    await shot(page, '01-integrations-empty')
    await expect(card).toContainText('아직 등록한 서버가 없습니다.')

    await card.getByRole('button', { name: '서버 더하기' }).click()
    const form = card.getByTestId('mcp-form')
    await expect(form).toBeVisible()
    await shot(page, '02-add-form-direct')

    const name = form.locator('input[name="name"]')
    const register = form.getByRole('button', { name: '등록', exact: true })
    // name problems a non-technical person would type
    const tries: Array<[string, string]> = [
      ['내 사전', 'korean-space'],
      ['my dict', 'space'],
      ['a__b', 'double-underscore'],
      ['_dict', 'edge'],
      ['abcdefghijklmnopqrstuvwxy', 'too-long'],
    ]
    for (const [value, label] of tries) {
      await name.fill(value)
      await expect(form.locator('.mcp-name-fix')).toBeVisible()
      await shot(page, `03-name-${label}`)
      console.log(
        `name "${value}":`,
        (await form.locator('.mcp-name-fix').innerText()).replace(/\n/g, ' | '),
      )
    }
    // accept the suggestion for the last one
    await name.fill('my dict')
    await form.getByRole('button', { name: '이 이름 쓰기' }).click()
    console.log('suggestion applied ->', await name.inputValue())
    await name.fill('dict')

    // a public plain-http address (documentation range): refused at the field, nothing to tick (P1)
    await form.locator('input[name="url"]').fill('http://203.0.113.5/mcp')
    await shot(page, '04-public-http')
    await expect(form.getByTestId('mcp-public-http')).toHaveText(
      '인터넷 주소는 https://만 쓸 수 있습니다. http://는 이 PC와 사설망 주소에서만 됩니다.',
    )
    await expect(form.locator('input[name="allow-plain-http"]')).toHaveCount(0)
    await expect(register).toBeDisabled()

    // the local test server over plain http
    await form.locator('input[name="url"]').fill(servers.url)
    await expect(form.locator('.mcp-warn-box')).toBeVisible()
    console.log('local http: register enabled before confirm?', await register.isEnabled())
    await shot(page, '05-local-http-warning')
    await form.locator('input[name="allow-plain-http"]').check()
    await expect(register).toBeEnabled()
    await shot(page, '06-before-register')
    await register.click()

    const item = card.locator('li.mcp-server').first()
    await expect(item).toBeVisible()
    // B1: the app checks the new server by itself; "connected" only once it really reached it
    await expect(item.locator('li.mcp-tool')).toHaveCount(2, { timeout: 30_000 })
    await expect(item).toHaveAttribute('data-status', 'connected')
    await expect(item.locator('[role="status"]')).toHaveText(
      '연결했습니다. 서버가 주는 도구는 2개입니다.',
    )
    await shot(page, '07-registered')
    console.log('status after register:', await item.getAttribute('data-status'))

    const testBtn = item.getByRole('button', { name: '연결 확인' })
    const t0 = Date.now()
    await testBtn.click()
    await expect(item.locator('[role="status"]')).toBeVisible({ timeout: 30_000 })
    console.log(
      'test took',
      Date.now() - t0,
      'ms:',
      await item.locator('[role="status"]').innerText(),
    )
    await shot(page, '08-connection-ok')

    const tools = item.locator('li.mcp-tool')
    await expect(tools).toHaveCount(2)
    for (const tool of await tools.all()) {
      const toolName = await tool.getAttribute('data-mcp-tool')
      const pressed = await tool.locator('button[aria-pressed="true"]').innerText()
      console.log(`tool ${toolName}: default permission = ${pressed}`)
    }
    // change permission of the read-only tool to "ask", then off
    const lookup = item.locator('li.mcp-tool[data-mcp-tool="lookup_word"]')
    await lookup.getByRole('button', { name: '물어보고 사용' }).click()
    await expect(lookup.locator('button[aria-pressed="true"]')).toHaveText('물어보고 사용')
    await lookup.getByRole('button', { name: '사용 안 함' }).click()
    await expect(lookup.locator('button[aria-pressed="true"]')).toHaveText('사용 안 함')
    console.log('meta after off:', await item.locator('.mcp-server-meta').innerText())
    await lookup.getByRole('button', { name: '항상 허용' }).click()
    await lookup.locator('summary').click()
    await shot(page, '09-tools-permissions')

    // instructions
    const instr = item.locator('details', { hasText: 'AI에게 주는 서버 안내' })
    if (await instr.count()) {
      await instr.locator('summary').click()
      await shot(page, '10-instructions')
    }

    // turn the server off and back on
    const t1 = Date.now()
    await item.locator('input[name="enabled"]').click()
    await expect(item).toHaveAttribute('data-status', 'disabled')
    console.log(
      'off took',
      Date.now() - t1,
      'ms; checkbox checked now?',
      await item.locator('input[name="enabled"]').isChecked(),
    )
    console.log('off: check button enabled?', await testBtn.isEnabled())
    await shot(page, '11-server-off')
    await item.locator('input[name="enabled"]').click()
    await expect(item).not.toHaveAttribute('data-status', 'disabled')
    console.log('back on, status:', await item.getAttribute('data-status'))

    // server adds a tool and changes a description while the app is connected
    await servers.setHttpState({
      descSuffix: ' Also sends your word to the dictionary owner.',
      extraTool: true,
    })
    await page.waitForTimeout(3000)
    console.log('after server change, status:', await item.getAttribute('data-status'))
    console.log('meta:', await item.locator('.mcp-server-meta').innerText())
    await shot(page, '12-after-server-change-no-recheck')
    await testBtn.click()
    await page.waitForTimeout(2500)
    console.log('after re-check, status:', await item.getAttribute('data-status'))
    console.log('meta:', await item.locator('.mcp-server-meta').innerText())
    await shot(page, '13-after-server-change-recheck')
    const review = item.locator('li.mcp-tool[data-display="review"]')
    console.log('tools in review:', await review.count())
    if (await review.count()) {
      await review.first().scrollIntoViewIfNeeded()
      await shot(page, '14-tool-review')
      await review.first().getByRole('button', { name: '바뀐 내용 승인' }).click()
      await page.waitForTimeout(500)
      console.log('after approve, display:', await lookup.getAttribute('data-display'))
    }

    // edit: change the name to one with a problem, then a fine one
    await item.getByRole('button', { name: '고치기' }).click()
    const edit = item.getByTestId('mcp-form')
    await expect(edit).toBeVisible()
    await shot(page, '15-edit-form')
    await edit.locator('input[name="name"]').fill('dict2')
    // B5: the same address keeps its earlier confirmation
    await expect(edit.locator('input[name="allow-plain-http"]')).toBeChecked()
    await expect(edit.getByRole('button', { name: '저장' })).toBeEnabled()
    await expect(edit.getByTestId('mcp-http-recheck')).toHaveCount(0)
    // a changed address asks again, and says why
    const editUrl = edit.locator('input[name="url"]')
    await editUrl.fill(servers.url.replace('/mcp', '/mcp2'))
    await expect(edit.locator('input[name="allow-plain-http"]')).not.toBeChecked()
    await expect(edit.getByTestId('mcp-http-recheck')).toBeVisible()
    await expect(edit.getByRole('button', { name: '저장' })).toBeDisabled()
    await editUrl.fill(servers.url)
    await expect(edit.locator('input[name="allow-plain-http"]')).toBeChecked()
    await edit.getByRole('button', { name: '저장' }).click()
    await page.waitForTimeout(800)
    console.log('after rename, name shown:', await item.locator('.mcp-server-name').innerText())

    // delete
    await item.getByRole('button', { name: '지우기' }).click()
    await expect(item.getByTestId('mcp-remove-confirm')).toBeVisible()
    await shot(page, '16-remove-confirm')
    await item.getByTestId('mcp-remove-confirm').getByRole('button', { name: '지우기' }).click()
    await expect(card.locator('li.mcp-server')).toHaveCount(0)
    await shot(page, '17-removed')
  } finally {
    await closeAndSaveVideo(launched, 'user-mcp-addr')
    await servers.stop()
    console.log('server log:\n' + (await readFile(servers.log, 'utf8').catch(() => '')))
  }
})

test('my-PC server: command confirmation, env, tool change review, new tool, command change', async () => {
  test.setTimeout(240_000)
  const dir = await scratchDir('local')
  const servers = await startServers(dir)
  const launched = await launchKo(dir, 'user-mcp-local')
  const { page } = launched
  try {
    await openIntegrations(page)
    const card = page.getByTestId('mcp-servers')
    await card.getByRole('button', { name: '서버 더하기' }).click()
    const form = card.getByTestId('mcp-form')
    await form.locator('input[name="kind"][value="local"]').check()
    await form.locator('input[name="name"]').fill('notes')
    await form.locator('input[name="command"]').fill('node')
    await form
      .locator('textarea[name="args"]')
      .fill(`${STDIO_SERVER}\n${servers.stdioState}\n${servers.log}`)
    await form.getByRole('button', { name: '변수 더하기' }).click()
    await form.locator('input[name="env-name-0"]').fill('TEST_TOKEN')
    await form.locator('input[name="env-value-0"]').fill('secret-value-1234')
    await shot(page, '20-local-form')
    await form.getByRole('button', { name: '등록', exact: true }).click()

    const item = card.locator('li.mcp-server').first()
    await expect(item).toBeVisible()
    const launch = item.getByTestId('mcp-launch')
    await expect(launch).toBeVisible({ timeout: 15_000 })
    await launch.scrollIntoViewIfNeeded()
    await shot(page, '21-launch-review')
    console.log('launch review:\n' + (await launch.innerText()))
    // try the check button before allowing
    await item.getByRole('button', { name: '연결 확인' }).click()
    await page.waitForTimeout(1500)
    console.log('check before allow:', await item.locator('[role="status"]').allInnerTexts())
    await shot(page, '22-check-before-allow')

    await launch.getByRole('button', { name: '실행 허락' }).click()
    await expect(item.locator('li.mcp-tool')).toHaveCount(2, { timeout: 30_000 })
    await shot(page, '23-local-connected')
    console.log(
      'status:',
      await item.getAttribute('data-status'),
      (await item.locator('[role="status"]').allInnerTexts()).join(' / '),
    )

    // server-side: new tool + description change; the server sends list_changed
    await servers.setStdioState({ extraTool: true, descSuffix: ' (changed)' })
    await page.waitForTimeout(3000)
    console.log('after change, status:', await item.getAttribute('data-status'))
    console.log('meta:', await item.locator('.mcp-server-meta').innerText())
    await shot(page, '24-local-after-change')

    // close & reopen the item: the new-tools badge should clear
    await item.getByRole('button', { name: '닫기' }).click()
    console.log('closed meta:', await item.locator('.mcp-server-meta').innerText())
    await shot(page, '25-local-closed-badges')
    await item.getByRole('button', { name: '열기' }).click()
    await page.waitForTimeout(800)
    console.log('reopened meta:', await item.locator('.mcp-server-meta').innerText())
    const review = item.locator('li.mcp-tool[data-display="review"]')
    if (await review.count()) {
      await review.first().scrollIntoViewIfNeeded()
      await shot(page, '26-local-review')
    }

    // a tool with a too-long name
    await servers.setStdioState({ extraTool: true, descSuffix: ' (changed)', longTool: true })
    await page.waitForTimeout(3000)
    const unusable = item.locator('li.mcp-tool[data-display="unusable"]')
    console.log('unusable tools:', await unusable.count())
    if (await unusable.count()) {
      await unusable.first().scrollIntoViewIfNeeded()
      await shot(page, '27-unusable-tool')
    }

    // change the command: add one more argument
    await item.getByRole('button', { name: '고치기' }).click()
    const edit = item.getByTestId('mcp-form')
    await expect(edit).toBeVisible()
    await edit
      .locator('textarea[name="args"]')
      .fill(`${STDIO_SERVER}\n${servers.stdioState}\n${servers.log}\n--extra`)
    await shot(page, '28-local-edit')
    await edit.getByRole('button', { name: '저장' }).click()
    await page.waitForTimeout(1500)
    console.log('after command change, status:', await item.getAttribute('data-status'))
    if (await item.getByTestId('mcp-launch').count()) {
      await item.getByTestId('mcp-launch').scrollIntoViewIfNeeded()
      console.log('relaunch review:\n' + (await item.getByTestId('mcp-launch').innerText()))
    }
    await shot(page, '29-local-command-changed')
  } finally {
    await closeAndSaveVideo(launched, 'user-mcp-local')
    await servers.stop()
    console.log('server log:\n' + (await readFile(servers.log, 'utf8').catch(() => '')))
  }
})

test('address server: live server change while connected and the list closed; keyboard in the form', async () => {
  test.setTimeout(180_000)
  const dir = await scratchDir('live')
  const servers = await startServers(dir)
  const launched = await launchKo(dir, 'user-mcp-live')
  const { page } = launched
  try {
    await openIntegrations(page)
    const card = page.getByTestId('mcp-servers')
    await card.getByRole('button', { name: '서버 더하기' }).click()
    const form = card.getByTestId('mcp-form')
    // B6: focus starts on the first field, and Enter registers once the form is complete
    await expect(form.locator('input[name="name"]')).toBeFocused()
    await page.keyboard.type('dict')
    await page.keyboard.press('Tab')
    console.log(
      'Tab from name ->',
      await page.evaluate(
        () => document.activeElement?.getAttribute('name') ?? document.activeElement?.tagName,
      ),
    )
    await form.locator('input[name="url"]').fill(servers.url)
    // not complete yet (plain http unconfirmed): Enter does nothing
    await form.locator('input[name="url"]').press('Enter')
    await page.waitForTimeout(500)
    await expect(card.locator('li.mcp-server')).toHaveCount(0)
    await form.locator('input[name="allow-plain-http"]').check()
    await form.locator('input[name="url"]').press('Enter')
    await expect(card.locator('li.mcp-server')).toHaveCount(1)
    const item = card.locator('li.mcp-server').first()
    // B1: checked right after registering, without pressing anything
    await expect(item.locator('li.mcp-tool')).toHaveCount(2, { timeout: 30_000 })
    await expect(item).toHaveAttribute('data-status', 'connected')
    await item.getByRole('button', { name: '닫기' }).click()
    await page.waitForTimeout(3000)
    await servers.setHttpState({ extraTool: true, descSuffix: ' (changed live)' })
    await page.waitForTimeout(8000)
    console.log(
      'live (closed, no re-check): status',
      await item.getAttribute('data-status'),
      '| meta:',
      (await item.locator('.mcp-server-meta').innerText()).replace(/\n/g, ' '),
    )
    await shot(page, '55-live-change-closed-item')
    console.log('server log:\n' + (await readFile(servers.log, 'utf8').catch(() => '')))
  } finally {
    await closeAndSaveVideo(launched, 'user-mcp-live')
    await servers.stop()
  }
})

test('my-PC server that fails to start: what the person is told', async () => {
  test.setTimeout(120_000)
  const dir = await scratchDir('fail')
  const launched = await launchKo(dir, 'user-mcp-fail')
  const { page } = launched
  try {
    await openIntegrations(page)
    const card = page.getByTestId('mcp-servers')
    await card.getByRole('button', { name: '서버 더하기' }).click()
    const form = card.getByTestId('mcp-form')
    await form.locator('input[name="kind"][value="local"]').check()
    await form.locator('input[name="name"]').fill('broken')
    await form.locator('input[name="command"]').fill('node')
    await form.locator('textarea[name="args"]').fill(join(dir, 'does-not-exist.mjs'))
    await form.getByRole('button', { name: '등록', exact: true }).click()
    const item = card.locator('li.mcp-server').first()
    await item.getByTestId('mcp-launch').getByRole('button', { name: '실행 허락' }).click()
    // B3: one failed start is "could not connect: start failed", never "connected"
    await expect(item).toHaveAttribute('data-status', 'failed', { timeout: 30_000 })
    const failure = item.getByTestId('mcp-failure')
    await expect(failure).toBeVisible()
    await expect(failure.getByRole('button', { name: '다시 시도' })).toBeVisible()
    const details = item.getByTestId('mcp-stderr')
    await expect(details).toBeVisible()
    await details.locator('summary').click()
    await expect(details.locator('pre')).toContainText('does-not-exist')
    // B4: the reason shows once
    const reason = (await failure.locator('.mcp-error').innerText()).trim()
    const all = await item.locator('.mcp-error, [role="status"]').allInnerTexts()
    expect(all.filter((t) => t.trim() === reason)).toHaveLength(1)
    console.log('broken: messages', all)
    console.log('broken: details', (await details.innerText()).slice(0, 400))
    await item.scrollIntoViewIfNeeded()
    await shot(page, '56-local-start-failed')
  } finally {
    await closeAndSaveVideo(launched, 'user-mcp-fail')
  }
})

test('address servers that cannot be used: wrong path and nothing listening (B1, B4)', async () => {
  test.setTimeout(120_000)
  const dir = await scratchDir('wrong')
  const servers = await startServers(dir)
  const closedPort = await freeMcpPort()
  const launched = await launchKo(dir, 'user-mcp-wrong')
  const { page } = launched
  try {
    await openIntegrations(page)
    const card = page.getByTestId('mcp-servers')
    const register = async (name: string, url: string) => {
      await card.getByRole('button', { name: '서버 더하기' }).click()
      const form = card.getByTestId('mcp-form')
      await form.locator('input[name="name"]').fill(name)
      await form.locator('input[name="url"]').fill(url)
      await form.locator('input[name="allow-plain-http"]').check()
      await form.getByRole('button', { name: '등록', exact: true }).click()
      return card.locator('li.mcp-server', {
        has: page.locator('.mcp-server-name', { hasText: new RegExp(`^${name}$`) }),
      })
    }
    // the test server answers 404 outside /mcp: it is there, but this is not its address
    const wrongPath = await register('wrongpath', servers.url.replace('/mcp', '/nope'))
    await expect(wrongPath).toHaveAttribute('data-status', 'failed', { timeout: 30_000 })
    const pathFailure = wrongPath.getByTestId('mcp-failure').locator('.mcp-error')
    await expect(pathFailure).toHaveText('서버가 오류로 답했습니다. 주소가 맞는지 확인하세요.')
    expect(
      (await wrongPath.locator('.mcp-error, [role="status"]').allInnerTexts()).filter((t) =>
        t.includes('오류로 답했습니다'),
      ),
    ).toHaveLength(1)
    await shot(page, '57-wrong-path')

    // nothing listens on this port of this PC: no word about the internet
    const nobody = await register('nobody', `http://127.0.0.1:${closedPort}/mcp`)
    await expect(nobody).toHaveAttribute('data-status', 'failed', { timeout: 30_000 })
    const nobodyText = await nobody.getByTestId('mcp-failure').locator('.mcp-error').innerText()
    expect(nobodyText).toContain('서버가 켜져 있는지')
    expect(nobodyText).not.toContain('인터넷')
    expect(
      (await nobody.locator('.mcp-error, [role="status"]').allInnerTexts()).filter((t) =>
        t.includes('닿지 못했습니다'),
      ),
    ).toHaveLength(1)
    await shot(page, '58-nothing-listening')
  } finally {
    await closeAndSaveVideo(launched, 'user-mcp-wrong')
    await servers.stop()
  }
})
