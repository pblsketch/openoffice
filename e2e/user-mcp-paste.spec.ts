/**
 * Exploratory QA (outside tester): adding MCP servers by pasting the kind of
 * settings text a server's README gives — Claude-style JSON (`mcpServers`),
 * Codex-style TOML, and text the app should refuse. Korean UI.
 */
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { closeAndSaveVideo } from './helpers'
import {
  STDIO_SERVER,
  launchKo,
  openIntegrations,
  scratchDir,
  shot,
  startServers,
} from './user-mcp-lib'

test.describe.configure({ mode: 'serial' })

test('paste: JSON with several servers, TOML, garbage text', async () => {
  test.setTimeout(240_000)
  const dir = await scratchDir('paste')
  const servers = await startServers(dir)
  const launched = await launchKo(dir, 'user-mcp-paste')
  const { page } = launched
  const card = page.getByTestId('mcp-servers')
  const openPaste = async () => {
    await card.getByRole('button', { name: '서버 더하기' }).click()
    await card.getByRole('tab', { name: '설정 글 붙여넣기' }).click()
    return card.getByTestId('mcp-form')
  }
  try {
    await openIntegrations(page)

    // 1) garbage text: what happens to what the person pasted?
    let form = await openPaste()
    await shot(page, '30-paste-empty')
    await form.getByRole('button', { name: '읽기' }).click()
    console.log('empty read:', await form.locator('.mcp-error').allInnerTexts())
    const garbage = '설치 방법: 아래 명령을 실행하세요\nnpx -y @example/dict-mcp --key YOUR_KEY'
    await form.locator('textarea[name="paste"]').fill(garbage)
    await form.getByRole('button', { name: '읽기' }).click()
    await page.waitForTimeout(800)
    console.log('garbage read:', await form.locator('.mcp-error').allInnerTexts())
    console.log(
      'textarea after failed read:',
      JSON.stringify(await form.locator('textarea[name="paste"]').inputValue()),
    )
    await shot(page, '31-paste-garbage')

    // a JSON with a small mistake (trailing comma, as people copy it)
    const almost = `{
  "mcpServers": {
    "dict": { "url": "${servers.url}" },
  }
}`
    await form.locator('textarea[name="paste"]').fill(almost)
    await form.getByRole('button', { name: '읽기' }).click()
    await page.waitForTimeout(800)
    console.log(
      'trailing-comma read:',
      await form.locator('.mcp-error').allInnerTexts(),
      'step?',
      await form.locator('.mcp-step').count(),
    )
    await shot(page, '32-paste-trailing-comma')
    await form.getByRole('button', { name: '취소' }).first().click()

    // 2) Claude-style JSON with three servers: one http (needs key from env), one stdio, one old SSE
    const json = `{
  "mcpServers": {
    "my dict": {
      "type": "http",
      "url": "${servers.url}",
      "headers": { "Authorization": "Bearer \${DICT_API_KEY}" }
    },
    "notes": {
      "command": "node",
      "args": [${JSON.stringify(STDIO_SERVER)}, ${JSON.stringify(servers.stdioState)}, ${JSON.stringify(servers.log)}],
      "env": { "TEST_TOKEN": "pasted-secret-9876" }
    },
    "legacy": { "type": "sse", "url": "http://127.0.0.1:${servers.port}/sse" }
  }
}`
    form = await openPaste()
    await form.locator('textarea[name="paste"]').fill(json)
    await shot(page, '33-paste-json-filled')
    await form.getByRole('button', { name: '읽기' }).click()
    await expect(form.locator('.mcp-step')).toBeVisible()
    // B2: the key written as ${DICT_API_KEY} is never kept as the key; the form asks for it
    await expect(form.locator('input[name="name"]')).toHaveValue('my-dict')
    await expect(form).toContainText(
      '붙여넣은 글은 열쇠를 PC 변수 DICT_API_KEY에서 읽게 되어 있습니다.',
    )
    await expect(form.locator('input[name="key"]')).toHaveValue('')
    await expect(form.locator('input[name="key"]')).toHaveAttribute('placeholder', '')
    for (let i = 0; i < 3; i++) {
      const step = await form
        .locator('.mcp-step')
        .innerText()
        .catch(() => '(no step)')
      console.log(`--- ${step}`)
      console.log('name:', await form.locator('input[name="name"]').inputValue())
      console.log(
        'notes:',
        (await form.locator('.mcp-note, .mcp-error, .set-field-desc').allInnerTexts())
          .filter((t) => t.trim())
          .slice(0, 6)
          .join(' || '),
      )
      await form.scrollIntoViewIfNeeded()
      await shot(page, `34-paste-json-step${i + 1}`)
      const register = form.getByRole('button', { name: '등록', exact: true })
      const plainBox = form.locator('input[name="allow-plain-http"]')
      if (await plainBox.count()) await plainBox.check()
      if (await register.isEnabled()) {
        await register.click()
      } else {
        console.log('register disabled at this step; skipping')
        await form.getByRole('button', { name: '건너뛰기' }).click()
      }
      await page.waitForTimeout(800)
      if (!(await form.isVisible().catch(() => false))) break
    }
    await shot(page, '35-paste-json-done')
    console.log('notice:', await card.locator('.set-intg-notice').allInnerTexts())
    console.log('servers now:', await card.locator('.mcp-server-name').allInnerTexts())

    // 3) Codex-style TOML
    const toml = `# ~/.codex/config.toml
[mcp_servers.dict_toml]
url = "${servers.url}"

[mcp_servers.notes_toml]
command = "node"
args = [${JSON.stringify(STDIO_SERVER)}, ${JSON.stringify(servers.stdioState)}, ${JSON.stringify(servers.log)}]
env = { TEST_TOKEN = "toml-secret" }
startup_timeout_sec = 20
`
    form = await openPaste()
    await form.locator('textarea[name="paste"]').fill(toml)
    await form.getByRole('button', { name: '읽기' }).click()
    await page.waitForTimeout(800)
    console.log('toml error?', await form.locator('.mcp-error').allInnerTexts())
    for (let i = 0; i < 2; i++) {
      if (
        !(await form
          .locator('.mcp-step')
          .isVisible()
          .catch(() => false))
      )
        break
      console.log(
        `--- ${await form.locator('.mcp-step').innerText()}`,
        'name:',
        await form.locator('input[name="name"]').inputValue(),
      )
      console.log(
        'notes:',
        (await form.locator('.set-field-desc').allInnerTexts())
          .filter((t) => t.trim())
          .slice(0, 5)
          .join(' || '),
      )
      await shot(page, `36-paste-toml-step${i + 1}`)
      const plainBox = form.locator('input[name="allow-plain-http"]')
      if (await plainBox.count()) await plainBox.check()
      await form.getByRole('button', { name: '등록', exact: true }).click()
      await page.waitForTimeout(800)
    }
    console.log('servers now:', await card.locator('.mcp-server-name').allInnerTexts())
    await shot(page, '37-paste-toml-done')

    // a pasted my-PC server: is the command confirmation still there?
    const notes = card.locator('li.mcp-server', {
      has: page.locator('.mcp-server-name', { hasText: /^notes$/ }),
    })
    if (await notes.count()) {
      if ((await notes.getAttribute('data-open')) !== 'true')
        await notes.getByRole('button', { name: '열기' }).click()
      console.log(
        'pasted notes status:',
        await notes.getAttribute('data-status'),
        'launch review shown:',
        await notes.getByTestId('mcp-launch').count(),
      )
      await notes.scrollIntoViewIfNeeded()
      await shot(page, '38-pasted-local-launch-review')
    }
    // the http server pasted with ${DICT_API_KEY}: what does its key look like?
    const dict = card.locator('li.mcp-server').first()
    console.log('first server status:', await dict.getAttribute('data-status'))

    // B1: each pasted server was checked by the app; none says "connected" unless it was reached
    const rowOf = (name: string) =>
      card.locator('li.mcp-server', {
        has: page.locator('.mcp-server-name', { hasText: new RegExp(`^${name}$`) }),
      })
    await expect(rowOf('my-dict')).toHaveAttribute('data-status', 'connected', { timeout: 30_000 })
    await expect(rowOf('dict_toml')).toHaveAttribute('data-status', 'connected', {
      timeout: 30_000,
    })
    // the test server answers 404 at /sse: could not connect, never "connected"
    await expect(rowOf('legacy')).toHaveAttribute('data-status', 'failed', { timeout: 30_000 })
    // my-PC servers wait for "allow to run"
    await expect(rowOf('notes')).toHaveAttribute('data-status', 'review-required')
    await expect(rowOf('notes_toml')).toHaveAttribute('data-status', 'review-required')
    for (const row of await card.locator('li.mcp-server').all()) {
      console.log(
        'status',
        await row.locator('.mcp-server-name').innerText(),
        '=',
        await row.getAttribute('data-status'),
      )
    }
    const legacy = rowOf('legacy')
    if ((await legacy.getAttribute('data-open')) !== 'true')
      await legacy.getByRole('button', { name: '열기' }).click()
    await legacy.getByRole('button', { name: '연결 확인' }).click()
    await page.waitForTimeout(4000)
    const legacyTexts = await legacy.locator('[role="status"], .mcp-error').allInnerTexts()
    console.log('legacy check:', await legacy.getAttribute('data-status'), legacyTexts)
    // B4: said once, and not blamed on the internet for a server on this PC
    expect(new Set(legacyTexts).size).toBe(legacyTexts.length)
    expect(legacyTexts.join(' ')).not.toContain('인터넷')
    await legacy.scrollIntoViewIfNeeded()
    await shot(page, '39-legacy-sse-check')
    const myDict = card.locator('li.mcp-server', {
      has: page.locator('.mcp-server-name', { hasText: /^my-dict$/ }),
    })
    if ((await myDict.getAttribute('data-open')) !== 'true')
      await myDict.getByRole('button', { name: '열기' }).click()
    await myDict.getByRole('button', { name: '연결 확인' }).click()
    await page.waitForTimeout(3000)
    console.log('my-dict check:', await myDict.locator('[role="status"]').allInnerTexts())
    console.log('server log:\n' + (await readFile(servers.log, 'utf8').catch(() => '')))

    // is the pasted secret anywhere in the settings file in clear text?
    const settingsText = await readFile(`${launched.userDataDir}\\mcp-servers.json`, 'utf8').catch(
      () => '(no mcp-servers.json)',
    )
    console.log(
      'settings file contains pasted secret in clear?',
      settingsText.includes('pasted-secret-9876'),
      settingsText.includes('toml-secret'),
    )
    // B2: the placeholder text was neither stored nor sent
    expect(settingsText).not.toContain('${DICT_API_KEY}')
    expect(settingsText).not.toContain('DICT_API_KEY')
    const serverLog = await readFile(servers.log, 'utf8').catch(() => '')
    expect(serverLog).not.toContain('DICT_API_KEY')
    expect(serverLog).toContain('initialize auth=none')
  } finally {
    await closeAndSaveVideo(launched, 'user-mcp-paste')
    await servers.stop()
  }
})
